/**
 * Zod schemas for runtime validation of all domain types.
 *
 * Used at system boundaries: parsing imported JSON, validating resolver
 * payloads, and deserialising KVS data. The domain layer itself uses
 * TypeScript types — Zod validates at the edges.
 */

import { z } from 'zod';
import { NodeId } from './node-id';
import { TreeId } from './tree-id';
import { LevelId } from './level-id';
import { AnnotationKey } from './annotation-key';
import type { TreeNode } from './types';

// ──── Primitives ────

const nodeIdSchema = NodeId.schema;
const treeIdSchema = TreeId.schema;
const levelIdSchema = LevelId.schema;
const annotationKeySchema = AnnotationKey.schema;

// ──── Annotations ────

const resolutionStrategySchema = z.enum(['union', 'nearest', 'explicit']);

const annotationDefinitionSchema = z.object({
  key: annotationKeySchema,
  label: z.string().min(1),
  resolution: resolutionStrategySchema,
});

// ──── Tree Configuration ────

const levelDefinitionSchema = z.object({
  id: levelIdSchema,
  label: z.string().min(1),
  depth: z.number().int().min(0),
});

/**
 * Recursive tree node schema.
 *
 * Zod v4 dropped the `Def` generic from ZodType, simplifying
 * recursive type annotations. We use z.lazy() with an explicit
 * output type to break the circularity.
 */
const treeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: nodeIdSchema,
    label: z.string().min(1),
    levelId: levelIdSchema,
    metadata: z.record(z.string(), z.string()).default({}),
    children: z.array(treeNodeSchema).default([]),
    annotations: z.record(z.string(), z.array(z.string())).default({}),
  }),
);

const treeConfigSchema = z.object({
  id: treeIdSchema,
  name: z.string().min(1),
  version: z.number().int().min(0),
  levels: z.array(levelDefinitionSchema).min(1),
  annotations: z.array(annotationDefinitionSchema).default([]),
  root: treeNodeSchema,
});

// ──── Tree Summary (meta index entries read from KVS) ────

const treeSummarySchema = z.object({
  id: treeIdSchema,
  name: z.string(),
  version: z.number(),
  levelCount: z.number(),
  nodeCount: z.number(),
  annotationCount: z.number(),
});

// ──── Field Value ────

const pathSegmentSchema = z.object({
  levelId: levelIdSchema,
  nodeId: nodeIdSchema,
  label: z.string(),
});

const selectionSchema = z.object({
  path: z.array(pathSegmentSchema),
  labels: z.array(z.string()),
  l0: z.string().optional(),
  l1: z.string().optional(),
  l2: z.string().optional(),
  l3: z.string().optional(),
  l4: z.string().optional(),
  l5: z.string().optional(),
});

const fieldValueSchema = z.object({
  selections: z.array(selectionSchema),
});

// ──── Context Configs ────

const selectFieldConfigSchema = z.object({
  treeId: treeIdSchema,
});

const derivedFieldConfigSchema = z.object({
  treeId: treeIdSchema,
  annotationKey: annotationKeySchema,
});

// ──── Import Format (user-provided JSON for tree data) ────

/**
 * Simplified import format: users provide nodes without requiring
 * the full TreeConfig wrapper. The admin UI wraps this into a
 * complete TreeConfig with generated IDs and metadata.
 */
interface ImportNode {
  readonly label: string;
  readonly level: string;
  readonly metadata?: Record<string, string> | undefined;
  readonly annotations?: Record<string, readonly string[]> | undefined;
  readonly children?: readonly ImportNode[] | undefined;
}

const importNodeSchema: z.ZodType<ImportNode> = z.lazy(() =>
  z.object({
    label: z.string().min(1),
    level: z.string().min(1),
    metadata: z.record(z.string(), z.string()).optional(),
    annotations: z.record(z.string(), z.array(z.string())).optional(),
    children: z.array(importNodeSchema).optional(),
  }),
);

const importAnnotationSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  resolution: resolutionStrategySchema.default('union'),
});

const importTreeSchema = z.object({
  name: z.string().min(1),
  levels: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })),
  annotations: z.array(importAnnotationSchema).default([]),
  nodes: z.array(importNodeSchema),
});

/** Inferred type for the import tree schema (user-provided simplified format). */
type ImportTree = z.infer<typeof importTreeSchema>;

export type { ImportNode, ImportTree };

/**
 * Zod schema collection for runtime validation at system boundaries.
 *
 * Covers all domain types: branded IDs, tree configuration, field values,
 * context configs, and the simplified import format.
 */
export const Schemas = {
  nodeId: nodeIdSchema,
  treeId: treeIdSchema,
  levelId: levelIdSchema,
  annotationKey: annotationKeySchema,
  resolutionStrategy: resolutionStrategySchema,
  annotationDefinition: annotationDefinitionSchema,
  levelDefinition: levelDefinitionSchema,
  treeNode: treeNodeSchema,
  treeConfig: treeConfigSchema,
  treeSummary: treeSummarySchema,
  pathSegment: pathSegmentSchema,
  selection: selectionSchema,
  fieldValue: fieldValueSchema,
  selectFieldConfig: selectFieldConfigSchema,
  derivedFieldConfig: derivedFieldConfigSchema,
  importNode: importNodeSchema,
  importAnnotation: importAnnotationSchema,
  importTree: importTreeSchema,
} as const;
