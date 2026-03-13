/**
 * NodeId - branded identifier for tree nodes.
 *
 * Wraps a non-empty string to prevent accidental conflation with
 * other string-based identifiers ({@link TreeId}, {@link LevelId}).
 * Instances are constructed via {@link NodeId.of} (trusted) or
 * {@link NodeId.parse} (validated).
 */

import { ok, err, type Result } from 'neverthrow';
import { z } from 'zod';
import type { Brand } from './brand';

/**
 * Unique identifier for a node within a tree hierarchy.
 *
 * Underlying representation: non-empty `string`.
 * See {@link NodeId} companion for construction and extraction.
 */
type NodeId = Brand<string, 'NodeId'>;

/**
 * Factory, validation, and extraction utilities for {@link NodeId}.
 *
 * - {@link NodeId.of} - trusted construction (no validation, caller guarantees non-empty)
 * - {@link NodeId.parse} - validated construction from unknown input
 * - {@link NodeId.schema} - Zod schema for boundary validation
 * - {@link NodeId.value} - extract the underlying string
 */
const NodeId = {
  /** Trusted constructor. Caller guarantees the input is a non-empty string. */
  of: (raw: string): NodeId => raw as NodeId,

  /** Validated constructor for system boundaries. */
  parse: (raw: unknown): Result<NodeId, string> =>
    typeof raw === 'string' && raw.length > 0 ? ok(raw as NodeId) : err('NodeId must be a non-empty string'),

  /** Zod schema that validates and brands in one step. */
  schema: z
    .string()
    .min(1)
    .transform((s): NodeId => s as NodeId),

  /** Extract the underlying string value. */
  value: (id: NodeId): string => id,
} as const;

export { NodeId };
