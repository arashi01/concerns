/**
 * Tests for the TreeStorage module (KVS boundary layer).
 *
 * Mocks @forge/kvs to test storage operations in isolation.
 * Domain logic (tree validation, annotation resolution) is tested
 * in the domain test suite - these tests focus on KVS interactions,
 * error handling, size limits, and data validation on read.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

// ---- Mock @forge/kvs ----

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDelete = vi.fn();

vi.mock('@forge/kvs', () => ({
  kvs: {
    get: (...args: unknown[]) => mockGet(...args) as unknown,
    set: (...args: unknown[]) => mockSet(...args) as unknown,
    delete: (...args: unknown[]) => mockDelete(...args) as unknown,
  },
}));

import { TreeStorage } from '../../resolvers/tree-storage';
import { testConfig, annotatedConfig } from '../domain/fixtures';
import { TreeId } from '../../domain/tree-id';
import { NodeId } from '../../domain/node-id';
import { LevelId } from '../../domain/level-id';
import type { TreeConfig, TreeSummary } from '../../domain/types';

// ---- Helpers ----

const treeId = testConfig.id;
const treeKey = `tree:${treeId as string}`;
const META_KEY = 'meta:trees';

const makeSummary = (config: TreeConfig): TreeSummary => ({
  id: config.id,
  name: config.name,
  version: config.version,
  levelCount: config.levels.length,
  nodeCount: 7,
  annotationCount: config.annotations.length,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue(undefined);
  mockSet.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
});

// ---- getTree ----

describe('TreeStorage.getTree', () => {
  it('returns the parsed tree when KVS has valid data', async () => {
    mockGet.mockResolvedValueOnce(testConfig);
    const result = await TreeStorage.getTree(treeId);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()?.name).toBe('Test Property Hierarchy');
    expect(mockGet).toHaveBeenCalledWith(treeKey);
  });

  it('returns undefined when key does not exist', async () => {
    mockGet.mockResolvedValueOnce(undefined);
    const result = await TreeStorage.getTree(treeId);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeUndefined();
  });

  it('returns undefined when key is null', async () => {
    mockGet.mockResolvedValueOnce(null);
    const result = await TreeStorage.getTree(treeId);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeUndefined();
  });

  it('returns error when KVS read fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('network timeout'));
    const result = await TreeStorage.getTree(treeId);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain('Storage read failed');
  });

  it('returns error when stored data fails Zod validation', async () => {
    mockGet.mockResolvedValueOnce({ id: 'test', bogus: true });
    const result = await TreeStorage.getTree(treeId);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain('Invalid tree data');
  });
});

// ---- listTrees ----

describe('TreeStorage.listTrees', () => {
  it('returns validated summaries from meta', async () => {
    const summaries = [makeSummary(testConfig)];
    mockGet.mockResolvedValueOnce(summaries);
    const result = await TreeStorage.listTrees();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toHaveLength(1);
    expect(result._unsafeUnwrap()[0]?.name).toBe('Test Property Hierarchy');
  });

  it('returns empty array when meta is undefined', async () => {
    mockGet.mockResolvedValueOnce(undefined);
    const result = await TreeStorage.listTrees();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('returns empty array when meta is not an array', async () => {
    mockGet.mockResolvedValueOnce('not an array');
    const result = await TreeStorage.listTrees();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([]);
  });

  it('filters out corrupted entries', async () => {
    const entries = [makeSummary(testConfig), { id: 'bad', bogus: true }, makeSummary(annotatedConfig)];
    mockGet.mockResolvedValueOnce(entries);
    const result = await TreeStorage.listTrees();

    expect(result.isOk()).toBe(true);
    // Both valid summaries have the same id ('test-tree'), so dedup
    // doesn't happen here - Zod validates shape, not uniqueness.
    // The corrupted entry is filtered out.
    expect(result._unsafeUnwrap()).toHaveLength(2);
  });

  it('returns error when KVS read fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('storage down'));
    const result = await TreeStorage.listTrees();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain('Storage meta read failed');
  });
});

// ---- saveTree ----

describe('TreeStorage.saveTree', () => {
  it('saves a new tree (no existing) and bumps version', async () => {
    // getTree: no existing tree
    mockGet.mockResolvedValueOnce(undefined);
    // listTrees inside updateMeta
    mockGet.mockResolvedValueOnce([]);
    const result = await TreeStorage.saveTree(testConfig);

    expect(result.isOk()).toBe(true);
    const saved = result._unsafeUnwrap();
    expect(saved.name).toBe('Test Property Hierarchy');
    // Version bumped from 1 -> 2
    expect(saved.version).toBe(2);

    // First set: tree data (with bumped version)
    expect(mockSet).toHaveBeenCalledTimes(2);
    const treeSaveCall = (mockSet as Mock).mock.calls[0]!;
    expect(treeSaveCall[0]).toBe(treeKey);
    expect((treeSaveCall[1] as TreeConfig).version).toBe(2);
    // Second set: meta index
    expect((mockSet as Mock).mock.calls[1]?.[0]).toBe(META_KEY);
  });

  it('saves when existing version matches (optimistic concurrency pass)', async () => {
    // getTree: existing tree with matching version
    mockGet.mockResolvedValueOnce(testConfig);
    // listTrees inside updateMeta
    mockGet.mockResolvedValueOnce([]);
    const result = await TreeStorage.saveTree(testConfig);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().version).toBe(2);
  });

  it('rejects when existing version mismatches (optimistic concurrency fail)', async () => {
    // Stored tree has version 2, but we're saving version 1
    const storedConfig: TreeConfig = { ...testConfig, version: 2 };
    mockGet.mockResolvedValueOnce(storedConfig);
    const result = await TreeStorage.saveTree(testConfig);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain('Version conflict');
    expect(result._unsafeUnwrapErr()).toContain('version 1');
    expect(result._unsafeUnwrapErr()).toContain('version 2');
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('saves annotated tree successfully', async () => {
    mockGet.mockResolvedValueOnce(undefined);
    mockGet.mockResolvedValueOnce([]);
    const result = await TreeStorage.saveTree(annotatedConfig);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().annotations).toHaveLength(2);
    expect(result._unsafeUnwrap().version).toBe(2);
  });

  it('returns error when tree validation fails (bad level ref)', async () => {
    const badConfig: TreeConfig = {
      ...testConfig,
      root: {
        ...testConfig.root,
        children: [
          {
            id: NodeId.of('bad-node'),
            label: 'Bad',
            levelId: LevelId.of('nonexistent'),
            metadata: {},
            annotations: {},
            children: [],
          },
        ],
      },
    };
    const result = await TreeStorage.saveTree(badConfig);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain('unknown level');
    // Validation fails before any KVS interaction
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('returns error when tree exceeds KVS size limit', async () => {
    const bigMetadata: Record<string, string> = {};
    for (let i = 0; i < 5000; i++) {
      bigMetadata[`key${String(i)}`] = 'x'.repeat(50);
    }
    const bigConfig: TreeConfig = {
      ...testConfig,
      root: {
        ...testConfig.root,
        metadata: bigMetadata,
      },
    };
    // getTree: no existing
    mockGet.mockResolvedValueOnce(undefined);
    const result = await TreeStorage.saveTree(bigConfig);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain('200 KiB storage limit');
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('returns error when KVS write fails', async () => {
    // getTree: no existing
    mockGet.mockResolvedValueOnce(undefined);
    mockSet.mockRejectedValueOnce(new Error('write timeout'));
    const result = await TreeStorage.saveTree(testConfig);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain('Storage write failed');
  });

  it('updates existing entry in meta index', async () => {
    // getTree: existing with matching version
    mockGet.mockResolvedValueOnce(testConfig);
    // listTrees inside updateMeta
    const existingSummary = { ...makeSummary(testConfig), version: 1 };
    mockGet.mockResolvedValueOnce([existingSummary]);
    const result = await TreeStorage.saveTree(testConfig);

    expect(result.isOk()).toBe(true);
    const metaCall = (mockSet as Mock).mock.calls.find((c: unknown[]) => c[0] === META_KEY);
    expect(metaCall).toBeDefined();
    const savedMeta = metaCall?.[1] as TreeSummary[];
    expect(savedMeta).toHaveLength(1);
    // Version bumped from 1 -> 2
    expect(savedMeta[0]?.version).toBe(2);
  });

  it('bumps version from 0 to 1 on first import', async () => {
    const importedConfig: TreeConfig = { ...testConfig, version: 0 };
    // getTree: no existing
    mockGet.mockResolvedValueOnce(undefined);
    // listTrees
    mockGet.mockResolvedValueOnce([]);
    const result = await TreeStorage.saveTree(importedConfig);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().version).toBe(1);
  });
});

// ---- deleteTree ----

describe('TreeStorage.deleteTree', () => {
  it('deletes tree data and removes from meta', async () => {
    const summaries = [makeSummary(testConfig)];
    mockGet.mockResolvedValueOnce(summaries);
    const result = await TreeStorage.deleteTree(treeId);

    expect(result.isOk()).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith(treeKey);
    // Meta should be updated to empty
    const metaCall = (mockSet as Mock).mock.calls.find((c: unknown[]) => c[0] === META_KEY);
    expect(metaCall).toBeDefined();
    expect(metaCall?.[1]).toEqual([]);
  });

  it('returns error when KVS delete fails', async () => {
    mockDelete.mockRejectedValueOnce(new Error('delete failed'));
    const result = await TreeStorage.deleteTree(treeId);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toContain('Storage delete failed');
  });

  it('handles meta containing other trees - only removes target', async () => {
    const otherSummary: TreeSummary = {
      ...makeSummary(testConfig),
      id: TreeId.of('other-tree'),
      name: 'Other',
    };
    mockGet.mockResolvedValueOnce([makeSummary(testConfig), otherSummary]);
    const result = await TreeStorage.deleteTree(treeId);

    expect(result.isOk()).toBe(true);
    const metaCall = (mockSet as Mock).mock.calls.find((c: unknown[]) => c[0] === META_KEY);
    const savedMeta = metaCall?.[1] as TreeSummary[];
    expect(savedMeta).toHaveLength(1);
    expect(savedMeta[0]?.name).toBe('Other');
  });
});
