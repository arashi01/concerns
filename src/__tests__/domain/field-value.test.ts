import { describe, it, expect } from 'vitest';
import { FieldValue as FV } from '../../domain/field-value';
import { NodeId } from '../../domain/node-id';
import { testConfig } from './fixtures';

// ──── Tests ────

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
