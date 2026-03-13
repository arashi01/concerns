/**
 * Read-only view of the derived annotation field.
 *
 * Renders on issue-view and portal-view using UI Kit (render: native).
 * Displays resolved annotation values (e.g. principal names) as tags.
 *
 * For type: string, collection: list — the field value is string[].
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import ForgeReconciler, { Tag, TagGroup, Lozenge, Spinner, Stack } from '@forge/react';
import { view } from '@forge/bridge';

const DerivedView = (): React.JSX.Element => {
  const [values, setValues] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      const context = await view.getContext();
      const ext = (context as unknown as Record<string, unknown>)['extension'] as Record<string, unknown> | undefined;
      const fv = ext?.['fieldValue'] as readonly string[] | undefined;
      setValues(fv ?? []);
      setLoading(false);
    };
    void load();
  }, []);

  if (loading) {
    return <Spinner size="small" />;
  }

  if (values.length === 0) {
    return <Lozenge appearance="default">None</Lozenge>;
  }

  const MAX_VISIBLE = 3;
  const visible = values.slice(0, MAX_VISIBLE);
  const remaining = values.length - MAX_VISIBLE;

  return (
    <Stack space="space.050">
      <TagGroup alignment="start">
        {visible.map((val, idx) => (
          <Tag key={idx} text={val} />
        ))}
      </TagGroup>
      {remaining > 0 && <Lozenge appearance="default">{`+${String(remaining)} more`}</Lozenge>}
    </Stack>
  );
};

ForgeReconciler.render(<DerivedView />);
