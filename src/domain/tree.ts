/**
 * Pure operations over tree hierarchies.
 *
 * Every function here is referentially transparent - no side effects,
 * no mutation, no imports from @forge/* packages.
 */

import { ok, err, type Result } from 'neverthrow';
import type { NodeId } from './node-id';
import type { LevelId } from './level-id';
import type { TreeNode, TreeConfig, PathSegment, ResolvedAnnotation } from './types';

// ---- Lookup ----

/** Find a node by ID anywhere in the tree. Returns undefined if absent. */
const findNode = (root: TreeNode, targetId: NodeId): TreeNode | undefined => {
  if (root.id === targetId) return root;
  for (const child of root.children) {
    const found = findNode(child, targetId);
    if (found !== undefined) return found;
  }
  return undefined;
};

/**
 * Build the path from root to the target node as PathSegments.
 * Returns an empty array if the node is not reachable from root.
 */
const pathTo = (root: TreeNode, targetId: NodeId): readonly PathSegment[] => {
  if (root.id === targetId) {
    return [{ levelId: root.levelId, nodeId: root.id, label: root.label }];
  }
  for (const child of root.children) {
    const childPath = pathTo(child, targetId);
    if (childPath.length > 0) {
      return [{ levelId: root.levelId, nodeId: root.id, label: root.label }, ...childPath];
    }
  }
  return [];
};

/**
 * Build the path from root to the target node as actual TreeNode references.
 * Needed for annotation resolution where we read node.annotations.
 * Returns an empty array if the node is not reachable.
 */
const nodePath = (root: TreeNode, targetId: NodeId): readonly TreeNode[] => {
  if (root.id === targetId) return [root];
  for (const child of root.children) {
    const childResult = nodePath(child, targetId);
    if (childResult.length > 0) return [root, ...childResult];
  }
  return [];
};

/** Get the immediate children of a node identified by `parentId`. */
const childrenOf = (root: TreeNode, parentId: NodeId): readonly TreeNode[] => {
  const parent = findNode(root, parentId);
  return parent?.children ?? [];
};

/** Get the immediate children of the root node (top-level items). */
const topLevel = (config: TreeConfig): readonly TreeNode[] => config.root.children;

// ---- Filtering ----

/** Filter children of `parentId` by their level. */
const childrenAtLevel = (root: TreeNode, parentId: NodeId, levelId: LevelId): readonly TreeNode[] =>
  childrenOf(root, parentId).filter(child => child.levelId === levelId);

/** Collect all nodes in the tree matching a label substring (case-insensitive). */
const search = (root: TreeNode, query: string): readonly TreeNode[] => {
  const lowerQuery = query.toLowerCase();
  const results: TreeNode[] = [];

  const walk = (node: TreeNode): void => {
    if (node.label.toLowerCase().includes(lowerQuery)) {
      results.push(node);
    }
    for (const child of node.children) {
      walk(child);
    }
  };

  walk(root);
  return results;
};

/**
 * Search nodes and return each match with its full path from root.
 * Useful for displaying search results with breadcrumb context.
 */
const searchWithPaths = (
  root: TreeNode,
  query: string,
): readonly { readonly node: TreeNode; readonly path: readonly PathSegment[] }[] => {
  const lowerQuery = query.toLowerCase();
  const results: { readonly node: TreeNode; readonly path: readonly PathSegment[] }[] = [];

  const walk = (node: TreeNode, ancestors: readonly PathSegment[]): void => {
    const currentPath: readonly PathSegment[] = [
      ...ancestors,
      { levelId: node.levelId, nodeId: node.id, label: node.label },
    ];
    if (node.label.toLowerCase().includes(lowerQuery)) {
      results.push({ node, path: currentPath });
    }
    for (const child of node.children) {
      walk(child, currentPath);
    }
  };

  walk(root, []);
  return results;
};

// ---- Annotation Resolution ----

/**
 * Resolve annotations for a set of selected node IDs.
 *
 * For each annotation definition on the tree config, walks each selected
 * node's path and collects values according to the resolution strategy.
 * Returns one ResolvedAnnotation per definition, with deduplicated values.
 */
const resolveAnnotations = (config: TreeConfig, selectedNodeIds: readonly NodeId[]): readonly ResolvedAnnotation[] => {
  if (config.annotations.length === 0) return [];

  const accumulated = new Map<string, Set<string>>();

  for (const nodeId of selectedNodeIds) {
    const path = nodePath(config.root, nodeId);
    if (path.length === 0) continue;

    // Skip root node - it's a virtual container
    const userPath = path[0]?.id === config.root.id ? path.slice(1) : path;

    for (const def of config.annotations) {
      const key = def.key as string;
      if (!accumulated.has(key)) accumulated.set(key, new Set());
      const values = accumulated.get(key) ?? new Set<string>();

      switch (def.resolution) {
        case 'union': {
          for (const node of userPath) {
            const nodeAnns = node.annotations[key];
            if (nodeAnns !== undefined) {
              for (const v of nodeAnns) values.add(v);
            }
          }
          break;
        }
        case 'nearest': {
          for (let i = userPath.length - 1; i >= 0; i--) {
            const node = userPath[i];
            if (node === undefined) continue;
            const nodeAnns = node.annotations[key];
            if (nodeAnns !== undefined && nodeAnns.length > 0) {
              for (const v of nodeAnns) values.add(v);
              break;
            }
          }
          break;
        }
        case 'explicit': {
          const selectedNode = userPath[userPath.length - 1];
          if (selectedNode !== undefined) {
            const nodeAnns = selectedNode.annotations[key];
            if (nodeAnns !== undefined) {
              for (const v of nodeAnns) values.add(v);
            }
          }
          break;
        }
      }
    }
  }

  return config.annotations.map(def => ({
    key: def.key,
    label: def.label,
    values: [...(accumulated.get(def.key as string) ?? [])],
  }));
};

// ---- Metrics ----

/** Count all nodes in the tree (excluding the root container). */
const nodeCount = (root: TreeNode): number => {
  let count = 0;
  const walk = (node: TreeNode): void => {
    count += 1;
    for (const child of node.children) {
      walk(child);
    }
  };
  for (const child of root.children) {
    walk(child);
  }
  return count;
};

/** Check whether a node has any children. */
const hasChildren = (root: TreeNode, nodeId: NodeId): boolean => {
  const node = findNode(root, nodeId);
  return node !== undefined && node.children.length > 0;
};

// ---- Validation ----

/** Verify that all nodes reference valid level IDs. */
const validateLevelRefs = (config: TreeConfig): Result<TreeConfig, readonly string[]> => {
  const validLevelIds = new Set(config.levels.map(l => l.id));
  const errors: string[] = [];

  const walk = (node: TreeNode): void => {
    if (!validLevelIds.has(node.levelId)) {
      errors.push(`Node "${node.label}" (${node.id as string}) references unknown level "${node.levelId as string}"`);
    }
    for (const child of node.children) {
      walk(child);
    }
  };

  for (const child of config.root.children) {
    walk(child);
  }

  return errors.length === 0 ? ok(config) : err(errors);
};

/** Verify that all node IDs within the tree are unique. */
const validateUniqueIds = (config: TreeConfig): Result<TreeConfig, readonly string[]> => {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];

  const walk = (node: TreeNode): void => {
    const idStr = node.id as string;
    const existing = seen.get(idStr);
    if (existing !== undefined) {
      duplicates.push(`Duplicate node ID "${idStr}" found on "${node.label}" and "${existing}"`);
    } else {
      seen.set(idStr, node.label);
    }
    for (const child of node.children) {
      walk(child);
    }
  };

  walk(config.root);
  return duplicates.length === 0 ? ok(config) : err(duplicates);
};

/** Verify that annotation keys used on nodes are defined in the config. */
const validateAnnotationRefs = (config: TreeConfig): Result<TreeConfig, readonly string[]> => {
  const validKeys = new Set(config.annotations.map(a => a.key as string));
  const errors: string[] = [];

  const walk = (node: TreeNode): void => {
    for (const key of Object.keys(node.annotations)) {
      if (!validKeys.has(key)) {
        errors.push(`Node "${node.label}" (${node.id as string}) has annotation key "${key}" not defined in config`);
      }
    }
    for (const child of node.children) {
      walk(child);
    }
  };

  for (const child of config.root.children) {
    walk(child);
  }

  return errors.length === 0 ? ok(config) : err(errors);
};

/** Run all tree validations and collect errors. */
const validate = (config: TreeConfig): Result<TreeConfig, readonly string[]> =>
  validateUniqueIds(config).andThen(validateLevelRefs).andThen(validateAnnotationRefs);

/**
 * Pure operations over tree hierarchies for {@link TreeConfig} and {@link TreeNode}.
 *
 * Lookup, filtering, search, annotation resolution, validation, and metrics.
 * All functions are referentially transparent with no side effects.
 */
export const Tree = {
  findNode,
  pathTo,
  nodePath,
  childrenOf,
  topLevel,
  childrenAtLevel,
  search,
  searchWithPaths,
  resolveAnnotations,
  nodeCount,
  hasChildren,
  validate,
  validateLevelRefs,
  validateUniqueIds,
  validateAnnotationRefs,
} as const;
