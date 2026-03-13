/**
 * Assemble an isolated build directory for `forge deploy`.
 *
 * Forge CLI v12 bundles TS 4.8 internally, which cannot parse Zod v4
 * declarations or TS 5.0+ tsconfig options. We pre-compile resolvers and
 * domain to JS with our TS 5.9 so Forge's bundler only ever sees plain
 * JavaScript for those layers. UI Kit frontend .tsx files are left intact
 * (their type-only domain imports are erased by verbatimModuleSyntax).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, symlinkSync, readdirSync, unlinkSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'forge-build');

// Clean slate
rmSync(build, { recursive: true, force: true });
mkdirSync(build, { recursive: true });

// Source tree (frontend .tsx preserved for Forge UI Kit processing)
cpSync(join(root, 'src'), join(build, 'src'), { recursive: true });

// Pre-compile resolvers + domain to JS
const tscOut = join(build, '.tsc');
execFileSync('npx', ['tsc', '--project', join(root, 'tsconfig.json'), '--outDir', tscOut], {
  cwd: root,
  stdio: 'inherit',
});

for (const dir of ['resolvers', 'domain']) {
  const compiled = join(tscOut, dir);
  const target = join(build, 'src', dir);

  // Copy compiled JS over
  for (const f of readdirSync(compiled).filter(f => f.endsWith('.js')))
    copyFileSync(join(compiled, f), join(target, f));

  // Remove .ts sources (Forge's TS 4.8 must not see them)
  for (const f of readdirSync(target).filter(f => f.endsWith('.ts'))) unlinkSync(join(target, f));
}

rmSync(tscOut, { recursive: true, force: true });

// Forge-compatible tsconfig — stops ts-loader walking up to the project root.
// Only affects UI Kit .tsx processing (resolvers/domain are already JS).
// TS 4.8 cannot parse verbatimModuleSyntax or moduleResolution:"bundler".
const forgeTsconfig = {
  compilerOptions: {
    strict: true,
    isolatedModules: true,
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'node',
    jsx: 'react-jsx',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    skipLibCheck: true,
  },
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  exclude: ['node_modules', 'static'],
};
writeFileSync(join(build, 'tsconfig.json'), JSON.stringify(forgeTsconfig, null, 2) + '\n');

// Scaffolding
copyFileSync(join(root, 'manifest.yml'), join(build, 'manifest.yml'));
copyFileSync(join(root, 'package.json'), join(build, 'package.json'));
symlinkSync(join(root, 'node_modules'), join(build, 'node_modules'));
symlinkSync(join(root, 'static'), join(build, 'static'));

console.log("forge-build/ ready — run 'cd forge-build && forge deploy' to deploy.");
