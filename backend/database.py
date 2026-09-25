"""
database.py
Reusable SQLite database layer for SafeStore.

Every function in this module opens its own short-lived connection.
This keeps the module simple and avoids sharing connections across
Flask's threaded request handling. All queries are parameterized to
prevent SQL injection.
"""

import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, "database")
DB_PATH = os.path.join(DB_DIR, "safestore.db")

NODE_DEFINITIONS = [
    ("node_a", "Node A"),
    ("node_b", "Node B"),
    ("node_c", "Node C"),
]


def get_connection():
    """Return a new SQLite connection with row access by column name."""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Create all tables if they do not exist yet, and seed the nodes table."""
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'online',
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            original_filename TEXT NOT NULL,
            stored_filename TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            upload_date TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS replicas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            node_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'available',
            synced_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE,
            FOREIGN KEY (node_id) REFERENCES nodes (id),
            UNIQUE (document_id, node_id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            details TEXT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)

    # Seed the three storage nodes if they are not present yet.
    for node_id, node_name in NODE_DEFINITIONS:
        cur.execute("""
            INSERT OR IGNORE INTO nodes (id, name, status) VALUES (?, ?, 'online')
        """, (node_id, node_name))

    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# User operations
# ---------------------------------------------------------------------------

def create_user(username, email, password_hash):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
        (username, email, password_hash),
    )
    conn.commit()
    user_id = cur.lastrowid
    conn.close()
    return user_id


def get_user_by_email(email):
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_username(username):
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(user_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_user_password(user_id, new_password_hash):
    conn = get_connection()
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_password_hash, user_id))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Session operations (lightweight token-based session, avoids cross-origin
# cookie issues when the frontend is opened as a static file)
# ---------------------------------------------------------------------------

def create_session(token, user_id):
    conn = get_connection()
    conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    conn.commit()
    conn.close()


def get_session_user_id(token):
    conn = get_connection()
    row = conn.execute("SELECT user_id FROM sessions WHERE token = ?", (token,)).fetchone()
    conn.close()
    return row["user_id"] if row else None


def delete_session(token):
    conn = get_connection()
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Document operations
# ---------------------------------------------------------------------------

def create_document(user_id, original_filename, stored_filename, file_type, file_size):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO documents (user_id, original_filename, stored_filename, file_type, file_size)
        VALUES (?, ?, ?, ?, ?)
    """, (user_id, original_filename, stored_filename, file_type, file_size))
    conn.commit()
    document_id = cur.lastrowid
    conn.close()
    return document_id


def get_documents_by_user(user_id):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM documents WHERE user_id = ? ORDER BY upload_date DESC",
        (user_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_document_by_id(document_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_document(document_id):
    conn = get_connection()
    conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))
    conn.commit()
    conn.close()


def count_documents_by_user(user_id):
    conn = get_connection()
    row = conn.execute(
        "SELECT COUNT(*) AS total FROM documents WHERE user_id = ?", (user_id,)
    ).fetchone()
    conn.close()
    return row["total"]


# ---------------------------------------------------------------------------
# Replica operations
# ---------------------------------------------------------------------------

def create_replica(document_id, node_id, status="available"):
    conn = get_connection()
    conn.execute("""
        INSERT INTO replicas (document_id, node_id, status)
        VALUES (?, ?, ?)
        ON CONFLICT(document_id, node_id) DO UPDATE SET
            status = excluded.status,
            synced_at = datetime('now')
    """, (document_id, node_id, status))
    conn.commit()
    conn.close()


def update_replica_status(document_id, node_id, status):
    conn = get_connection()
    conn.execute("""
        UPDATE replicas SET status = ?, synced_at = datetime('now')
        WHERE document_id = ? AND node_id = ?
    """, (status, document_id, node_id))
    conn.commit()
    conn.close()


def get_replicas_for_document(document_id):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM replicas WHERE document_id = ?", (document_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_replica(document_id, node_id):
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM replicas WHERE document_id = ? AND node_id = ?",
        (document_id, node_id),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_document_ids():
    conn = get_connection()
    rows = conn.execute("SELECT id FROM documents").fetchall()
    conn.close()
    return [r["id"] for r in rows]


# ---------------------------------------------------------------------------
# Node operations
# ---------------------------------------------------------------------------

def get_all_nodes():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM nodes ORDER BY id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_node(node_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM nodes WHERE id = ?", (node_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_node_status(node_id, status):
    conn = get_connection()
    conn.execute(
        "UPDATE nodes SET status = ?, updated_at = datetime('now') WHERE id = ?",
        (status, node_id),
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Activity log operations
# ---------------------------------------------------------------------------

def log_activity(user_id, action, details=""):
    conn = get_connection()
    conn.execute(
        "INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)",
        (user_id, action, details),
    )
    conn.commit()
    conn.close()


def get_activity_logs(user_id=None, limit=50):
    conn = get_connection()
    if user_id is not None:
        rows = conn.execute("""
            SELECT * FROM activity_logs WHERE user_id = ?
            ORDER BY timestamp DESC LIMIT ?
        """, (user_id, limit)).fetchall()
    else:
        rows = conn.execute("""
            SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT ?
        """, (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Dashboard aggregate stats
# ---------------------------------------------------------------------------

def get_dashboard_stats(user_id):
    conn = get_connection()

    total_documents = conn.execute(
        "SELECT COUNT(*) AS c FROM documents WHERE user_id = ?", (user_id,)
    ).fetchone()["c"]

    active_nodes = conn.execute(
        "SELECT COUNT(*) AS c FROM nodes WHERE status = 'online'"
    ).fetchone()["c"]

    failed_nodes = conn.execute(
        "SELECT COUNT(*) AS c FROM nodes WHERE status = 'offline'"
    ).fetchone()["c"]

    # A document is "available" if at least one of its replicas sits on an
    # online node with replica status 'available'.
    available_documents = conn.execute("""
        SELECT COUNT(DISTINCT d.id) AS c
        FROM documents d
        JOIN replicas r ON r.document_id = d.id
        JOIN nodes n ON n.id = r.node_id
        WHERE d.user_id = ? AND r.status = 'available' AND n.status = 'online'
    """, (user_id,)).fetchone()["c"]

    conn.close()

    return {
        "total_documents": total_documents,
        "available_documents": available_documents,
        "active_nodes": active_nodes,
        "failed_nodes": failed_nodes,
    }
