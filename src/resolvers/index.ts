/**
 * Forge resolver definitions.
 *
 * Maps invoke() keys from the frontend to backend handlers.
 * Each handler delegates to TreeStorage and returns plain objects
 * that the bridge serialises to the Custom UI / UI Kit frontend.
 */

import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
import { TreeStorage } from './tree-storage';
import { TreeId } from '../domain/tree-id';
import { NodeId } from '../domain/node-id';
import { Tree } from '../domain/tree';
import { Schemas } from '../domain/schemas';
import { Import } from '../domain/import';
import { Sanitise } from '../domain/sanitise';
import { Log } from '../domain/log';

interface ResolverRequest {
  readonly payload: Record<string, unknown>;
  readonly context: Record<string, unknown>;
}

const resolver = new Resolver();

// ---- Tree CRUD ----

resolver.define('getTree', async (req: ResolverRequest) => {
  const treeId = TreeId.parse(req.payload['treeId']);
  if (treeId.isErr()) return { error: treeId.error };

  Log.debug('getTree', 'loading', { treeId: treeId.value as string });
  const result = await TreeStorage.getTree(treeId.value);
  return result.match(
    tree => {
      if (tree === undefined) {
        Log.warn('getTree', 'not found', { treeId: treeId.value as string });
        return { error: 'Tree not found' };
      }
      return { data: tree };
    },
    error => {
      Log.error('getTree', 'storage error', { error });
      return { error };
    },
  );
});

resolver.define('listTrees', async () => {
  const result = await TreeStorage.listTrees();
  return result.match(
    summaries => {
      Log.debug('listTrees', 'loaded', { count: summaries.length });
      return { data: summaries };
    },
    error => {
      Log.error('listTrees', 'storage error', { error });
      return { error };
    },
  );
});

resolver.define('saveTree', async (req: ResolverRequest) => {
  const parsed = Schemas.treeConfig.safeParse(req.payload['tree']);
  if (!parsed.success) return { error: `Invalid tree: ${parsed.error.message}` };

  const sanitised = Sanitise.sanitiseTreeConfig(parsed.data);
  if (sanitised.isErr()) return { error: sanitised.error.join('; ') };

  Log.info('saveTree', 'saving', { treeId: sanitised.value.id as string, name: sanitised.value.name });
  const result = await TreeStorage.saveTree(sanitised.value);
  return result.match(
    tree => {
      Log.info('saveTree', 'saved', { treeId: tree.id as string, version: tree.version });
      return { data: tree };
    },
    error => {
      Log.error('saveTree', 'failed', { error });
      return { error };
    },
  );
});

resolver.define('deleteTree', async (req: ResolverRequest) => {
  const treeId = TreeId.parse(req.payload['treeId']);
  if (treeId.isErr()) return { error: treeId.error };

  Log.info('deleteTree', 'deleting', { treeId: treeId.value as string });
  const result = await TreeStorage.deleteTree(treeId.value);
  return result.match(
    () => {
      Log.info('deleteTree', 'deleted', { treeId: treeId.value as string });
      return { data: { success: true } };
    },
    error => {
      Log.error('deleteTree', 'failed', { error });
      return { error };
    },
  );
});

// ---- Tree Query (for edit UI) ----

resolver.define('getChildren', async (req: ResolverRequest) => {
  const treeId = TreeId.parse(req.payload['treeId']);
  if (treeId.isErr()) return { error: treeId.error };

  const parentId = req.payload['parentId'];
  Log.debug('getChildren', 'loading', {
    treeId: treeId.value as string,
    parentId: typeof parentId === 'string' ? parentId : 'root',
  });
  const treeResult = await TreeStorage.getTree(treeId.value);
  return treeResult.match(
    tree => {
      if (tree === undefined) return { error: 'Tree not found' };

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

  Log.debug('searchTree', 'searching', { treeId: treeId.value as string, query: trimmedQuery });
  const treeResult = await TreeStorage.getTree(treeId.value);
  return treeResult.match(
    tree => {
      if (tree === undefined) return { error: 'Tree not found' };

      const results = Tree.searchWithPaths(tree.root, trimmedQuery);
      Log.debug('searchTree', 'results', { count: results.length });
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

  Log.debug('resolveAnnotations', 'resolving', { treeId: treeId.value as string, nodeCount: nodeIds.length });
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

// ---- Field Context Configuration (KVS bridge for Custom UI edit modules) ----
//
// Forge does not expose context configuration to Custom UI edit modules
// (only to UI Kit / render:native modules). To bridge this gap, contextConfig
// modules call saveFieldConfig when the admin saves, and edit modules call
// getFieldConfig on load. Both use a KVS key keyed on fieldId.

const fieldConfigKey = (fieldId: string): string => `fieldConfig:${fieldId}`;

resolver.define('getFieldConfig', async (req: ResolverRequest) => {
  const fieldId = req.payload['fieldId'];
  if (typeof fieldId !== 'string') return { error: 'fieldId must be a string' };

  Log.info('getFieldConfig', 'loading', { fieldId });
  const raw: unknown = await kvs.get(fieldConfigKey(fieldId));
  Log.info('getFieldConfig', 'loaded', { fieldId, found: raw !== undefined && raw !== null });
  if (raw === undefined || raw === null) {
    return { data: undefined };
  }
  return { data: raw };
});

resolver.define('saveFieldConfig', async (req: ResolverRequest) => {
  const fieldId = req.payload['fieldId'];
  const config = req.payload['config'];
  if (typeof fieldId !== 'string') return { error: 'fieldId must be a string' };
  if (typeof config !== 'object' || config === null) return { error: 'config must be an object' };

  Log.info('saveFieldConfig', 'saving', { fieldId, config: config as Record<string, unknown> });
  await kvs.set(fieldConfigKey(fieldId), config);
  Log.info('saveFieldConfig', 'saved', { fieldId, key: fieldConfigKey(fieldId) });
  return { data: { success: true } };
});

// ---- Import (simplified format -> full TreeConfig) ----

resolver.define('importTree', async (req: ResolverRequest) => {
  const parsed = Schemas.importTree.safeParse(req.payload['tree']);
  if (!parsed.success) return { error: `Invalid import: ${parsed.error.message}` };

  Log.info('importTree', 'transforming', { name: parsed.data.name });
  const result = Import.transformImport(parsed.data, () => crypto.randomUUID());
  if (result.isErr()) return { error: result.error.join('; ') };

  const sanitised = Sanitise.sanitiseTreeConfig(result.value);
  if (sanitised.isErr()) return { error: sanitised.error.join('; ') };

  const saved = await TreeStorage.saveTree(sanitised.value);
  return saved.match(
    tree => {
      Log.info('importTree', 'imported', { treeId: tree.id as string, name: tree.name });
      return { data: tree };
    },
    error => {
      Log.error('importTree', 'failed', { error });
      return { error };
    },
  );
});

export const handler = resolver.getDefinitions();
