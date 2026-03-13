/**
 * Tests for CSV parsing (PapaParse-backed domain transformations).
 *
 * Covers three formats:
 *   - Tree CSV: columns = levels, rows = paths
 *   - Combined CSV: levels + @-prefixed annotation columns
 *   - Annotation CSV: annotate existing tree by path
 */

import { describe, it, expect } from 'vitest';
import { CsvParse } from '../../domain/csv-parse';
import { testConfig, annotatedConfig } from './fixtures';

// ──── parseTreeCsv ────

describe('CsvParse.parseTreeCsv', () => {
  it('parses a simple tree CSV', () => {
    const csv = `County,Sub-County,Plot
Mombasa,Mvita,Plot 52
Mombasa,Mvita,Plot 67
Mombasa,Likoni,Plot 1`;

    const result = CsvParse.parseTreeCsv(csv);
    expect(result.isOk()).toBe(true);

    const tree = result._unsafeUnwrap();
    expect(tree.name).toBe('Imported Tree');
    expect(tree.levels).toHaveLength(3);
    expect(tree.levels[0]!.label).toBe('County');
    expect(tree.levels[0]!.id).toBe('county');
    expect(tree.levels[1]!.id).toBe('sub-county');
    expect(tree.levels[2]!.id).toBe('plot');

    // One root county (Mombasa)
    expect(tree.nodes).toHaveLength(1);
    expect(tree.nodes[0]!.label).toBe('Mombasa');

    // Two sub-counties: Mvita, Likoni
    const mombasa = tree.nodes[0]!;
    expect(mombasa.children).toHaveLength(2);

    const mvita = mombasa.children!.find(c => c.label === 'Mvita')!;
    expect(mvita.children).toHaveLength(2);
    expect(mvita.children![0]!.label).toBe('Plot 52');
    expect(mvita.children![1]!.label).toBe('Plot 67');
  });

  it('handles empty trailing cells (partial paths)', () => {
    const csv = `County,Sub-County,Plot
Mombasa,,
Mombasa,Mvita,`;

    const result = CsvParse.parseTreeCsv(csv);
    expect(result.isOk()).toBe(true);

    const tree = result._unsafeUnwrap();
    expect(tree.nodes).toHaveLength(1);

    const mombasa = tree.nodes[0]!;
    expect(mombasa.label).toBe('Mombasa');
    // Mvita exists as a child, but its "Plot" cell was empty
    expect(mombasa.children).toHaveLength(1);
    expect(mombasa.children![0]!.label).toBe('Mvita');
  });

  it('deduplicates shared ancestors', () => {
    const csv = `A,B,C
X,Y,Z1
X,Y,Z2
X,Y2,`;

    const result = CsvParse.parseTreeCsv(csv);
    expect(result.isOk()).toBe(true);

    const tree = result._unsafeUnwrap();
    // One root: X
    expect(tree.nodes).toHaveLength(1);
    // Two children of X: Y and Y2
    expect(tree.nodes[0]!.children).toHaveLength(2);
    // Y has two children: Z1 and Z2
    const y = tree.nodes[0]!.children!.find(c => c.label === 'Y')!;
    expect(y.children).toHaveLength(2);
  });

  it('returns error for empty CSV', () => {
    const csv = `County,Sub-County\n`;
    const result = CsvParse.parseTreeCsv(csv);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().join('; ')).toContain('no data');
  });

  it('handles CSV with quoted fields', () => {
    const csv = `Region,City
"North America","New York"
"North America","Los Angeles"`;

    const result = CsvParse.parseTreeCsv(csv);
    expect(result.isOk()).toBe(true);

    const tree = result._unsafeUnwrap();
    expect(tree.nodes[0]!.label).toBe('North America');
    expect(tree.nodes[0]!.children![0]!.label).toBe('New York');
  });

  it('generates level IDs from header names', () => {
    const csv = `Product Category,Sub Category
Electronics,Phones`;

    const result = CsvParse.parseTreeCsv(csv);
    expect(result.isOk()).toBe(true);

    const tree = result._unsafeUnwrap();
    expect(tree.levels[0]!.id).toBe('product-category');
    expect(tree.levels[1]!.id).toBe('sub-category');
  });

  it('assigns correct level to each node', () => {
    const csv = `County,Sub-County
Mombasa,Mvita`;

    const result = CsvParse.parseTreeCsv(csv);
    const tree = result._unsafeUnwrap();
    expect(tree.nodes[0]!.level).toBe('County');
    expect(tree.nodes[0]!.children![0]!.level).toBe('Sub-County');
  });
});

// ──── parseCombinedCsv ────

describe('CsvParse.parseCombinedCsv', () => {
  it('separates level and annotation columns', () => {
    const csv = `County,Sub-County,@principal,@manager
Mombasa,Mvita,SBS Properties Ltd,Kamau
Mombasa,Likoni,SBS Properties Ltd,`;

    const result = CsvParse.parseCombinedCsv(csv);
    expect(result.isOk()).toBe(true);

    const tree = result._unsafeUnwrap();
    // Two level columns
    expect(tree.levels).toHaveLength(2);
    // Two annotation definitions
    expect(tree.annotations).toHaveLength(2);
    expect(tree.annotations[0]!.key).toBe('principal');
    expect(tree.annotations[0]!.resolution).toBe('union');
    expect(tree.annotations[1]!.key).toBe('manager');
  });

  it('attaches annotations to the deepest node', () => {
    const csv = `County,Sub-County,@principal
Mombasa,Mvita,SBS Properties Ltd`;

    const result = CsvParse.parseCombinedCsv(csv);
    const tree = result._unsafeUnwrap();

    // Mvita (deepest non-empty) should have the annotation
    const mvita = tree.nodes[0]!.children![0]!;
    expect(mvita.annotations!['principal']).toEqual(['SBS Properties Ltd']);

    // Mombasa should NOT have annotations
    expect(tree.nodes[0]!.annotations).toBeUndefined();
  });

  it('merges annotations across duplicate rows', () => {
    const csv = `County,@principal
Mombasa,SBS Properties Ltd
Mombasa,SBS Properties (2016)`;

    const result = CsvParse.parseCombinedCsv(csv);
    const tree = result._unsafeUnwrap();

    const mombasa = tree.nodes[0]!;
    expect(mombasa.annotations!['principal']).toEqual(['SBS Properties Ltd', 'SBS Properties (2016)']);
  });

  it('skips empty annotation values', () => {
    const csv = `County,@principal,@manager
Mombasa,SBS Properties Ltd,`;

    const result = CsvParse.parseCombinedCsv(csv);
    const tree = result._unsafeUnwrap();

    const mombasa = tree.nodes[0]!;
    expect(mombasa.annotations!['principal']).toEqual(['SBS Properties Ltd']);
    // manager should not be present (empty value)
    expect(mombasa.annotations!['manager']).toBeUndefined();
  });

  it('capitalises annotation labels from column names', () => {
    const csv = `A,@costCentre
X,CC-001`;

    const result = CsvParse.parseCombinedCsv(csv);
    const tree = result._unsafeUnwrap();
    expect(tree.annotations[0]!.label).toBe('CostCentre');
  });

  it('returns error when all columns are annotations', () => {
    const csv = `@principal,@manager
SBS,Kamau`;

    const result = CsvParse.parseCombinedCsv(csv);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().join('; ')).toContain('No level columns');
  });
});

// ──── parseAnnotationCsv ────

describe('CsvParse.parseAnnotationCsv', () => {
  it('applies annotations to matching nodes in existing tree', () => {
    // annotatedConfig has principal + manager annotation definitions
    const csv = `path,principal,manager
Mombasa > Mvita > Plot 52/II/MS,New Principal,New Manager`;

    const result = CsvParse.parseAnnotationCsv(csv, annotatedConfig);
    expect(result.isOk()).toBe(true);

    const updated = result._unsafeUnwrap();
    const mombasa = updated.root.children[0]!;
    const mvita = mombasa.children[0]!;
    const plot52 = mvita.children[0]!;
    // Merged with existing: Plot 52 already had principal: ['SBS Properties Ltd'], manager: ['Kamau']
    expect(plot52.annotations['principal']).toContain('SBS Properties Ltd');
    expect(plot52.annotations['principal']).toContain('New Principal');
    expect(plot52.annotations['manager']).toContain('Kamau');
    expect(plot52.annotations['manager']).toContain('New Manager');
  });

  it('returns error when path column is missing', () => {
    const csv = `location,principal
Mombasa,SBS`;

    const result = CsvParse.parseAnnotationCsv(csv, testConfig);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().join('; ')).toContain('path');
  });

  it('returns error when no node matches path', () => {
    const csv = `path,principal
Mombasa > Nonexistent,SBS Properties Ltd`;

    const result = CsvParse.parseAnnotationCsv(csv, testConfig);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().join('; ')).toContain('no node found');
  });

  it('returns error when annotation key not defined in config', () => {
    // testConfig has no annotation definitions
    const csv = `path,principal
Mombasa > Mvita > Plot 52/II/MS,SBS`;

    const result = CsvParse.parseAnnotationCsv(csv, testConfig);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().join('; ')).toContain('not defined');
  });

  it('applies annotations to tree with existing annotation definitions', () => {
    // annotatedConfig already has principal + manager annotations defined
    const csv = `path,principal
Mombasa > Mvita > Plot 67/II/MS,New Owner`;

    const result = CsvParse.parseAnnotationCsv(csv, annotatedConfig);
    expect(result.isOk()).toBe(true);

    const updated = result._unsafeUnwrap();
    const mombasa = updated.root.children[0]!;
    const mvita = mombasa.children[0]!;
    const plot67 = mvita.children[1]!;
    // Should have merged with existing annotations
    expect(plot67.annotations['principal']).toContain('New Owner');
  });

  it('returns error for empty path values', () => {
    const csv = `path,principal
,SBS Properties Ltd`;

    const result = CsvParse.parseAnnotationCsv(csv, annotatedConfig);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().join('; ')).toContain('empty path');
  });

  it('preserves unmodified nodes', () => {
    const csv = `path,principal
Mombasa > Mvita > Plot 52/II/MS,Override`;

    const result = CsvParse.parseAnnotationCsv(csv, annotatedConfig);
    expect(result.isOk()).toBe(true);

    const updated = result._unsafeUnwrap();
    // Plot 67 should be unchanged
    const mvita = updated.root.children[0]!.children[0]!;
    const plot67 = mvita.children[1]!;
    expect(plot67.annotations['principal']).toEqual(['SBS Properties Ltd']);
  });
});
