import { describe, it, expect } from 'vitest';
import { FieldValue as FV } from '../../domain/field-value';
import { NodeId } from '../../domain/node-id';
import { testConfig } from './fixtures';

// ---- Tests ----

describe('FieldValue.empty', () => {
  it('has no selections', () => {
    expect(FV.empty.selections).toEqual([]);
  });
});

describe('FieldValue.fromNodeIds', () => {
  it('builds selections from valid node IDs', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('unit-1'), NodeId.of('plot-67')]);
    expect(fv.selections).toHaveLength(2);
  });

  it('skips invalid node IDs silently', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('unit-1'), NodeId.of('nonexistent')]);
    expect(fv.selections).toHaveLength(1);
  });

  it('populates denormalised level labels for JQL', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('unit-1')]);
    const selection = fv.selections[0];
    expect(selection).toBeDefined();
    expect(selection?.l0).toBe('Mombasa');
    expect(selection?.l1).toBe('Mvita');
    expect(selection?.l2).toBe('Plot 52/II/MS');
    expect(selection?.l3).toBe('Block A');
    expect(selection?.l4).toBe('Unit 1');
    expect(selection?.l5).toBeUndefined();
  });

  it('handles selection at intermediate level', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('mvita')]);
    const selection = fv.selections[0];
    expect(selection).toBeDefined();
    expect(selection?.l0).toBe('Mombasa');
    expect(selection?.l1).toBe('Mvita');
    expect(selection?.l2).toBeUndefined();
  });
});

describe('FieldValue.addSelection', () => {
  it('adds a new selection to an existing field value', () => {
    const fv1 = FV.fromNodeIds(testConfig, [NodeId.of('unit-1')]);
    const fv2 = FV.addSelection(fv1, testConfig, NodeId.of('plot-67'));
    expect(fv2.selections).toHaveLength(2);
  });

  it('deduplicates by terminal node ID', () => {
    const fv1 = FV.fromNodeIds(testConfig, [NodeId.of('unit-1')]);
    const fv2 = FV.addSelection(fv1, testConfig, NodeId.of('unit-1'));
    expect(fv2.selections).toHaveLength(1);
  });

  it('ignores invalid node IDs', () => {
    const fv1 = FV.fromNodeIds(testConfig, [NodeId.of('unit-1')]);
    const fv2 = FV.addSelection(fv1, testConfig, NodeId.of('ghost'));
    expect(fv2.selections).toHaveLength(1);
  });
});

describe('FieldValue.removeSelection', () => {
  it('removes a selection by terminal node ID', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('unit-1'), NodeId.of('plot-67')]);
    const updated = FV.removeSelection(fv, NodeId.of('unit-1'));
    expect(updated.selections).toHaveLength(1);
    expect(updated.selections[0]?.labels[updated.selections[0].labels.length - 1]).toBe('Plot 67/II/MS');
  });

  it('is a no-op when node ID is not in selections', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('unit-1')]);
    const updated = FV.removeSelection(fv, NodeId.of('ghost'));
    expect(updated.selections).toHaveLength(1);
  });
});

describe('FieldValue.format', () => {
  it('formats selections as breadcrumb strings joined by semicolons', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('unit-1'), NodeId.of('plot-67')]);
    const formatted = FV.format(fv);
    expect(formatted).toContain('Mombasa > Mvita > Plot 52/II/MS > Block A > Unit 1');
    expect(formatted).toContain('Mombasa > Mvita > Plot 67/II/MS');
    expect(formatted).toContain('; ');
  });

  it('returns empty string for empty field value', () => {
    expect(FV.format(FV.empty)).toBe('');
  });
});

describe('FieldValue.selectedNodeIds', () => {
  it('extracts terminal node IDs from all selections', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('unit-1'), NodeId.of('plot-67')]);
    const ids = FV.selectedNodeIds(fv);
    expect(ids.map(id => id as string)).toEqual(['unit-1', 'plot-67']);
  });

  it('returns empty array for empty field value', () => {
    expect(FV.selectedNodeIds(FV.empty)).toEqual([]);
  });
});

// ---- Display Grouping ----

describe('FieldValue.groupSelections', () => {
  it('returns empty array for empty field value', () => {
    expect(FV.groupSelections(FV.empty)).toEqual([]);
  });

  it('groups selections sharing common ancestors', () => {
    // Plot 52 and Plot 67 share Mombasa > Mvita
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('plot-52'), NodeId.of('plot-67')]);
    const nodes = FV.groupSelections(fv);
    expect(nodes).toHaveLength(1); // single root: Mombasa
    const mombasa = nodes[0];
    expect(mombasa?.label).toBe('Mombasa');
    expect(mombasa?.isLeaf).toBe(false);
    expect(mombasa?.depth).toBe(0);
    const mvita = mombasa?.children[0];
    expect(mvita?.label).toBe('Mvita');
    expect(mvita?.isLeaf).toBe(false);
    expect(mvita?.children).toHaveLength(2);
    expect(mvita?.children[0]?.label).toBe('Plot 52/II/MS');
    expect(mvita?.children[0]?.isLeaf).toBe(true);
    expect(mvita?.children[1]?.label).toBe('Plot 67/II/MS');
    expect(mvita?.children[1]?.isLeaf).toBe(true);
  });

  it('creates separate subtrees for disjoint branches', () => {
    // unit-1 (Mombasa branch) and plot-99 (Nairobi branch)
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('unit-1'), NodeId.of('plot-99')]);
    const nodes = FV.groupSelections(fv);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]?.label).toBe('Mombasa');
    expect(nodes[1]?.label).toBe('Nairobi');
  });

  it('handles a single selection', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('mombasa')]);
    const nodes = FV.groupSelections(fv);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.label).toBe('Mombasa');
    expect(nodes[0]?.isLeaf).toBe(true);
    expect(nodes[0]?.children).toHaveLength(0);
  });

  it('handles mixed-level selections (ancestor and descendant)', () => {
    // Selecting Mombasa (county) AND Unit 1 (under Mombasa)
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('mombasa'), NodeId.of('unit-1')]);
    const nodes = FV.groupSelections(fv);
    expect(nodes).toHaveLength(1);
    const mombasa = nodes[0];
    expect(mombasa?.label).toBe('Mombasa');
    expect(mombasa?.isLeaf).toBe(true); // directly selected
    expect(mombasa?.children.length).toBeGreaterThan(0); // also has children
  });
});

describe('FieldValue.flattenDisplay', () => {
  it('produces pre-order traversal with correct depths', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('plot-52'), NodeId.of('plot-67')]);
    const nodes = FV.groupSelections(fv);
    const flat = FV.flattenDisplay(nodes);
    expect(flat.map(n => ({ label: n.label, depth: n.depth, isLeaf: n.isLeaf }))).toEqual([
      { label: 'Mombasa', depth: 0, isLeaf: false },
      { label: 'Mvita', depth: 1, isLeaf: false },
      { label: 'Plot 52/II/MS', depth: 2, isLeaf: true },
      { label: 'Plot 67/II/MS', depth: 2, isLeaf: true },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(FV.flattenDisplay([])).toEqual([]);
  });

  it('includes multiple subtrees in order', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('unit-1'), NodeId.of('plot-99')]);
    const flat = FV.flattenDisplay(FV.groupSelections(fv));
    const labels = flat.map(n => n.label);
    expect(labels[0]).toBe('Mombasa');
    expect(labels[labels.length - 1]).toBe('Plot 99/III/NB');
  });
});

// ---- Condensed Breadcrumb Formatting ----

describe('FieldValue.formatGrouped', () => {
  const S = FV.BREADCRUMB_SEP;

  it('returns empty array for empty field value', () => {
    expect(FV.formatGrouped(FV.empty)).toEqual([]);
  });

  it('formats a single selection as one breadcrumb line', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('unit-1')]);
    expect(FV.formatGrouped(fv)).toEqual([`Mombasa${S}Mvita${S}Plot 52/II/MS${S}Block A${S}Unit 1`]);
  });

  it('groups sibling leaves onto one comma-separated line', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('plot-52'), NodeId.of('plot-67')]);
    expect(FV.formatGrouped(fv)).toEqual([`Mombasa${S}Mvita${S}Plot 52/II/MS, Plot 67/II/MS`]);
  });

  it('produces separate lines for disjoint branches', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('unit-1'), NodeId.of('plot-99')]);
    const lines = FV.formatGrouped(fv);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Mombasa');
    expect(lines[0]).toContain('Unit 1');
    expect(lines[1]).toContain('Nairobi');
    expect(lines[1]).toContain('Plot 99/III/NB');
  });

  it('handles a single top-level selection', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('mombasa')]);
    expect(FV.formatGrouped(fv)).toEqual(['Mombasa']);
  });

  it('suppresses ancestor-only lines when descendants are also selected', () => {
    // Selecting Mombasa AND Unit 1 (under Mombasa) - Mombasa is already
    // visible as the breadcrumb prefix, so no separate "Mombasa" line
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('mombasa'), NodeId.of('unit-1')]);
    const lines = FV.formatGrouped(fv);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Mombasa');
    expect(lines[0]).toContain('Unit 1');
  });

  it('uses the visual breadcrumb separator', () => {
    const fv = FV.fromNodeIds(testConfig, [NodeId.of('mvita')]);
    const lines = FV.formatGrouped(fv);
    expect(lines[0]).toBe(`Mombasa${S}Mvita`);
    expect(lines[0]).toContain('\u203A');
  });
});
