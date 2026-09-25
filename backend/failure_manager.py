"""
failure_manager.py
Handles marking storage nodes as failed or recovered, and exposes helpers
for querying which nodes are currently active. Actual file synchronization
on recovery is delegated to replication.py.
"""

import database
import replication

VALID_NODE_IDS = {"node_a", "node_b", "node_c"}


def check_node_status(node_id):
    """Return the current status string ('online' / 'offline') of a node,
    or None if the node id is not recognized."""
    node = database.get_node(node_id)
    return node["status"] if node else None


def get_active_nodes():
    return [n for n in database.get_all_nodes() if n["status"] == "online"]


def get_failed_nodes():
    return [n for n in database.get_all_nodes() if n["status"] == "offline"]


def mark_node_failed(node_id, user_id=None):
    """
    Simulate a node failure. The node is marked offline; its files remain
    physically present on disk (they are simply no longer considered a
    valid download source while offline), so recovery can later verify
    what survived versus what needs resynchronization.
    """
    if node_id not in VALID_NODE_IDS:
        raise ValueError(f"Unknown node id: {node_id}")

    node = database.get_node(node_id)
    if not node:
        raise ValueError(f"Node not found: {node_id}")
    if node["status"] == "offline":
        return node

    database.update_node_status(node_id, "offline")
    database.log_activity(user_id, "Node failed", f"{node['name']} ({node_id}) marked OFFLINE")
    return database.get_node(node_id)


def recover_node(node_id, user_id=None):
    """
    Bring a failed node back online and resynchronize any documents it is
    missing from an active replica (or the origin copy in /uploads).
    """
    if node_id not in VALID_NODE_IDS:
        raise ValueError(f"Unknown node id: {node_id}")

    node = database.get_node(node_id)
    if not node:
        raise ValueError(f"Node not found: {node_id}")

    database.update_node_status(node_id, "online")
    database.log_activity(user_id, "Node recovered", f"{node['name']} ({node_id}) marked ONLINE")

    synchronized_count = replication.synchronize_node(node_id)

    if synchronized_count > 0:
        database.log_activity(
            user_id,
            "Replica synchronized",
            f"{synchronized_count} document(s) resynchronized to {node_id}",
        )

    return {
        "node": database.get_node(node_id),
        "synchronized_documents": synchronized_count,
    }
