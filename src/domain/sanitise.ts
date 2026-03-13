/**
 * Input sanitisation for tree configurations.
 *
 * Validates and trims user-provided data before persistence.
 * Pure functions — no side effects, no @forge/* dependencies.
 */

import { ok, err, type Result } from 'neverthrow';
import type { TreeConfig, TreeNode } from './types';

// ──── Constants ────

const MAX_NAME_LENGTH = 100;
const MAX_LABEL_LENGTH = 200;
const MAX_METADATA_VALUE_LENGTH = 500;
const MAX_ANNOTATION_VALUE_LENGTH = 200;

/** Matches ASCII control characters (C0 range, except tab/newline/carriage return). */
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

// ──── Helpers ────

const hasControlChars = (s: string): boolean => CONTROL_CHAR_RE.test(s);

const checkString = (value: string, maxLength: number, label: string, errors: string[]): string => {
  const trimmed = value.trim();
  if (hasControlChars(trimmed)) {
    errors.push(`${label}: contains control characters`);
  }
  if (trimmed.length > maxLength) {
    errors.push(`${label}: exceeds max length of ${String(maxLength)} (got ${String(trimmed.length)})`);
  }
  return trimmed;
};

// ──── Node sanitisation ────

const sanitiseNode = (node: TreeNode, path: string, errors: string[]): TreeNode => {
  const label = checkString(node.label, MAX_LABEL_LENGTH, `${path} label`, errors);

  const metadata: Record<string, string> = {};
  for (const [k, v] of Object.entries(node.metadata)) {
    const trimmedKey = checkString(k, MAX_LABEL_LENGTH, `${path} metadata key "${k}"`, errors);
    const trimmedVal = checkString(v, MAX_METADATA_VALUE_LENGTH, `${path} metadata "${k}"`, errors);
    metadata[trimmedKey] = trimmedVal;
  }

  const annotations: Record<string, readonly string[]> = {};
  for (const [k, values] of Object.entries(node.annotations)) {
    annotations[k] = values.map((v, i) =>
      checkString(v, MAX_ANNOTATION_VALUE_LENGTH, `${path} annotation "${k}"[${String(i)}]`, errors),
    );
  }

  const children = node.children.map((child, i) =>
    sanitiseNode(child, `${path} > ${child.label}[${String(i)}]`, errors),
  );

  return { ...node, label, metadata, annotations, children };
};

// ──── Public API ────

const sanitiseTreeConfig = (config: TreeConfig): Result<TreeConfig, readonly string[]> => {
  const errors: string[] = [];

  const name = checkString(config.name, MAX_NAME_LENGTH, 'Tree name', errors);

  const levels = config.levels.map(level => ({
    ...level,
    label: checkString(level.label, MAX_LABEL_LENGTH, `Level "${level.label}"`, errors),
  }));

  const annotations = config.annotations.map(ann => ({
    ...ann,
    label: checkString(ann.label, MAX_LABEL_LENGTH, `Annotation "${ann.label}"`, errors),
  }));

  const root = sanitiseNode(config.root, 'Root', errors);

  if (errors.length > 0) return err(errors);

  return ok({ ...config, name, levels, annotations, root });
};

/**
 * Input sanitisation and validation for {@link TreeConfig}.
 *
 * Enforces length limits, trims whitespace, and rejects control characters.
 */
export const Sanitise = {
  sanitiseTreeConfig,
  MAX_NAME_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_METADATA_VALUE_LENGTH,
  MAX_ANNOTATION_VALUE_LENGTH,
} as const;
