/**
 * Assemble an isolated build directory for `forge deploy`.
 *
 * Forge CLI v12 bundles TS 4.8 internally, which cannot parse Zod v4's
 * .d.cts declarations or TS 5.0+ tsconfig options. We use esbuild to:
 *   - Bundle resolver entry points with all deps inlined (zod, neverthrow,
 *     domain) so Forge's webpack never follows imports to Zod.
 *   - Transpile domain files to JS for UI Kit module resolution (their
 *     import-type references are erased by ts-loader but the .js must exist).
 *
 * UI Kit frontend .tsx files are left intact for Forge's native rendering.
 * Tests are excluded — Forge must not bundle them.
 */
import { buildSync } from 'esbuild';
import { cpSync, mkdirSync, rmSync, symlinkSync, readdirSync, unlinkSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'forge-build');

// Clean slate
rmSync(build, { recursive: true, force: true });
mkdirSync(build, { recursive: true });

// Source tree (frontend .tsx preserved, tests excluded)
cpSync(join(root, 'src'), join(build, 'src'), {
  recursive: true,
  filter: src => !src.includes('__tests__'),
});

// Bundle resolver entry points — inlines zod, neverthrow, and domain code
// so Forge's TS 4.8 bundler never follows imports to Zod's .d.cts files.
// @forge/* packages are provided at runtime by the Forge platform.
for (const entry of ['index', 'search-suggestions', 'issue-event']) {
  buildSync({
    entryPoints: [join(root, `src/resolvers/${entry}.ts`)],
    bundle: true,
    platform: 'node',
    target: 'es2022',
    format: 'esm',
    external: ['@forge/*'],
    outfile: join(build, `src/resolvers/${entry}.js`),
    tsconfig: join(root, 'tsconfig.json'),
  });
}

// Transpile domain to JS — UI Kit .tsx files reference domain/types via
// import type. These are erased by ts-loader, but the .js must exist for
// module resolution. Non-bundled so each file stays independent.
const domainTs = readdirSync(join(build, 'src/domain')).filter(f => f.endsWith('.ts'));
if (domainTs.length > 0) {
  buildSync({
    entryPoints: domainTs.map(f => join(build, 'src/domain', f)),
    outdir: join(build, 'src/domain'),
    platform: 'node',
    target: 'es2022',
    format: 'esm',
    tsconfig: join(root, 'tsconfig.json'),
  });
}

// Remove .ts from resolvers + domain (Forge's TS 4.8 must only see JS)
for (const dir of ['resolvers', 'domain']) {
  const target = join(build, 'src', dir);
  for (const f of readdirSync(target).filter(f => f.endsWith('.ts'))) unlinkSync(join(target, f));
}

// Forge-compatible tsconfig — stops ts-loader walking up to the project root.
// Only affects UI Kit .tsx processing (resolvers/domain are already JS).
// TS 4.8 cannot parse verbatimModuleSyntax or moduleResolution:"bundler".
const forgeTsconfig = {
  compilerOptions: {
    strict: true,
    isolatedModules: true,
    allowJs: true,
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'node',
    jsx: 'react-jsx',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    skipLibCheck: true,
  },
  include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js'],
  exclude: ['node_modules', 'static'],
};
writeFileSync(join(build, 'tsconfig.json'), JSON.stringify(forgeTsconfig, null, 2) + '\n');

// Scaffolding
copyFileSync(join(root, 'manifest.yml'), join(build, 'manifest.yml'));
copyFileSync(join(root, 'package.json'), join(build, 'package.json'));
symlinkSync(join(root, 'node_modules'), join(build, 'node_modules'));
symlinkSync(join(root, 'static'), join(build, 'static'));

console.log("forge-build/ ready — run 'cd forge-build && forge deploy' to deploy.");
