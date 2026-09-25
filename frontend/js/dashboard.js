// dashboard.js
// Handles the SafeStore dashboard: navigation, dashboard stats, documents,
// uploads, node failure/recovery, replication monitor, fault-tolerance
// test, system health, settings, and activity logs.

const API_BASE_URL = "/api";
const NODE_LABELS = { node_a: "Node A", node_b: "Node B", node_c: "Node C" };
const NODE_ORDER = ["node_a", "node_b", "node_c"];

const PAGE_META = {
  "section-dashboard": ["Dashboard", "Overview of your documents and storage nodes"],
  "section-documents": ["Documents", "Manage your uploaded documents"],
  "section-upload": ["Upload", "Add a new document for replication"],
  "section-nodes": ["Node Status", "Monitor and control the 3 storage nodes"],
  "section-replication": ["Replication Monitor", "Document-to-node replication matrix"],
  "section-faulttest": ["Fault-Tolerance Test", "Verify document availability during a real node failure"],
  "section-activity": ["Activity Logs", "System event history"],
  "section-health": ["System Health", "Live backend, database, and node checks"],
  "section-settings": ["Settings", "Manage your profile and security"],
};

let pendingDeleteId = null;
let documentsCache = [];
let nodesCache = [];
let activityCache = [];
let activityFilter = "all";

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("safestore_token");
  if (!token) {
    window.location.href = "index.html";
    return;
  }

  renderUserInfo();
  setupNavigation();
  setupSidebarCollapse();
  setupLogout();
  setupUpload();
  setupModal();
  setupRefreshButtons();
  setupDocumentToolbar();
  setupActivityFilters();
  setupFaultToleranceTest();
  setupSettings();
  setupPasswordToggles();
  setupNotificationButton();
  renderMascots();

  loadDashboard();
  loadDocuments();
  loadNodes();
  loadActivityLogs();
});

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function getToken() {
  return localStorage.getItem("safestore_token");
}

async function apiRequest(path, options = {}) {
  const headers = options.headers || {};
  headers["Authorization"] = `Bearer ${getToken()}`;
  if (!(options.body instanceof FormData) && options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (response.status === 401) {
    localStorage.removeItem("safestore_token");
    localStorage.removeItem("safestore_user");
    window.location.href = "index.html";
    throw new Error("Session expired");
  }

  return response;
}

function renderUserInfo() {
  const userRaw = localStorage.getItem("safestore_user");
  if (!userRaw) return;
  const user = JSON.parse(userRaw);
  document.getElementById("user-name").textContent = user.username;
  document.getElementById("user-email").textContent = user.email;
  document.getElementById("user-avatar").textContent = user.username.charAt(0).toUpperCase();
  document.getElementById("sidebar-user-name").textContent = user.username;
  document.getElementById("sidebar-user-email").textContent = user.email;
  document.getElementById("sidebar-avatar").textContent = user.username.charAt(0).toUpperCase();
  document.getElementById("settings-username").textContent = user.username;
  document.getElementById("settings-email").textContent = user.email;
}

function setupLogout() {
  document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
      await apiRequest("/logout", { method: "POST" });
    } catch (err) {
      // ignore — we clear local storage regardless
    }
    localStorage.removeItem("safestore_token");
    localStorage.removeItem("safestore_user");
    window.location.href = "index.html";
  });
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function setupNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      navItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");

      document.querySelectorAll(".app-section").forEach((section) => section.classList.add("hidden"));
      const target = item.dataset.section;
      document.getElementById(target).classList.remove("hidden");

      const meta = PAGE_META[target];
      if (meta) {
        document.getElementById("page-title").textContent = meta[0];
        document.getElementById("page-subtitle").textContent = meta[1];
      }

      if (target === "section-replication") loadReplicationMonitor();
      if (target === "section-health") loadSystemHealth();
      if (target === "section-faulttest") populateFaultTestDocumentSelect();
    });
  });
}

function setupSidebarCollapse() {
  const sidebar = document.getElementById("sidebar");
  const btn = document.getElementById("sidebar-collapse-btn");
  btn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    btn.textContent = sidebar.classList.contains("collapsed") ? "›" : "‹";
  });
}

function setupRefreshButtons() {
  document.getElementById("refresh-dashboard-btn").addEventListener("click", loadDashboard);
  document.getElementById("refresh-documents-btn").addEventListener("click", loadDocuments);
  document.getElementById("refresh-nodes-btn").addEventListener("click", loadNodes);
  document.getElementById("refresh-activity-btn").addEventListener("click", loadActivityLogs);
  document.getElementById("refresh-replication-btn").addEventListener("click", loadReplicationMonitor);
  document.getElementById("refresh-health-btn").addEventListener("click", loadSystemHealth);
}

// ---------------------------------------------------------------------------
// Dashboard stats + node summary
// ---------------------------------------------------------------------------

async function loadDashboard() {
  try {
    const response = await apiRequest("/dashboard");
    const data = await response.json();
    if (!data.success) return;

    document.getElementById("stat-total").textContent = data.stats.total_documents;
    document.getElementById("stat-available").textContent = data.stats.available_documents;
    document.getElementById("stat-active-nodes").textContent = data.stats.active_nodes;
    document.getElementById("stat-failed-nodes").textContent = data.stats.failed_nodes;
    document.getElementById("stat-total-sub").textContent =
      data.stats.total_documents === 1 ? "1 document stored" : `${data.stats.total_documents} documents stored`;
    document.getElementById("stat-available-sub").textContent =
      data.stats.total_documents > 0
        ? `${Math.round((data.stats.available_documents / data.stats.total_documents) * 100)}% availability`
        : "No documents yet";

    nodesCache = data.nodes;
    renderNodeGrid(document.getElementById("dashboard-node-grid"), data.nodes, false);
  } catch (err) {
    showToast("Could not load dashboard data.", "error");
  }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function setupDocumentToolbar() {
  document.getElementById("doc-search").addEventListener("input", renderDocumentsTable);
  document.getElementById("doc-filter-type").addEventListener("change", renderDocumentsTable);
  document.getElementById("doc-sort").addEventListener("change", renderDocumentsTable);
}

async function loadDocuments() {
  try {
    const response = await apiRequest("/documents");
    const data = await response.json();
    if (!data.success) return;
    documentsCache = data.documents;
    renderDocumentsTable();
  } catch (err) {
    showToast("Could not load documents.", "error");
  }
}

function renderDocumentsTable() {
  const tbody = document.getElementById("documents-table-body");
  const emptyState = document.getElementById("documents-empty");

  const search = document.getElementById("doc-search").value.trim().toLowerCase();
  const typeFilter = document.getElementById("doc-filter-type").value;
  const sortBy = document.getElementById("doc-sort").value;

  let docs = documentsCache.filter((d) => {
    const matchesSearch = !search || d.original_filename.toLowerCase().includes(search);
    const matchesType = !typeFilter || d.file_type === typeFilter;
    return matchesSearch && matchesType;
  });

  docs = docs.slice().sort((a, b) => {
    switch (sortBy) {
      case "date_asc": return new Date(a.upload_date) - new Date(b.upload_date);
      case "name_asc": return a.original_filename.localeCompare(b.original_filename);
      case "name_desc": return b.original_filename.localeCompare(a.original_filename);
      case "size_desc": return b.file_size - a.file_size;
      case "size_asc": return a.file_size - b.file_size;
      case "date_desc":
      default: return new Date(b.upload_date) - new Date(a.upload_date);
    }
  });

  if (documentsCache.length === 0) {
    tbody.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  if (docs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">No documents match your search/filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = docs.map((doc) => renderDocumentRow(doc)).join("");

  tbody.querySelectorAll("[data-download]").forEach((btn) => {
    btn.addEventListener("click", () => downloadDocument(btn.dataset.download, btn.dataset.filename));
  });
  tbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => openDeleteModal(btn.dataset.delete, btn.dataset.filename));
  });
}

function renderDocumentRow(doc) {
  const availabilityBadge = doc.is_available
    ? `<span class="badge badge-success">Available</span>`
    : `<span class="badge badge-danger">Unavailable</span>`;

  const nodesLabel = doc.available_nodes.length
    ? doc.available_nodes.map((n) => NODE_LABELS[n] || n).join(", ")
    : "None online";

  const uploadDate = formatDateTime(doc.upload_date);

  return `
    <tr>
      <td><div class="file-name-cell">📄 ${escapeHtml(doc.original_filename)}</div></td>
      <td><span class="badge badge-neutral">${escapeHtml(doc.file_type)}</span></td>
      <td>${formatFileSize(doc.file_size)}</td>
      <td>${uploadDate}</td>
      <td>${availabilityBadge}</td>
      <td>${escapeHtml(nodesLabel)}</td>
      <td>
        <div class="table-actions">
          <button class="icon-btn" data-download="${doc.id}" data-filename="${escapeHtml(doc.original_filename)}" ${doc.is_available ? "" : "disabled"}>Download</button>
          <button class="icon-btn danger" data-delete="${doc.id}" data-filename="${escapeHtml(doc.original_filename)}">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

async function downloadDocument(documentId, filename) {
  try {
    const response = await apiRequest(`/documents/${documentId}/download`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      showToast(data.error || "Document is currently unavailable.", "error");
      return;
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    showToast("Download started.", "success");
  } catch (err) {
    showToast("Download failed.", "error");
  }
}

function setupModal() {
  document.getElementById("confirm-cancel").addEventListener("click", closeDeleteModal);
  document.getElementById("confirm-ok").addEventListener("click", confirmDelete);
}

function openDeleteModal(documentId, filename) {
  pendingDeleteId = documentId;
  document.getElementById("confirm-modal-title").textContent = "Delete document?";
  document.getElementById("confirm-modal-text").textContent =
    `This will remove all replicas of "${filename}" from the storage nodes. This cannot be undone.`;
  document.getElementById("confirm-modal").classList.remove("hidden");
}

function closeDeleteModal() {
  pendingDeleteId = null;
  document.getElementById("confirm-modal").classList.add("hidden");
}

async function confirmDelete() {
  if (!pendingDeleteId) return;
  try {
    const response = await apiRequest(`/documents/${pendingDeleteId}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok || !data.success) {
      showToast(data.error || "Unable to delete document.", "error");
      return;
    }
    showToast("Document deleted successfully.", "success");
    closeDeleteModal();
    loadDocuments();
    loadDashboard();
    loadActivityLogs();
  } catch (err) {
    showToast("Unable to delete document.", "error");
  }
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

function setupUpload() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const selectedFileBox = document.getElementById("selected-file");
  const selectedFileName = document.getElementById("selected-file-name");
  const uploadBtn = document.getElementById("upload-btn");
  const uploadProgress = document.getElementById("upload-progress");
  const uploadResult = document.getElementById("upload-result");

  let selectedFile = null;

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length) {
      selectedFile = e.dataTransfer.files[0];
      selectedFileName.textContent = `${selectedFile.name} (${formatFileSize(selectedFile.size)})`;
      selectedFileBox.classList.remove("hidden");
      uploadResult.classList.add("hidden");
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) {
      selectedFile = fileInput.files[0];
      selectedFileName.textContent = `${selectedFile.name} (${formatFileSize(selectedFile.size)})`;
      selectedFileBox.classList.remove("hidden");
      uploadResult.classList.add("hidden");
    }
  });

  uploadBtn.addEventListener("click", async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("file", selectedFile);

    selectedFileBox.classList.add("hidden");
    uploadProgress.classList.remove("hidden");
    uploadResult.classList.add("hidden");
    uploadBtn.disabled = true;

    try {
      const response = await apiRequest("/upload", { method: "POST", body: formData });
      const data = await response.json();

      uploadProgress.classList.add("hidden");
      uploadBtn.disabled = false;

      if (!response.ok || !data.success) {
        showToast(data.error || "Upload failed. Please check the file and try again.", "error");
        selectedFileBox.classList.remove("hidden");
        return;
      }

      // Fetch the just-uploaded document to show real per-node replication result.
      const docsResp = await apiRequest("/documents");
      const docsData = await docsResp.json();
      const uploaded = (docsData.documents || []).find((d) => d.id === data.document_id);
      const availableNodes = uploaded ? uploaded.available_nodes : [];

      const rows = NODE_ORDER.map((nodeId) => {
        const ok = availableNodes.includes(nodeId);
        return `<div class="upload-step">${ok ? "✓" : "✕"} Replicated to ${NODE_LABELS[nodeId]}${ok ? "" : " (node offline)"}</div>`;
      }).join("");
      uploadResult.innerHTML = `<div class="upload-step" style="font-weight:700;">✓ Uploaded successfully</div><div class="upload-step" style="font-weight:700;">✓ Replicated across storage nodes</div>${rows}`;
      uploadResult.classList.remove("hidden");

      showToast(`Document uploaded and replicated to ${availableNodes.length} of 3 nodes.`, "success");
      selectedFile = null;
      fileInput.value = "";
      loadDocuments();
      loadDashboard();
      loadActivityLogs();
    } catch (err) {
      uploadProgress.classList.add("hidden");
      uploadBtn.disabled = false;
      selectedFileBox.classList.remove("hidden");
      showToast("Upload failed. Is the backend running?", "error");
    }
  });
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

async function loadNodes() {
  try {
    const response = await apiRequest("/nodes");
    const data = await response.json();
    if (!data.success) return;
    nodesCache = data.nodes;
    renderNodeGrid(document.getElementById("nodes-full-grid"), data.nodes, true);

    const allOnline = data.nodes.every((n) => n.status === "online");
    const banner = document.getElementById("nodes-happy-banner");
    if (banner) banner.classList.toggle("hidden", !allOnline);
  } catch (err) {
    showToast("Could not load node status.", "error");
  }
}

function renderNodeGrid(container, nodes, showActions) {
  container.innerHTML = nodes.map((node) => renderNodeCard(node, showActions)).join("");

  container.querySelectorAll("[data-fail]").forEach((btn) => {
    btn.addEventListener("click", () => failNode(btn.dataset.fail));
  });
  container.querySelectorAll("[data-recover]").forEach((btn) => {
    btn.addEventListener("click", () => recoverNode(btn.dataset.recover));
  });
}

function renderNodeCard(node, showActions) {
  const isOnline = node.status === "online";
  const statusPill = isOnline
    ? `<span class="status-pill status-online">Online</span>`
    : `<span class="status-pill status-offline">Offline</span>`;

  const docsOnNode = documentsCache.filter((d) => d.available_nodes.includes(node.id)).length;

  const actions = showActions
    ? `<div class="node-card-actions">
         ${isOnline
           ? `<button class="btn btn-danger btn-sm" data-fail="${node.id}">Simulate Failure</button>`
           : `<button class="btn btn-success btn-sm" data-recover="${node.id}">Recover Node</button>`}
       </div>`
    : "";

  return `
    <div class="node-card ${isOnline ? "" : "offline"}">
      <div class="node-card-head">
        <span class="node-card-name">${escapeHtml(node.name)}</span>
        ${statusPill}
      </div>
      ${isOnline ? "" : `<div style="margin:2px 0 4px;">${typeof safeStoreMascot === "function" ? safeStoreMascot(36, "sleepy") : ""}</div>`}
      <div class="node-meta"><span>Node ID</span><span>${node.id}</span></div>
      <div class="node-meta"><span>Documents available here</span><span>${docsOnNode}</span></div>
      <div class="node-meta"><span>Last status change</span><span>${formatDateTime(node.updated_at)}</span></div>
      ${actions}
    </div>
  `;
}

async function failNode(nodeId) {
  try {
    const response = await apiRequest(`/nodes/${nodeId}/fail`, { method: "POST" });
    const data = await response.json();
    if (!response.ok || !data.success) {
      showToast(data.error || "Could not mark node as failed.", "error");
      return;
    }
    showToast(`Oops! ${NODE_LABELS[nodeId] || nodeId} took a little coffee break ☕ Documents remain available from other replicas.`, "warning");
    await Promise.all([loadNodes(), loadDashboard(), loadDocuments()]);
    loadActivityLogs();
  } catch (err) {
    showToast("Could not mark node as failed.", "error");
  }
}

async function recoverNode(nodeId) {
  try {
    const response = await apiRequest(`/nodes/${nodeId}/recover`, { method: "POST" });
    const data = await response.json();
    if (!response.ok || !data.success) {
      showToast(data.error || "Could not recover node.", "error");
      return;
    }
    showToast(
      `${NODE_LABELS[nodeId] || nodeId} is back! Syncing everything now ✨ (${data.synchronized_documents} document(s) resynchronized.)`,
      "success"
    );
    await Promise.all([loadNodes(), loadDashboard(), loadDocuments()]);
    loadActivityLogs();
  } catch (err) {
    showToast("Could not recover node.", "error");
  }
}

// ---------------------------------------------------------------------------
// Replication Monitor
// ---------------------------------------------------------------------------

async function loadReplicationMonitor() {
  try {
    const [docsResp, nodesResp] = await Promise.all([apiRequest("/documents"), apiRequest("/nodes")]);
    const docsData = await docsResp.json();
    const nodesData = await nodesResp.json();
    if (!docsData.success || !nodesData.success) return;

    const nodeStatusById = {};
    nodesData.nodes.forEach((n) => { nodeStatusById[n.id] = n.status; });

    const tbody = document.getElementById("replication-table-body");
    const emptyState = document.getElementById("replication-empty");
    const docs = docsData.documents;

    if (docs.length === 0) {
      tbody.innerHTML = "";
      emptyState.classList.remove("hidden");
      document.getElementById("replication-summary").innerHTML = "";
      return;
    }
    emptyState.classList.add("hidden");

    let healthyReplicas = 0;
    let missingReplicas = 0;
    let healthyDocs = 0;

    const rows = docs.map((doc) => {
      const replicaByNode = {};
      (doc.replicas || []).forEach((r) => { replicaByNode[r.node_id] = r.status; });

      const cells = NODE_ORDER.map((nodeId) => {
        const isUp = replicaByNode[nodeId] === "available" && nodeStatusById[nodeId] === "online";
        if (isUp) healthyReplicas++; else missingReplicas++;
        return `<td class="replica-cell">${isUp ? '<span class="replica-yes">✓</span>' : '<span class="replica-no">✕</span>'}</td>`;
      }).join("");

      const upCount = NODE_ORDER.filter((nodeId) => replicaByNode[nodeId] === "available" && nodeStatusById[nodeId] === "online").length;
      let statusBadge;
      if (upCount === 3) { statusBadge = '<span class="badge badge-success">Healthy</span>'; healthyDocs++; }
      else if (upCount > 0) { statusBadge = '<span class="badge badge-warning">Degraded</span>'; }
      else { statusBadge = '<span class="badge badge-danger">Unavailable</span>'; }

      return `<tr><td>${escapeHtml(doc.original_filename)}</td>${cells}<td>${statusBadge}</td></tr>`;
    }).join("");

    tbody.innerHTML = rows;

    const totalPossible = docs.length * 3;
    const healthPct = totalPossible > 0 ? Math.round((healthyReplicas / totalPossible) * 100) : 100;

    document.getElementById("replication-summary").innerHTML = `
      <div class="summary-box"><div class="val">${docs.length}</div><div class="lbl">Total Documents</div></div>
      <div class="summary-box"><div class="val" style="color:var(--success)">${healthyReplicas}</div><div class="lbl">Healthy Replicas</div></div>
      <div class="summary-box"><div class="val" style="color:var(--danger)">${missingReplicas}</div><div class="lbl">Missing Replicas</div></div>
      <div class="summary-box"><div class="val">${healthPct}%</div><div class="lbl">Replication Health</div></div>
    `;
  } catch (err) {
    showToast("Could not load replication monitor.", "error");
  }
}

// ---------------------------------------------------------------------------
// Fault-Tolerance Test
// ---------------------------------------------------------------------------

function setupFaultToleranceTest() {
  document.getElementById("run-ft-test-btn").addEventListener("click", runFaultToleranceTest);
}

async function populateFaultTestDocumentSelect() {
  const select = document.getElementById("ft-document-select");
  try {
    const response = await apiRequest("/documents");
    const data = await response.json();
    if (!data.success || data.documents.length === 0) {
      select.innerHTML = `<option value="">No documents available — upload one first</option>`;
      return;
    }
    select.innerHTML = data.documents
      .map((d) => `<option value="${d.id}">${escapeHtml(d.original_filename)}</option>`)
      .join("");
  } catch (err) {
    select.innerHTML = `<option value="">Could not load documents</option>`;
  }
}

function renderFtSteps(steps) {
  const container = document.getElementById("ft-steps");
  container.innerHTML = steps.map((s) => {
    const icon = s.state === "pass" ? "✓" : s.state === "fail" ? "✕" : s.state === "running" ? "…" : "○";
    return `<div class="ft-step ${s.state}"><span class="ft-step-icon">${icon}</span><span>${escapeHtml(s.label)}</span></div>`;
  }).join("");
}

async function runFaultToleranceTest() {
  const select = document.getElementById("ft-document-select");
  const documentId = select.value;
  const runBtn = document.getElementById("run-ft-test-btn");
  const resultBox = document.getElementById("ft-result");
  resultBox.classList.add("hidden");

  if (!documentId) {
    showToast("Upload a document first, then run the test.", "warning");
    return;
  }

  const steps = [
    { label: "Verifying document replicas before the test", state: "pending" },
    { label: "Simulating a storage node taking a coffee break ☕", state: "pending" },
    { label: "Don't worry! Checking your document is still available", state: "pending" },
    { label: "Downloading document from a healthy replica", state: "pending" },
    { label: "Node is back! Synchronizing missing data...", state: "pending" },
    { label: "Synchronization complete ✓", state: "pending" },
    { label: "Verifying replica restored on the recovered node", state: "pending" },
  ];
  renderFtSteps(steps);
  runBtn.disabled = true;
  const ftMascotEl = document.getElementById("ft-mascot");
  if (ftMascotEl && typeof safeStoreMascot === "function") ftMascotEl.innerHTML = safeStoreMascot(56, "shield");

  const setStep = (i, state) => { steps[i].state = state; renderFtSteps(steps); };

  try {
    // Step 1: current replicas
    setStep(0, "running");
    let docsResp = await apiRequest("/documents");
    let docsData = await docsResp.json();
    let doc = docsData.documents.find((d) => String(d.id) === String(documentId));
    if (!doc || doc.available_nodes.length === 0) {
      setStep(0, "fail");
      showFtResult(false, "Selected document has no available replicas to test with.");
      runBtn.disabled = false;
      return;
    }
    const targetNode = doc.available_nodes[0];
    setStep(0, "pass");

    // Step 2: fail the node
    setStep(1, "running");
    const failResp = await apiRequest(`/nodes/${targetNode}/fail`, { method: "POST" });
    const failData = await failResp.json();
    if (!failResp.ok || !failData.success) { setStep(1, "fail"); showFtResult(false, "Could not simulate node failure."); runBtn.disabled = false; return; }
    setStep(1, "pass");

    // Step 3: verify still available
    setStep(2, "running");
    docsResp = await apiRequest("/documents");
    docsData = await docsResp.json();
    doc = docsData.documents.find((d) => String(d.id) === String(documentId));
    if (!doc.is_available) { setStep(2, "fail"); showFtResult(false, "Document became unavailable after node failure."); runBtn.disabled = false; return; }
    setStep(2, "pass");

    // Step 4: download
    setStep(3, "running");
    const downloadResp = await apiRequest(`/documents/${documentId}/download`);
    if (!downloadResp.ok) { setStep(3, "fail"); showFtResult(false, "Download failed while a node was offline."); runBtn.disabled = false; return; }
    setStep(3, "pass");

    // Step 5: recover node
    setStep(4, "running");
    const recoverResp = await apiRequest(`/nodes/${targetNode}/recover`, { method: "POST" });
    const recoverData = await recoverResp.json();
    if (!recoverResp.ok || !recoverData.success) { setStep(4, "fail"); showFtResult(false, "Could not recover the node."); runBtn.disabled = false; return; }
    setStep(4, "pass");

    // Step 6: synchronization happened as part of recover
    setStep(5, "running");
    setStep(5, "pass");

    // Step 7: verify replica restored
    setStep(6, "running");
    docsResp = await apiRequest("/documents");
    docsData = await docsResp.json();
    doc = docsData.documents.find((d) => String(d.id) === String(documentId));
    if (!doc.available_nodes.includes(targetNode)) { setStep(6, "fail"); showFtResult(false, "Replica was not restored on the recovered node."); runBtn.disabled = false; return; }
    setStep(6, "pass");

    showFtResult(true, `Fault-tolerance test passed. ${NODE_LABELS[targetNode]} was failed and recovered; the document stayed available throughout, and ${recoverData.synchronized_documents} document(s) were resynchronized.`);
    loadDashboard();
    loadDocuments();
    loadNodes();
    loadActivityLogs();
  } catch (err) {
    showFtResult(false, "Test aborted due to a network or server error.");
  }

  runBtn.disabled = false;
}

function showFtResult(passed, message) {
  const box = document.getElementById("ft-result");
  box.className = `ft-result-banner ${passed ? "pass" : "fail"}`;
  box.innerHTML = (passed ? "✓ FAULT-TOLERANCE TEST PASSED — " : "✕ FAULT-TOLERANCE TEST FAILED — ") + escapeHtml(message);
  box.classList.remove("hidden");

  const mascotEl = document.getElementById("ft-mascot");
  if (mascotEl && typeof safeStoreMascot === "function") {
    mascotEl.innerHTML = safeStoreMascot(56, passed ? "success" : "confused");
  }
}

// ---------------------------------------------------------------------------
// System Health
// ---------------------------------------------------------------------------

async function loadSystemHealth() {
  const list = document.getElementById("health-list");
  try {
    const response = await apiRequest("/system-health");
    const data = await response.json();
    if (!data.success) return;

    list.innerHTML = data.checks.map((c) => {
      const statusClass = c.status === "healthy" || c.status === "online" ? "status-online"
        : c.status === "warning" ? "status-warning" : "status-offline";
      const statusLabel = c.status.charAt(0).toUpperCase() + c.status.slice(1);
      return `
        <div class="health-row">
          <div><div class="health-name">${escapeHtml(c.component)}</div><div class="health-detail">${escapeHtml(c.detail)}</div></div>
          <span class="status-pill ${statusClass}">${statusLabel}</span>
        </div>
      `;
    }).join("");

    document.getElementById("health-last-checked").textContent =
      `Overall status: ${data.overall_status.toUpperCase()} · Last checked ${formatDateTime(data.checked_at.replace("Z", ""))}`;

    const healthMascotEl = document.getElementById("health-mascot");
    if (healthMascotEl && typeof safeStoreMascot === "function") {
      const mood = data.overall_status === "healthy" ? "shield" : data.overall_status === "warning" ? "confused" : "sleepy";
      healthMascotEl.innerHTML = safeStoreMascot(56, mood);
    }
    const friendlyLine = document.getElementById("health-friendly-line");
    if (friendlyLine) {
      friendlyLine.textContent = data.overall_status === "healthy"
        ? "Everything looks good 🤎 Your documents are protected across the available storage nodes."
        : data.overall_status === "warning"
          ? "Mostly good — one thing could use attention, but your documents are still protected."
          : "Something needs your attention — check the details below.";
    }

    // Recent failures / recovery events, from the real activity log.
    const eventsResp = await apiRequest("/activity-logs");
    const eventsData = await eventsResp.json();
    if (eventsData.success) {
      const relevant = eventsData.logs.filter((log) => {
        const a = log.action.toLowerCase();
        return a.includes("node failed") || a.includes("node recovered") || a.includes("replica synchronized");
      }).slice(0, 10);

      const list = document.getElementById("health-events-list");
      const emptyState = document.getElementById("health-events-empty");
      if (relevant.length === 0) {
        list.innerHTML = "";
        emptyState.classList.remove("hidden");
      } else {
        emptyState.classList.add("hidden");
        list.innerHTML = renderActivityItems(relevant);
      }
    }
  } catch (err) {
    showToast("Could not load system health.", "error");
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function setupSettings() {
  document.getElementById("change-password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById("current-password").value;
    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-new-password").value;
    const errorBox = document.getElementById("change-password-error");
    const successBox = document.getElementById("change-password-success");
    const submitBtn = document.getElementById("change-password-btn");

    errorBox.classList.add("hidden");
    successBox.classList.add("hidden");

    if (newPassword.length < 8) {
      errorBox.textContent = "New password must be at least 8 characters.";
      errorBox.classList.remove("hidden");
      return;
    }
    if (newPassword !== confirmPassword) {
      errorBox.textContent = "Passwords do not match.";
      errorBox.classList.remove("hidden");
      return;
    }

    setButtonLoading(submitBtn, true, "Changing password…");

    try {
      const response = await apiRequest("/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      const data = await response.json();
      setButtonLoading(submitBtn, false);

      if (!response.ok || !data.success) {
        errorBox.textContent = data.error || "Could not change password.";
        errorBox.classList.remove("hidden");
        return;
      }

      successBox.textContent = "Password changed successfully.";
      successBox.classList.remove("hidden");
      document.getElementById("change-password-form").reset();
      showToast("Password changed successfully.", "success");
      loadActivityLogs();
    } catch (err) {
      setButtonLoading(submitBtn, false);
      errorBox.textContent = "Could not reach the SafeStore server.";
      errorBox.classList.remove("hidden");
    }
  });
}

// ---------------------------------------------------------------------------
// Activity logs
// ---------------------------------------------------------------------------

function setupActivityFilters() {
  document.querySelectorAll("#activity-filters .filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#activity-filters .filter-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      activityFilter = chip.dataset.filter;
      renderActivityList();
    });
  });
}

function categorizeAction(action) {
  const a = action.toLowerCase();
  if (a.includes("user") || a.includes("login") || a.includes("logout") || a.includes("password")) return "auth";
  if (a.includes("document")) return "documents";
  if (a.includes("node") || a.includes("replica")) return "nodes";
  return "system";
}

function activityIcon(action) {
  const a = action.toLowerCase();
  if (a.includes("uploaded")) return "⬆";
  if (a.includes("downloaded")) return "⬇";
  if (a.includes("deleted")) return "🗑";
  if (a.includes("replicated") || a.includes("synchronized")) return "⧉";
  if (a.includes("failed")) return "⚠";
  if (a.includes("recovered")) return "✓";
  if (a.includes("logged in")) return "→";
  if (a.includes("logged out")) return "⏻";
  if (a.includes("registered")) return "＋";
  if (a.includes("password")) return "🔑";
  return "•";
}

function renderActivityItems(logs) {
  return logs.map((log) => `
    <li class="activity-item">
      <span class="activity-dot" style="background:transparent;width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;">${activityIcon(log.action)}</span>
      <div>
        <div class="activity-action">${escapeHtml(log.action)}</div>
        <div class="activity-details">${escapeHtml(log.details || "")}</div>
        <div class="activity-time">${formatDateTime(log.timestamp)}</div>
      </div>
    </li>
  `).join("");
}

async function loadActivityLogs() {
  try {
    const response = await apiRequest("/activity-logs");
    const data = await response.json();
    if (!data.success) return;
    activityCache = data.logs;
    renderActivityList();
  } catch (err) {
    showToast("Could not load activity logs.", "error");
  }
}

function renderActivityList() {
  const list = document.getElementById("activity-list");
  const emptyState = document.getElementById("activity-empty");

  const logs = activityFilter === "all"
    ? activityCache
    : activityCache.filter((log) => categorizeAction(log.action) === activityFilter);

  if (logs.length === 0) {
    list.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  list.innerHTML = renderActivityItems(logs);
  updateNotificationBadge();
}

function updateNotificationBadge() {
  const badge = document.getElementById("notification-badge");
  if (!badge) return;
  // Real count: events in the last 24 hours, from the real activity log.
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentCount = activityCache.filter((log) => {
    const t = new Date(log.timestamp.replace(" ", "T") + "Z").getTime();
    return !isNaN(t) && t >= oneDayAgo;
  }).length;

  if (recentCount > 0) {
    badge.textContent = recentCount > 99 ? "99+" : String(recentCount);
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function renderMascots() {
  if (typeof applySafeStoreFavicon === "function") applySafeStoreFavicon();

  const logoSlot = document.getElementById("sidebar-logo");
  if (logoSlot && typeof safeStoreLogo === "function") logoSlot.innerHTML = safeStoreLogo(22);

  if (typeof safeStoreMascot !== "function") return;
  const slots = [
    ["sidebar-mascot", 44, "happy"],
    ["welcome-mascot", 64, "waving"],
    ["upload-mascot", 60, "holding"],
    ["ft-mascot", 56, "shield"],
    ["documents-empty-mascot", 70, "happy"],
  ];
  slots.forEach(([id, size, mood]) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = safeStoreMascot(size, mood);
  });

  const emptyBtn = document.getElementById("empty-state-upload-btn");
  if (emptyBtn) {
    emptyBtn.addEventListener("click", () => {
      document.querySelector('.nav-item[data-section="section-upload"]').click();
    });
  }
}

function setupNotificationButton() {
  const btn = document.getElementById("notification-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    document.querySelector('.nav-item[data-section="section-activity"]').click();
  });
}

// ---------------------------------------------------------------------------
// Shared password toggle (used on Settings page too)
// ---------------------------------------------------------------------------

function setupPasswordToggles() {
  document.querySelectorAll(".password-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.toggleFor);
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "👁" : "🙈";
    });
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(sqliteTimestamp) {
  if (!sqliteTimestamp) return "—";
  const isoLike = sqliteTimestamp.replace(" ", "T") + (sqliteTimestamp.includes("Z") ? "" : "Z");
  const date = new Date(isoLike);
  if (isNaN(date.getTime())) return sqliteTimestamp;
  return date.toLocaleString();
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function setButtonLoading(button, isLoading, loadingText) {
  const label = button.querySelector(".btn-label");
  const spinner = button.querySelector(".btn-spinner");
  button.disabled = isLoading;
  if (isLoading) {
    if (loadingText) label.textContent = loadingText;
    label.classList.add("hidden");
    spinner.classList.remove("hidden");
  } else {
    label.classList.remove("hidden");
    spinner.classList.add("hidden");
  }
}

function showToast(message, type = "primary") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
