/**
 * CSV parsing for tree and annotation import.
 *
 * Uses PapaParse for RFC 4180-compliant CSV tokenisation. This module
 * handles the domain-specific transformation from parsed rows into
 * the import format (ImportTree) or updated TreeConfig.
 *
 * Three CSV formats are supported:
 *   1. Tree CSV — columns are hierarchy levels, rows are paths
 *   2. Combined CSV — levels + @-prefixed annotation columns
 *   3. Annotation CSV — annotate an existing tree by path
 *
 * Pure functions — no side effects, no @forge/* dependencies.
 */

import * as Papa from 'papaparse';
import { ok, err, type Result } from 'neverthrow';
import type { TreeConfig, TreeNode } from './types';
import type { ImportNode, ImportTree } from './schemas';

// ──── Internal helpers ────

/** Check whether a header column represents an annotation (starts with @). */
const isAnnotationColumn = (header: string): boolean => header.startsWith('@') && header.length > 1;

/** Strip the @ prefix from an annotation column header. */
const annotationKeyFromHeader = (header: string): string => header.slice(1);

/**
 * Parse CSV text via PapaParse with header mode.
 * Returns the parsed rows or a list of errors.
 */
const parseCsvText = (csvText: string): Result<readonly Record<string, string>[], readonly string[]> => {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    const errors = result.errors.map(e => `Row ${String(e.row)}: ${e.message} (${e.code})`);
    return err(errors);
  }

  if (result.data.length === 0) {
    return err(['CSV contains no data rows']);
  }

  return ok(result.data);
};

// ──── Tree structure builder ────

/**
 * Build a tree from CSV rows where each column is a hierarchy level.
 * Deduplicates nodes by (parent-path, label) — rows sharing a
 * common prefix share the same ancestor nodes in the output.
 */
const buildTreeFromRows = (
  rows: readonly Record<string, string>[],
  levelColumns: readonly string[],
  annotationColumns: readonly string[],
): readonly ImportNode[] => {
  // Track nodes by their path key to deduplicate
  const nodeMap = new Map<
    string,
    {
      label: string;
      level: string;
      annotations: Record<string, string[]>;
      childKeys: Set<string>;
    }
  >();

  for (const row of rows) {
    let parentKey = '';
    let deepestKey = '';

    for (const col of levelColumns) {
      const value = row[col]?.trim() ?? '';
      if (value === '') break;

      const nodeKey = parentKey === '' ? value : `${parentKey}>${value}`;
      deepestKey = nodeKey;

      if (!nodeMap.has(nodeKey)) {
        nodeMap.set(nodeKey, {
          label: value,
          level: col,
          annotations: {},
          childKeys: new Set(),
        });
      }

      // Register as child of parent
      if (parentKey !== '') {
        const parentEntry = nodeMap.get(parentKey);
        if (parentEntry !== undefined) {
          parentEntry.childKeys.add(nodeKey);
        }
      }

      parentKey = nodeKey;
    }

    // Attach annotation values to the deepest node in this row
    if (deepestKey !== '' && annotationColumns.length > 0) {
      const node = nodeMap.get(deepestKey);
      if (node !== undefined) {
        for (const annCol of annotationColumns) {
          const value = row[annCol]?.trim() ?? '';
          if (value === '') continue;
          const key = annotationKeyFromHeader(annCol);
          node.annotations[key] ??= [];
          if (!node.annotations[key].includes(value)) {
            node.annotations[key].push(value);
          }
        }
      }
    }
  }

  // Recursively build ImportNode tree from the map
  const buildNode = (key: string): ImportNode | undefined => {
    const entry = nodeMap.get(key);
    if (entry === undefined) return undefined;

    const children: ImportNode[] = [];
    for (const childKey of entry.childKeys) {
      const child = buildNode(childKey);
      if (child !== undefined) children.push(child);
    }

    const annotations: Record<string, readonly string[]> = {};
    for (const [k, v] of Object.entries(entry.annotations)) {
      if (v.length > 0) annotations[k] = v;
    }

    return {
      label: entry.label,
      level: entry.level,
      ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
      ...(children.length > 0 ? { children } : {}),
    };
  };

  // Find root-level keys (no parent)
  const allChildKeys = new Set<string>();
  for (const entry of nodeMap.values()) {
    for (const ck of entry.childKeys) {
      allChildKeys.add(ck);
    }
  }

  const rootKeys: string[] = [];
  for (const key of nodeMap.keys()) {
    if (!allChildKeys.has(key)) {
      rootKeys.push(key);
    }
  }

  const roots: ImportNode[] = [];
  for (const key of rootKeys) {
    const node = buildNode(key);
    if (node !== undefined) roots.push(node);
  }

  return roots;
};

// ──── Public API ────

/**
 * Parse a tree CSV where columns represent hierarchy levels and
 * rows represent paths. Empty trailing cells indicate the path
 * stops at that level.
 *
 * Header: `County,Sub-county,Plot,Block,Unit`
 * Row:    `Mombasa,Mvita,Plot 52,,`
 */
const parseTreeCsv = (csvText: string): Result<ImportTree, readonly string[]> => {
  const parsed = parseCsvText(csvText);
  if (parsed.isErr()) return err(parsed.error);
  const rows = parsed.value;

  // All columns are level columns (no @ prefix)
  const firstRow = rows[0];
  if (firstRow === undefined) {
    return err(['CSV contains no data rows']);
  }
  const headers = Object.keys(firstRow);
  const levelColumns = headers.filter(h => !isAnnotationColumn(h));

  if (levelColumns.length === 0) {
    return err(['No level columns found in CSV header']);
  }

  const nodes = buildTreeFromRows(rows, levelColumns, []);

  return ok({
    name: 'Imported Tree',
    levels: levelColumns.map(col => ({ id: col.toLowerCase().replace(/\s+/g, '-'), label: col })),
    annotations: [],
    nodes: [...nodes],
  });
};

/**
 * Parse a combined CSV with both level columns and @-prefixed
 * annotation columns.
 *
 * Header: `County,Sub-county,Plot,@principal,@manager`
 * Row:    `Mombasa,Mvita,Plot 52,SBS Properties Ltd,Kamau`
 */
const parseCombinedCsv = (csvText: string): Result<ImportTree, readonly string[]> => {
  const parsed = parseCsvText(csvText);
  if (parsed.isErr()) return err(parsed.error);
  const rows = parsed.value;

  const firstRow = rows[0];
  if (firstRow === undefined) {
    return err(['CSV contains no data rows']);
  }
  const headers = Object.keys(firstRow);
  const levelColumns = headers.filter(h => !isAnnotationColumn(h));
  const annotationColumns = headers.filter(isAnnotationColumn);

  if (levelColumns.length === 0) {
    return err(['No level columns found in CSV header (all columns have @ prefix)']);
  }

  const nodes = buildTreeFromRows(rows, levelColumns, annotationColumns);

  // Build annotation definitions from @-prefixed columns
  const annotationDefs = annotationColumns.map(col => {
    const key = annotationKeyFromHeader(col);
    return {
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      resolution: 'union' as const,
    };
  });

  return ok({
    name: 'Imported Tree',
    levels: levelColumns.map(col => ({ id: col.toLowerCase().replace(/\s+/g, '-'), label: col })),
    annotations: annotationDefs,
    nodes: [...nodes],
  });
};

/**
 * Parse an annotation CSV that maps tree paths to annotation values
 * for an existing tree configuration.
 *
 * Header: `path,principal,manager`
 * Row:    `Mombasa > Mvita > Plot 52,SBS Properties Ltd,Kamau`
 *
 * The `path` column contains breadcrumb paths separated by ` > `.
 * Returns an updated TreeConfig with annotations applied to matching nodes.
 */
const parseAnnotationCsv = (csvText: string, existingConfig: TreeConfig): Result<TreeConfig, readonly string[]> => {
  const parsed = parseCsvText(csvText);
  if (parsed.isErr()) return err(parsed.error);
  const rows = parsed.value;

  const firstRow = rows[0];
  if (firstRow === undefined) {
    return err(['CSV contains no data rows']);
  }
  const headers = Object.keys(firstRow);
  const pathColumn = headers.find(h => h.toLowerCase() === 'path');
  if (pathColumn === undefined) {
    return err(['CSV must have a "path" column']);
  }

  const annotationColumns = headers.filter(h => h.toLowerCase() !== 'path');
  if (annotationColumns.length === 0) {
    return err(['No annotation columns found (only "path" column present)']);
  }

  // Build a label-based index for node lookup
  // Maps breadcrumb string → NodeId
  const nodeByPath = new Map<string, TreeNode>();
  const indexNode = (node: TreeNode, pathParts: readonly string[]): void => {
    const currentPath = [...pathParts, node.label];
    nodeByPath.set(currentPath.join(' > '), node);
    for (const child of node.children) {
      indexNode(child, currentPath);
    }
  };
  for (const child of existingConfig.root.children) {
    indexNode(child, []);
  }

  // Apply annotations from CSV rows
  const errors: string[] = [];
  const annotationUpdates = new Map<string, Record<string, string[]>>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row === undefined) continue;
    const pathValue = row[pathColumn]?.trim() ?? '';
    if (pathValue === '') {
      errors.push(`Row ${String(i + 1)}: empty path`);
      continue;
    }

    const node = nodeByPath.get(pathValue);
    if (node === undefined) {
      errors.push(`Row ${String(i + 1)}: no node found for path "${pathValue}"`);
      continue;
    }

    const nodeIdStr = node.id as string;
    if (!annotationUpdates.has(nodeIdStr)) {
      // Start with existing annotations
      const existing: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(node.annotations)) {
        existing[k] = [...v];
      }
      annotationUpdates.set(nodeIdStr, existing);
    }

    const updates = annotationUpdates.get(nodeIdStr) ?? {};
    for (const col of annotationColumns) {
      const value = row[col]?.trim() ?? '';
      if (value === '') continue;
      updates[col] ??= [];
      if (!updates[col].includes(value)) {
        updates[col].push(value);
      }
    }
  }

  if (errors.length > 0) {
    return err(errors);
  }

  // Rebuild tree with updated annotations
  const rebuildNode = (node: TreeNode): TreeNode => {
    const nodeIdStr = node.id as string;
    const updatedAnnotations = annotationUpdates.get(nodeIdStr);
    const newAnnotations: Record<string, readonly string[]> =
      updatedAnnotations !== undefined ? { ...updatedAnnotations } : { ...node.annotations };

    return {
      ...node,
      annotations: newAnnotations,
      children: node.children.map(rebuildNode),
    };
  };

  const updatedRoot = rebuildNode(existingConfig.root);

  // Ensure annotation definitions exist for all CSV columns
  const existingKeys = new Set(existingConfig.annotations.map(a => a.key as string));
  for (const col of annotationColumns) {
    if (!existingKeys.has(col)) {
      // This would need to be manually added — report it
      errors.push(`Annotation key "${col}" not defined in tree config. Define it first or use combined CSV format.`);
    }
  }

  if (errors.length > 0) {
    return err(errors);
  }

  return ok({
    ...existingConfig,
    root: updatedRoot,
  });
};

/**
 * CSV parsing and transformation for tree and annotation import.
 *
 * Supports three formats: tree CSV, combined CSV (with annotations),
 * and annotation CSV (for existing trees). Uses PapaParse for RFC 4180 tokenisation.
 */
export const CsvParse = {
  parseTreeCsv,
  parseCombinedCsv,
  parseAnnotationCsv,
} as const;
