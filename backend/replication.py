"""
replication.py
Handles distributed replication of uploaded documents across the three
simulated storage nodes (node_a, node_b, node_c).

Design:
- The original uploaded file is kept permanently in /uploads (the origin
  copy). This is only ever used as a synchronization source, never served
  directly for download -- downloads are always served from a live node,
  so node failures genuinely affect availability.
- Each node has its own folder under backend/storage/<node_id>/.
- The 'replicas' table tracks, for every (document, node) pair, whether
  that node currently holds a usable copy of the file.
"""

import os
import shutil

import database

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
UPLOADS_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "uploads"))

NODE_IDS = ["node_a", "node_b", "node_c"]


def get_node_path(node_id):
    """Absolute path to a node's storage folder."""
    return os.path.join(STORAGE_DIR, node_id)


def get_node_file_path(node_id, stored_filename):
    return os.path.join(get_node_path(node_id), stored_filename)


def get_origin_file_path(stored_filename):
    return os.path.join(UPLOADS_DIR, stored_filename)


def ensure_node_folders():
    for node_id in NODE_IDS:
        os.makedirs(get_node_path(node_id), exist_ok=True)
    os.makedirs(UPLOADS_DIR, exist_ok=True)


def replicate_file(document_id, origin_path, stored_filename):
    """
    Copy the newly uploaded file (already saved at origin_path in /uploads)
    into every currently active node's storage folder, and record a
    replica entry for every node.

    A node that is offline at upload time still gets a replica record, but
    marked as 'missing' -- it will be caught up later by synchronize_node()
    once it comes back online.
    """
    ensure_node_folders()
    active_node_ids = {n["id"] for n in database.get_all_nodes() if n["status"] == "online"}

    for node_id in NODE_IDS:
        if node_id in active_node_ids:
            destination = get_node_file_path(node_id, stored_filename)
            shutil.copyfile(origin_path, destination)
            database.create_replica(document_id, node_id, status="available")
            database.log_activity(
                None,
                "Document replicated",
                f"Document #{document_id} replicated to {node_id}",
            )
        else:
            database.create_replica(document_id, node_id, status="missing")


def get_available_replica_path(document_id):
    """
    Find a usable copy of a document: a replica marked 'available' whose
    node is currently 'online'. Returns the file path, or None if the
    document is not available on any active node.
    """
    replicas = database.get_replicas_for_document(document_id)
    nodes_by_id = {n["id"]: n for n in database.get_all_nodes()}
    document = database.get_document_by_id(document_id)
    if not document:
        return None

    for replica in replicas:
        node = nodes_by_id.get(replica["node_id"])
        if not node:
            continue
        if node["status"] == "online" and replica["status"] == "available":
            path = get_node_file_path(replica["node_id"], document["stored_filename"])
            if os.path.exists(path):
                return path

    return None


def is_document_available(document_id):
    return get_available_replica_path(document_id) is not None


def get_document_node_summary(document_id):
    """
    Return, for a document, the list of node ids that currently hold an
    available copy, considering both replica status and node status.
    """
    replicas = database.get_replicas_for_document(document_id)
    nodes_by_id = {n["id"]: n for n in database.get_all_nodes()}
    available_nodes = []
    for replica in replicas:
        node = nodes_by_id.get(replica["node_id"])
        if node and node["status"] == "online" and replica["status"] == "available":
            available_nodes.append(replica["node_id"])
    return available_nodes


def remove_document_from_all_nodes(document_id):
    """Delete the physical file from every node and from /uploads, and let
    the caller remove the database rows (cascades to replicas)."""
    document = database.get_document_by_id(document_id)
    if not document:
        return

    stored_filename = document["stored_filename"]

    for node_id in NODE_IDS:
        path = get_node_file_path(node_id, stored_filename)
        if os.path.exists(path):
            os.remove(path)

    origin_path = get_origin_file_path(stored_filename)
    if os.path.exists(origin_path):
        os.remove(origin_path)


def synchronize_node(node_id):
    """
    Called when a node comes back online. For every document, check whether
    this node has a usable copy. If not, copy it in from another available
    replica (or, failing that, from the /uploads origin copy) and mark the
    replica as available again.

    Returns the number of documents that were synchronized.
    """
    ensure_node_folders()
    synchronized_count = 0

    for document_id in database.get_all_document_ids():
        document = database.get_document_by_id(document_id)
        if not document:
            continue

        stored_filename = document["stored_filename"]
        target_path = get_node_file_path(node_id, stored_filename)

        replica = database.get_replica(document_id, node_id)
        needs_sync = (
            replica is None
            or replica["status"] != "available"
            or not os.path.exists(target_path)
        )

        if not needs_sync:
            continue

        # Find a source copy: prefer another active node, fall back to the
        # /uploads origin copy.
        source_path = get_available_replica_path(document_id)
        if not source_path:
            origin_path = get_origin_file_path(stored_filename)
            if os.path.exists(origin_path):
                source_path = origin_path

        if not source_path:
            # No source available anywhere -- cannot recover this document.
            continue

        shutil.copyfile(source_path, target_path)
        database.create_replica(document_id, node_id, status="available")
        database.log_activity(
            document["user_id"],
            "Replica synchronized",
            f"Document '{document['original_filename']}' resynchronized to {node_id}",
        )
        synchronized_count += 1

    return synchronized_count
