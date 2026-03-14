/**
 * Tree configuration persistence via Forge Storage.
 *
 * This module is the sole impure boundary for tree data.
 * All storage operations are confined here - the domain layer
 * never touches storage directly.
 */

import { kvs } from '@forge/kvs';
import { ok, err, errAsync, ResultAsync } from 'neverthrow';
import type { TreeConfig, TreeSummary } from '../domain/types';
import type { TreeId } from '../domain/tree-id';
import { Tree } from '../domain/tree';
import { Schemas } from '../domain/schemas';

// ---- Constants ----

const treeKey = (id: TreeId): string => `tree:${id as string}`;
const META_KEY = 'meta:trees';

/** Forge KVS per-value size limit (200 KiB). */
const KVS_MAX_BYTES = 200 * 1024;

// ---- Read ----

const getTree = (id: TreeId): ResultAsync<TreeConfig | undefined, string> =>
  ResultAsync.fromPromise(kvs.get(treeKey(id)), e => `Storage read failed: ${String(e)}`).andThen(raw => {
    if (raw === undefined || raw === null) return ok(undefined);
    const parsed = Schemas.treeConfig.safeParse(raw);
    return parsed.success
      ? ok(parsed.data as TreeConfig)
      : err(`Invalid tree data for "${id as string}": ${parsed.error.message}`);
  });

const listTrees = (): ResultAsync<readonly TreeSummary[], string> =>
  ResultAsync.fromPromise(kvs.get(META_KEY), e => `Storage meta read failed: ${String(e)}`).map(raw => {
    if (!Array.isArray(raw)) return [];
    const validated: TreeSummary[] = [];
    for (const entry of raw) {
      const parsed = Schemas.treeSummary.safeParse(entry);
      if (parsed.success) validated.push(parsed.data as TreeSummary);
    }
    return validated;
  });

// ---- Write ----

const saveTree = (config: TreeConfig): ResultAsync<TreeConfig, string> => {
  const validation = Tree.validate(config);
  if (validation.isErr()) {
    return errAsync(validation.error.join('; '));
  }

  // Optimistic concurrency: check version against stored tree
  return getTree(config.id).andThen(existing => {
    if (existing !== undefined && existing.version !== config.version) {
      return errAsync(
        `Version conflict: you are editing version ${String(config.version)}, but version ${String(existing.version)} is stored. Reload and retry.`,
      );
    }

    // Bump version
    const bumped: TreeConfig = { ...config, version: config.version + 1 };

    const serialized = JSON.stringify(bumped);
    if (serialized.length > KVS_MAX_BYTES) {
      return errAsync(
        `Tree "${bumped.name}" exceeds the 200 KiB storage limit (${String(Math.ceil(serialized.length / 1024))} KiB). Reduce the number of nodes or metadata.`,
      );
    }

    return ResultAsync.fromPromise(kvs.set(treeKey(bumped.id), bumped), e => `Storage write failed: ${String(e)}`)
      .andThen(() => updateMeta(bumped))
      .map(() => bumped);
  });
};

const deleteTree = (id: TreeId): ResultAsync<void, string> =>
  ResultAsync.fromPromise(kvs.delete(treeKey(id)), e => `Storage delete failed: ${String(e)}`).andThen(() =>
    removeMeta(id),
  );

// ---- Meta Index ----

const updateMeta = (config: TreeConfig): ResultAsync<void, string> =>
  listTrees().andThen(summaries => {
    const summary: TreeSummary = {
      id: config.id,
      name: config.name,
      version: config.version,
      levelCount: config.levels.length,
      nodeCount: Tree.nodeCount(config.root),
      annotationCount: config.annotations.length,
    };
    const updated = [...summaries.filter(s => s.id !== config.id), summary];
    return ResultAsync.fromPromise(kvs.set(META_KEY, updated), e => `Storage meta write failed: ${String(e)}`).map(
      () => undefined,
    );
  });

const removeMeta = (id: TreeId): ResultAsync<void, string> =>
  listTrees().andThen(summaries => {
    const updated = summaries.filter(s => s.id !== id);
    return ResultAsync.fromPromise(kvs.set(META_KEY, updated), e => `Storage meta write failed: ${String(e)}`).map(
      () => undefined,
    );
  });

export const TreeStorage = {
  getTree,
  listTrees,
  saveTree,
  deleteTree,
  KVS_MAX_BYTES,
} as const;
