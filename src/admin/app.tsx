/**
 * Admin page for managing tree configurations.
 *
 * Custom UI rendered in Jira admin settings.
 * Provides: tree listing, JSON import/export, and tree detail view.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { invoke, showFlag } from '@forge/bridge';
import Button from '@atlaskit/button/new';
import Heading from '@atlaskit/heading';
import DynamicTable from '@atlaskit/dynamic-table';
import Tabs, { Tab, TabList, TabPanel } from '@atlaskit/tabs';
import TextArea from '@atlaskit/textarea';
import Textfield from '@atlaskit/textfield';
import Spinner from '@atlaskit/spinner';
import SectionMessage from '@atlaskit/section-message';
import Lozenge from '@atlaskit/lozenge';
import Modal, { ModalTransition, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import Select from '@atlaskit/select';
import { Box, Stack, Inline } from '@atlaskit/primitives/compiled';
import { cssMap } from '@atlaskit/css';
import type { TreeSummary, TreeConfig, TreeNode, AnnotationDefinition } from '../domain/types';
import type { ResolutionStrategy } from '../domain/types';
import { AnnotationKey } from '../domain/annotation-key';
import { Schemas } from '../domain/schemas';
import { CsvParse } from '../domain/csv-parse';
import { TreeEditor } from './components/tree-editor';

type ImportFormat = 'json' | 'tree-csv' | 'combined-csv' | 'annotation-csv';

type ResolverResponse<T> = { readonly data: T } | { readonly error: string };

// ---- Styles ----

const styles = cssMap({
  page: { padding: 'var(--ds-space-400)', maxWidth: '960px' },
  section: { paddingBlockStart: 'var(--ds-space-200)' },
  fileInput: { paddingBlock: 'var(--ds-space-100)' },
});

export const App: React.FC = () => {
  const [trees, setTrees] = useState<readonly TreeSummary[]>([]);
  const [selectedTree, setSelectedTree] = useState<TreeConfig | undefined>(undefined);
  const [importText, setImportText] = useState('');
  const [importFormat, setImportFormat] = useState<ImportFormat>('json');
  const [annotationTreeId, setAnnotationTreeId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<TreeSummary | undefined>(undefined);
  const [editedRoot, setEditedRoot] = useState<TreeNode | undefined>(undefined);
  const [editedAnnotations, setEditedAnnotations] = useState<AnnotationDefinition[]>([]);
  const [treeModified, setTreeModified] = useState(false);

  const clearMessages = useCallback(() => {
    setError(undefined);
    setSuccess(undefined);
  }, []);

  const showSuccess = useCallback((message: string) => {
    setSuccess(message);
    void showFlag({
      id: `success-${String(Date.now())}`,
      title: 'Success',
      type: 'success',
      description: message,
      isAutoDismiss: true,
    });
  }, []);

  const loadTrees = useCallback(async () => {
    setLoading(true);
    try {
      const response = await invoke<ResolverResponse<readonly TreeSummary[]>>('listTrees');
      if ('error' in response) {
        setError(response.error);
      } else {
        setTrees(response.data);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTrees();
  }, [loadTrees]);

  const handleSelectTree = useCallback(
    async (treeId: string) => {
      setLoading(true);
      clearMessages();
      try {
        const response = await invoke<ResolverResponse<TreeConfig>>('getTree', { treeId });
        if ('error' in response) {
          setError(response.error);
        } else {
          setSelectedTree(response.data);
          setEditedRoot(response.data.root);
          setEditedAnnotations([...response.data.annotations]);
          setTreeModified(false);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [clearMessages],
  );

  const handleImport = useCallback(async () => {
    clearMessages();
    try {
      if (importFormat === 'json') {
        // Auto-detect: try simplified import format first, fall back to full TreeConfig
        const parsed = JSON.parse(importText) as unknown;
        const importResult = Schemas.importTree.safeParse(parsed);
        if (importResult.success) {
          const response = await invoke<ResolverResponse<TreeConfig>>('importTree', {
            tree: importResult.data,
          });
          if ('error' in response) {
            setError(response.error);
          } else {
            showSuccess(`Tree "${response.data.name}" imported successfully.`);
            setImportText('');
            void loadTrees();
          }
          return;
        }
        // Fall back to full TreeConfig format
        const fullResult = Schemas.treeConfig.safeParse(parsed);
        if (!fullResult.success) {
          setError(`Validation error: ${fullResult.error.message}`);
          return;
        }
        const response = await invoke<ResolverResponse<TreeConfig>>('saveTree', {
          tree: fullResult.data,
        });
        if ('error' in response) {
          setError(response.error);
        } else {
          showSuccess(`Tree "${response.data.name}" saved successfully.`);
          setImportText('');
          void loadTrees();
        }
      } else if (importFormat === 'tree-csv') {
        const result = CsvParse.parseTreeCsv(importText);
        if (result.isErr()) {
          setError(result.error.join('; '));
          return;
        }
        const response = await invoke<ResolverResponse<TreeConfig>>('importTree', {
          tree: result.value,
        });
        if ('error' in response) {
          setError(response.error);
        } else {
          setSuccess(
            `Tree "${response.data.name}" imported (${String(result.value.levels.length)} levels, ${String(result.value.nodes.length)} top-level nodes).`,
          );
          setImportText('');
          void loadTrees();
        }
      } else if (importFormat === 'combined-csv') {
        const result = CsvParse.parseCombinedCsv(importText);
        if (result.isErr()) {
          setError(result.error.join('; '));
          return;
        }
        const response = await invoke<ResolverResponse<TreeConfig>>('importTree', {
          tree: result.value,
        });
        if ('error' in response) {
          setError(response.error);
        } else {
          setSuccess(
            `Tree "${response.data.name}" imported (${String(result.value.levels.length)} levels, ${String(result.value.annotations.length)} annotations).`,
          );
          setImportText('');
          void loadTrees();
        }
      } else {
        if (annotationTreeId === undefined) {
          setError('Select a tree to annotate first.');
          return;
        }
        const treeResponse = await invoke<ResolverResponse<TreeConfig>>('getTree', {
          treeId: annotationTreeId,
        });
        if ('error' in treeResponse) {
          setError(treeResponse.error);
          return;
        }
        const result = CsvParse.parseAnnotationCsv(importText, treeResponse.data);
        if (result.isErr()) {
          setError(result.error.join('; '));
          return;
        }
        const saveResponse = await invoke<ResolverResponse<TreeConfig>>('saveTree', {
          tree: result.value,
        });
        if ('error' in saveResponse) {
          setError(saveResponse.error);
        } else {
          showSuccess(`Annotations applied to "${saveResponse.data.name}".`);
          setImportText('');
          void loadTrees();
        }
      }
    } catch (e) {
      setError(importFormat === 'json' ? `Invalid JSON: ${String(e)}` : `Import error: ${String(e)}`);
    }
  }, [importFormat, importText, annotationTreeId, loadTrees, clearMessages]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) return;

    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setImportText(text);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDelete = useCallback(async () => {
    if (deleteTarget === undefined) return;
    clearMessages();
    const response = await invoke<ResolverResponse<{ success: boolean }>>('deleteTree', {
      treeId: deleteTarget.id,
    });
    if ('error' in response) {
      setError(response.error);
    } else {
      showSuccess(`Tree "${deleteTarget.name}" deleted.`);
      if (selectedTree?.id === deleteTarget.id) {
        setSelectedTree(undefined);
      }
      void loadTrees();
    }
    setDeleteTarget(undefined);
  }, [deleteTarget, selectedTree, loadTrees, clearMessages]);

  const handleExport = useCallback((tree: TreeConfig) => {
    const json = JSON.stringify(tree, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tree.name.toLowerCase().replace(/\s+/g, '-')}-v${String(tree.version)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleSaveTree = useCallback(async () => {
    if (selectedTree === undefined || editedRoot === undefined) return;
    clearMessages();
    const updated: TreeConfig = {
      ...selectedTree,
      root: editedRoot,
      annotations: editedAnnotations,
    };
    const response = await invoke<ResolverResponse<TreeConfig>>('saveTree', { tree: updated });
    if ('error' in response) {
      setError(response.error);
    } else {
      showSuccess(`Tree "${response.data.name}" saved (v${String(response.data.version)}).`);
      setSelectedTree(response.data);
      setEditedRoot(response.data.root);
      setEditedAnnotations([...response.data.annotations]);
      setTreeModified(false);
      void loadTrees();
    }
  }, [selectedTree, editedRoot, editedAnnotations, loadTrees, clearMessages]);

  const handleRootUpdate = useCallback((newRoot: TreeNode) => {
    setEditedRoot(newRoot);
    setTreeModified(true);
  }, []);

  // ---- Table definition ----

  const tableHead = {
    cells: [
      { key: 'name', content: 'Name', isSortable: true, width: 30 },
      { key: 'levels', content: 'Levels', width: 12 },
      { key: 'annotations', content: 'Annotations', width: 14 },
      { key: 'nodes', content: 'Nodes', width: 12 },
      { key: 'version', content: 'Version', width: 12 },
      { key: 'actions', content: 'Actions', width: 20 },
    ],
  };

  const tableRows = trees.map(t => ({
    key: t.id as string,
    cells: [
      { key: 'name', content: t.name },
      { key: 'levels', content: <Lozenge>{String(t.levelCount)}</Lozenge> },
      { key: 'annotations', content: <Lozenge appearance="new">{String(t.annotationCount)}</Lozenge> },
      { key: 'nodes', content: String(t.nodeCount) },
      { key: 'version', content: <Lozenge appearance="moved">v{String(t.version)}</Lozenge> },
      {
        key: 'actions',
        content: (
          <Inline space="space.050">
            <Button
              appearance="subtle"
              onClick={() => {
                void handleSelectTree(t.id as string);
              }}
            >
              View
            </Button>
            <Button appearance="subtle" onClick={() => setDeleteTarget(t)}>
              Delete
            </Button>
          </Inline>
        ),
      },
    ],
  }));

  // ---- Render ----

  return (
    <Box xcss={styles.page}>
      <Stack space="space.300">
        <Heading size="xlarge">Concerns — Tree Configuration</Heading>

        {/* Feedback messages */}
        {error !== undefined && (
          <SectionMessage appearance="error" title="Error">
            <p>{error}</p>
          </SectionMessage>
        )}
        {success !== undefined && (
          <SectionMessage appearance="success" title="Success">
            <p>{success}</p>
          </SectionMessage>
        )}

        {/* Tree detail view */}
        {selectedTree !== undefined && editedRoot !== undefined && (
          <Box xcss={styles.section}>
            <Stack space="space.200">
              <Inline space="space.100" alignBlock="center">
                <Heading size="large">{selectedTree.name}</Heading>
                <Lozenge appearance="moved">v{String(selectedTree.version)}</Lozenge>
                {treeModified && <Lozenge appearance="removed">Unsaved changes</Lozenge>}
              </Inline>

              <Inline space="space.100">
                <Lozenge>{String(selectedTree.levels.length)} levels</Lozenge>
                <Lozenge appearance="new">{String(editedAnnotations.length)} annotations</Lozenge>
              </Inline>

              {/* Levels (read-only display) */}
              <Heading size="small">Levels</Heading>
              <Stack space="space.050">
                {selectedTree.levels.map((level, idx) => (
                  <Inline key={level.id as string} space="space.050">
                    <Lozenge appearance="default">{String(idx)}</Lozenge>
                    <span>{level.label}</span>
                  </Inline>
                ))}
              </Stack>

              {/* Annotation definitions editor */}
              <Heading size="small">Annotation Definitions</Heading>
              <Stack space="space.100">
                {editedAnnotations.map((ann, idx) => (
                  <Inline key={ann.key as string} space="space.100" alignBlock="center">
                    <Lozenge appearance="default">{ann.key as string}</Lozenge>
                    <Textfield
                      value={ann.label}
                      onChange={e => {
                        const newAnns = [...editedAnnotations];
                        newAnns[idx] = { ...ann, label: (e.target as HTMLInputElement).value };
                        setEditedAnnotations(newAnns);
                        setTreeModified(true);
                      }}
                      isCompact
                      width="medium"
                    />
                    <Select<{ label: string; value: ResolutionStrategy }>
                      inputId={`resolution-${ann.key as string}`}
                      options={[
                        { label: 'Union', value: 'union' },
                        { label: 'Nearest', value: 'nearest' },
                        { label: 'Explicit', value: 'explicit' },
                      ]}
                      value={{
                        label: ann.resolution.charAt(0).toUpperCase() + ann.resolution.slice(1),
                        value: ann.resolution,
                      }}
                      onChange={option => {
                        if (option !== null) {
                          const newAnns = [...editedAnnotations];
                          newAnns[idx] = { ...ann, resolution: option.value };
                          setEditedAnnotations(newAnns);
                          setTreeModified(true);
                        }
                      }}
                      isCompact
                      spacing="compact"
                      menuPortalTarget={document.body}
                    />
                    <Button
                      appearance="subtle"
                      spacing="compact"
                      onClick={() => {
                        setEditedAnnotations(editedAnnotations.filter((_, i) => i !== idx));
                        setTreeModified(true);
                      }}
                    >
                      Remove
                    </Button>
                  </Inline>
                ))}
                <Button
                  appearance="subtle"
                  onClick={() => {
                    const key = `annotation-${String(Date.now())}`;
                    setEditedAnnotations([
                      ...editedAnnotations,
                      {
                        key: AnnotationKey.of(key),
                        label: 'New Annotation',
                        resolution: 'union',
                      },
                    ]);
                    setTreeModified(true);
                  }}
                >
                  + Add Annotation
                </Button>
              </Stack>

              {/* Tree editor */}
              <Heading size="small">Tree Structure</Heading>
              <TreeEditor
                root={editedRoot}
                levels={selectedTree.levels}
                annotations={editedAnnotations}
                onRootUpdate={handleRootUpdate}
                generateId={() => crypto.randomUUID()}
              />

              {/* Actions */}
              <Inline space="space.100">
                <Button
                  appearance="primary"
                  onClick={() => {
                    void handleSaveTree();
                  }}
                  isDisabled={!treeModified}
                >
                  Save Changes
                </Button>
                <Button appearance="default" onClick={() => handleExport(selectedTree)}>
                  Export JSON
                </Button>
                <Button
                  appearance="subtle"
                  onClick={() => {
                    setSelectedTree(undefined);
                    setEditedRoot(undefined);
                    setTreeModified(false);
                  }}
                >
                  Close
                </Button>
              </Inline>
            </Stack>
          </Box>
        )}

        {/* Main tabs */}
        <Tabs id="admin-tabs">
          <TabList>
            <Tab>Trees</Tab>
            <Tab>Import</Tab>
          </TabList>

          {/* Trees list */}
          <TabPanel>
            <Box xcss={styles.section}>
              {loading && trees.length === 0 ? (
                <Spinner size="medium" label="Loading trees" />
              ) : (
                <DynamicTable
                  head={tableHead}
                  rows={tableRows}
                  rowsPerPage={10}
                  defaultSortKey="name"
                  defaultSortOrder="ASC"
                  isLoading={loading}
                  emptyView={
                    <SectionMessage appearance="information">
                      <p>No tree configurations yet. Use the Import tab to add one.</p>
                    </SectionMessage>
                  }
                />
              )}
            </Box>
          </TabPanel>

          {/* Import */}
          <TabPanel>
            <Box xcss={styles.section}>
              <Stack space="space.200">
                <p>Upload a file or paste content below. Supports JSON and CSV formats.</p>

                {/* Format selector */}
                <Stack space="space.050">
                  <Heading size="xsmall">Format</Heading>
                  <Inline space="space.050">
                    {(
                      [
                        ['json', 'JSON'],
                        ['tree-csv', 'Tree CSV'],
                        ['combined-csv', 'Combined CSV'],
                        ['annotation-csv', 'Annotation CSV'],
                      ] as const
                    ).map(([value, label]) => (
                      <Button
                        key={value}
                        appearance={importFormat === value ? 'primary' : 'subtle'}
                        onClick={() => {
                          setImportFormat(value);
                          clearMessages();
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </Inline>
                </Stack>

                {/* Format help text */}
                <SectionMessage appearance="information">
                  {importFormat === 'json' && (
                    <p>
                      Paste or upload a JSON file. Accepts both the simplified import format (with string level
                      references) and the full TreeConfig format.
                    </p>
                  )}
                  {importFormat === 'tree-csv' && (
                    <p>
                      CSV where each column is a hierarchy level and each row is a path. Empty trailing cells indicate
                      the path stops at that level. Example: <code>County,Sub-County,Plot</code>
                    </p>
                  )}
                  {importFormat === 'combined-csv' && (
                    <p>
                      CSV with level columns and <code>@</code>-prefixed annotation columns. Annotations are attached to
                      the deepest node in each row. Example: <code>County,Sub-County,@principal,@manager</code>
                    </p>
                  )}
                  {importFormat === 'annotation-csv' && (
                    <p>
                      CSV with a <code>path</code> column (breadcrumbs separated by <code>&gt;</code>) and annotation
                      value columns. Applies annotations to an existing tree.
                    </p>
                  )}
                </SectionMessage>

                {/* Tree selector for annotation CSV */}
                {importFormat === 'annotation-csv' && (
                  <Stack space="space.050">
                    <Heading size="xsmall">Target Tree</Heading>
                    <select
                      value={annotationTreeId ?? ''}
                      onChange={e => setAnnotationTreeId(e.target.value === '' ? undefined : e.target.value)}
                      style={{ padding: '8px', borderRadius: '3px', border: '1px solid #DFE1E6' }}
                    >
                      <option value="">Select a tree to annotate...</option>
                      {trees.map(t => (
                        <option key={t.id as string} value={t.id as string}>
                          {t.name} ({String(t.annotationCount)} annotations)
                        </option>
                      ))}
                    </select>
                  </Stack>
                )}

                <Box xcss={styles.fileInput}>
                  <label htmlFor="file-input">Upload {importFormat === 'json' ? 'JSON' : 'CSV'} file</label>
                  <input
                    id="file-input"
                    type="file"
                    accept={importFormat === 'json' ? '.json' : '.csv'}
                    onChange={handleFileUpload}
                  />
                </Box>

                <TextArea
                  name="import-text"
                  placeholder={importFormat === 'json' ? 'Paste tree configuration JSON...' : 'Paste CSV content...'}
                  value={importText}
                  onChange={e => setImportText((e.target as HTMLTextAreaElement).value)}
                  minimumRows={12}
                  isMonospaced
                  resize="vertical"
                />

                <Inline space="space.100">
                  <Button
                    appearance="primary"
                    onClick={() => {
                      void handleImport();
                    }}
                    isDisabled={
                      importText.length === 0 || (importFormat === 'annotation-csv' && annotationTreeId === undefined)
                    }
                  >
                    Import
                  </Button>
                  <Button
                    appearance="subtle"
                    onClick={() => {
                      setImportText('');
                      clearMessages();
                    }}
                  >
                    Clear
                  </Button>
                </Inline>
              </Stack>
            </Box>
          </TabPanel>
        </Tabs>

        {/* Delete confirmation modal */}
        <ModalTransition>
          {deleteTarget !== undefined && (
            <Modal onClose={() => setDeleteTarget(undefined)} width="small" label="Confirm deletion">
              <ModalHeader hasCloseButton>
                <ModalTitle appearance="danger">Delete tree?</ModalTitle>
              </ModalHeader>
              <ModalBody>
                <p>
                  Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action cannot be undone.
                  Any fields referencing this tree will stop working.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button appearance="subtle" onClick={() => setDeleteTarget(undefined)}>
                  Cancel
                </Button>
                <Button
                  appearance="danger"
                  onClick={() => {
                    void handleDelete();
                  }}
                >
                  Delete
                </Button>
              </ModalFooter>
            </Modal>
          )}
        </ModalTransition>
      </Stack>
    </Box>
  );
};
