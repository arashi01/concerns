/**
 * Domain layer public API.
 *
 * Re-exports all types, companions, and pure logic modules.
 * This module has zero side effects and zero @forge/* dependencies.
 */

export type { Brand } from './brand';
export { NodeId } from './node-id';
export { TreeId } from './tree-id';
export { LevelId } from './level-id';
export { AnnotationKey } from './annotation-key';

export type {
  LevelDefinition,
  ResolutionStrategy,
  AnnotationDefinition,
  TreeNode,
  TreeConfig,
  TreeSummary,
  PathSegment,
  Selection,
  ResolvedAnnotation,
  SelectFieldConfig,
  DerivedFieldConfig,
} from './types';

export type { ImportNode, ImportTree } from './schemas';

export { Tree } from './tree';
export { FieldValue } from './field-value';
export { Import } from './import';
export { CsvParse } from './csv-parse';
export { TreeMutate } from './tree-mutate';
export { Sanitise } from './sanitise';
export { Schemas } from './schemas';
