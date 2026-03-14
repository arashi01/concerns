/**
 * Context configuration for the derived annotation field.
 *
 * Allows admins to select:
 *   1. Which tree configuration provides the annotation data
 *   2. Which annotation key to resolve (e.g. "principal", "manager")
 *
 * Rendered via UI Kit (render: native) in the field configuration screen.
 */

import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import ForgeReconciler, {
  Form,
  FormSection,
  FormFooter,
  Label,
  Select,
  Button,
  Spinner,
  SectionMessage,
  Text,
} from '@forge/react';
import { invoke, view } from '@forge/bridge';
import type { TreeSummary, TreeConfig, DerivedFieldConfig } from '../../domain/types';

type ResolverResponse<T> = { data: T } | { error: string };

const DerivedConfig = (): React.JSX.Element => {
  const [trees, setTrees] = useState<readonly TreeSummary[]>([]);
  const [selectedTreeId, setSelectedTreeId] = useState<string | undefined>(undefined);
  const [annotationKeys, setAnnotationKeys] = useState<readonly { key: string; label: string }[]>([]);
  const [selectedAnnotationKey, setSelectedAnnotationKey] = useState<string | undefined>(undefined);
  const [fieldId, setFieldId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  // Load tree list and existing config
  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const [treesResponse, context] = await Promise.all([
          invoke<ResolverResponse<readonly TreeSummary[]>>('listTrees'),
          view.getContext(),
        ]);

        if ('error' in treesResponse) {
          setError(treesResponse.error);
        } else {
          setTrees(treesResponse.data);
        }

        const ext = (context as unknown as Record<string, unknown>)['extension'] as Record<string, unknown> | undefined;
        setFieldId(ext?.['fieldId'] as string | undefined);
        const existingConfig = ext?.['configuration'] as DerivedFieldConfig | undefined;
        if (existingConfig?.treeId !== undefined) {
          setSelectedTreeId(existingConfig.treeId as string);
          // Load annotation keys for this tree
          void loadAnnotationKeys(existingConfig.treeId as string);
        }
        if (existingConfig?.annotationKey !== undefined) {
          setSelectedAnnotationKey(existingConfig.annotationKey as string);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const loadAnnotationKeys = useCallback(async (treeId: string) => {
    const response = await invoke<ResolverResponse<TreeConfig>>('getTree', { treeId });
    if (!('error' in response)) {
      setAnnotationKeys(
        response.data.annotations.map(a => ({
          key: a.key as string,
          label: a.label,
        })),
      );
    }
  }, []);

  const handleTreeChange = useCallback(
    (option: unknown) => {
      if (option !== null && typeof option === 'object' && 'value' in option) {
        const treeId = (option as { value: string }).value;
        setSelectedTreeId(treeId);
        setSelectedAnnotationKey(undefined);
        void loadAnnotationKeys(treeId);
      }
    },
    [loadAnnotationKeys],
  );

  const handleSubmit = async (): Promise<void> => {
    if (selectedTreeId === undefined || selectedAnnotationKey === undefined) return;
    try {
      const fieldConfig = { treeId: selectedTreeId, annotationKey: selectedAnnotationKey };
      await view.submit({ configuration: fieldConfig });
      // Persist to KVS so Custom UI edit modules can read it via the resolver.
      if (fieldId !== undefined) {
        await invoke('saveFieldConfig', { fieldId, config: fieldConfig });
      }
    } catch (e) {
      setError(`Save failed: ${String(e)}`);
    }
  };

  if (loading) {
    return <Spinner size="medium" />;
  }

  if (error !== undefined) {
    const errorText = <Text>{error}</Text>;
    return (
      <SectionMessage appearance="error" title="Error">
        {errorText}
      </SectionMessage>
    );
  }

  const treeOptions = trees.map(t => ({
    label: `${t.name} (${String(t.levelCount)} levels, ${String(t.annotationCount)} annotations)`,
    value: t.id as string,
  }));

  if (treeOptions.length === 0) {
    return (
      <SectionMessage appearance="information" title="No trees available">
        <Text>
          Create a tree first in the Concerns admin page (Jira Settings &gt; Apps &gt; Concerns - Tree Configuration).
        </Text>
      </SectionMessage>
    );
  }

  const annotationOptions = annotationKeys.map(a => ({
    label: a.label,
    value: a.key,
  }));

  return (
    <Form onSubmit={handleSubmit}>
      <FormSection>
        <Label labelFor="tree-select">Tree Configuration</Label>
        <Select
          inputId="tree-select"
          name="treeId"
          options={treeOptions}
          value={treeOptions.find(o => o.value === selectedTreeId)}
          onChange={handleTreeChange}
          placeholder="Select a tree..."
        />
      </FormSection>
      {annotationOptions.length > 0 && (
        <FormSection>
          <Label labelFor="annotation-select">Annotation Dimension</Label>
          <Select
            inputId="annotation-select"
            name="annotationKey"
            options={annotationOptions}
            value={annotationOptions.find(o => o.value === selectedAnnotationKey)}
            onChange={option => {
              if (option !== null && typeof option === 'object' && 'value' in option) {
                setSelectedAnnotationKey((option as { value: string }).value);
              }
            }}
            placeholder="Select an annotation..."
          />
        </FormSection>
      )}
      <FormFooter>
        <Button
          appearance="primary"
          type="submit"
          isDisabled={selectedTreeId === undefined || selectedAnnotationKey === undefined}
        >
          Save
        </Button>
      </FormFooter>
    </Form>
  );
};

ForgeReconciler.render(<DerivedConfig />);
