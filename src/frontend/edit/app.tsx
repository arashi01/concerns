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
import Lozenge from '@atlaskit/lozenge';
import { Box, Stack } from '@atlaskit/primitives/compiled';
import { cssMap, cx } from '@atlaskit/css';
import type { TreeConfig, TreeNode, FieldValue, SelectFieldConfig, Selection, FilteredTree } from '../../domain/types';
import type { NodeId } from '../../domain/node-id';
import { FieldValue as FV } from '../../domain/field-value';
import { Tree } from '../../domain/tree';

type ResolverResponse<T> = { readonly data: T } | { readonly error: string };

/** Trees above this node count use resolver-based navigation. */
const LAZY_THRESHOLD = 500;

/** Format a selection as a breadcrumb string using the visual separator. */
const formatBreadcrumb = (selection: Selection): string => selection.labels.join(FV.BREADCRUMB_SEP);

/** Flat entry from a pre-order walk of a filtered tree. */
interface FlatFilterEntry {
  readonly node: TreeNode;
  readonly depth: number;
  readonly isMatch: boolean;
}

/** Pre-order flatten of a filtered tree, skipping the virtual root container. */
const flattenFilteredTree = (filtered: FilteredTree): readonly FlatFilterEntry[] => {
  const result: FlatFilterEntry[] = [];
  const walk = (node: TreeNode, depth: number): void => {
    result.push({ node, depth, isMatch: filtered.matchIds.has(node.id as string) });
    for (const child of node.children) walk(child, depth + 1);
  };
  for (const child of filtered.root.children) walk(child, 0);
  return result;
};

// ---- Styles ----

const styles = cssMap({
  container: { padding: 'var(--ds-space-100)' },
  nodeRow: { display: 'flex', alignItems: 'center', gap: 'var(--ds-space-050)' },
  nodeSelectWrap: { flexGrow: 1, minWidth: '0px' },
  nodeList: { padding: 'var(--ds-space-0)', listStyleType: 'none' },
  focusedNode: { outline: '2px solid', outlineColor: 'var(--ds-border-focused)' },
  empty: { padding: 'var(--ds-space-200)', textAlign: 'center' },
  ancestorRow: { display: 'flex', alignItems: 'center', gap: 'var(--ds-space-050)', color: 'var(--ds-text-subtlest)' },
  matchRow: { display: 'flex', alignItems: 'center', gap: 'var(--ds-space-050)' },
  indent1: { paddingInlineStart: 'var(--ds-space-300)' },
  indent2: { paddingInlineStart: 'var(--ds-space-600)' },
  indent3: { paddingInlineStart: 'var(--ds-space-800)' },
  lozengeWrap: { flexShrink: 0 },
});

/** Indentation style by depth. Depth 0 has no indent; capped at depth 3. */
const indentFor = (depth: number): ReturnType<typeof cssMap>[string] | false => {
  if (depth <= 0) return false;
  if (depth === 1) return styles.indent1;
  if (depth === 2) return styles.indent2;
  return styles.indent3;
};

export const App: React.FC = () => {
  // ---- State ----
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

  // ---- Initialisation ----
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

        // Load tree config via resolver (Custom UI does not receive contextConfig in extension context)
        const fieldId = ext?.['fieldId'] as string | undefined;
        const configResponse = await invoke<ResolverResponse<SelectFieldConfig | undefined>>('getFieldConfig', {
          fieldId,
        });
        if ('error' in configResponse) {
          setError(configResponse.error);
          setLoading(false);
          return;
        }

        const config = configResponse.data;
        if (config?.treeId === undefined) {
          setError(
            'Field not configured. A Jira admin must assign a tree: go to Jira Settings > Fields, find this field, then Actions > Contexts and default values > Edit custom field config.',
          );
          setLoading(false);
          return;
        }

        const treeResponse = await invoke<ResolverResponse<TreeConfig>>('getTree', {
          treeId: config.treeId,
        });

        if ('error' in treeResponse) {
          const msg =
            treeResponse.error === 'Tree not found'
              ? 'The configured tree no longer exists. A Jira admin must update the field context configuration to select a valid tree.'
              : treeResponse.error;
          setError(msg);
        } else {
          const treeData = treeResponse.data;
          setTree(treeData);
          const totalNodes = Tree.nodeCount(treeData.root);
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

  // ---- Actions ----

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

  /** Drill into a node from search results, restoring the full drill path. */
  const drillFromSearch = useCallback(
    (node: TreeNode) => {
      if (tree === undefined) return;
      const path = Tree.nodePath(tree.root, node.id);
      const userPath = path.length > 0 && path[0]?.id === tree.root.id ? path.slice(1) : path;
      setDrillPath([...userPath]);
      setCurrentChildren(node.children);
      setSearchQuery('');
    },
    [tree],
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

  // ---- Derived state ----

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

  /** Prune the full tree to branches matching the search query. */
  const filteredResult = useMemo((): FilteredTree | undefined => {
    if (searchQuery === '' || tree === undefined) return undefined;
    return Tree.filterTree(tree.root, searchQuery);
  }, [searchQuery, tree]);

  const isSearchActive = searchQuery !== '' && tree !== undefined;

  const flatFiltered = useMemo(
    () => (filteredResult !== undefined ? flattenFilteredTree(filteredResult) : []),
    [filteredResult],
  );

  const interactiveNodes = useMemo(() => flatFiltered.filter(entry => entry.isMatch), [flatFiltered]);

  /** Look up the human-readable level label for a node's levelId. */
  const levelLabelOf = useMemo(() => {
    if (tree === undefined) return (_levelId: unknown): string | undefined => undefined;
    const map = new Map(tree.levels.map(l => [l.id as string, l.label]));
    return (levelId: unknown): string | undefined => map.get(levelId as string);
  }, [tree]);

  /** Node ID of the currently keyboard-focused item (search or drill-down). */
  const focusedNodeId = useMemo((): string | undefined => {
    if (focusedIndex < 0) return undefined;
    if (isSearchActive) {
      const entry = interactiveNodes[focusedIndex];
      return entry !== undefined ? (entry.node.id as string) : undefined;
    }
    const node = filteredChildren[focusedIndex];
    return node !== undefined ? (node.id as string) : undefined;
  }, [focusedIndex, isSearchActive, interactiveNodes, filteredChildren]);

  // Reset focused index when results change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [currentChildren, searchQuery]);

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const nodeAt = (idx: number): TreeNode | undefined =>
        isSearchActive ? interactiveNodes[idx]?.node : filteredChildren[idx];
      const count = isSearchActive ? interactiveNodes.length : filteredChildren.length;
      const maxIdx = count - 1;
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
          const node = nodeAt(focusedIndex);
          if (node !== undefined) addSelection(node.id);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const node = nodeAt(focusedIndex);
          if (node !== undefined && node.children.length > 0) {
            if (isSearchActive) drillFromSearch(node);
            else drillInto(node);
          }
          break;
        }
        case 'Escape':
          e.preventDefault();
          if (isSearchActive) setSearchQuery('');
          else if (drillPath.length > 0) drillUp(drillPath.length - 2);
          break;
      }
    },
    [
      isSearchActive,
      interactiveNodes,
      filteredChildren,
      focusedIndex,
      addSelection,
      drillFromSearch,
      drillInto,
      drillPath,
      drillUp,
    ],
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

  // ---- Render ----

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

        {/* Breadcrumb navigation (hidden during full-tree search) */}
        {!isSearchActive && drillPath.length > 0 && (
          <Breadcrumbs label="Hierarchy navigation">
            <BreadcrumbsItem text="Root" onClick={() => drillUp(-1)} />
            {drillPath.map((node, idx) => (
              <BreadcrumbsItem key={node.id as string} text={node.label} onClick={() => drillUp(idx)} />
            ))}
          </Breadcrumbs>
        )}

        {/* Search (always searches the full tree) */}
        <Textfield
          placeholder="Search all levels..."
          value={searchQuery}
          onChange={e => setSearchQuery((e.target as HTMLInputElement).value)}
          aria-label="Search hierarchy"
          isCompact
        />

        {/* Node list: full-tree search results or drill-down list */}
        {isSearchActive ? (
          filteredResult !== undefined ? (
            <Box
              xcss={styles.nodeList}
              as="ul"
              role="listbox"
              ref={listRef as React.RefObject<never>}
              tabIndex={0}
              onKeyDown={handleListKeyDown}
              aria-activedescendant={focusedNodeId !== undefined ? `search-node-${focusedNodeId}` : undefined}
              aria-label="Search results"
            >
              {flatFiltered.map(entry => {
                const nodeIdStr = entry.node.id as string;
                const isFocused = nodeIdStr === focusedNodeId;
                const isSelected = selectedNodeIds.has(nodeIdStr);
                const hasKids = entry.node.children.length > 0;
                const indent = indentFor(entry.depth);

                if (!entry.isMatch) {
                  return (
                    <Box xcss={cx(styles.ancestorRow, indent)} as="li" key={nodeIdStr}>
                      {entry.node.label}
                    </Box>
                  );
                }

                return (
                  <Box
                    xcss={cx(styles.matchRow, isFocused && styles.focusedNode, indent)}
                    as="li"
                    key={nodeIdStr}
                    role="option"
                    id={`search-node-${nodeIdStr}`}
                    aria-selected={isSelected}
                  >
                    <Box xcss={styles.nodeSelectWrap}>
                      <Button
                        appearance={isSelected ? 'primary' : 'subtle'}
                        isSelected={isSelected}
                        onClick={() => addSelection(entry.node.id)}
                        shouldFitContainer
                      >
                        {entry.node.label}
                      </Button>
                    </Box>
                    <Box xcss={styles.lozengeWrap}>
                      <Lozenge>{levelLabelOf(entry.node.levelId) ?? ''}</Lozenge>
                    </Box>
                    {hasKids && (
                      <Button
                        appearance="subtle"
                        spacing="compact"
                        onClick={() => drillFromSearch(entry.node)}
                        aria-label={`Expand ${entry.node.label}`}
                      >
                        &#9656;
                      </Button>
                    )}
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Box xcss={styles.empty}>
              <p>No matching items.</p>
            </Box>
          )
        ) : (
          <>
            <Box
              xcss={styles.nodeList}
              as="ul"
              role="listbox"
              ref={listRef as React.RefObject<never>}
              tabIndex={0}
              onKeyDown={handleListKeyDown}
              aria-activedescendant={focusedNodeId !== undefined ? `node-${focusedNodeId}` : undefined}
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
                <p>No items at this level.</p>
              </Box>
            )}
          </>
        )}
      </Stack>
    </Box>
  );
};
