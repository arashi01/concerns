/**
 * Context configuration for the hierarchical select field.
 *
 * Allows admins to select which tree configuration this field
 * instance uses. Rendered via UI Kit (render: native) in the
 * field configuration screen.
 */

import type React from 'react';
import { useState, useEffect } from 'react';
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
import type { TreeSummary, SelectFieldConfig } from '../../domain/types';

type ResolverResponse<T> = { data: T } | { error: string };

const Config = (): React.JSX.Element => {
  const [trees, setTrees] = useState<readonly TreeSummary[]>([]);
  const [selectedTreeId, setSelectedTreeId] = useState<string | undefined>(undefined);
  const [fieldId, setFieldId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

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
        const existingConfig = ext?.['configuration'] as SelectFieldConfig | undefined;
        if (existingConfig?.treeId !== undefined) {
          setSelectedTreeId(existingConfig.treeId as string);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleSubmit = async (): Promise<void> => {
    if (selectedTreeId === undefined) return;
    try {
      const fieldConfig = { treeId: selectedTreeId };
      // Persist to KVS first - view.submit() may refresh/close the page, so the
      // KVS bridge must be written before the platform save.
      if (fieldId !== undefined) {
        await invoke('saveFieldConfig', { fieldId, config: fieldConfig });
      }
      await view.submit({ configuration: fieldConfig });
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

  const options = trees.map(t => ({
    label: `${t.name} (${String(t.levelCount)} levels, ${String(t.nodeCount)} nodes)`,
    value: t.id as string,
  }));

  if (options.length === 0) {
    return (
      <SectionMessage appearance="information" title="No trees available">
        <Text>
          Create a tree first in the Concerns admin page (Jira Settings &gt; Apps &gt; Concerns - Tree Configuration).
        </Text>
      </SectionMessage>
    );
  }

  return (
    <Form onSubmit={handleSubmit}>
      <FormSection>
        <Label labelFor="tree-select">Tree Configuration</Label>
        <Select
          inputId="tree-select"
          name="treeId"
          options={options}
          value={options.find(o => o.value === selectedTreeId)}
          onChange={option => {
            if (option !== null && typeof option === 'object' && 'value' in option) {
              setSelectedTreeId((option as { value: string }).value);
            }
          }}
          placeholder="Select a tree configuration..."
        />
      </FormSection>
      <FormFooter>
        <Button appearance="primary" type="submit" isDisabled={selectedTreeId === undefined}>
          Save
        </Button>
      </FormFooter>
    </Form>
  );
};

ForgeReconciler.render(<Config />);
