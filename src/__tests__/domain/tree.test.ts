import { describe, it, expect } from 'vitest';
import { Tree } from '../../domain/tree';
import { NodeId } from '../../domain/node-id';
import { LevelId } from '../../domain/level-id';
import type { TreeConfig, TreeNode } from '../../domain/types';
import {
  root,
  mombasa,
  mvita as _mvita,
  plot52 as _plot52,
  plot67 as _plot67,
  blockA as _blockA,
  testConfig,
  countyLevel as _countyLevel,
  subCountyLevel as _subCountyLevel,
  plotLevel,
  unitLevel,
  annotatedConfig,
  annRoot as _annRoot,
  annPlot52,
  annBlockA,
  principalKey,
  managerKey,
} from './fixtures';

// ---- Lookup ----

describe('Tree.findNode', () => {
  it('finds a top-level node', () => {
    const found = Tree.findNode(root, NodeId.of('mombasa'));
    expect(found).toBeDefined();
    expect(found?.label).toBe('Mombasa');
  });

  it('finds a deeply nested node', () => {
    const found = Tree.findNode(root, NodeId.of('unit-2'));
    expect(found).toBeDefined();
    expect(found?.label).toBe('Unit 2');
  });

  it('returns undefined for non-existent ID', () => {
    const found = Tree.findNode(root, NodeId.of('does-not-exist'));
    expect(found).toBeUndefined();
  });
});

describe('Tree.pathTo', () => {
  it('builds a full path to a leaf node', () => {
    const path = Tree.pathTo(root, NodeId.of('unit-1'));
    expect(path.map(s => s.label)).toEqual(['Root', 'Mombasa', 'Mvita', 'Plot 52/II/MS', 'Block A', 'Unit 1']);
  });

  it('builds a path to an intermediate node', () => {
    const path = Tree.pathTo(root, NodeId.of('mvita'));
    expect(path.map(s => s.label)).toEqual(['Root', 'Mombasa', 'Mvita']);
  });

  it('returns empty array for non-existent node', () => {
    const path = Tree.pathTo(root, NodeId.of('nope'));
    expect(path).toEqual([]);
  });
});

describe('Tree.nodePath', () => {
  it('returns TreeNode objects along the path', () => {
    const path = Tree.nodePath(root, NodeId.of('unit-1'));
    expect(path.map(n => n.label)).toEqual(['Root', 'Mombasa', 'Mvita', 'Plot 52/II/MS', 'Block A', 'Unit 1']);
  });

  it('returns empty array for non-existent node', () => {
    expect(Tree.nodePath(root, NodeId.of('nope'))).toEqual([]);
  });
});

describe('Tree.childrenOf', () => {
  it('returns children of a specified parent', () => {
    const children = Tree.childrenOf(root, NodeId.of('mvita'));
    expect(children.map(c => c.label)).toEqual(['Plot 52/II/MS', 'Plot 67/II/MS']);
  });

  it('returns empty array for leaf nodes', () => {
    expect(Tree.childrenOf(root, NodeId.of('unit-1'))).toEqual([]);
  });

  it('returns empty array for non-existent parent', () => {
    expect(Tree.childrenOf(root, NodeId.of('ghost'))).toEqual([]);
  });
});

describe('Tree.topLevel', () => {
  it('returns direct children of the root', () => {
    const top = Tree.topLevel(testConfig);
    expect(top.map(n => n.label)).toEqual(['Mombasa']);
  });
});

describe('Tree.childrenAtLevel', () => {
  it('filters children by level ID', () => {
    const plots = Tree.childrenAtLevel(root, NodeId.of('mvita'), plotLevel);
    expect(plots.map(p => p.label)).toEqual(['Plot 52/II/MS', 'Plot 67/II/MS']);
  });

  it('returns empty when no children match the level', () => {
    const units = Tree.childrenAtLevel(root, NodeId.of('mvita'), unitLevel);
    expect(units).toEqual([]);
  });
});

// ---- Search ----

describe('Tree.search', () => {
  it('finds nodes by label substring (case-insensitive)', () => {
    const results = Tree.search(root, 'plot');
    expect(results.map(n => n.label)).toEqual(['Plot 52/II/MS', 'Plot 67/II/MS']);
  });

  it('finds nodes with partial match', () => {
    const results = Tree.search(root, '52');
    expect(results.map(n => n.label)).toEqual(['Plot 52/II/MS']);
  });

  it('returns empty array when nothing matches', () => {
    expect(Tree.search(root, 'Nairobi')).toEqual([]);
  });
});

describe('Tree.searchWithPaths', () => {
  it('returns matching nodes with their full paths', () => {
    const results = Tree.searchWithPaths(root, 'unit 1');
    expect(results).toHaveLength(1);
    expect(results[0]?.path.map(s => s.label)).toEqual([
      'Root',
      'Mombasa',
      'Mvita',
      'Plot 52/II/MS',
      'Block A',
      'Unit 1',
    ]);
  });
});

// ---- Metrics ----

describe('Tree.nodeCount', () => {
  it('counts all non-root nodes', () => {
    // mombasa, mvita, plot52, plot67, blockA, unit1, unit2 = 7
    expect(Tree.nodeCount(root)).toBe(7);
  });
});

describe('Tree.hasChildren', () => {
  it('returns true for nodes with children', () => {
    expect(Tree.hasChildren(root, NodeId.of('block-a'))).toBe(true);
  });

  it('returns false for leaf nodes', () => {
    expect(Tree.hasChildren(root, NodeId.of('unit-1'))).toBe(false);
  });

  it('returns false for non-existent nodes', () => {
    expect(Tree.hasChildren(root, NodeId.of('nope'))).toBe(false);
  });
});

// ---- Validation ----

describe('Tree.validate', () => {
  it('passes for a valid config', () => {
    expect(Tree.validate(testConfig).isOk()).toBe(true);
  });

  it('passes for a valid annotated config', () => {
    expect(Tree.validate(annotatedConfig).isOk()).toBe(true);
  });

  it('detects duplicate node IDs', () => {
    const dupeRoot: TreeNode = {
      ...root,
      children: [mombasa, { ...mombasa, label: 'Mombasa Copy' }],
    };
    const badConfig: TreeConfig = { ...testConfig, root: dupeRoot };
    expect(Tree.validateUniqueIds(badConfig).isErr()).toBe(true);
  });

  it('detects invalid level references', () => {
    const badNode: TreeNode = {
      ...mombasa,
      levelId: LevelId.of('nonexistent-level'),
    };
    const badRoot: TreeNode = { ...root, children: [badNode] };
    const badConfig: TreeConfig = { ...testConfig, root: badRoot };
    expect(Tree.validateLevelRefs(badConfig).isErr()).toBe(true);
  });

  it('detects undefined annotation keys on nodes', () => {
    const badNode: TreeNode = {
      ...mombasa,
      annotations: { bogus: ['value'] },
    };
    const badRoot: TreeNode = { ...root, children: [badNode] };
    const badConfig: TreeConfig = { ...testConfig, root: badRoot };
    // testConfig has annotations: [] so "bogus" is undefined
    expect(Tree.validateAnnotationRefs(badConfig).isErr()).toBe(true);
  });
});

// ---- Annotation Resolution ----

describe('Tree.resolveAnnotations', () => {
  it('returns empty array when config has no annotation definitions', () => {
    const result = Tree.resolveAnnotations(testConfig, [NodeId.of('unit-1')]);
    expect(result).toEqual([]);
  });

  it('resolves union strategy: collects from all ancestors', () => {
    // Unit 1 is under Block A (principal: [SBS Ltd, SBS 2016]) and Plot 52 (principal: [SBS Ltd])
    const result = Tree.resolveAnnotations(annotatedConfig, [NodeId.of('unit-1')]);
    const principals = result.find(r => r.key === principalKey);
    expect(principals).toBeDefined();
    // Union: SBS Properties Ltd (from plot52) + SBS Properties Ltd, SBS Properties (2016) (from blockA)
    // Deduplicated: SBS Properties Ltd, SBS Properties (2016)
    expect(principals?.values).toHaveLength(2);
    expect(principals?.values).toContain('SBS Properties Ltd');
    expect(principals?.values).toContain('SBS Properties (2016)');
  });

  it('resolves nearest strategy: takes closest ancestor', () => {
    // Unit 1 has no manager annotation; Block A has none; Plot 52 has manager: [Kamau]
    const result = Tree.resolveAnnotations(annotatedConfig, [NodeId.of('unit-1')]);
    const managers = result.find(r => r.key === managerKey);
    expect(managers).toBeDefined();
    expect(managers?.values).toEqual(['Kamau']);
  });

  it('resolves nearest: closer annotation wins over farther', () => {
    // Add a manager annotation to Block A - it should override Plot 52's manager
    const blockWithManager: TreeNode = {
      ...annBlockA,
      annotations: {
        ...annBlockA.annotations,
        manager: ['Njoroge'],
      },
    };
    const plot52WithBlock: TreeNode = { ...annPlot52, children: [blockWithManager] };
    const mvitaNode: TreeNode = {
      ...annotatedConfig.root.children[0]!.children[0]!,
      children: [plot52WithBlock, annotatedConfig.root.children[0]!.children[0]!.children[1]!],
    };
    const mombasaNode: TreeNode = {
      ...annotatedConfig.root.children[0]!,
      children: [mvitaNode],
    };
    const modRoot: TreeNode = { ...annotatedConfig.root, children: [mombasaNode] };
    const modConfig: TreeConfig = { ...annotatedConfig, root: modRoot };

    const result = Tree.resolveAnnotations(modConfig, [NodeId.of('unit-1')]);
    const managers = result.find(r => r.key === managerKey);
    expect(managers?.values).toEqual(['Njoroge']);
  });

  it('resolves explicit strategy: only direct annotations', () => {
    const explicitConfig: TreeConfig = {
      ...annotatedConfig,
      annotations: [{ key: principalKey, label: 'Principal', resolution: 'explicit' }],
    };
    // Unit 1 has no annotations directly - should resolve to empty
    const result = Tree.resolveAnnotations(explicitConfig, [NodeId.of('unit-1')]);
    expect(result[0]?.values).toEqual([]);

    // Block A has principal annotations directly - should resolve
    const blockResult = Tree.resolveAnnotations(explicitConfig, [NodeId.of('block-a')]);
    expect(blockResult[0]?.values).toContain('SBS Properties Ltd');
    expect(blockResult[0]?.values).toContain('SBS Properties (2016)');
  });

  it('deduplicates across multiple selections', () => {
    // Both Plot 52 and Plot 67 have principal: [SBS Properties Ltd]
    const result = Tree.resolveAnnotations(annotatedConfig, [NodeId.of('plot-52'), NodeId.of('plot-67')]);
    const principals = result.find(r => r.key === principalKey);
    // SBS Properties Ltd appears on both but should be deduplicated
    expect(principals?.values.filter(v => v === 'SBS Properties Ltd')).toHaveLength(1);
  });

  it('ignores non-existent node IDs', () => {
    const result = Tree.resolveAnnotations(annotatedConfig, [NodeId.of('ghost')]);
    expect(result.every(r => r.values.length === 0)).toBe(true);
  });

  it('includes label from annotation definition', () => {
    const result = Tree.resolveAnnotations(annotatedConfig, [NodeId.of('unit-1')]);
    expect(result.find(r => r.key === principalKey)?.label).toBe('Principal');
    expect(result.find(r => r.key === managerKey)?.label).toBe('Manager');
  });
});
