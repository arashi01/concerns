# Contributing

## Setup

```bash
npm install
```

Requires Node.js 24+ and the [Forge CLI](https://developer.atlassian.com/platform/forge/set-up-forge/) for deployment.

## Commands

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint
npm run format        # Prettier --write
npm run format:check  # Prettier --check (CI gate)
npm run test          # vitest run (165 tests)
npm run test:watch    # vitest in watch mode
npm run build         # Build all 3 Custom UI bundles
```

Build runs `typecheck` first (`prebuild` hook). All four static analysis checks (format, typecheck, lint, test) must pass before deployment.

## Deploy

The Forge CLI bundles resolver functions with an internal TypeScript 4.8 that cannot parse TS 5.0+ syntax (Zod v4 declarations, `verbatimModuleSyntax`, `moduleResolution: "bundler"`). `forge:prepare` assembles an isolated `forge-build/` directory with pre-compiled resolvers so the Forge bundler only ever sees plain JavaScript. The source tree is never modified.

```bash
npm run forge:prepare
cd forge-build && forge deploy -e development
```

CI handles this automatically in the deploy job.

```bash
forge install --site <site>.atlassian.net --product jira -e development
forge tunnel          # Local dev proxy (hot-reloads code, not manifest)
```

Manifest changes require a redeploy. Scope changes require redeploy + reinstall.

## Architecture

```text
src/
├── domain/              Pure TypeScript, zero Forge dependencies
├── resolvers/           Forge KVS + resolver handlers (impure boundary)
├── frontend/            UI surfaces (6 modules)
│   ├── view/            UI Kit — read-only tree select
│   ├── edit/            Custom UI — drill-down select + tag accumulator
│   ├── config/          UI Kit — per-field tree picker
│   ├── derived-view/    UI Kit — read-only annotation display
│   ├── derived-edit/    Custom UI — auto-populated annotation editor
│   └── derived-config/  UI Kit — tree + annotation key picker
├── admin/               Custom UI — tree management admin page
└── __tests__/
    ├── domain/          Pure domain logic tests
    └── resolvers/       Resolver + storage tests (mocked KVS)
```

### Functional core, impure shell

The `domain/` layer is pure functions over immutable data. No Forge imports, no side effects, no async. All tree traversal, annotation resolution, field value logic, validation, CSV parsing, and tree mutation lives here.

Side effects (KVS reads/writes, Forge bridge calls, React state) are confined to `resolvers/` and `frontend/`. This boundary is strict — domain code must never import from `@forge/*`, `react`, or any module with side effects.

### Errors as values

All fallible operations return `Result<T, E>` or `ResultAsync<T, E>` from [neverthrow](https://github.com/supermacro/neverthrow). There are no thrown exceptions in domain or resolver code.

```ts
// ✓ Return errors
const result = Tree.find(root, nodeId);
if (result.isErr()) return err(result.error);

// ✗ Never throw
throw new Error('Node not found');
```

Resolver handlers convert `Result` values to `{ data: T } | { error: string }` at the Forge boundary.

### Branded types

`NodeId`, `TreeId`, `LevelId`, and `AnnotationKey` are nominal (branded) types that prevent accidental mixing at compile time. Each has a companion object with:

- `of(raw: string)` — construct from a known-good string
- `parse(input: unknown)` — validate and construct (returns `Result`)
- `schema` — Zod schema for boundary validation
- `value(branded)` — extract the underlying string

```ts
const nodeId = NodeId.of('abc');
const treeId = TreeId.of('abc');
// nodeId and treeId are incompatible types despite both wrapping strings
```

### Validation at boundaries

[Zod v4](https://zod.dev/) schemas validate data entering the system: JSON imports, KVS reads, resolver payloads. Internal code trusts the domain types and does not re-validate.

Sanitisation (`domain/sanitise.ts`) enforces length limits and strips control characters before storage.

### Immutability

All domain types use `readonly` properties and `ReadonlyArray`. Tree mutations (`domain/tree-mutate.ts`) return new trees via structural sharing (spread operators), never mutating in place.

## TypeScript configuration

The project uses TypeScript 5.9 with strict settings:

- `strict: true`
- `exactOptionalPropertyTypes: true` — `undefined` must be explicit in optional types
- `verbatimModuleSyntax: true` — requires `import type` for type-only imports
- `noUncheckedIndexedAccess: true` — array/object indexing returns `T | undefined`

These are non-negotiable. Do not weaken them to resolve type errors — fix the code instead.

## Rendering strategy

| Surface      | Technology      | Reason                                                 |
| ------------ | --------------- | ------------------------------------------------------ |
| View, Config | UI Kit (native) | Simple display/picker — no DOM control needed          |
| Edit, Admin  | Custom UI       | Drill-down nav, tree editor, file upload need full DOM |

Custom UI surfaces use `@atlaskit/*` components for native Jira theming. UI Kit surfaces use `@forge/react` components exclusively — never import React components from other packages in UI Kit modules.

## Testing

Tests use Vitest with no special setup. Domain tests are pure function tests. Resolver tests mock `@forge/kvs` at the module level.

```bash
npm run test              # All 165 tests
npx vitest run domain     # Domain tests only
npx vitest run resolvers  # Resolver tests only
```

Test fixtures live in `src/__tests__/domain/fixtures.ts` — shared tree configs (plain and annotated variants) and a `mkNode` factory.

## Key dependencies

| Package         | Purpose                                        |
| --------------- | ---------------------------------------------- |
| neverthrow      | `Result<T, E>` / `ResultAsync<T, E>`           |
| zod             | Runtime validation at system boundaries        |
| papaparse       | RFC 4180 CSV parsing for import                |
| @atlaskit/\*    | Atlassian Design System for Custom UI          |
| @forge/react    | UI Kit components for native-rendered surfaces |
| @forge/bridge   | Frontend ↔ resolver communication + events     |
| @forge/kvs      | Key-value storage (backend only)               |
| @forge/resolver | Resolver handler definitions (backend only)    |

## Storage model

Each tree is a single KVS document at key `tree:{id}` (max 240 KiB). A metadata index at `meta:trees` stores `TreeSummary` entries for listing without loading full trees.

`saveTree` auto-increments the version field and rejects version mismatches (optimistic concurrency). The TOCTOU window is acceptable for admin-frequency operations.

## Resolver handlers

| Handler              | Purpose                                       |
| -------------------- | --------------------------------------------- |
| `getTree`            | Load a single tree by ID                      |
| `listTrees`          | List all tree summaries from metadata index   |
| `saveTree`           | Validate, sanitise, version-bump, store       |
| `deleteTree`         | Remove tree + update metadata index           |
| `importTree`         | Transform simplified/CSV format → full config |
| `getChildren`        | Return children of a node (for lazy loading)  |
| `searchTree`         | Full-text search across node labels           |
| `resolveAnnotations` | Resolve annotation values for given node IDs  |

## Design decisions

These are locked in and documented in [TASKS.md](TASKS.md) § Design Decisions. Do not revisit without discussion:

1. Custom UI for edit/admin, UI Kit for view/config
2. Self-contained tree configs (one KVS document per tree)
3. 6-level JQL indexing via `searchAlias` Level1–Level6
4. Separate field types for hierarchy and derived annotations
5. Three annotation resolution strategies (union, nearest, explicit)
6. Cross-field events for tree select → derived field communication
