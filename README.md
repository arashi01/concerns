# Concerns

Hierarchical multi-level select fields for Jira Cloud. Define a tree structure (locations, org charts, product categories — anything hierarchical), attach it to Jira issues, and search by any level in JQL.

Built on [Atlassian Forge](https://developer.atlassian.com/platform/forge/).

## What you get

**Tree Select field** — users drill down through your hierarchy and pick one or more nodes at any depth. Selections display as breadcrumb tags.

**Derived fields** — auto-populated from tree selections. Define annotation dimensions on your tree (e.g. "Principal", "Manager") and Concerns resolves the values automatically when users select nodes. Each derived field is independently searchable in JQL.

**JQL search** — query any of the 6 hierarchy levels or any derived dimension:

```text
"Location".Level1 = "Mombasa"
"Location".Level3 = "Plot 52"
"Principals" = "SBS Properties Ltd"
"Manager" = "Kamau"
```

## Installation

1. Install the [Forge CLI](https://developer.atlassian.com/platform/forge/set-up-forge/) and authenticate
2. Deploy and install:

```bash
npm install
npm run forge:deploy:dev
forge install --site <site>.atlassian.net --product jira -e development
```

## Setting up a tree

Go to **Jira Settings > Apps > Concerns — Tree Configuration**.

### Option 1: JSON import

Paste or upload a JSON file using the simplified format:

```json
{
  "name": "Locations",
  "levels": [
    { "id": "county", "label": "County" },
    { "id": "subcounty", "label": "Sub-county" },
    { "id": "plot", "label": "Plot" }
  ],
  "nodes": [
    {
      "label": "Mombasa",
      "level": "county",
      "children": [
        {
          "label": "Likoni",
          "level": "subcounty",
          "children": [
            { "label": "Plot 52", "level": "plot" },
            { "label": "Plot 67", "level": "plot" }
          ]
        }
      ]
    }
  ]
}
```

IDs are generated automatically. You don't need to manage them.

### Option 2: CSV import

Upload a CSV where columns represent hierarchy levels:

```csv
County,Sub-county,Plot
Mombasa,Mvita,Plot 52
Mombasa,Mvita,Plot 67
Mombasa,Likoni,Plot 12
```

Duplicate paths are deduplicated automatically. Rows with empty trailing columns create nodes at higher levels.

### Option 3: Combined CSV (with annotations)

Add annotation columns prefixed with `@`:

```csv
County,Sub-county,Plot,@principal,@manager
Mombasa,Mvita,Plot 52,SBS Properties Ltd,Kamau
Mombasa,Mvita,Plot 67,SBS Properties Ltd,Omondi
Mombasa,Likoni,Plot 12,SBS Properties (2016),Wanjiku
```

### Option 4: Inline editor

Use the visual tree editor in the admin page to add, rename, reorder, or remove nodes directly. Define annotation dimensions and bind values to nodes — no JSON or CSV required.

## Adding fields to your project

### Tree Select field

1. Go to **Jira Settings > Issues > Custom fields > Create custom field**
2. Select type **Concerns Tree Select** and give it a name (e.g. "Location")
3. Configure the field context: go to **Jira Settings > Fields**, find the field, open its **Actions** menu (**...**), click **Contexts and default values**, then **Edit custom field config** to select which tree this field uses
4. Add the field to your project's screens if not already visible

### Derived field

1. Go to **Jira Settings > Issues > Custom fields > Create custom field**
2. Select type **Concerns Derived** and give it a name (e.g. "Principals")
3. Configure the field context: go to **Jira Settings > Fields**, find the field, open its **Actions** menu (**...**), click **Contexts and default values**, then **Edit custom field config** to select a tree and annotation key (e.g. "principal")
4. The field auto-populates when users make tree selections - no manual entry needed

Create one Derived field per annotation dimension. For example, if your tree has "principal" and "manager" annotations, create two Derived fields.

## Using the fields

### Selecting values

On issue create, transition, or inline edit:

1. The Tree Select field shows the top level of your hierarchy
2. Click a node to select it, or click the arrow to drill into its children
3. Use the search box to filter nodes at the current level
4. Selected nodes appear as removable tags showing the full path
5. Keyboard: Arrow keys to navigate, Enter to select, Right arrow to drill in, Escape to go back

Derived fields update automatically as you change tree selections.

### Reading values

On issue view and portal view, Tree Select shows breadcrumb tags (e.g. `Mombasa > Mvita > Plot 52`). Derived fields show resolved values as tags.

In issue navigator, emails, and CSV exports, selections render as semicolon-separated breadcrumbs.

### Searching with JQL

Each hierarchy level maps to a JQL property:

| Level depth | JQL property | Example                         |
| ----------- | ------------ | ------------------------------- |
| 1st         | Level1       | `"Location".Level1 = "Mombasa"` |
| 2nd         | Level2       | `"Location".Level2 = "Mvita"`   |
| 3rd         | Level3       | `"Location".Level3 = "Plot 52"` |
| 4th–6th     | Level4–6     | Same pattern                    |

Derived fields are searched by field name: `"Principals" = "SBS Properties Ltd"`.

JQL autocomplete suggests matching values as you type.

## Annotations

Annotations are values attached to tree nodes — ownership, responsibility, cost codes, compliance tags, or any dimension relevant to your hierarchy.

### Defining annotations

In the admin page, open a tree and use the annotation definitions panel:

- **Key** — internal identifier (e.g. `principal`)
- **Label** — display name (e.g. `Principal`)
- **Resolution strategy** — how values are resolved when a node is selected:

| Strategy     | Behaviour                                                 | When to use                    |
| ------------ | --------------------------------------------------------- | ------------------------------ |
| **Union**    | Collects values from every ancestor and the node itself   | Show all owners up the chain   |
| **Nearest**  | Walks up from the selected node, takes the first found    | Local overrides (e.g. manager) |
| **Explicit** | Only values directly on the selected node, no inheritance | One-off tags with no cascade   |

### Binding values to nodes

In the tree editor, expand a node and add annotation values. Or import them via CSV:

```csv
path,principal,manager
Mombasa > Mvita > Plot 52,SBS Properties Ltd,Kamau
Mombasa > Mvita > Plot 67,SBS Properties Ltd,Omondi
```

The `path` column uses `>` as separator. Annotation values are applied to the matching node.

## Managing trees

### Export

Click **Export JSON** on any tree in the admin page to download the full configuration. Use this for backups, migration between Jira sites, or version control.

### Multiple trees

Create separate trees for different field instances. One Jira site can have a "Locations" tree for property management and an "Org Structure" tree for team assignments, each powering its own set of fields.

### Editing

The visual tree editor supports:

- Add, rename, and delete nodes
- Reorder siblings (move up/down)
- Edit annotation values per node
- Add and remove annotation definitions

Changes are saved with optimistic concurrency — if another admin edits the same tree simultaneously, you'll be prompted to reload before saving.

## Example: property management

**Tree**: County > Sub-county > Plot > Block > Unit

**Annotations**: Principal (union), Manager (nearest), Contractor (explicit)

1. Create a "Locations" tree with the CSV:

```csv
County,Sub-county,Plot,Block,Unit,@principal,@manager
Mombasa,Mvita,Plot 52,Block A,Unit 1,SBS Properties Ltd,Kamau
Mombasa,Mvita,Plot 52,Block A,Unit 2,SBS Properties Ltd,Kamau
Mombasa,Mvita,Plot 52,Block B,,SBS Properties (2016),Omondi
```

1. Add a **Concerns Tree Select** field called "Location" to your project
1. Add **Concerns Derived** fields: "Principals" (key: `principal`) and "Manager" (key: `manager`)
1. On issue create, an agent selects `Mombasa > Mvita > Plot 52 > Block A > Unit 2`
1. "Principals" auto-populates with `SBS Properties Ltd` (union of all ancestors)
1. "Manager" auto-populates with `Kamau` (nearest ancestor with a manager)
1. Project manager filters with `"Manager" = "Kamau"` to see all their issues

## Limits

| Constraint        | Limit   | Notes                                       |
| ----------------- | ------- | ------------------------------------------- |
| Hierarchy depth   | 6       | 6 JQL-searchable levels (Level1–Level6)     |
| Tree size         | 200 KiB | Forge KVS per-key limit                     |
| Selections        | No cap  | Practical limit is display space            |
| Annotation keys   | No cap  | Each requires a corresponding Derived field |
| Trees per install | No cap  | Each tree is a separate storage key         |

## License

MIT
