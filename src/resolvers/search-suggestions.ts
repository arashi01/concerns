/**
 * JQL value function for search alias autocomplete.
 *
 * When users type JQL like `Level1 = "Mom..."`, this function
 * provides autocomplete suggestions by walking the tree at the
 * corresponding depth and matching labels.
 *
 * Note: The exact Forge manifest syntax for value functions on
 * object-type fields with searchAlias is under-documented. This
 * handler may need adjustment after deploy testing.
 */

import { TreeStorage } from './tree-storage';
import { TreeId } from '../domain/tree-id';
import type { TreeNode } from '../domain/types';

interface ValueFunctionRequest {
  readonly context: {
    readonly configuration?: { readonly treeId?: string } | undefined;
    readonly searchAlias?: string | undefined;
    readonly query?: string | undefined;
  };
}

interface ValueResult {
  readonly results: readonly { readonly label: string; readonly value: string }[];
}

/** Map searchAlias names (Level1-Level6) to depth indices (0-5). */
const aliasToDepth = (alias: string): number | undefined => {
  const match = /^Level(\d)$/.exec(alias);
  if (match === null) return undefined;
  const num = Number(match[1]);
  return num >= 1 && num <= 6 ? num - 1 : undefined;
};

/** Collect all labels at a specific depth in the tree. */
const labelsAtDepth = (root: TreeNode, targetDepth: number): Set<string> => {
  const labels = new Set<string>();

  const walk = (node: TreeNode, currentDepth: number): void => {
    if (currentDepth === targetDepth) {
      labels.add(node.label);
      return;
    }
    for (const child of node.children) {
      walk(child, currentDepth + 1);
    }
  };

  // Start from root's children (depth 0 = first real level)
  for (const child of root.children) {
    walk(child, 0);
  }

  return labels;
};

export const handler = async (req: ValueFunctionRequest): Promise<ValueResult> => {
  const config = req.context.configuration;
  const alias = req.context.searchAlias ?? '';
  const query = (req.context.query ?? '').toLowerCase().trim();

  if (config?.treeId === undefined) {
    return { results: [] };
  }

  const depth = aliasToDepth(alias);
  if (depth === undefined) {
    return { results: [] };
  }

  const treeId = TreeId.parse(config.treeId);
  if (treeId.isErr()) {
    return { results: [] };
  }

  const treeResult = await TreeStorage.getTree(treeId.value);
  return treeResult.match(
    tree => {
      if (tree === undefined) return { results: [] };

      const allLabels = labelsAtDepth(tree.root, depth);
      const filtered = [...allLabels].filter(label => query === '' || label.toLowerCase().includes(query)).sort();

      return {
        results: filtered.map(label => ({ label, value: label })),
      };
    },
    () => ({ results: [] }),
  );
};
