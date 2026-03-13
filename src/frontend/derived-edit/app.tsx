/**
 * Edit experience for the derived annotation field.
 *
 * Custom UI (iframe) that listens for selection changes from the
 * tree select field via the Forge events API, resolves annotations,
 * and submits the derived value.
 *
 * Also supports manual override: users can remove values.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { invoke, view, events } from '@forge/bridge';
import { RemovableTag } from '@atlaskit/tag';
import TagGroup from '@atlaskit/tag-group';
import Spinner from '@atlaskit/spinner';
import SectionMessage from '@atlaskit/section-message';
import { cssMap } from '@atlaskit/css';
import { Box, Stack } from '@atlaskit/primitives/compiled';
import type { TreeConfig, DerivedFieldConfig, ResolvedAnnotation } from '../../domain/types';

type ResolverResponse<T> = { readonly data: T } | { readonly error: string };

// ──── Styles ────

const styles = cssMap({
  container: { padding: 'var(--ds-space-100)' },
});

export const App: React.FC = () => {
  const [values, setValues] = useState<readonly string[]>([]);
  const [treeConfig, setTreeConfig] = useState<TreeConfig | undefined>(undefined);
  const [annotationKey, setAnnotationKey] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  // ──── Initialisation ────
  useEffect(() => {
    const init = async (): Promise<void> => {
      try {
        const context = await view.getContext();
        const ext = (context as unknown as Record<string, unknown>)['extension'] as Record<string, unknown> | undefined;

        // Load existing field value (string[])
        const existingValue = ext?.['fieldValue'] as readonly string[] | undefined;
        if (existingValue !== undefined) {
          setValues(existingValue);
        }

        // Load derived field configuration
        const config = ext?.['configuration'] as DerivedFieldConfig | undefined;
        if (config === undefined) {
          setError('Derived field not configured. Set tree and annotation key in field settings.');
          setLoading(false);
          return;
        }

        setAnnotationKey(config.annotationKey as string);

        // Load tree config for annotation resolution
        const treeResponse = await invoke<ResolverResponse<TreeConfig>>('getTree', {
          treeId: config.treeId,
        });

        if ('error' in treeResponse) {
          setError(treeResponse.error);
        } else {
          setTreeConfig(treeResponse.data);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  // ──── Cross-field event listener ────
  useEffect(() => {
    if (treeConfig === undefined || annotationKey === undefined) return;

    let subscription: { unsubscribe: () => void } | undefined;

    const subscribe = async (): Promise<void> => {
      subscription = await events.on(
        'concerns-tree-select:selectionsChanged',
        async (payload?: { nodeIds?: readonly string[] }) => {
          if (payload?.nodeIds === undefined) return;

          // Resolve annotations via the resolver
          const response = await invoke<ResolverResponse<readonly ResolvedAnnotation[]>>('resolveAnnotations', {
            treeId: treeConfig.id,
            nodeIds: payload.nodeIds,
          });

          if ('error' in response) return;

          const resolved = response.data.find(r => (r.key as string) === annotationKey);
          const newValues = resolved?.values ?? [];
          setValues(newValues);
          void view.submit(newValues);
        },
      );
    };

    void subscribe();

    return () => {
      subscription?.unsubscribe();
    };
  }, [treeConfig, annotationKey]);

  // ──── Manual removal ────
  const removeValue = useCallback(
    (valueToRemove: string) => {
      const updated = values.filter(v => v !== valueToRemove);
      setValues(updated);
      void view.submit(updated);
    },
    [values],
  );

  // ──── Render ────

  if (loading) {
    return (
      <Box xcss={styles.container}>
        <Spinner size="medium" label="Loading" />
      </Box>
    );
  }

  if (error !== undefined) {
    return (
      <Box xcss={styles.container}>
        <SectionMessage appearance="error" title="Configuration error">
          <p>{error}</p>
        </SectionMessage>
      </Box>
    );
  }

  return (
    <Box xcss={styles.container}>
      <Stack space="space.100">
        {values.length === 0 ? (
          <SectionMessage appearance="information">
            <p>Auto-populated from tree selections.</p>
          </SectionMessage>
        ) : (
          <TagGroup>
            {values.map(val => (
              <RemovableTag
                key={val}
                text={val}
                removeButtonLabel={`Remove ${val}`}
                onAfterRemoveAction={() => removeValue(val)}
              />
            ))}
          </TagGroup>
        )}
      </Stack>
    </Box>
  );
};
