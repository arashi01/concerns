/**
 * Immutable tree mutation functions.
 *
 * Each function returns a new tree root via structural sharing (spread).
 * No mutation, no side effects, no @forge/* dependencies.
 */

import type { NodeId } from './node-id';
import type { TreeNode, TreeConfig, AnnotationDefinition } from './types';

// ──── Node-level mutations ────

/** Add a child node to the specified parent. Returns the new root. */
const addNode = (root: TreeNode, parentId: NodeId, newNode: TreeNode): TreeNode => {
  if (root.id === parentId) {
    return { ...root, children: [...root.children, newNode] };
  }
  return {
    ...root,
    children: root.children.map(child => addNode(child, parentId, newNode)),
  };
};

/** Remove a node (and its entire subtree) by ID. Returns the new root. */
const removeNode = (root: TreeNode, targetId: NodeId): TreeNode => ({
  ...root,
  children: root.children.filter(child => child.id !== targetId).map(child => removeNode(child, targetId)),
});

/** Rename a node's label. Returns the new root. */
const renameNode = (root: TreeNode, targetId: NodeId, newLabel: string): TreeNode => {
  if (root.id === targetId) {
    return { ...root, label: newLabel };
  }
  return {
    ...root,
    children: root.children.map(child => renameNode(child, targetId, newLabel)),
  };
};

/**
 * Move a node up or down among its siblings.
 * Returns the new root. No-op if the node is already at the boundary.
 */
const moveNode = (root: TreeNode, targetId: NodeId, direction: 'up' | 'down'): TreeNode => {
  const idx = root.children.findIndex(c => c.id === targetId);
  if (idx !== -1) {
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= root.children.length) return root;

    const children = [...root.children];
    const [moved] = children.splice(idx, 1);
    if (moved === undefined) return root;
    children.splice(newIdx, 0, moved);
    return { ...root, children };
  }
  return {
    ...root,
    children: root.children.map(child => moveNode(child, targetId, direction)),
  };
};

/** Set annotations on a specific node. Returns the new root. */
const setNodeAnnotations = (
  root: TreeNode,
  targetId: NodeId,
  annotations: Readonly<Record<string, readonly string[]>>,
): TreeNode => {
  if (root.id === targetId) {
    return { ...root, annotations };
  }
  return {
    ...root,
    children: root.children.map(child => setNodeAnnotations(child, targetId, annotations)),
  };
};

// ──── Config-level mutations ────

/** Replace the annotation definitions on a tree config. */
const updateAnnotationDefs = (config: TreeConfig, annotations: readonly AnnotationDefinition[]): TreeConfig => ({
  ...config,
  annotations,
});

/**
 * Immutable tree mutation operations for {@link TreeNode} and {@link TreeConfig}.
 *
 * Add, remove, rename, reorder nodes, and update annotation definitions.
 * All functions return new trees via structural sharing.
 */
export const TreeMutate = {
  addNode,
  removeNode,
  renameNode,
  moveNode,
  setNodeAnnotations,
  updateAnnotationDefs,
} as const;
