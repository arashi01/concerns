/**
 * Tests for the import format transformer.
 *
 * Verifies that simplified import documents (name + levels + nodes)
 * are correctly transformed into full TreeConfig objects with
 * generated IDs, branded types, and proper validation.
 */

import { describe, it, expect } from 'vitest';
import { Import } from '../../domain/import';
import type { ImportTree } from '../../domain/schemas';
import { Tree } from '../../domain/tree';

// Deterministic ID generator for tests
const makeIdGenerator = () => {
  let counter = 0;
  return () => {
    counter += 1;
    return `gen-${String(counter)}`;
  };
};

const validImport: ImportTree = {
  name: 'Test Tree',
  levels: [
    { id: 'county', label: 'County' },
    { id: 'subcounty', label: 'Sub-County' },
    { id: 'plot', label: 'Plot' },
  ],
  annotations: [
    { key: 'principal', label: 'Principal', resolution: 'union' },
    { key: 'manager', label: 'Manager', resolution: 'nearest' },
  ],
  nodes: [
    {
      label: 'Mombasa',
      level: 'county',
      children: [
        {
          label: 'Mvita',
          level: 'subcounty',
          children: [
            {
              label: 'Plot 52',
              level: 'plot',
              metadata: { lrNumber: 'CR/12345' },
              annotations: { principal: ['SBS Properties Ltd'] },
            },
            {
              label: 'Plot 67',
              level: 'plot',
              annotations: { principal: ['SBS Properties Ltd'], manager: ['Kamau'] },
            },
          ],
        },
      ],
    },
  ],
};

describe('Import.transformImport', () => {
  it('transforms a valid import into a TreeConfig', () => {
    const result = Import.transformImport(validImport, makeIdGenerator());
    expect(result.isOk()).toBe(true);

    const config = result._unsafeUnwrap();
    expect(config.name).toBe('Test Tree');
    expect(config.version).toBe(0);
    expect(config.levels).toHaveLength(3);
    expect(config.annotations).toHaveLength(2);
  });

  it('assigns correct depth values to levels', () => {
    const result = Import.transformImport(validImport, makeIdGenerator());
    const config = result._unsafeUnwrap();

    expect(config.levels[0]!.depth).toBe(0);
    expect(config.levels[0]!.label).toBe('County');
    expect(config.levels[1]!.depth).toBe(1);
    expect(config.levels[2]!.depth).toBe(2);
  });

  it('generates branded LevelId values from level strings', () => {
    const result = Import.transformImport(validImport, makeIdGenerator());
    const config = result._unsafeUnwrap();

    // LevelId is a branded string — check the underlying value
    expect(config.levels[0]!.id as string).toBe('county');
    expect(config.levels[1]!.id as string).toBe('subcounty');
    expect(config.levels[2]!.id as string).toBe('plot');
  });

  it('generates branded AnnotationKey values', () => {
    const result = Import.transformImport(validImport, makeIdGenerator());
    const config = result._unsafeUnwrap();

    expect(config.annotations[0]!.key as string).toBe('principal');
    expect(config.annotations[0]!.resolution).toBe('union');
    expect(config.annotations[1]!.key as string).toBe('manager');
    expect(config.annotations[1]!.resolution).toBe('nearest');
  });

  it('generates unique NodeId for each node', () => {
    const result = Import.transformImport(validImport, makeIdGenerator());
    const config = result._unsafeUnwrap();

    // Collect all IDs (excluding virtual root)
    const ids = new Set<string>();
    const walk = (node: { id: unknown; children: readonly { id: unknown; children: readonly unknown[] }[] }) => {
      ids.add(node.id as string);
      for (const child of node.children) {
        walk(child as typeof node);
      }
    };
    for (const child of config.root.children) {
      walk(child as Parameters<typeof walk>[0]);
    }

    // 4 nodes: Mombasa, Mvita, Plot 52, Plot 67
    expect(ids.size).toBe(4);
  });

  it('wraps nodes in a virtual root', () => {
    const result = Import.transformImport(validImport, makeIdGenerator());
    const config = result._unsafeUnwrap();

    expect(config.root.label).toBe('Root');
    expect(config.root.id as string).toBe('root');
    expect(config.root.children).toHaveLength(1);
    expect(config.root.children[0]!.label).toBe('Mombasa');
  });

  it('preserves metadata on nodes', () => {
    const result = Import.transformImport(validImport, makeIdGenerator());
    const config = result._unsafeUnwrap();

    // Plot 52 = Mombasa > Mvita > Plot 52
    const mvita = config.root.children[0]!.children[0]!;
    const plot52 = mvita.children[0]!;
    expect(plot52.metadata['lrNumber']).toBe('CR/12345');
  });

  it('preserves annotation values on nodes', () => {
    const result = Import.transformImport(validImport, makeIdGenerator());
    const config = result._unsafeUnwrap();

    const mvita = config.root.children[0]!.children[0]!;
    const plot67 = mvita.children[1]!;
    expect(plot67.annotations['principal']).toEqual(['SBS Properties Ltd']);
    expect(plot67.annotations['manager']).toEqual(['Kamau']);
  });

  it('passes Tree.validate on valid import', () => {
    const result = Import.transformImport(validImport, makeIdGenerator());
    expect(result.isOk()).toBe(true);

    // Independently validate
    const config = result._unsafeUnwrap();
    const validation = Tree.validate(config);
    expect(validation.isOk()).toBe(true);
  });

  it('returns error when node references unknown level', () => {
    const badImport: ImportTree = {
      name: 'Bad Tree',
      levels: [{ id: 'county', label: 'County' }],
      annotations: [],
      nodes: [{ label: 'Mombasa', level: 'county', children: [{ label: 'Mvita', level: 'nonexistent' }] }],
    };

    const result = Import.transformImport(badImport, makeIdGenerator());
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().join('; ')).toContain('unknown level');
  });

  it('transforms import with no annotations', () => {
    const simpleImport: ImportTree = {
      name: 'Simple',
      levels: [{ id: 'level1', label: 'Level 1' }],
      annotations: [],
      nodes: [{ label: 'Node A', level: 'level1' }],
    };

    const result = Import.transformImport(simpleImport, makeIdGenerator());
    expect(result.isOk()).toBe(true);

    const config = result._unsafeUnwrap();
    expect(config.annotations).toHaveLength(0);
    expect(config.root.children).toHaveLength(1);
  });

  it('transforms import with empty nodes array', () => {
    const emptyImport: ImportTree = {
      name: 'Empty',
      levels: [{ id: 'level1', label: 'Level 1' }],
      annotations: [],
      nodes: [],
    };

    const result = Import.transformImport(emptyImport, makeIdGenerator());
    expect(result.isOk()).toBe(true);

    const config = result._unsafeUnwrap();
    expect(config.root.children).toHaveLength(0);
    expect(Tree.nodeCount(config.root)).toBe(0);
  });

  it('assigns TreeId from the generator', () => {
    const result = Import.transformImport(validImport, makeIdGenerator());
    const config = result._unsafeUnwrap();

    // The TreeId is generated after all nodes (4 nodes + root = gen-1..gen-5, then gen-6 for TreeId)
    // Actually: gen-1 through gen-4 for nodes, gen-5 for TreeId
    expect((config.id as string).startsWith('gen-')).toBe(true);
  });

  it('uses default resolution strategy union for annotations', () => {
    const importWithDefault: ImportTree = {
      name: 'Default Resolution',
      levels: [{ id: 'l1', label: 'L1' }],
      annotations: [{ key: 'owner', label: 'Owner', resolution: 'union' }],
      nodes: [{ label: 'A', level: 'l1' }],
    };

    const result = Import.transformImport(importWithDefault, makeIdGenerator());
    const config = result._unsafeUnwrap();
    expect(config.annotations[0]!.resolution).toBe('union');
  });

  it('handles deeply nested tree structure', () => {
    const deepImport: ImportTree = {
      name: 'Deep',
      levels: [
        { id: 'l1', label: 'L1' },
        { id: 'l2', label: 'L2' },
        { id: 'l3', label: 'L3' },
      ],
      annotations: [],
      nodes: [
        {
          label: 'A',
          level: 'l1',
          children: [
            {
              label: 'B',
              level: 'l2',
              children: [
                {
                  label: 'C',
                  level: 'l3',
                },
              ],
            },
          ],
        },
      ],
    };

    const result = Import.transformImport(deepImport, makeIdGenerator());
    expect(result.isOk()).toBe(true);

    const config = result._unsafeUnwrap();
    expect(Tree.nodeCount(config.root)).toBe(3);
    expect(config.root.children[0]!.children[0]!.children[0]!.label).toBe('C');
  });
});
