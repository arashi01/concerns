/**
 * Assemble a self-contained Forge project in forge-build/ for deployment.
 *
 * Forge CLI v12 bundles TS 4.8 internally (via webpack + ts-loader) which
 * cannot parse Zod v4's .d.cts declarations or TS 5.0+ tsconfig options.
 *
 * Solution: compile everything to JS with esbuild, bundling all dependencies
 * except React and @forge/react. These are declared in the generated
 * package.json and installed via npm so Forge's webpack resolves and bundles
 * them once (shared across all native UI resources).
 *
 * - Resolvers: fully bundled (all deps inlined).
 * - Native UI: bundled with all deps inlined except React + @forge/react.
 * - Custom UI: already Vite-built in static/. Forge just zips them.
 * - Manifest: resource paths rewritten from .tsx to .js.
 */
import { buildSync } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'forge-build');

rmSync(build, { recursive: true, force: true });
mkdirSync(build, { recursive: true });

// ---- Resolvers (bundled, @forge/* external for Forge's runtime) ----
for (const entry of ['index', 'search-suggestions']) {
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

// ---- Native UI (bundled, React + @forge/react external) ----
// React and @forge/react are left external so Forge's webpack resolves them
// from node_modules and deduplicates across all native UI resources.
const nativeUi = [
  'frontend/view/index.tsx',
  'frontend/config/index.tsx',
  'frontend/derived-view/index.tsx',
  'frontend/derived-config/index.tsx',
];
for (const file of nativeUi) {
  const outfile = join(build, 'src', file.replace(/\.tsx$/, '.js'));
  mkdirSync(dirname(outfile), { recursive: true });
  buildSync({
    entryPoints: [join(root, 'src', file)],
    bundle: true,
    platform: 'browser',
    target: 'es2022',
    format: 'esm',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@forge/react', '@forge/react/*'],
    outfile,
    tsconfig: join(root, 'tsconfig.json'),
  });
}

// ---- Manifest (rewrite native UI paths .tsx -> .js) ----
let manifest = readFileSync(join(root, 'manifest.yml'), 'utf8');
manifest = manifest.replace(/\.tsx$/gm, '.js');
writeFileSync(join(build, 'manifest.yml'), manifest);

// ---- Minimal tsconfig (prevents ts-loader walking up to project root) ----
writeFileSync(
  join(build, 'tsconfig.json'),
  JSON.stringify({ compilerOptions: { allowJs: true, skipLibCheck: true } }, null, 2) + '\n',
);

// ---- package.json with shared deps (for Forge's webpack to resolve) ----
// Read exact versions from the project's installed packages to stay in sync.
const depVersion = pkg => JSON.parse(readFileSync(join(root, 'node_modules', pkg, 'package.json'), 'utf8')).version;
writeFileSync(
  join(build, 'package.json'),
  JSON.stringify(
    {
      name: 'concerns',
      private: true,
      dependencies: {
        react: depVersion('react'),
        'react-dom': depVersion('react-dom'),
        '@forge/api': depVersion('@forge/api'),
        '@forge/kvs': depVersion('@forge/kvs'),
        '@forge/react': depVersion('@forge/react'),
        '@forge/resolver': depVersion('@forge/resolver'),
      },
    },
    null,
    2,
  ) + '\n',
);

// ---- Install shared deps for Forge's webpack to resolve ----
execFileSync('npm', ['install', '--omit=dev'], { cwd: build, stdio: 'inherit' });

// ---- Static assets (Custom UI bundles - Forge zips these as-is) ----
cpSync(join(root, 'static'), join(build, 'static'), { recursive: true });

console.log('forge-build/ ready.');
