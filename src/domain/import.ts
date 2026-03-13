/**
 * Transform simplified import format into a full TreeConfig.
 *
 * The import format uses plain strings for level references and
 * omits generated IDs. This module bridges the gap: it generates
 * branded IDs, maps level strings to LevelId values, constructs
 * the virtual root node, and validates the resulting tree.
 *
 * Pure function — no side effects, no @forge/* dependencies.
 * The ID generator is injected for testability.
 */

import { err, type Result } from 'neverthrow';
import type { TreeConfig, TreeNode, LevelDefinition, AnnotationDefinition } from './types';
import type { ImportNode, ImportTree } from './schemas';
import { TreeId } from './tree-id';
import { NodeId } from './node-id';
import { LevelId } from './level-id';
import { AnnotationKey } from './annotation-key';
import { Tree } from './tree';

/**
 * Transform a simplified import document into a validated TreeConfig.
 *
 * @param input  - Parsed import format (already Zod-validated)
 * @param generateId - ID generator (e.g. `() => crypto.randomUUID()`)
 * @returns The constructed TreeConfig, or validation errors
 */
const transformImport = (input: ImportTree, generateId: () => string): Result<TreeConfig, readonly string[]> => {
  // Build level lookup: import level id string → branded LevelId
  const levelMap = new Map<string, LevelId>();
  const levels: LevelDefinition[] = [];

  for (let i = 0; i < input.levels.length; i++) {
    const level = input.levels[i];
    if (level === undefined) continue;
    const levelId = LevelId.of(level.id);
    levelMap.set(level.id, levelId);
    levels.push({ id: levelId, label: level.label, depth: i });
  }

  // Build annotation definitions
  const annotations: AnnotationDefinition[] = input.annotations.map(a => ({
    key: AnnotationKey.of(a.key),
    label: a.label,
    resolution: a.resolution,
  }));

  // Collect errors during node transformation
  const errors: string[] = [];

  const transformNode = (importNode: ImportNode): TreeNode => {
    const levelId = levelMap.get(importNode.level);
    if (levelId === undefined) {
      errors.push(`Node "${importNode.label}" references unknown level "${importNode.level}"`);
    }

    // Transform annotation keys to branded AnnotationKey format
    const nodeAnnotations: Record<string, readonly string[]> = {};
    if (importNode.annotations !== undefined) {
      for (const [key, values] of Object.entries(importNode.annotations)) {
        nodeAnnotations[key] = values;
      }
    }

    const children: TreeNode[] = [];
    if (importNode.children !== undefined) {
      for (const child of importNode.children) {
        children.push(transformNode(child));
      }
    }

    return {
      id: NodeId.of(generateId()),
      label: importNode.label,
      levelId: levelId ?? LevelId.of(importNode.level),
      metadata: importNode.metadata ?? {},
      annotations: nodeAnnotations,
      children,
    };
  };

  // Transform all top-level nodes
  const topLevelNodes: TreeNode[] = [];
  for (const node of input.nodes) {
    topLevelNodes.push(transformNode(node));
  }

  if (errors.length > 0) {
    return err(errors);
  }

  // Construct the virtual root node
  const root: TreeNode = {
    id: NodeId.of('root'),
    label: 'Root',
    levelId: LevelId.of('root'),
    metadata: {},
    annotations: {},
    children: topLevelNodes,
  };

  const config: TreeConfig = {
    id: TreeId.of(generateId()),
    name: input.name,
    version: 0,
    levels,
    annotations,
    root,
  };

  // Validate the constructed tree
  return Tree.validate(config);
};

/**
 * Simplified import format transformer for {@link TreeConfig}.
 *
 * Bridges user-provided import documents (no IDs, string level refs)
 * to fully branded, validated tree configurations.
 */
export const Import = { transformImport } as const;
