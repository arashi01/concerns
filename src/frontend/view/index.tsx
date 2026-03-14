/**
 * Read-only view of the hierarchical select field.
 *
 * Renders on issue-view and portal-view using UI Kit (render: native).
 * Displays selected paths as condensed breadcrumb lines, merging
 * sibling selections that share common ancestors onto one line.
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import ForgeReconciler, { Text, Lozenge, Spinner, Stack } from '@forge/react';
import { view } from '@forge/bridge';
import type { FieldValue } from '../../domain/types';
import { FieldValue as FV } from '../../domain/field-value';

/** Maximum number of breadcrumb lines to display before truncating. */
const MAX_VISIBLE = 3;

const View = (): React.JSX.Element => {
  const [fieldValue, setFieldValue] = useState<FieldValue | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      const context = await view.getContext();
      const ext = (context as unknown as Record<string, unknown>)['extension'] as Record<string, unknown> | undefined;
      const fv = ext?.['fieldValue'] as FieldValue | undefined;
      setFieldValue(fv ?? undefined);
      setLoading(false);
    };
    void load();
  }, []);

  if (loading) {
    return <Spinner size="small" />;
  }

  if (fieldValue?.selections === undefined || fieldValue.selections.length === 0) {
    return <Lozenge appearance="default">None</Lozenge>;
  }

  const lines = FV.formatGrouped(fieldValue);

  if (lines.length === 0) {
    return <Lozenge appearance="default">None</Lozenge>;
  }

  const visibleLines = lines.slice(0, MAX_VISIBLE);
  const remaining = lines.length - MAX_VISIBLE;

  return (
    <Stack space="space.050">
      {visibleLines.map((line, idx) => (
        <Text key={idx}>{line}</Text>
      ))}
      {remaining > 0 && <Lozenge appearance="default">{`+${String(remaining)} more`}</Lozenge>}
    </Stack>
  );
};

ForgeReconciler.render(<View />);
