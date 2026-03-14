/**
 * Construction and manipulation of the custom field value.
 *
 * The field value is the JSON object stored on each Jira issue.
 * It contains selections (paths through the tree) with denormalised
 * level labels for JQL indexing via searchAlias.
 */

import type { NodeId } from './node-id';
import type { TreeConfig, Selection, FieldValue as FieldValueData, PathSegment } from './types';
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

/**
 * Construction, manipulation, and formatting utilities for {@link FieldValue}.
 *
 * Selection building, add/remove, formatting, and node ID extraction.
 */
export const FieldValue = {
  MAX_INDEXED_LEVELS,
  empty,
  fromNodeIds,
  selectionFromNode,
  addSelection,
  removeSelection,
  format,
  selectedNodeIds,
} as const;
