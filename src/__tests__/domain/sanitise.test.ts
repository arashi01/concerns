/**
 * Tests for input sanitisation (pure domain validation/trimming).
 */

import { describe, it, expect } from 'vitest';
import { Sanitise } from '../../domain/sanitise';
import { testConfig, annotatedConfig } from './fixtures';
import type { TreeConfig } from '../../domain/types';

describe('Sanitise.sanitiseTreeConfig', () => {
  it('passes a valid config unchanged', () => {
    const result = Sanitise.sanitiseTreeConfig(testConfig);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().name).toBe(testConfig.name);
  });

  it('trims whitespace from tree name', () => {
    const config: TreeConfig = { ...testConfig, name: '  My Tree  ' };
    const result = Sanitise.sanitiseTreeConfig(config);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().name).toBe('My Tree');
  });

  it('trims whitespace from level labels', () => {
    const config: TreeConfig = {
      ...testConfig,
      levels: testConfig.levels.map(l => ({ ...l, label: `  ${l.label}  ` })),
    };
    const result = Sanitise.sanitiseTreeConfig(config);
    expect(result.isOk()).toBe(true);
    result._unsafeUnwrap().levels.forEach((l, i) => {
      expect(l.label).toBe(testConfig.levels[i]!.label);
    });
  });

  it('trims whitespace from node labels', () => {
    const config: TreeConfig = {
      ...testConfig,
      root: {
        ...testConfig.root,
        children: testConfig.root.children.map(c => ({
          ...c,
          label: `  ${c.label}  `,
        })),
      },
    };
    const result = Sanitise.sanitiseTreeConfig(config);
    expect(result.isOk()).toBe(true);
    result._unsafeUnwrap().root.children.forEach((c, i) => {
      expect(c.label).toBe(testConfig.root.children[i]!.label);
    });
  });

  it('rejects tree name exceeding max length', () => {
    const config: TreeConfig = { ...testConfig, name: 'x'.repeat(101) };
    const result = Sanitise.sanitiseTreeConfig(config);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().join('; ')).toContain('Tree name');
    expect(result._unsafeUnwrapErr().join('; ')).toContain('max length');
  });

  it('accepts tree name at exactly max length', () => {
    const config: TreeConfig = { ...testConfig, name: 'x'.repeat(100) };
    const result = Sanitise.sanitiseTreeConfig(config);
    expect(result.isOk()).toBe(true);
  });

  it('rejects node label exceeding max length', () => {
    const config: TreeConfig = {
      ...testConfig,
      root: {
        ...testConfig.root,
        children: [
          {
            ...testConfig.root.children[0]!,
            label: 'y'.repeat(201),
          },
        ],
      },
    };
    const result = Sanitise.sanitiseTreeConfig(config);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().join('; ')).toContain('label');
    expect(result._unsafeUnwrapErr().join('; ')).toContain('max length');
  });

  it('rejects control characters in tree name', () => {
    const config: TreeConfig = { ...testConfig, name: 'My\x00Tree' };
    const result = Sanitise.sanitiseTreeConfig(config);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().join('; ')).toContain('control characters');
  });

  it('rejects control characters in node label', () => {
    const config: TreeConfig = {
      ...testConfig,
      root: {
        ...testConfig.root,
        children: [
          {
            ...testConfig.root.children[0]!,
            label: 'Node\x07Label',
          },
        ],
      },
    };
    const result = Sanitise.sanitiseTreeConfig(config);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().join('; ')).toContain('control characters');
  });

  it('collects multiple errors', () => {
    const config: TreeConfig = {
      ...testConfig,
      name: 'x'.repeat(101),
      root: {
        ...testConfig.root,
        children: [
          {
            ...testConfig.root.children[0]!,
            label: 'y'.repeat(201),
          },
        ],
      },
    };
    const result = Sanitise.sanitiseTreeConfig(config);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().length).toBeGreaterThanOrEqual(2);
  });

  it('sanitises annotation values in annotated config', () => {
    const result = Sanitise.sanitiseTreeConfig(annotatedConfig);
    expect(result.isOk()).toBe(true);
  });

  it('rejects annotation values exceeding max length', () => {
    const config: TreeConfig = {
      ...annotatedConfig,
      root: {
        ...annotatedConfig.root,
        children: annotatedConfig.root.children.map(county => ({
          ...county,
          children: county.children.map(sub => ({
            ...sub,
            children: sub.children.map(plot => ({
              ...plot,
              annotations: {
                principal: ['x'.repeat(201)],
              },
            })),
          })),
        })),
      },
    };
    const result = Sanitise.sanitiseTreeConfig(config);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().join('; ')).toContain('annotation');
    expect(result._unsafeUnwrapErr().join('; ')).toContain('max length');
  });

  it('rejects metadata values exceeding max length', () => {
    const config: TreeConfig = {
      ...testConfig,
      root: {
        ...testConfig.root,
        metadata: { bigKey: 'v'.repeat(501) },
      },
    };
    const result = Sanitise.sanitiseTreeConfig(config);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().join('; ')).toContain('metadata');
  });

  it('allows tabs and newlines (not treated as control chars)', () => {
    const config: TreeConfig = {
      ...testConfig,
      root: {
        ...testConfig.root,
        metadata: { notes: 'Line 1\nLine 2\tTabbed' },
      },
    };
    const result = Sanitise.sanitiseTreeConfig(config);
    expect(result.isOk()).toBe(true);
  });
});
