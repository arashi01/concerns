/**
 * Recursive tree editor for admin UI.
 *
 * Renders an indented tree with inline editing capabilities:
 *   - Expand/collapse per node
 *   - Inline rename (click label → textfield)
 *   - Add child node
 *   - Delete node (with confirmation)
 *   - Move up/down among siblings
 *   - View/edit annotation values
 *
 * Built as a controlled component: mutations produce a new root
 * via TreeMutate and bubble up through onRootUpdate.
 */

import React, { useState, useCallback } from 'react';
import Button from '@atlaskit/button/new';
import Textfield from '@atlaskit/textfield';
import Lozenge from '@atlaskit/lozenge';
import { cssMap } from '@atlaskit/css';
import { Box, Stack, Inline } from '@atlaskit/primitives/compiled';
import type { TreeNode, LevelDefinition, AnnotationDefinition } from '../../domain/types';
import { NodeId } from '../../domain/node-id';
import { TreeMutate } from '../../domain/tree-mutate';

// ──── Props ────

interface TreeEditorProps {
  /** The full tree root (including virtual root node). */
  readonly root: TreeNode;
  /** Level definitions for assigning levels to new nodes. */
  readonly levels: readonly LevelDefinition[];
  /** Annotation definitions for displaying annotation badges. */
  readonly annotations: readonly AnnotationDefinition[];
  /** Callback with the new root after any mutation. */
  readonly onRootUpdate: (updatedRoot: TreeNode) => void;
  /** ID generator for new nodes (injected for testability). */
  readonly generateId: () => string;
}

interface NodeEditorProps {
  readonly node: TreeNode;
  readonly root: TreeNode;
  readonly levels: readonly LevelDefinition[];
  readonly annotations: readonly AnnotationDefinition[];
  readonly depth: number;
  readonly onRootUpdate: (updatedRoot: TreeNode) => void;
  readonly generateId: () => string;
}

// ──── Styles ────

const styles = cssMap({
  nodeRow: {
    paddingBlock: 'var(--ds-space-050)',
    borderBlockEnd: 'var(--ds-border-width) solid var(--ds-border)',
  },
  childrenContainer: { paddingInlineStart: 'var(--ds-space-300)' },
  annotationBadge: { paddingInlineStart: 'var(--ds-space-100)' },
  emptyToggle: { width: '32px' },
});

// ──── Node editor (recursive) ────

const NodeEditor: React.FC<NodeEditorProps> = ({
  node,
  root,
  levels,
  annotations,
  depth,
  onRootUpdate,
  generateId,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(node.label);
  const [addingChild, setAddingChild] = useState(false);
  const [newChildLabel, setNewChildLabel] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasChildren = node.children.length > 0;
  const annotationCount = Object.keys(node.annotations).length;

  // Determine the level for a new child (one deeper than current node)
  const currentLevelIdx = levels.findIndex(l => l.id === node.levelId);
  const childLevel =
    currentLevelIdx >= 0 && currentLevelIdx + 1 < levels.length ? levels[currentLevelIdx + 1] : undefined;

  const handleRename = useCallback(() => {
    if (editLabel.trim() === '' || editLabel.trim() === node.label) {
      setEditing(false);
      setEditLabel(node.label);
      return;
    }
    onRootUpdate(TreeMutate.renameNode(root, node.id, editLabel.trim()));
    setEditing(false);
  }, [editLabel, node.id, node.label, root, onRootUpdate]);

  const handleAddChild = useCallback(() => {
    if (newChildLabel.trim() === '' || childLevel === undefined) return;
    const newNode: TreeNode = {
      id: NodeId.of(generateId()),
      label: newChildLabel.trim(),
      levelId: childLevel.id,
      metadata: {},
      annotations: {},
      children: [],
    };
    onRootUpdate(TreeMutate.addNode(root, node.id, newNode));
    setNewChildLabel('');
    setAddingChild(false);
    setExpanded(true);
  }, [newChildLabel, childLevel, generateId, root, node.id, onRootUpdate]);

  const handleDelete = useCallback(() => {
    onRootUpdate(TreeMutate.removeNode(root, node.id));
  }, [root, node.id, onRootUpdate]);

  const handleMove = useCallback(
    (direction: 'up' | 'down') => {
      onRootUpdate(TreeMutate.moveNode(root, node.id, direction));
    },
    [root, node.id, onRootUpdate],
  );

  return (
    <Box>
      <Box xcss={styles.nodeRow}>
        <Inline space="space.050" alignBlock="center">
          {/* Expand/collapse toggle */}
          {hasChildren ? (
            <Button appearance="subtle" spacing="compact" onClick={() => setExpanded(!expanded)}>
              {expanded ? '▼' : '▶'}
            </Button>
          ) : (
            <Box xcss={styles.emptyToggle} />
          )}

          {/* Label (editable) */}
          {editing ? (
            <Inline space="space.050" alignBlock="center">
              <Textfield
                value={editLabel}
                onChange={e => setEditLabel((e.target as HTMLInputElement).value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') {
                    setEditing(false);
                    setEditLabel(node.label);
                  }
                }}
                isCompact
                width="medium"
                autoFocus
              />
              <Button appearance="primary" spacing="compact" onClick={handleRename}>
                Save
              </Button>
              <Button
                appearance="subtle"
                spacing="compact"
                onClick={() => {
                  setEditing(false);
                  setEditLabel(node.label);
                }}
              >
                Cancel
              </Button>
            </Inline>
          ) : (
            <Button
              appearance="subtle"
              spacing="compact"
              onClick={() => {
                setEditing(true);
                setEditLabel(node.label);
              }}
            >
              {node.label}
            </Button>
          )}

          {/* Level badge */}
          <Lozenge appearance="default">
            {levels.find(l => l.id === node.levelId)?.label ?? (node.levelId as string)}
          </Lozenge>

          {/* Annotation count badge */}
          {annotationCount > 0 && (
            <Box xcss={styles.annotationBadge}>
              <Lozenge appearance="new">{String(annotationCount)} ann.</Lozenge>
            </Box>
          )}

          {/* Action buttons */}
          <Button appearance="subtle" spacing="compact" onClick={() => handleMove('up')}>
            ↑
          </Button>
          <Button appearance="subtle" spacing="compact" onClick={() => handleMove('down')}>
            ↓
          </Button>
          {childLevel !== undefined && (
            <Button appearance="subtle" spacing="compact" onClick={() => setAddingChild(!addingChild)}>
              +
            </Button>
          )}
          {confirmDelete ? (
            <Inline space="space.050">
              <Button appearance="danger" spacing="compact" onClick={handleDelete}>
                Confirm
              </Button>
              <Button appearance="subtle" spacing="compact" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </Inline>
          ) : (
            <Button appearance="subtle" spacing="compact" onClick={() => setConfirmDelete(true)}>
              ✕
            </Button>
          )}
        </Inline>
      </Box>

      {/* Add child form */}
      {addingChild && (
        <Box xcss={styles.childrenContainer}>
          <Inline space="space.050" alignBlock="center">
            <Textfield
              value={newChildLabel}
              onChange={e => setNewChildLabel((e.target as HTMLInputElement).value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddChild();
                if (e.key === 'Escape') {
                  setAddingChild(false);
                  setNewChildLabel('');
                }
              }}
              placeholder={`New ${childLevel?.label ?? 'node'}...`}
              isCompact
              width="medium"
              autoFocus
            />
            <Button appearance="primary" spacing="compact" onClick={handleAddChild}>
              Add
            </Button>
            <Button
              appearance="subtle"
              spacing="compact"
              onClick={() => {
                setAddingChild(false);
                setNewChildLabel('');
              }}
            >
              Cancel
            </Button>
          </Inline>
        </Box>
      )}

      {/* Children */}
      {expanded && hasChildren && (
        <Box xcss={styles.childrenContainer}>
          {node.children.map(child => (
            <NodeEditor
              key={child.id as string}
              node={child}
              root={root}
              levels={levels}
              annotations={annotations}
              depth={depth + 1}
              onRootUpdate={onRootUpdate}
              generateId={generateId}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

// ──── Tree editor (entry point) ────

export const TreeEditor: React.FC<TreeEditorProps> = ({ root, levels, annotations, onRootUpdate, generateId }) => {
  // Render children of the virtual root (the actual top-level nodes)
  if (root.children.length === 0) {
    return <p>No nodes in this tree. Use the import tab to add data.</p>;
  }

  return (
    <Stack space="space.0">
      {root.children.map(child => (
        <NodeEditor
          key={child.id as string}
          node={child}
          root={root}
          levels={levels}
          annotations={annotations}
          depth={0}
          onRootUpdate={onRootUpdate}
          generateId={generateId}
        />
      ))}
    </Stack>
  );
};
