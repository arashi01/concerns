/**
 * Construction and manipulation of the custom field value.
 *
 * The field value is the JSON object stored on each Jira issue.
 * It contains selections (paths through the tree) with denormalised
 * level labels for JQL indexing via searchAlias.
 */

import type { NodeId } from './node-id';
import type { TreeConfig, Selection, FieldValue as FieldValueData, PathSegment, DisplayNode } from './types';
import { Tree } from './tree';

/** Re-export the data type so this module is the single canonical source for FieldValue. */
export type FieldValue = FieldValueData;

/** Maximum number of JQL-indexed levels (Level1 through Level6). */
const MAX_INDEXED_LEVELS = 6;

/**
 * Build a Selection from a target node ID within a tree.
 * Returns undefined if the node is not found in the tree.
 */
const selectionFromNode = (config: TreeConfig, nodeId: NodeId): Selection | undefined => {
  const fullPath = Tree.pathTo(config.root, nodeId);
  if (fullPath.length === 0) return undefined;

  // The root node is a virtual container - skip it in the user-facing path
  const path: readonly PathSegment[] = fullPath[0]?.nodeId === config.root.id ? fullPath.slice(1) : fullPath;

  const labels = path.map(seg => seg.label);

  return {
    path,
    labels,
    l0: labels[0],
    l1: labels[1],
    l2: labels[2],
    l3: labels[3],
    l4: labels[4],
    l5: labels[5],
  };
};

/**
 * Construct a FieldValue from a set of selected node IDs.
 * Invalid node IDs (not found in tree) are silently excluded.
 */
const fromNodeIds = (config: TreeConfig, nodeIds: readonly NodeId[]): FieldValue => {
  const selections: Selection[] = [];
  for (const nodeId of nodeIds) {
    const selection = selectionFromNode(config, nodeId);
    if (selection !== undefined) {
      selections.push(selection);
    }
  }
  return { selections };
};

/** Create an empty field value (no selections). */
const empty: FieldValue = { selections: [] };

/** Add a selection to an existing field value. Deduplicates by node ID. */
const addSelection = (fieldValue: FieldValue, config: TreeConfig, nodeId: NodeId): FieldValue => {
  // Check if this node is already selected
  const alreadySelected = fieldValue.selections.some(
    s => s.path.length > 0 && s.path[s.path.length - 1]?.nodeId === nodeId,
  );
  if (alreadySelected) return fieldValue;

  const selection = selectionFromNode(config, nodeId);
  if (selection === undefined) return fieldValue;

  return { selections: [...fieldValue.selections, selection] };
};

/** Remove a selection by the terminal node ID of its path. */
const removeSelection = (fieldValue: FieldValue, nodeId: NodeId): FieldValue => ({
  selections: fieldValue.selections.filter(s => s.path.length === 0 || s.path[s.path.length - 1]?.nodeId !== nodeId),
});

/** Format the field value as a human-readable string (mirrors the formatter expression). */
const format = (fieldValue: FieldValue): string => fieldValue.selections.map(s => s.labels.join(' > ')).join('; ');

/** Extract all terminal node IDs from the field value. */
const selectedNodeIds = (fieldValue: FieldValue): readonly NodeId[] =>
  fieldValue.selections.flatMap(s => {
    const last = s.path[s.path.length - 1];
    return last !== undefined ? [last.nodeId] : [];
  });

// ---- Display Grouping ----

/** Mutable trie node used during construction only. */
interface TrieNode {
  readonly label: string;
  readonly depth: number;
  isLeaf: boolean;
  readonly children: Map<string, TrieNode>;
}

/** Convert a mutable trie into an immutable DisplayNode tree. */
const freezeTrie = (node: TrieNode): DisplayNode => ({
  label: node.label,
  depth: node.depth,
  isLeaf: node.isLeaf,
  children: [...node.children.values()].map(freezeTrie),
});

/**
 * Group selections sharing common ancestors into a display tree.
 * Returns an array of root-level {@link DisplayNode} entries suitable
 * for hierarchical rendering in the view UI.
 */
const groupSelections = (fieldValue: FieldValue): readonly DisplayNode[] => {
  const roots = new Map<string, TrieNode>();

  for (const selection of fieldValue.selections) {
    let siblings = roots;
    for (let i = 0; i < selection.labels.length; i++) {
      const label = selection.labels[i];
      if (label === undefined) continue;

      let node = siblings.get(label);
      if (node === undefined) {
        node = { label, depth: i, isLeaf: false, children: new Map() };
        siblings.set(label, node);
      }
      if (i === selection.labels.length - 1) {
        node.isLeaf = true;
      }
      siblings = node.children;
    }
  }

  return [...roots.values()].map(freezeTrie);
};

// ---- Condensed Breadcrumb Formatting ----

/** Visual breadcrumb separator for display. U+203A single right-pointing angle quotation mark. */
const BREADCRUMB_SEP = ' \u203A ';

/**
 * Format a field value as condensed breadcrumb lines with leaf grouping.
 *
 * Selections sharing a common ancestor path are merged onto one line
 * with comma-separated leaf labels. Produces one line per distinct
 * branch rather than one per selection.
 *
 * Example: two selections under the same sub-county produce
 * `["Mombasa \u203A Mvita \u203A Plot 52, Plot 67"]` (single line).
 */
const formatGrouped = (fieldValue: FieldValue): readonly string[] => {
  const roots = groupSelections(fieldValue);
  const lines: string[] = [];

  const walk = (node: DisplayNode, prefix: string): void => {
    const path = prefix === '' ? node.label : `${prefix}${BREADCRUMB_SEP}${node.label}`;

    if (node.children.length === 0) {
      lines.push(path);
      return;
    }

    const allChildrenTerminal = node.children.every(c => c.children.length === 0);

    if (allChildrenTerminal) {
      lines.push(`${path}${BREADCRUMB_SEP}${node.children.map(c => c.label).join(', ')}`);
      return;
    }

    for (const child of node.children) {
      walk(child, path);
    }
  };

  for (const root of roots) {
    walk(root, '');
  }

  return lines;
};

/**
 * Flatten a display tree into a linear list via pre-order traversal.
 * Each entry carries its depth for indentation-based rendering.
 */
const flattenDisplay = (nodes: readonly DisplayNode[]): readonly DisplayNode[] => {
  const result: DisplayNode[] = [];
  const walk = (node: DisplayNode): void => {
    result.push(node);
    for (const child of node.children) {
      walk(child);
    }
  };
  for (const node of nodes) {
    walk(node);
  }
  return result;
};

/**
 * Construction, manipulation, formatting, and display utilities for {@link FieldValue}.
 *
 * Selection building, add/remove, formatting, node ID extraction,
 * and hierarchical display grouping.
 */
export const FieldValue = {
  MAX_INDEXED_LEVELS,
  BREADCRUMB_SEP,
  empty,
  fromNodeIds,
  selectionFromNode,
  addSelection,
  removeSelection,
  format,
  formatGrouped,
  selectedNodeIds,
  groupSelections,
  flattenDisplay,
} as const;
