/**
 * Tests for immutable tree mutation functions.
 */

import { describe, it, expect } from 'vitest';
import { TreeMutate } from '../../domain/tree-mutate';
import {
  testConfig,
  annotatedConfig,
  root,
  mombasa,
  mvita as _mvita,
  plot52,
  blockA,
  unit1,
  unit2,
  plot67 as _plot67,
  countyLevel as _countyLevel,
  subCountyLevel,
  plotLevel as _plotLevel,
  annotationDefs,
  principalKey as _principalKey,
  managerKey as _managerKey,
} from './fixtures';
import { NodeId } from '../../domain/node-id';
import { LevelId } from '../../domain/level-id';
import { AnnotationKey } from '../../domain/annotation-key';
import type { TreeNode } from '../../domain/types';

// ---- addNode ----

describe('TreeMutate.addNode', () => {
  it('adds a child to the specified parent', () => {
    const newNode: TreeNode = {
      id: NodeId.of('new-node'),
      label: 'Likoni',
      levelId: subCountyLevel,
      metadata: {},
      annotations: {},
      children: [],
    };
    const updated = TreeMutate.addNode(root, mombasa.id, newNode);
    const updatedMombasa = updated.children[0]!;
    expect(updatedMombasa.children).toHaveLength(2);
    expect(updatedMombasa.children[1]!.label).toBe('Likoni');
  });

  it('does not mutate the original tree', () => {
    const newNode: TreeNode = {
      id: NodeId.of('new-node'),
      label: 'Likoni',
      levelId: subCountyLevel,
      metadata: {},
      annotations: {},
      children: [],
    };
    TreeMutate.addNode(root, mombasa.id, newNode);
    expect(root.children[0]!.children).toHaveLength(1);
  });

  it('adds a node deeply nested', () => {
    const newUnit: TreeNode = {
      id: NodeId.of('unit-3'),
      label: 'Unit 3',
      levelId: LevelId.of('unit'),
      metadata: {},
      annotations: {},
      children: [],
    };
    const updated = TreeMutate.addNode(root, blockA.id, newUnit);
    const block = updated.children[0]!.children[0]!.children[0]!.children[0]!;
    expect(block.children).toHaveLength(3);
    expect(block.children[2]!.label).toBe('Unit 3');
  });
});

// ---- removeNode ----

describe('TreeMutate.removeNode', () => {
  it('removes a leaf node', () => {
    const updated = TreeMutate.removeNode(root, unit2.id);
    const block = updated.children[0]!.children[0]!.children[0]!.children[0]!;
    expect(block.children).toHaveLength(1);
    expect(block.children[0]!.label).toBe('Unit 1');
  });

  it('removes a node with children (subtree removal)', () => {
    const updated = TreeMutate.removeNode(root, plot52.id);
    const updatedMvita = updated.children[0]!.children[0]!;
    expect(updatedMvita.children).toHaveLength(1);
    expect(updatedMvita.children[0]!.label).toBe('Plot 67/II/MS');
  });

  it('does not mutate the original tree', () => {
    TreeMutate.removeNode(root, unit2.id);
    const block = root.children[0]!.children[0]!.children[0]!.children[0]!;
    expect(block.children).toHaveLength(2);
  });
});

// ---- renameNode ----

describe('TreeMutate.renameNode', () => {
  it('renames a node', () => {
    const updated = TreeMutate.renameNode(root, mombasa.id, 'Nairobi');
    expect(updated.children[0]!.label).toBe('Nairobi');
  });

  it('renames a deeply nested node', () => {
    const updated = TreeMutate.renameNode(root, unit1.id, 'Unit Alpha');
    const block = updated.children[0]!.children[0]!.children[0]!.children[0]!;
    expect(block.children[0]!.label).toBe('Unit Alpha');
  });

  it('does not mutate the original', () => {
    TreeMutate.renameNode(root, mombasa.id, 'Nairobi');
    expect(root.children[0]!.label).toBe('Mombasa');
  });
});

// ---- moveNode ----

describe('TreeMutate.moveNode', () => {
  it('moves a node down among siblings', () => {
    const updated = TreeMutate.moveNode(root, unit1.id, 'down');
    const block = updated.children[0]!.children[0]!.children[0]!.children[0]!;
    expect(block.children[0]!.label).toBe('Unit 2');
    expect(block.children[1]!.label).toBe('Unit 1');
  });

  it('moves a node up among siblings', () => {
    const updated = TreeMutate.moveNode(root, unit2.id, 'up');
    const block = updated.children[0]!.children[0]!.children[0]!.children[0]!;
    expect(block.children[0]!.label).toBe('Unit 2');
    expect(block.children[1]!.label).toBe('Unit 1');
  });

  it('is a no-op when moving first child up', () => {
    const updated = TreeMutate.moveNode(root, unit1.id, 'up');
    const block = updated.children[0]!.children[0]!.children[0]!.children[0]!;
    expect(block.children[0]!.label).toBe('Unit 1');
    expect(block.children[1]!.label).toBe('Unit 2');
  });

  it('is a no-op when moving last child down', () => {
    const updated = TreeMutate.moveNode(root, unit2.id, 'down');
    const block = updated.children[0]!.children[0]!.children[0]!.children[0]!;
    expect(block.children[0]!.label).toBe('Unit 1');
    expect(block.children[1]!.label).toBe('Unit 2');
  });

  it('does not mutate the original', () => {
    TreeMutate.moveNode(root, unit1.id, 'down');
    const block = root.children[0]!.children[0]!.children[0]!.children[0]!;
    expect(block.children[0]!.label).toBe('Unit 1');
  });
});

// ---- setNodeAnnotations ----

describe('TreeMutate.setNodeAnnotations', () => {
  it('sets annotations on a node', () => {
    const updated = TreeMutate.setNodeAnnotations(root, mombasa.id, {
      principal: ['Test Corp'],
    });
    expect(updated.children[0]!.annotations['principal']).toEqual(['Test Corp']);
  });

  it('replaces existing annotations', () => {
    const updated = TreeMutate.setNodeAnnotations(
      annotatedConfig.root,
      annotatedConfig.root.children[0]!.children[0]!.children[0]!.id, // annPlot52
      { principal: ['New Principal'], manager: ['New Manager'] },
    );
    const plot = updated.children[0]!.children[0]!.children[0]!;
    expect(plot.annotations['principal']).toEqual(['New Principal']);
    expect(plot.annotations['manager']).toEqual(['New Manager']);
  });

  it('does not mutate the original', () => {
    TreeMutate.setNodeAnnotations(root, mombasa.id, { principal: ['X'] });
    expect(root.children[0]!.annotations).toEqual({});
  });
});

// ---- updateAnnotationDefs ----

describe('TreeMutate.updateAnnotationDefs', () => {
  it('replaces annotation definitions', () => {
    const newDefs = [{ key: AnnotationKey.of('owner'), label: 'Owner', resolution: 'union' as const }];
    const updated = TreeMutate.updateAnnotationDefs(testConfig, newDefs);
    expect(updated.annotations).toHaveLength(1);
    expect(updated.annotations[0]!.key).toBe(AnnotationKey.of('owner'));
  });

  it('preserves other config fields', () => {
    const updated = TreeMutate.updateAnnotationDefs(testConfig, annotationDefs);
    expect(updated.name).toBe(testConfig.name);
    expect(updated.levels).toBe(testConfig.levels);
    expect(updated.root).toBe(testConfig.root);
  });

  it('does not mutate the original', () => {
    TreeMutate.updateAnnotationDefs(testConfig, annotationDefs);
    expect(testConfig.annotations).toHaveLength(0);
  });
});
