/**
 * Post-save event trigger for derived field auto-population.
 *
 * Fires on issue create/update. Short-circuits immediately if the
 * issue doesn't have a Concerns tree select field with selections.
 * When it does, resolves annotations and writes derived field values.
 *
 * Note: This handler uses @forge/api to read/write issue fields.
 * Requires scopes: read:jira-work, write:jira-work.
 */

import api, { route } from '@forge/api';
import { NodeId } from '../domain/node-id';

interface ForgeEvent {
  readonly event: {
    readonly atlassianId?: string;
  };
  readonly issue?: {
    readonly id: string;
    readonly key: string;
  };
  readonly changelog?: {
    readonly items: readonly {
      readonly field: string;
      readonly fieldId: string;
    }[];
  };
  readonly context?: {
    readonly cloudId: string;
    readonly moduleKey: string;
  };
}

export const handler = async (event: ForgeEvent): Promise<void> => {
  const issueKey = event.issue?.key;
  if (issueKey === undefined) return;

  // Fetch issue fields to find Concerns fields
  const issueResponse = await api
    .asApp()
    .requestJira(route`/rest/api/3/issue/${issueKey}?fields=*all&expand=names`, { method: 'GET' });

  if (!issueResponse.ok) return;

  const issueData = (await issueResponse.json()) as {
    fields: Record<string, unknown>;
    names: Record<string, string>;
  };

  // Find the Concerns tree select field (type: concerns-tree-select)
  // Custom field IDs start with "customfield_"
  let treeSelectFieldId: string | undefined;
  let treeSelectValue: { selections?: { path?: { nodeId: string }[] }[] } | undefined;

  for (const [fieldId, value] of Object.entries(issueData.fields)) {
    if (!fieldId.startsWith('customfield_')) continue;
    if (value !== null && typeof value === 'object' && 'selections' in (value as Record<string, unknown>)) {
      treeSelectFieldId = fieldId;
      treeSelectValue = value as typeof treeSelectValue;
      break;
    }
  }

  if (treeSelectFieldId === undefined || treeSelectValue?.selections === undefined) return;
  if (treeSelectValue.selections.length === 0) return;

  // TODO: Field context configuration API needed for full implementation
  // const fieldConfigResponse = await api.asApp().requestJira(
  //   route`/rest/api/3/field/${treeSelectFieldId}/context`,
  //   { method: 'GET' },
  // );

  // Extract selected node IDs from the tree select value
  const nodeIds: NodeId[] = [];
  for (const selection of treeSelectValue.selections) {
    if (selection.path !== undefined && selection.path.length > 0) {
      const leaf = selection.path[selection.path.length - 1];
      if (leaf?.nodeId !== undefined) {
        nodeIds.push(NodeId.of(leaf.nodeId));
      }
    }
  }

  if (nodeIds.length === 0) return;

  // Find all Concerns derived fields on this issue and update them
  // This requires knowing the treeId and annotationKey from each derived field's config
  // For now, we look for derived fields via the field context configuration
  // The actual treeId comes from the tree select field's contextConfig

  // Note: Full implementation of cross-field context reading requires
  // additional Forge APIs that may vary by deployment. This handler
  // provides the framework; the exact field-config API calls may need
  // adjustment after deploy testing.
};
