import type { NodeId } from './node-id';
import type { TreeId } from './tree-id';
import type { LevelId } from './level-id';
import type { AnnotationKey } from './annotation-key';

// ---- Tree Configuration (stored in Forge KVS) ----

/** Defines a single level type within the hierarchy (e.g. "County", "Plot"). */
interface LevelDefinition {
  readonly id: LevelId;
  readonly label: string;
  readonly depth: number;
}

/**
 * How annotation values are resolved along the path from root to selected node.
 *
 * - `union`: collect all values from every ancestor + the selected node.
 * - `nearest`: walk up from selected node, take the first annotation found.
 * - `explicit`: only values directly on the selected node, no inheritance.
 */
type ResolutionStrategy = 'union' | 'nearest' | 'explicit';

/** Defines an annotation dimension on the tree (e.g. "Principals", "Managers"). */
interface AnnotationDefinition {
  readonly key: AnnotationKey;
  readonly label: string;
  readonly resolution: ResolutionStrategy;
}

/**
 * A single node in the hierarchy tree.
 *
 * Nodes carry data only. All traversal, filtering, and mutation logic
 * lives in the Tree companion module.
 *
 * `annotations` maps annotation keys to arrays of values. An empty
 * record means no annotations on this node. Resolution against
 * ancestor annotations is handled at query time by Tree.resolveAnnotations.
 */
interface TreeNode {
  readonly id: NodeId;
  readonly label: string;
  readonly levelId: LevelId;
  readonly metadata: Readonly<Record<string, string>>;
  readonly children: readonly TreeNode[];
  readonly annotations: Readonly<Record<string, readonly string[]>>;
}

/**
 * Complete tree configuration document.
 *
 * Self-contained: one KVS key stores the entire hierarchy plus
 * annotation definitions. `version` enables optimistic concurrency
 * on admin writes.
 */
interface TreeConfig {
  readonly id: TreeId;
  readonly name: string;
  readonly version: number;
  readonly levels: readonly LevelDefinition[];
  readonly annotations: readonly AnnotationDefinition[];
  readonly root: TreeNode;
}

/** Summary entry for listing available tree configs without loading full trees. */
interface TreeSummary {
  readonly id: TreeId;
  readonly name: string;
  readonly version: number;
  readonly levelCount: number;
  readonly nodeCount: number;
  readonly annotationCount: number;
}

// ---- Field Value (stored on each Jira issue) ----

/** A single segment in a selection path. */
interface PathSegment {
  readonly levelId: LevelId;
  readonly nodeId: NodeId;
  readonly label: string;
}

/**
 * One complete selection within the field.
 *
 * `path` is the full breadcrumb from root to the selected node.
 * `l0`-`l5` are denormalised labels for JQL indexing via searchAlias.
 */
interface Selection {
  readonly path: readonly PathSegment[];
  readonly labels: readonly string[];
  readonly l0: string | undefined;
  readonly l1: string | undefined;
  readonly l2: string | undefined;
  readonly l3: string | undefined;
  readonly l4: string | undefined;
  readonly l5: string | undefined;
}

/** The complete field value persisted on an issue. */
interface FieldValue {
  readonly selections: readonly Selection[];
}

// ---- Annotation Resolution (returned by Tree.resolveAnnotations) ----

/** The resolved values for a single annotation dimension across all selections. */
interface ResolvedAnnotation {
  readonly key: AnnotationKey;
  readonly label: string;
  readonly values: readonly string[];
}

// ---- Filtered Tree (returned by Tree.filterTree for search rendering) ----

/** Result of pruning a tree to only branches containing matching nodes. */
interface FilteredTree {
  readonly root: TreeNode;
  /** Node IDs that directly match the query (vs. ancestors kept for context). */
  readonly matchIds: ReadonlySet<string>;
}

// ---- Display Tree (returned by FV.groupSelections for view rendering) ----

/** A node in the grouped display tree for hierarchical rendering. */
interface DisplayNode {
  readonly label: string;
  readonly depth: number;
  readonly isLeaf: boolean;
  readonly children: readonly DisplayNode[];
}

// ---- Field Context Configs ----

/** Configuration for the tree select field instance (contextConfig). */
interface SelectFieldConfig {
  readonly treeId: TreeId;
}

/** Configuration for the derived annotation field instance (contextConfig). */
interface DerivedFieldConfig {
  readonly treeId: TreeId;
  readonly annotationKey: AnnotationKey;
}

export type {
  LevelDefinition,
  ResolutionStrategy,
  AnnotationDefinition,
  TreeNode,
  TreeConfig,
  TreeSummary,
  PathSegment,
  Selection,
  FieldValue,
  FilteredTree,
  DisplayNode,
  ResolvedAnnotation,
  SelectFieldConfig,
  DerivedFieldConfig,
};
