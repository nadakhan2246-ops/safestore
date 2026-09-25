// login.js
// Handles the login/register page: form switching, validation, API calls,
// password show/hide, strength meter, and redirecting into the dashboard.

const API_BASE_URL = "/api";

document.addEventListener("DOMContentLoaded", () => {
  if (typeof applySafeStoreFavicon === "function") applySafeStoreFavicon();

  const logoSlot = document.getElementById("auth-logo");
  if (logoSlot && typeof safeStoreLogo === "function") logoSlot.innerHTML = safeStoreLogo(30);

  const mascotSlot = document.getElementById("auth-mascot");
  if (mascotSlot && typeof safeStoreMascot === "function") {
    mascotSlot.innerHTML = safeStoreMascot(90, "waving");
  }

  // If already logged in, skip straight to the dashboard.
  if (localStorage.getItem("safestore_token")) {
    window.location.href = "dashboard.html";
    return;
  }

  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");

  function showLogin() {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
  }

  function showRegister() {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    registerForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
  }

  tabLogin.addEventListener("click", showLogin);
  tabRegister.addEventListener("click", showRegister);
  document.getElementById("go-to-register").addEventListener("click", (e) => {
    e.preventDefault();
    showRegister();
  });
  document.getElementById("go-to-login").addEventListener("click", (e) => {
    e.preventDefault();
    showLogin();
  });

  setupPasswordToggles();
  setupPasswordStrength();

  // ---------------- Login ----------------
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = document.getElementById("login-identifier").value.trim();
    const password = document.getElementById("login-password").value;
    const errorBox = document.getElementById("login-error");
    const submitBtn = document.getElementById("login-submit");

    errorBox.classList.add("hidden");

    if (!identifier || !password) {
      showFormError(errorBox, "Please fill in all fields.");
      return;
    }

    setButtonLoading(submitBtn, true, "Logging in…");

    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier, username: identifier, password }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        showFormError(errorBox, data.error || "Incorrect email/username or password.");
        setButtonLoading(submitBtn, false);
        return;
      }

      localStorage.setItem("safestore_token", data.token);
      localStorage.setItem("safestore_user", JSON.stringify(data.user));
      window.location.href = "dashboard.html";
    } catch (err) {
      showFormError(errorBox, "Could not reach the SafeStore server. Is the backend running?");
      setButtonLoading(submitBtn, false);
    }
  });

  // ---------------- Register ----------------
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("register-username").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const confirm = document.getElementById("register-confirm").value;
    const errorBox = document.getElementById("register-error");
    const submitBtn = document.getElementById("register-submit");

    errorBox.classList.add("hidden");

    if (!username || !email || !password || !confirm) {
      showFormError(errorBox, "Please fill in all fields.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      showFormError(errorBox, "Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      showFormError(errorBox, "Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      showFormError(errorBox, "Passwords do not match.");
      return;
    }

    setButtonLoading(submitBtn, true, "Creating account…");

    try {
      const response = await fetch(`${API_BASE_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        showFormError(errorBox, data.error || "Registration failed. Please try again.");
        setButtonLoading(submitBtn, false);
        return;
      }

      setButtonLoading(submitBtn, false);
      registerForm.reset();
      resetStrengthMeter();
      showToast("Account created! Please log in.", "success");
      showLogin();
    } catch (err) {
      showFormError(errorBox, "Could not reach the SafeStore server. Is the backend running?");
      setButtonLoading(submitBtn, false);
    }
  });
});

// ---------------------------------------------------------------------------
// Password show/hide toggles
// ---------------------------------------------------------------------------

function setupPasswordToggles() {
  document.querySelectorAll(".password-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.toggleFor);
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "👁" : "🙈";
      btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    });
  });
}

// ---------------------------------------------------------------------------
// Password strength meter (client-side heuristic, register form only)
// ---------------------------------------------------------------------------

function setupPasswordStrength() {
  const input = document.getElementById("register-password");
  const fill = document.getElementById("strength-bar-fill");
  const label = document.getElementById("strength-label");
  if (!input) return;

  input.addEventListener("input", () => {
    const value = input.value;
    let score = 0;
    if (value.length >= 8) score++;
    if (value.length >= 12) score++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    if (/[0-9]/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;

    const levels = [
      { pct: 0, color: "#DC2626", text: "Password strength" },
      { pct: 20, color: "#DC2626", text: "Weak" },
      { pct: 40, color: "#F59E0B", text: "Fair" },
      { pct: 60, color: "#F59E0B", text: "Good" },
      { pct: 80, color: "#16A34A", text: "Strong" },
      { pct: 100, color: "#16A34A", text: "Very strong" },
    ];
    const level = value.length === 0 ? levels[0] : levels[Math.min(score, 5)];

    fill.style.width = `${level.pct}%`;
    fill.style.background = level.color;
    label.textContent = value.length === 0 ? "Password strength" : level.text;
  });
}

function resetStrengthMeter() {
  const fill = document.getElementById("strength-bar-fill");
  const label = document.getElementById("strength-label");
  if (fill) { fill.style.width = "0%"; }
  if (label) { label.textContent = "Password strength"; }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function showFormError(box, message) {
  box.textContent = message;
  box.classList.remove("hidden");
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
