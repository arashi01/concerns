/**
 * Custom UI edit experience for the hierarchical select field.
 *
 * Renders inside an iframe on issue-create, issue-transition, and issue-view.
 * Communicates with the resolver via invoke() and persists values via view.submit().
 *
 * UX model: Breadcrumb drill-down with cascading selects + tag accumulator.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke, view, events } from '@forge/bridge';
import Button from '@atlaskit/button/new';
import Breadcrumbs, { BreadcrumbsItem } from '@atlaskit/breadcrumbs';
import { RemovableTag } from '@atlaskit/tag';
import TagGroup from '@atlaskit/tag-group';
import Textfield from '@atlaskit/textfield';
import Spinner from '@atlaskit/spinner';
import SectionMessage from '@atlaskit/section-message';
import { Box, Stack } from '@atlaskit/primitives/compiled';
import { cssMap, cx } from '@atlaskit/css';
import type { TreeConfig, TreeNode, FieldValue, SelectFieldConfig, Selection } from '../../domain/types';
import type { NodeId } from '../../domain/node-id';
import { FieldValue as FV } from '../../domain/field-value';

type ResolverResponse<T> = { readonly data: T } | { readonly error: string };

/** Trees above this node count use resolver-based navigation. */
const LAZY_THRESHOLD = 500;

/** Format a selection as a breadcrumb string. */
const formatBreadcrumb = (selection: Selection): string => selection.labels.join(' \u203A ');

// ──── Styles ────

const styles = cssMap({
  container: { padding: 'var(--ds-space-100)' },
  nodeRow: { display: 'flex', alignItems: 'center', gap: 'var(--ds-space-050)' },
  nodeSelectWrap: { flexGrow: 1, minWidth: '0px' },
  nodeList: { padding: 'var(--ds-space-0)', listStyleType: 'none' },
  focusedNode: { outline: '2px solid', outlineColor: 'var(--ds-border-focused)' },
  empty: { padding: 'var(--ds-space-200)', textAlign: 'center' },
});

export const App: React.FC = () => {
  // ──── State ────
  const [tree, setTree] = useState<TreeConfig | undefined>(undefined);
  const [fieldValue, setFieldValue] = useState<FieldValue>(FV.empty);
  const [drillPath, setDrillPath] = useState<readonly TreeNode[]>([]);
  const [currentChildren, setCurrentChildren] = useState<readonly TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [lazy, setLazy] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<HTMLElement>(null);

  // ──── Initialisation ────
  useEffect(() => {
    const init = async (): Promise<void> => {
      try {
        const context = await view.getContext();
        const ext = (context as unknown as Record<string, unknown>)['extension'] as Record<string, unknown> | undefined;

        // Load existing field value
        const existingValue = ext?.['fieldValue'] as FieldValue | undefined;
        if (existingValue?.selections !== undefined) {
          setFieldValue(existingValue);
        }

        // Load tree config from context configuration
        const config = ext?.['configuration'] as SelectFieldConfig | undefined;
        if (config?.treeId === undefined) {
          setError('No tree configuration assigned. Configure this field in admin settings.');
          setLoading(false);
          return;
        }

        const treeResponse = await invoke<ResolverResponse<TreeConfig>>('getTree', {
          treeId: config.treeId,
        });

        if ('error' in treeResponse) {
          setError(treeResponse.error);
        } else {
          const treeData = treeResponse.data;
          setTree(treeData);
          // Use lazy navigation for large trees
          const totalNodes = treeData.root.children.reduce(
            (sum, _) => sum + 1, // count is approximate from top level
            0,
          );
          // Check against a rough estimate; the summary nodeCount is more accurate
          // but we already have the full tree loaded at this point
          const isLazy = treeData.levels.length > 3 && totalNodes > LAZY_THRESHOLD;
          setLazy(isLazy);
          setCurrentChildren(treeData.root.children);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  // ──── Actions ────

  const drillInto = useCallback(
    (node: TreeNode) => {
      setDrillPath(prev => [...prev, node]);
      setSearchQuery('');

      if (lazy && tree !== undefined) {
        // Fetch children from resolver for large trees
        void invoke<ResolverResponse<readonly TreeNode[]>>('getChildren', {
          treeId: tree.id,
          parentId: node.id,
        }).then(response => {
          if (!('error' in response)) {
            setCurrentChildren(response.data);
          }
        });
      } else {
        setCurrentChildren(node.children);
      }
    },
    [lazy, tree],
  );

  const drillUp = useCallback(
    (toIndex: number) => {
      if (tree === undefined) return;
      if (toIndex < 0) {
        setDrillPath([]);
        setCurrentChildren(tree.root.children);
      } else {
        const target = drillPath[toIndex];
        if (target === undefined) return;
        setDrillPath(prev => prev.slice(0, toIndex + 1));
        setCurrentChildren(target.children);
      }
      setSearchQuery('');
    },
    [tree, drillPath],
  );

  /** Emit selection change event for derived fields to consume. */
  const emitSelections = useCallback((fv: FieldValue) => {
    const nodeIds = FV.selectedNodeIds(fv).map(id => id as string);
    void events.emit('concerns-tree-select:selectionsChanged', { nodeIds });
  }, []);

  const addSelection = useCallback(
    (nodeId: NodeId) => {
      if (tree === undefined) return;
      const updated = FV.addSelection(fieldValue, tree, nodeId);
      setFieldValue(updated);
      void view.submit(updated);
      emitSelections(updated);
    },
    [tree, fieldValue, emitSelections],
  );

  const removeSelection = useCallback(
    (nodeId: NodeId) => {
      const updated = FV.removeSelection(fieldValue, nodeId);
      setFieldValue(updated);
      void view.submit(updated);
      emitSelections(updated);
    },
    [fieldValue, emitSelections],
  );

  // ──── Derived state ────

  const selectedNodeIds = useMemo(() => new Set(FV.selectedNodeIds(fieldValue).map(id => id as string)), [fieldValue]);

  const levelLabel = useMemo(() => {
    if (tree === undefined) return '';
    if (currentChildren.length === 0) return '';
    const firstChild = currentChildren[0];
    if (firstChild === undefined) return '';
    const level = tree.levels.find(l => l.id === firstChild.levelId);
    return level?.label ?? '';
  }, [tree, currentChildren]);

  const filteredChildren = useMemo(
    () =>
      currentChildren.filter(
        node => searchQuery === '' || node.label.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [currentChildren, searchQuery],
  );

  // Reset focused index when children change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [currentChildren, searchQuery]);

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const maxIdx = filteredChildren.length - 1;
      if (maxIdx < 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex(prev => Math.min(prev + 1, maxIdx));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter': {
          e.preventDefault();
          const node = filteredChildren[focusedIndex];
          if (node !== undefined) addSelection(node.id);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const node = filteredChildren[focusedIndex];
          if (node !== undefined && node.children.length > 0) drillInto(node);
          break;
        }
        case 'Escape':
          e.preventDefault();
          if (drillPath.length > 0) drillUp(drillPath.length - 2);
          break;
      }
    },
    [filteredChildren, focusedIndex, addSelection, drillInto, drillPath, drillUp],
  );

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex < 0 || listRef.current === null) return;
    const items = listRef.current.querySelectorAll('[role="option"]');
    const item = items[focusedIndex];
    if (item !== undefined) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  // ──── Render ────

  if (loading) {
    return (
      <Box xcss={styles.container}>
        <Spinner size="medium" label="Loading tree" />
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
      <Stack space="space.150">
        {/* Selected items as removable tags */}
        {fieldValue.selections.length > 0 && (
          <TagGroup>
            {fieldValue.selections.map(selection => {
              const lastSegment = selection.path[selection.path.length - 1];
              if (lastSegment === undefined) return null;
              return (
                <RemovableTag
                  key={lastSegment.nodeId as string}
                  text={formatBreadcrumb(selection)}
                  removeButtonLabel={`Remove ${formatBreadcrumb(selection)}`}
                  onAfterRemoveAction={() => removeSelection(lastSegment.nodeId)}
                />
              );
            })}
          </TagGroup>
        )}

        {/* Breadcrumb navigation */}
        {drillPath.length > 0 && (
          <Breadcrumbs label="Hierarchy navigation">
            <BreadcrumbsItem text="Root" onClick={() => drillUp(-1)} />
            {drillPath.map((node, idx) => (
              <BreadcrumbsItem key={node.id as string} text={node.label} onClick={() => drillUp(idx)} />
            ))}
          </Breadcrumbs>
        )}

        {/* Search */}
        <Textfield
          placeholder={`Search ${levelLabel || 'items'}...`}
          value={searchQuery}
          onChange={e => setSearchQuery((e.target as HTMLInputElement).value)}
          aria-label="Search hierarchy"
          isCompact
        />

        {/* Node list */}
        <Box
          xcss={styles.nodeList}
          as="ul"
          role="listbox"
          ref={listRef as React.RefObject<never>}
          tabIndex={0}
          onKeyDown={handleListKeyDown}
          aria-activedescendant={
            focusedIndex >= 0 && filteredChildren[focusedIndex] !== undefined
              ? `node-${filteredChildren[focusedIndex].id as string}`
              : undefined
          }
          aria-label={`${levelLabel || 'Items'} list`}
        >
          {filteredChildren.map((node, idx) => {
            const isSelected = selectedNodeIds.has(node.id as string);
            const isFocused = idx === focusedIndex;
            const hasKids = node.children.length > 0;
            return (
              <Box
                xcss={cx(styles.nodeRow, isFocused && styles.focusedNode)}
                as="li"
                key={node.id as string}
                role="option"
                id={`node-${node.id as string}`}
                aria-selected={isSelected}
              >
                <Box xcss={styles.nodeSelectWrap}>
                  <Button
                    appearance={isSelected ? 'primary' : 'subtle'}
                    isSelected={isSelected}
                    onClick={() => addSelection(node.id)}
                    shouldFitContainer
                  >
                    {node.label}
                  </Button>
                </Box>
                {hasKids && (
                  <Button
                    appearance="subtle"
                    spacing="compact"
                    onClick={() => drillInto(node)}
                    aria-label={`Expand ${node.label}`}
                  >
                    &#9656;
                  </Button>
                )}
              </Box>
            );
          })}
        </Box>

        {filteredChildren.length === 0 && (
          <Box xcss={styles.empty}>
            <p>{searchQuery !== '' ? 'No matching items.' : 'No items at this level.'}</p>
          </Box>
        )}
      </Stack>
    </Box>
  );
};
