"""
app.py
Flask application entry point for SafeStore.

Wires together authentication, file upload/download, document management,
node failure/recovery, and activity logging into a REST API consumed by
the vanilla-JS frontend.

Authentication note:
The frontend is a set of static files that may be opened directly (or via
a lightweight static server) on a different origin/port than the Flask
API. To avoid cross-origin cookie complications for a student demo, auth
uses a simple opaque session token returned at login and sent back by the
frontend as an "Authorization: Bearer <token>" header. Tokens are stored
server-side in the 'sessions' table -- this is standard server-side
session tracking, just without relying on browser cookies.
"""

import os
import re
import secrets
import uuid
from functools import wraps

from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

import database
import replication
import failure_manager

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# frontend/ sits next to backend/ at the project root.
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

ALLOWED_EXTENSIONS = {"pdf", "doc", "docx", "txt", "png", "jpg", "jpeg"}
MAX_CONTENT_LENGTH = 20 * 1024 * 1024  # 20 MB

# static_folder=FRONTEND_DIR + static_url_path="" means every file under
# frontend/ is served at the matching root-relative URL, e.g.
# frontend/css/style.css -> /css/style.css
# frontend/js/login.js   -> /js/login.js
# frontend/dashboard.html -> /dashboard.html
# Flask does not auto-serve an index for "/", so that is added explicitly
# below.
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
CORS(app)


@app.route("/")
def serve_frontend_index():
    """Serve the SafeStore login/register page at the site root."""
    return send_from_directory(FRONTEND_DIR, "index.html")


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def json_error(message, status_code=400):
    return jsonify({"success": False, "error": message}), status_code


def require_auth(view_func):
    """Decorator that resolves the Authorization header into a user, or
    returns 401 if missing/invalid."""
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return json_error("Authentication required.", 401)

        token = auth_header.split(" ", 1)[1].strip()
        user_id = database.get_session_user_id(token)
        if not user_id:
            return json_error("Invalid or expired session.", 401)

        user = database.get_user_by_id(user_id)
        if not user:
            return json_error("Invalid or expired session.", 401)

        request.current_user = user
        return view_func(*args, **kwargs)

    return wrapped


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not username or not email or not password:
        return json_error("Username, email and password are required.")
    if not EMAIL_PATTERN.match(email):
        return json_error("Please enter a valid email address.")
    if len(password) < 8:
        return json_error("Password must contain at least 8 characters.")

    if database.get_user_by_email(email):
        return json_error("An account with this email already exists. Please log in instead.", 409)
    if database.get_user_by_username(username):
        return json_error("This username is already taken. Please choose another username.", 409)

    password_hash = generate_password_hash(password)
    user_id = database.create_user(username, email, password_hash)
    database.log_activity(user_id, "User registered", f"New account created for {username}")

    return jsonify({"success": True, "message": "Account created. You can now log in."}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    identifier = (data.get("email") or data.get("username") or "").strip().lower()
    password = data.get("password") or ""

    if not identifier or not password:
        return json_error("Email/username and password are required.")

    user = database.get_user_by_email(identifier) or database.get_user_by_username(identifier)
    if not user or not check_password_hash(user["password_hash"], password):
        return json_error("Incorrect email/username or password.", 401)

    token = secrets.token_hex(32)
    database.create_session(token, user["id"])
    database.log_activity(user["id"], "User logged in", f"{user['username']} logged in")

    return jsonify({
        "success": True,
        "token": token,
        "user": {"id": user["id"], "username": user["username"], "email": user["email"]},
    })


@app.route("/api/logout", methods=["POST"])
@require_auth
def logout():
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.split(" ", 1)[1].strip()
    database.delete_session(token)
    database.log_activity(request.current_user["id"], "User logged out",
                           f"{request.current_user['username']} logged out")
    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@app.route("/api/dashboard", methods=["GET"])
@require_auth
def dashboard():
    stats = database.get_dashboard_stats(request.current_user["id"])
    nodes = database.get_all_nodes()
    return jsonify({"success": True, "stats": stats, "nodes": nodes})


# ---------------------------------------------------------------------------
# Document endpoints
# ---------------------------------------------------------------------------

@app.route("/api/upload", methods=["POST"])
@require_auth
def upload_document():
    if "file" not in request.files:
        return json_error("No file part in the request.")

    file = request.files["file"]
    if file.filename == "":
        return json_error("No file selected.")

    if not allowed_file(file.filename):
        return json_error(
            "Unsupported file type. Allowed: " + ", ".join(sorted(ALLOWED_EXTENSIONS))
        )

    original_filename = secure_filename(file.filename)
    if not original_filename:
        return json_error("Invalid filename.")

    file_extension = original_filename.rsplit(".", 1)[1].lower()
    stored_filename = f"{uuid.uuid4().hex}.{file_extension}"

    replication.ensure_node_folders()
    origin_path = replication.get_origin_file_path(stored_filename)

    try:
        file.save(origin_path)
    except OSError:
        return json_error("Could not save the uploaded file.", 500)

    file_size = os.path.getsize(origin_path)
    user_id = request.current_user["id"]

    document_id = database.create_document(
        user_id=user_id,
        original_filename=original_filename,
        stored_filename=stored_filename,
        file_type=file_extension,
        file_size=file_size,
    )

    replication.replicate_file(document_id, origin_path, stored_filename)

    database.log_activity(
        user_id, "Document uploaded",
        f"'{original_filename}' uploaded and replicated across active nodes",
    )

    return jsonify({
        "success": True,
        "message": "Document uploaded and replicated.",
        "document_id": document_id,
    }), 201


@app.route("/api/documents", methods=["GET"])
@require_auth
def list_documents():
    user_id = request.current_user["id"]
    documents = database.get_documents_by_user(user_id)

    result = []
    for doc in documents:
        replicas = database.get_replicas_for_document(doc["id"])
        available_nodes = replication.get_document_node_summary(doc["id"])
        result.append({
            **doc,
            "is_available": len(available_nodes) > 0,
            "available_nodes": available_nodes,
            "replicas": replicas,
        })

    return jsonify({"success": True, "documents": result})


@app.route("/api/documents/<int:document_id>/download", methods=["GET"])
@require_auth
def download_document(document_id):
    document = database.get_document_by_id(document_id)
    if not document or document["user_id"] != request.current_user["id"]:
        return json_error("Document not found.", 404)

    file_path = replication.get_available_replica_path(document_id)
    if not file_path:
        return json_error(
            "This document is currently unavailable. All nodes holding a "
            "copy are offline.", 503
        )

    database.log_activity(
        request.current_user["id"], "Document downloaded",
        f"'{document['original_filename']}' downloaded",
    )

    return send_file(file_path, as_attachment=True, download_name=document["original_filename"])


@app.route("/api/documents/<int:document_id>", methods=["DELETE"])
@require_auth
def delete_document(document_id):
    document = database.get_document_by_id(document_id)
    if not document or document["user_id"] != request.current_user["id"]:
        return json_error("Document not found.", 404)

    replication.remove_document_from_all_nodes(document_id)
    database.delete_document(document_id)

    database.log_activity(
        request.current_user["id"], "Document deleted",
        f"'{document['original_filename']}' deleted from all nodes",
    )

    return jsonify({"success": True, "message": "Document deleted."})


# ---------------------------------------------------------------------------
# Node endpoints
# ---------------------------------------------------------------------------

@app.route("/api/nodes", methods=["GET"])
@require_auth
def list_nodes():
    return jsonify({"success": True, "nodes": database.get_all_nodes()})


@app.route("/api/nodes/<node_id>/fail", methods=["POST"])
@require_auth
def fail_node(node_id):
    try:
        node = failure_manager.mark_node_failed(node_id, user_id=request.current_user["id"])
    except ValueError as exc:
        return json_error(str(exc), 404)

    return jsonify({"success": True, "node": node})


@app.route("/api/nodes/<node_id>/recover", methods=["POST"])
@require_auth
def recover_node(node_id):
    try:
        result = failure_manager.recover_node(node_id, user_id=request.current_user["id"])
    except ValueError as exc:
        return json_error(str(exc), 404)

    return jsonify({
        "success": True,
        "node": result["node"],
        "synchronized_documents": result["synchronized_documents"],
    })


@app.route("/api/change-password", methods=["POST"])
@require_auth
def change_password():
    data = request.get_json(silent=True) or {}
    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""
    confirm_password = data.get("confirm_password") or ""

    user = request.current_user

    if not check_password_hash(user["password_hash"], current_password):
        return json_error("Current password is incorrect.", 401)
    if len(new_password) < 8:
        return json_error("New password must be at least 8 characters.")
    if new_password != confirm_password:
        return json_error("New passwords do not match.")
    if check_password_hash(user["password_hash"], new_password):
        return json_error("New password must be different from the current password.")

    database.update_user_password(user["id"], generate_password_hash(new_password))
    database.log_activity(user["id"], "Password changed", f"{user['username']} changed their password")

    return jsonify({"success": True, "message": "Password changed successfully."})


@app.route("/api/system-health", methods=["GET"])
@require_auth
def system_health():
    import datetime as _dt

    checks = []

    # API: if this handler is running, the API is reachable and auth passed.
    checks.append({"component": "Backend API", "status": "healthy", "detail": "Responding normally"})
    checks.append({"component": "Authentication", "status": "healthy", "detail": "Session token verified"})

    # Database: run a real query against SQLite.
    try:
        conn = database.get_connection()
        conn.execute("SELECT 1")
        conn.close()
        checks.append({"component": "Database", "status": "healthy", "detail": "SQLite connection OK"})
    except Exception:
        checks.append({"component": "Database", "status": "offline", "detail": "Could not query SQLite"})

    # Storage + Replication engine: verify each node folder exists and is writable.
    storage_ok = True
    for node_id in replication.NODE_IDS:
        node_path = replication.get_node_path(node_id)
        if not (os.path.isdir(node_path) and os.access(node_path, os.W_OK)):
            storage_ok = False
        node = database.get_node(node_id)
        status = "online" if node and node["status"] == "online" else "offline"
        checks.append({
            "component": node["name"] if node else node_id,
            "status": status,
            "detail": f"Storage path {'writable' if os.access(node_path, os.W_OK) else 'NOT writable'}",
        })

    checks.append({
        "component": "Storage",
        "status": "healthy" if storage_ok else "warning",
        "detail": "All node storage paths writable" if storage_ok else "One or more node paths are not writable",
    })
    checks.append({
        "component": "Replication Engine",
        "status": "healthy" if storage_ok else "warning",
        "detail": "Ready to replicate and synchronize documents",
    })

    overall = "healthy"
    if any(c["status"] == "offline" for c in checks):
        overall = "offline"
    elif any(c["status"] == "warning" for c in checks):
        overall = "warning"

    return jsonify({
        "success": True,
        "overall_status": overall,
        "checked_at": _dt.datetime.utcnow().isoformat() + "Z",
        "checks": checks,
    })


# ---------------------------------------------------------------------------
# Activity logs
# ---------------------------------------------------------------------------

@app.route("/api/activity-logs", methods=["GET"])
@require_auth
def activity_logs():
    logs = database.get_activity_logs(limit=100)
    return jsonify({"success": True, "logs": logs})


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def not_found(_error):
    return json_error("The requested resource was not found.", 404)


@app.errorhandler(413)
def file_too_large(_error):
    return json_error("File is too large. Maximum size is 20 MB.", 413)


@app.errorhandler(500)
def server_error(_error):
    return json_error("An unexpected server error occurred.", 500)


if __name__ == "__main__":
    database.init_db()
    replication.ensure_node_folders()
    app.run(host="0.0.0.0", port=5000, debug=True)
