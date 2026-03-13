/**
 * TreeId - branded identifier for tree configurations.
 *
 * Wraps a non-empty string to prevent accidental conflation with
 * other string-based identifiers ({@link NodeId}, {@link LevelId}).
 * Instances are constructed via {@link TreeId.of} (trusted) or
 * {@link TreeId.parse} (validated).
 */

import { ok, err, type Result } from 'neverthrow';
import { z } from 'zod';
import type { Brand } from './brand';

/**
 * Unique identifier for a tree configuration.
 *
 * Underlying representation: non-empty `string`.
 * See {@link TreeId} companion for construction and extraction.
 */
type TreeId = Brand<string, 'TreeId'>;

/**
 * Factory, validation, and extraction utilities for {@link TreeId}.
 *
 * - {@link TreeId.of} - trusted construction (no validation, caller guarantees non-empty)
 * - {@link TreeId.parse} - validated construction from unknown input
 * - {@link TreeId.schema} - Zod schema for boundary validation
 * - {@link TreeId.value} - extract the underlying string
 */
const TreeId = {
  /** Trusted constructor. Caller guarantees the input is a non-empty string. */
  of: (raw: string): TreeId => raw as TreeId,

  /** Validated constructor for system boundaries. */
  parse: (raw: unknown): Result<TreeId, string> =>
    typeof raw === 'string' && raw.length > 0 ? ok(raw as TreeId) : err('TreeId must be a non-empty string'),

  /** Zod schema that validates and brands in one step. */
  schema: z
    .string()
    .min(1)
    .transform((s): TreeId => s as TreeId),

  /** Extract the underlying string value. */
  value: (id: TreeId): string => id,
} as const;

export { TreeId };
