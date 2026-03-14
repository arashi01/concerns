/**
 * Forge resolver definitions.
 *
 * Maps invoke() keys from the frontend to backend handlers.
 * Each handler delegates to TreeStorage and returns plain objects
 * that the bridge serialises to the Custom UI / UI Kit frontend.
 */

import Resolver from '@forge/resolver';
import { TreeStorage } from './tree-storage';
import { TreeId } from '../domain/tree-id';
import { NodeId } from '../domain/node-id';
import { Tree } from '../domain/tree';
import { Schemas } from '../domain/schemas';
import { Import } from '../domain/import';
import { Sanitise } from '../domain/sanitise';

interface ResolverRequest {
  readonly payload: Record<string, unknown>;
  readonly context: Record<string, unknown>;
}

const resolver = new Resolver();

// ---- Tree CRUD ----

resolver.define('getTree', async (req: ResolverRequest) => {
  const treeId = TreeId.parse(req.payload['treeId']);
  if (treeId.isErr()) return { error: treeId.error };

  const result = await TreeStorage.getTree(treeId.value);
  return result.match(
    tree => (tree !== undefined ? { data: tree } : { error: 'Tree not found' }),
    error => ({ error }),
  );
});

resolver.define('listTrees', async () => {
  const result = await TreeStorage.listTrees();
  return result.match(
    summaries => ({ data: summaries }),
    error => ({ error }),
  );
});

resolver.define('saveTree', async (req: ResolverRequest) => {
  const parsed = Schemas.treeConfig.safeParse(req.payload['tree']);
  if (!parsed.success) return { error: `Invalid tree: ${parsed.error.message}` };

  const sanitised = Sanitise.sanitiseTreeConfig(parsed.data);
  if (sanitised.isErr()) return { error: sanitised.error.join('; ') };

  const result = await TreeStorage.saveTree(sanitised.value);
  return result.match(
    tree => ({ data: tree }),
    error => ({ error }),
  );
});

resolver.define('deleteTree', async (req: ResolverRequest) => {
  const treeId = TreeId.parse(req.payload['treeId']);
  if (treeId.isErr()) return { error: treeId.error };

  const result = await TreeStorage.deleteTree(treeId.value);
  return result.match(
    () => ({ data: { success: true } }),
    error => ({ error }),
  );
});

// ---- Tree Query (for edit UI) ----

resolver.define('getChildren', async (req: ResolverRequest) => {
  const treeId = TreeId.parse(req.payload['treeId']);
  if (treeId.isErr()) return { error: treeId.error };

  const treeResult = await TreeStorage.getTree(treeId.value);
  return treeResult.match(
    tree => {
      if (tree === undefined) return { error: 'Tree not found' };

      const parentId = req.payload['parentId'];
      if (typeof parentId !== 'string') {
        return { data: Tree.topLevel(tree) };
      }

      const children = Tree.childrenOf(tree.root, NodeId.of(parentId));
      return { data: children };
    },
    error => ({ error }),
  );
});

resolver.define('searchTree', async (req: ResolverRequest) => {
  const treeId = TreeId.parse(req.payload['treeId']);
  if (treeId.isErr()) return { error: treeId.error };

  const query = req.payload['query'];
  if (typeof query !== 'string') return { error: 'query must be a string' };
  const trimmedQuery = query.trim();

  const treeResult = await TreeStorage.getTree(treeId.value);
  return treeResult.match(
    tree => {
      if (tree === undefined) return { error: 'Tree not found' };

      const results = Tree.searchWithPaths(tree.root, trimmedQuery);
      return { data: results };
    },
    error => ({ error }),
  );
});

// ---- Annotation Resolution (for derived field) ----

resolver.define('resolveAnnotations', async (req: ResolverRequest) => {
  const treeId = TreeId.parse(req.payload['treeId']);
  if (treeId.isErr()) return { error: treeId.error };

  const rawIds = req.payload['nodeIds'];
  if (!Array.isArray(rawIds)) return { error: 'nodeIds must be an array' };

  const nodeIds = rawIds.filter((id): id is string => typeof id === 'string' && id.length > 0).map(id => NodeId.of(id));

  const treeResult = await TreeStorage.getTree(treeId.value);
  return treeResult.match(
    tree => {
      if (tree === undefined) return { error: 'Tree not found' };
      const resolved = Tree.resolveAnnotations(tree, nodeIds);
      return { data: resolved };
    },
    error => ({ error }),
  );
});

// ---- Import (simplified format -> full TreeConfig) ----

resolver.define('importTree', async (req: ResolverRequest) => {
  const parsed = Schemas.importTree.safeParse(req.payload['tree']);
  if (!parsed.success) return { error: `Invalid import: ${parsed.error.message}` };

  const result = Import.transformImport(parsed.data, () => crypto.randomUUID());
  if (result.isErr()) return { error: result.error.join('; ') };

  const sanitised = Sanitise.sanitiseTreeConfig(result.value);
  if (sanitised.isErr()) return { error: sanitised.error.join('; ') };

  const saved = await TreeStorage.saveTree(sanitised.value);
  return saved.match(
    tree => ({ data: tree }),
    error => ({ error }),
  );
});

export const handler = resolver.getDefinitions();
