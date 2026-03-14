/**
 * Shared test fixtures for domain layer tests.
 *
 * Models the SBS Properties hierarchy:
 *   Mombasa > Mvita > Plot 52/II/MS > Block A > Unit 1, Unit 2
 *                    > Plot 67/II/MS
 *
 * Two fixture sets:
 *   - Plain: no annotations (for core tree/field-value tests)
 *   - Annotated: with principal + manager annotations (for resolution tests)
 */

import { NodeId } from '../../domain/node-id';
import { TreeId } from '../../domain/tree-id';
import { LevelId } from '../../domain/level-id';
import { AnnotationKey } from '../../domain/annotation-key';
import type { TreeConfig, TreeNode, AnnotationDefinition } from '../../domain/types';

// ---- Level IDs ----

export const countyLevel = LevelId.of('county');
export const subCountyLevel = LevelId.of('subcounty');
export const plotLevel = LevelId.of('plot');
export const buildingLevel = LevelId.of('building');
export const unitLevel = LevelId.of('unit');

// ---- Node factory ----

const mkNode = (
  id: string,
  label: string,
  levelId: LevelId,
  children: readonly TreeNode[] = [],
  opts?: {
    metadata?: Readonly<Record<string, string>>;
    annotations?: Readonly<Record<string, readonly string[]>>;
  },
): TreeNode => ({
  id: NodeId.of(id),
  label,
  levelId,
  metadata: opts?.metadata ?? {},
  annotations: opts?.annotations ?? {},
  children,
});

// ---- Plain tree (no annotations) ----

export const unit1 = mkNode('unit-1', 'Unit 1', unitLevel);
export const unit2 = mkNode('unit-2', 'Unit 2', unitLevel);
export const blockA = mkNode('block-a', 'Block A', buildingLevel, [unit1, unit2]);
export const plot52 = mkNode('plot-52', 'Plot 52/II/MS', plotLevel, [blockA], {
  metadata: { lrNumber: 'CR/12345' },
});
export const plot67 = mkNode('plot-67', 'Plot 67/II/MS', plotLevel);
export const mvita = mkNode('mvita', 'Mvita', subCountyLevel, [plot52, plot67]);
export const mombasa = mkNode('mombasa', 'Mombasa', countyLevel, [mvita]);
export const root = mkNode('root', 'Root', LevelId.of('root'), [mombasa]);

export const testConfig: TreeConfig = {
  id: TreeId.of('test-tree'),
  name: 'Test Property Hierarchy',
  version: 1,
  levels: [
    { id: countyLevel, label: 'County', depth: 0 },
    { id: subCountyLevel, label: 'Sub-County', depth: 1 },
    { id: plotLevel, label: 'Plot', depth: 2 },
    { id: buildingLevel, label: 'Building', depth: 3 },
    { id: unitLevel, label: 'Unit', depth: 4 },
  ],
  annotations: [],
  root,
};

// ---- Annotated tree ----

export const principalKey = AnnotationKey.of('principal');
export const managerKey = AnnotationKey.of('manager');

export const annotationDefs: readonly AnnotationDefinition[] = [
  { key: principalKey, label: 'Principal', resolution: 'union' },
  { key: managerKey, label: 'Manager', resolution: 'nearest' },
];

export const annUnit1 = mkNode('unit-1', 'Unit 1', unitLevel);
export const annUnit2 = mkNode('unit-2', 'Unit 2', unitLevel);
export const annBlockA = mkNode('block-a', 'Block A', buildingLevel, [annUnit1, annUnit2], {
  annotations: { principal: ['SBS Properties Ltd', 'SBS Properties (2016)'] },
});
export const annPlot52 = mkNode('plot-52', 'Plot 52/II/MS', plotLevel, [annBlockA], {
  metadata: { lrNumber: 'CR/12345' },
  annotations: { principal: ['SBS Properties Ltd'], manager: ['Kamau'] },
});
export const annPlot67 = mkNode('plot-67', 'Plot 67/II/MS', plotLevel, [], {
  annotations: { principal: ['SBS Properties Ltd'] },
});
export const annMvita = mkNode('mvita', 'Mvita', subCountyLevel, [annPlot52, annPlot67]);
export const annMombasa = mkNode('mombasa', 'Mombasa', countyLevel, [annMvita]);
export const annRoot = mkNode('root', 'Root', LevelId.of('root'), [annMombasa]);

export const annotatedConfig: TreeConfig = {
  id: TreeId.of('test-tree'),
  name: 'Test Property Hierarchy',
  version: 1,
  levels: [
    { id: countyLevel, label: 'County', depth: 0 },
    { id: subCountyLevel, label: 'Sub-County', depth: 1 },
    { id: plotLevel, label: 'Plot', depth: 2 },
    { id: buildingLevel, label: 'Building', depth: 3 },
    { id: unitLevel, label: 'Unit', depth: 4 },
  ],
  annotations: annotationDefs,
  root: annRoot,
};
