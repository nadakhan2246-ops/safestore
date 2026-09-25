# SafeStore — Fault-Tolerant Personal Document Storage System

## 1. Project Title
**SafeStore: A Fault-Tolerant Personal Document Storage System Demonstrating Distributed DBMS Replication and Recovery**

## 2. Project Overview
SafeStore is a full-stack web application that lets a user upload and manage
personal or academic documents (resumes, certificates, project reports,
images, etc.). Its purpose is not just file storage — it is a working,
hands-on demonstration of core **Distributed Database Management System
(DDBMS)** concepts: replication, node availability, failure detection,
fault tolerance, and recovery through replica synchronization.

Every uploaded document is automatically replicated across three simulated
storage nodes (`node_a`, `node_b`, `node_c`). The system tracks each node's
health and each replica's status in SQLite, and genuinely uses that state
to decide whether a document can be downloaded — there are no hard-coded
or fake status displays.

## 3. Problem Statement
Centralized storage systems have a single point of failure: if the one
server holding a file goes down, the file becomes unavailable. Distributed
databases solve this by keeping multiple copies (replicas) of data across
independent nodes, so that the failure of any single node does not make
the data unavailable. SafeStore recreates this problem and its solution in
a small, understandable, and demonstrable system suitable for a college
project.

## 4. Objectives
- Implement automatic 3-way replication of uploaded files.
- Track replica and node state in a relational database.
- Detect and simulate node failure without losing data.
- Serve files from any currently healthy node holding a copy.
- Recover a failed node by resynchronizing missing replicas.
- Present all of this through a clear, professional dashboard.

## 5. Features
- Secure user registration and login (hashed passwords).
- Upload documents (PDF, DOC, DOCX, TXT, PNG, JPG, JPEG).
- Automatic replication to `node_a`, `node_b`, and `node_c`.
- Document list showing type, size, upload date, replication status, and
  which nodes currently hold an available copy.
- Download a document — always served from a currently active node.
- Delete a document (removed from every node and the database).
- Simulate node failure with a single click; the node's files stay on
  disk but are no longer used for downloads while it is offline.
- Automatic failover: if the node holding the file a user requests is
  offline, another active replica is served instead.
- Recover a failed node; missing documents are automatically
  resynchronized to it from another active node.
- Live dashboard statistics: total documents, available documents, active
  nodes, failed nodes.
- Full activity log of uploads, replication, failures, downloads,
  recovery, and synchronization events.

## 6. Technology Stack
**Frontend:** HTML5, CSS3, vanilla JavaScript (no frameworks)
**Backend:** Python 3, Flask, Flask-CORS
**Database:** SQLite (`backend/database/safestore.db`)
**Storage simulation:** Three folders (`node_a`, `node_b`, `node_c`) acting
as independent storage nodes

## 7. System Architecture
```
 ┌──────────────┐        REST API (JSON)        ┌───────────────────┐
 │   Frontend    │ ─────────────────────────────▶│   Flask Backend    │
 │ (HTML/CSS/JS) │◀───────────────────────────── │      app.py        │
 └──────────────┘                                └─────────┬──────────┘
                                                             │
                    ┌────────────────────────────────────────┼───────────────────┐
                    ▼                                        ▼                   ▼
            database.py (SQLite)                   replication.py       failure_manager.py
        users / documents / nodes /                (copies files to     (marks nodes online/
        replicas / activity_logs /                  node_a/b/c,          offline, triggers
        sessions                                    finds available      synchronize_node)
                                                      replicas)
                                                             │
                                     ┌───────────────────────┼───────────────────────┐
                                     ▼                       ▼                       ▼
                         backend/storage/node_a   backend/storage/node_b   backend/storage/node_c
```

Authentication uses a simple server-tracked session token (returned at
login, stored in the `sessions` table, sent back by the frontend as an
`Authorization: Bearer <token>` header). This avoids cross-origin cookie
issues while still being a genuine server-side session, not a JWT.

## 8. Folder Structure
```
SafeStore/
├── backend/
│   ├── app.py              REST API and request handling
│   ├── database.py         All SQLite access functions
│   ├── replication.py      Replication + replica lookup logic
│   ├── failure_manager.py  Node failure / recovery logic
│   ├── requirements.txt
│   ├── database/
│   │   └── safestore.db    Created automatically on first run
│   └── storage/
│       ├── node_a/
│       ├── node_b/
│       └── node_c/
├── frontend/
│   ├── index.html          Login / register page
│   ├── dashboard.html      Main application dashboard
│   ├── css/style.css
│   └── js/
│       ├── login.js
│       └── dashboard.js
├── uploads/                 Origin copy of every uploaded file
└── README.md
```

## 9. Database Design

| Table            | Purpose                                                             |
|-------------------|----------------------------------------------------------------------|
| `users`           | id, username, email, password_hash, created_at                     |
| `nodes`           | id (node_a/b/c), name, status (online/offline), updated_at         |
| `documents`       | id, user_id, original_filename, stored_filename, file_type, file_size, upload_date |
| `replicas`        | id, document_id, node_id, status (available/missing), synced_at    |
| `activity_logs`   | id, user_id, action, details, timestamp                            |
| `sessions`        | token, user_id, created_at                                         |

All tables use primary keys, foreign keys (`ON DELETE CASCADE` where
appropriate), and timestamps. The database and the three node rows are
created automatically the first time the backend runs — no manual SQL
setup is required.

## 10. Distributed Replication Concept
When a file is uploaded:
1. The original file is saved once in `/uploads` (the origin copy).
2. The system checks which nodes are currently online.
3. The file is copied into every **online** node's storage folder
   (`backend/storage/node_a/`, `node_b/`, `node_c/`).
4. A `replicas` row is created for **every** node — `available` for nodes
   that received a copy, `missing` for any node that was offline at
   upload time.

Downloads never read from `/uploads` directly. They only read from a node
whose `replicas` row is `available` **and** whose `nodes` row is
`online` — so replication and failover are real, not simulated.

## 11. Failure Handling
- **Simulate failure:** `POST /api/nodes/<node_id>/fail` marks the node
  `offline` in the database. Its files stay on disk untouched, but the
  system stops treating it as a valid source.
- **Automatic failover:** if the node a user would normally read from is
  offline, `replication.get_available_replica_path()` walks the other
  replicas and serves the first one whose node is online.
- **Recovery:** `POST /api/nodes/<node_id>/recover` marks the node
  `online`, then calls `replication.synchronize_node()`, which checks
  every document, copies in any missing file from another active
  replica (or the `/uploads` origin copy), and updates the replica
  record to `available`.
- All of these actions are written to `activity_logs` (Node failed, Node
  recovered, Replica synchronized, etc.) so the whole process is visible
  during a live demo.

## 12. Installation

### Prerequisites
- Python 3.10+ installed and available on PATH
- A modern web browser (Chrome, Edge, Firefox)

### Steps (Windows PowerShell)
```powershell
# 1. Open the SafeStore folder in VS Code, then open a terminal (Ctrl + `)

# 2. Move into the backend folder
cd backend

# 3. Create a virtual environment
python -m venv venv

# 4. Activate the virtual environment
venv\Scripts\Activate.ps1

# 5. Install dependencies
pip install -r requirements.txt

# 6. Run the Flask backend
python app.py
```

You should see Flask start on `http://127.0.0.1:5000`. The database and
node folders are created automatically on first run.

### Opening the frontend
The frontend is static HTML/CSS/JS and talks to the backend over
`http://127.0.0.1:5000/api`. The simplest way to open it:

- In VS Code, right-click `frontend/index.html` and choose **"Open with
  Live Server"** (installable from the Extensions marketplace), **or**
- Just double-click `frontend/index.html` to open it directly in your
  browser.

Either way, log in or register, and you will be redirected to
`dashboard.html`.

## 13. How to Run — Full Demo Checklist
1. Start the backend (`python app.py` inside `backend/`, with the venv
   activated). Keep this terminal open.
2. Open `frontend/index.html` in your browser.
3. Click **Register**, create an account, then log in.
4. On the **Upload** tab, choose a file (e.g. `Resume.pdf`) and click
   **Upload & Replicate**.
5. Go to the **Documents** tab — the file shows as *Available* with all
   three nodes listed under "Available Nodes".
6. Go to **Node Status** and click **Simulate Failure** on Node A.
7. Node A now shows **Offline**. Go back to **Documents** — the file is
   still *Available* (served from Node B or Node C).
8. Click **Download** — the file downloads successfully even with Node A
   down.
9. Return to **Node Status** and click **Recover Node** on Node A.
10. Check **Activity Logs** — you will see a "Replica synchronized" entry
    confirming the file was copied back into Node A's folder.

## 14. API Overview

| Method | Endpoint                            | Description                        |
|--------|--------------------------------------|-------------------------------------|
| POST   | `/api/register`                     | Create a new user account          |
| POST   | `/api/login`                        | Log in, returns a session token    |
| POST   | `/api/logout`                       | Invalidate the current token       |
| GET    | `/api/dashboard`                    | Stats + node summary               |
| POST   | `/api/upload`                       | Upload and replicate a document    |
| GET    | `/api/documents`                    | List the current user's documents  |
| GET    | `/api/documents/<id>/download`      | Download (served from a live node) |
| DELETE | `/api/documents/<id>`               | Delete a document from all nodes   |
| GET    | `/api/nodes`                        | Current status of all three nodes  |
| POST   | `/api/nodes/<node_id>/fail`         | Simulate a node failure            |
| POST   | `/api/nodes/<node_id>/recover`      | Recover a node + resynchronize     |
| GET    | `/api/activity-logs`                | Recent system activity             |

All authenticated endpoints require an `Authorization: Bearer <token>`
header. Responses are JSON with a `success` boolean and appropriate HTTP
status codes (200/201 success, 400/401/404/409/413/500 for errors).

## 15. Testing Procedure
1. **Auth:** Try registering with a duplicate email/username (expect a
   409 error) and logging in with a wrong password (expect a 401 error).
2. **Upload:** Upload a file larger than 20 MB and confirm the "file too
   large" error. Upload an unsupported extension (e.g. `.exe`) and
   confirm it is rejected.
3. **Replication:** After uploading, check that the same file physically
   exists in `backend/storage/node_a`, `node_b`, and `node_c`.
4. **Failure/Availability:** Fail all three nodes one at a time. After
   the last one fails, confirm the Download button becomes disabled and
   the document shows as *Unavailable*.
5. **Recovery:** Recover the nodes again and confirm the document becomes
   *Available* once at least one node is back online, and that files
   missing from a recovered node reappear in its folder.
6. **Delete:** Delete a document and confirm its files are removed from
   `/uploads` and all three node folders.

## 16. Example Demonstration
1. Upload `Resume.pdf`.
2. Show it exists physically in `node_a`, `node_b`, and `node_c`.
3. Show all three nodes as ONLINE on the dashboard.
4. Simulate Node A failure — it turns OFFLINE.
5. Node B and Node C remain ONLINE.
6. Download `Resume.pdf` successfully (served from Node B or C).
7. Recover Node A.
8. Activity log shows "Replica synchronized" for Node A.
9. Node A is ONLINE and holds the file again.

## 17. Future Scope
- Replace the simulated node folders with real distributed nodes across
  separate machines or containers, communicating over a network API.
- Add configurable replication factor (e.g. replicate to 2 of 3 nodes
  instead of all 3).
- Add consistency mechanisms (e.g. checksums) to detect corrupted
  replicas, not just missing ones.
- Add role-based access control and document sharing between users.
- Add automated periodic health checks instead of manual fail/recover
  buttons.

## 18. Limitations
- Nodes are simulated as local folders on the same machine, not truly
  independent servers — this is intentional for a demonstrable academic
  project.
- Session tokens are stored server-side in SQLite without expiry logic;
  a production system would add token expiration and refresh.
- Only one active DBMS technology (SQLite) is used; a production
  distributed system would typically use a distributed database engine
  directly rather than simulating node behavior in application code.
