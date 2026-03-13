/**
 * AnnotationKey - branded identifier for annotation definitions.
 *
 * Used as the key linking annotation definitions on TreeConfig
 * to annotation values on individual TreeNode instances.
 * Wraps a non-empty string to prevent conflation with other
 * string-based identifiers ({@link NodeId}, {@link TreeId}, {@link LevelId}).
 */

import { ok, err, type Result } from 'neverthrow';
import { z } from 'zod';
import type { Brand } from './brand';

/**
 * Branded identifier for annotation definitions.
 *
 * Underlying representation: non-empty `string`.
 * See {@link AnnotationKey} companion for construction and extraction.
 */
type AnnotationKey = Brand<string, 'AnnotationKey'>;

/**
 * Factory, validation, and extraction utilities for {@link AnnotationKey}.
 *
 * - {@link AnnotationKey.of} - trusted construction (no validation, caller guarantees non-empty)
 * - {@link AnnotationKey.parse} - validated construction from unknown input
 * - {@link AnnotationKey.schema} - Zod schema for boundary validation
 * - {@link AnnotationKey.value} - extract the underlying string
 */
const AnnotationKey = {
  /** Trusted constructor. Caller guarantees the input is a non-empty string. */
  of: (raw: string): AnnotationKey => raw as AnnotationKey,

  /** Validated constructor for system boundaries. */
  parse: (raw: unknown): Result<AnnotationKey, string> =>
    typeof raw === 'string' && raw.length > 0
      ? ok(raw as AnnotationKey)
      : err('AnnotationKey must be a non-empty string'),

  /** Zod schema that validates and brands in one step. */
  schema: z
    .string()
    .min(1)
    .transform((s): AnnotationKey => s as AnnotationKey),

  /** Extract the underlying string value. */
  value: (key: AnnotationKey): string => key,
} as const;

export { AnnotationKey };
