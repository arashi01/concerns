/**
 * Tests for resolver handlers.
 *
 * Mocks TreeStorage to test handler logic in isolation.
 * Verifies: input validation, delegation to storage/domain, response shaping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';
import { testConfig, annotatedConfig } from '../domain/fixtures';
import type { TreeConfig, TreeSummary, TreeNode } from '../../domain/types';

// ---- Mock TreeStorage ----

const mockGetTree = vi.fn();
const mockListTrees = vi.fn();
const mockSaveTree = vi.fn();
const mockDeleteTree = vi.fn();

vi.mock('../../resolvers/tree-storage', () => ({
  TreeStorage: {
    getTree: (...args: unknown[]) => mockGetTree(...args) as unknown,
    listTrees: (...args: unknown[]) => mockListTrees(...args) as unknown,
    saveTree: (...args: unknown[]) => mockSaveTree(...args) as unknown,
    deleteTree: (...args: unknown[]) => mockDeleteTree(...args) as unknown,
    KVS_MAX_BYTES: 200 * 1024,
  },
}));

// ---- Mock @forge/resolver ----

type HandlerFn = (req: { payload: Record<string, unknown>; context: Record<string, unknown> }) => Promise<unknown>;

const handlers = new Map<string, HandlerFn>();

vi.mock('@forge/resolver', () => {
  return {
    default: class MockResolver {
      define(name: string, handler: HandlerFn) {
        handlers.set(name, handler);
      }
      getDefinitions() {
        return Object.fromEntries(handlers);
      }
    },
  };
});

// Import after mocks are set up
await import('../../resolvers/index');

// ---- Helpers ----

const call = async (name: string, payload: Record<string, unknown> = {}) => {
  const handler = handlers.get(name);
  if (handler === undefined) throw new Error(`No handler: ${name}`);
  return handler({ payload, context: {} });
};

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
});

// ---- getTree ----

describe('getTree resolver', () => {
  it('returns tree data for valid ID', async () => {
    mockGetTree.mockReturnValue(okAsync(testConfig));
    const result = await call('getTree', { treeId: testConfig.id });
    expect(result).toEqual({ data: testConfig });
  });

  it('returns error when tree not found', async () => {
    mockGetTree.mockReturnValue(okAsync(undefined));
    const result = await call('getTree', { treeId: testConfig.id });
    expect(result).toEqual({ error: 'Tree not found' });
  });

  it('returns error for invalid treeId', async () => {
    const result = await call('getTree', { treeId: '' });
    expect(result).toHaveProperty('error');
  });

  it('returns error when storage fails', async () => {
    mockGetTree.mockReturnValue(errAsync('storage down'));
    const result = await call('getTree', { treeId: testConfig.id });
    expect(result).toEqual({ error: 'storage down' });
  });
});

// ---- listTrees ----

describe('listTrees resolver', () => {
  it('returns summaries', async () => {
    const summaries = [makeSummary(testConfig)];
    mockListTrees.mockReturnValue(okAsync(summaries));
    const result = await call('listTrees');
    expect(result).toEqual({ data: summaries });
  });

  it('returns error when storage fails', async () => {
    mockListTrees.mockReturnValue(errAsync('meta read failed'));
    const result = await call('listTrees');
    expect(result).toEqual({ error: 'meta read failed' });
  });
});

// ---- saveTree ----

describe('saveTree resolver', () => {
  it('saves valid tree config', async () => {
    mockSaveTree.mockReturnValue(okAsync(testConfig));
    const result = await call('saveTree', { tree: testConfig });
    expect(result).toEqual({ data: testConfig });
  });

  it('returns error for invalid payload', async () => {
    const result = await call('saveTree', { tree: { bogus: true } });
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Invalid tree');
  });

  it('returns error when storage fails', async () => {
    mockSaveTree.mockReturnValue(errAsync('write failed'));
    const result = await call('saveTree', { tree: testConfig });
    expect(result).toEqual({ error: 'write failed' });
  });
});

// ---- deleteTree ----

describe('deleteTree resolver', () => {
  it('deletes tree successfully', async () => {
    mockDeleteTree.mockReturnValue(okAsync(undefined));
    const result = await call('deleteTree', { treeId: testConfig.id });
    expect(result).toEqual({ data: { success: true } });
  });

  it('returns error for invalid treeId', async () => {
    const result = await call('deleteTree', { treeId: '' });
    expect(result).toHaveProperty('error');
  });

  it('returns error when storage fails', async () => {
    mockDeleteTree.mockReturnValue(errAsync('delete failed'));
    const result = await call('deleteTree', { treeId: testConfig.id });
    expect(result).toEqual({ error: 'delete failed' });
  });
});

// ---- getChildren ----

describe('getChildren resolver', () => {
  it('returns top-level children when no parentId', async () => {
    mockGetTree.mockReturnValue(okAsync(testConfig));
    const result = (await call('getChildren', { treeId: testConfig.id })) as { data: TreeNode[] };
    expect(result).toHaveProperty('data');
    expect(result.data[0]!.label).toBe('Mombasa');
  });

  it('returns children of specific parent', async () => {
    mockGetTree.mockReturnValue(okAsync(testConfig));
    // Find a node with children to use as parentId
    const mombasaId = testConfig.root.children[0]!.id;
    const result = (await call('getChildren', {
      treeId: testConfig.id,
      parentId: mombasaId,
    })) as { data: TreeNode[] };
    expect(result).toHaveProperty('data');
    expect(result.data[0]!.label).toBe('Mvita');
  });

  it('returns error when tree not found', async () => {
    mockGetTree.mockReturnValue(okAsync(undefined));
    const result = await call('getChildren', { treeId: testConfig.id });
    expect(result).toEqual({ error: 'Tree not found' });
  });
});

// ---- searchTree ----

describe('searchTree resolver', () => {
  it('returns search results for valid query', async () => {
    mockGetTree.mockReturnValue(okAsync(testConfig));
    const result = (await call('searchTree', {
      treeId: testConfig.id,
      query: 'Plot',
    })) as { data: unknown[] };
    expect(result).toHaveProperty('data');
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('trims search query whitespace', async () => {
    mockGetTree.mockReturnValue(okAsync(testConfig));
    const result = (await call('searchTree', {
      treeId: testConfig.id,
      query: '  Plot  ',
    })) as { data: unknown[] };
    expect(result).toHaveProperty('data');
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('returns error when query is not a string', async () => {
    const result = await call('searchTree', { treeId: testConfig.id, query: 123 });
    expect(result).toEqual({ error: 'query must be a string' });
  });

  it('returns error when tree not found', async () => {
    mockGetTree.mockReturnValue(okAsync(undefined));
    const result = await call('searchTree', { treeId: testConfig.id, query: 'x' });
    expect(result).toEqual({ error: 'Tree not found' });
  });
});

// ---- resolveAnnotations ----

describe('resolveAnnotations resolver', () => {
  it('resolves annotations for valid nodeIds', async () => {
    mockGetTree.mockReturnValue(okAsync(annotatedConfig));
    const leafId = annotatedConfig.root.children[0]!.children[0]!.children[0]!.id;
    const result = (await call('resolveAnnotations', {
      treeId: annotatedConfig.id,
      nodeIds: [leafId],
    })) as { data: unknown[] };
    expect(result).toHaveProperty('data');
  });

  it('returns error when nodeIds is not an array', async () => {
    const result = await call('resolveAnnotations', {
      treeId: annotatedConfig.id,
      nodeIds: 'not-array',
    });
    expect(result).toEqual({ error: 'nodeIds must be an array' });
  });

  it('returns error when tree not found', async () => {
    mockGetTree.mockReturnValue(okAsync(undefined));
    const result = await call('resolveAnnotations', {
      treeId: annotatedConfig.id,
      nodeIds: ['some-id'],
    });
    expect(result).toEqual({ error: 'Tree not found' });
  });
});

// ---- importTree ----

describe('importTree resolver', () => {
  it('transforms and saves valid import format', async () => {
    const savedConfig = { ...testConfig, version: 1 };
    mockSaveTree.mockReturnValue(okAsync(savedConfig));
    const importData = {
      name: 'Test Import',
      levels: [{ id: 'county', label: 'County' }],
      annotations: [],
      nodes: [{ label: 'Mombasa', level: 'county' }],
    };
    const result = (await call('importTree', { tree: importData })) as { data: TreeConfig };
    expect(result).toHaveProperty('data');
    expect(mockSaveTree).toHaveBeenCalledTimes(1);
  });

  it('returns error for invalid import payload', async () => {
    const result = await call('importTree', { tree: { bogus: true } });
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Invalid import');
  });

  it('returns error when storage save fails', async () => {
    mockSaveTree.mockReturnValue(errAsync('write failed'));
    const importData = {
      name: 'Test Import',
      levels: [{ id: 'county', label: 'County' }],
      annotations: [],
      nodes: [{ label: 'Mombasa', level: 'county' }],
    };
    const result = await call('importTree', { tree: importData });
    expect(result).toEqual({ error: 'write failed' });
  });
});
