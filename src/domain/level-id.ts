/**
 * LevelId - branded identifier for hierarchy level definitions.
 *
 * Wraps a non-empty string to prevent accidental conflation with
 * other string-based identifiers ({@link NodeId}, {@link TreeId}).
 * Instances are constructed via {@link LevelId.of} (trusted) or
 * {@link LevelId.parse} (validated).
 */

import { ok, err, type Result } from 'neverthrow';
import { z } from 'zod';
import type { Brand } from './brand';

/**
 * Unique identifier for a hierarchy level definition.
 *
 * Underlying representation: non-empty `string`.
 * See {@link LevelId} companion for construction and extraction.
 */
type LevelId = Brand<string, 'LevelId'>;

/**
 * Factory, validation, and extraction utilities for {@link LevelId}.
 *
 * - {@link LevelId.of} - trusted construction (no validation, caller guarantees non-empty)
 * - {@link LevelId.parse} - validated construction from unknown input
 * - {@link LevelId.schema} - Zod schema for boundary validation
 * - {@link LevelId.value} - extract the underlying string
 */
const LevelId = {
  /** Trusted constructor. Caller guarantees the input is a non-empty string. */
  of: (raw: string): LevelId => raw as LevelId,

  /** Validated constructor for system boundaries. */
  parse: (raw: unknown): Result<LevelId, string> =>
    typeof raw === 'string' && raw.length > 0 ? ok(raw as LevelId) : err('LevelId must be a non-empty string'),

  /** Zod schema that validates and brands in one step. */
  schema: z
    .string()
    .min(1)
    .transform((s): LevelId => s as LevelId),

  /** Extract the underlying string value. */
  value: (id: LevelId): string => id,
} as const;

export { LevelId };
