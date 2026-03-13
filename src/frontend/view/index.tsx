/**
 * Read-only view of the hierarchical select field.
 *
 * Renders on issue-view and portal-view using UI Kit (render: native).
 * Displays selected paths as tags within a tag group.
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import ForgeReconciler, { Tag, TagGroup, Lozenge, Spinner, Stack } from '@forge/react';
import { view } from '@forge/bridge';
import type { FieldValue, Selection } from '../../domain/types';

/** Format a selection path as a breadcrumb string. */
const formatSelection = (selection: Selection): string => selection.labels.join(' \u203A ');

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

  const MAX_VISIBLE = 3;
  const visible = fieldValue.selections.slice(0, MAX_VISIBLE);
  const remaining = fieldValue.selections.length - MAX_VISIBLE;

  return (
    <Stack space="space.050">
      <TagGroup alignment="start">
        {visible.map((selection, idx) => (
          <Tag key={idx} text={formatSelection(selection)} />
        ))}
      </TagGroup>
      {remaining > 0 && <Lozenge appearance="default">{`+${String(remaining)} more`}</Lozenge>}
    </Stack>
  );
};

ForgeReconciler.render(<View />);
