/**
 * Build all Custom UI bundles, with optional typecheck.
 *
 * The three Custom UI surfaces (edit, admin, derived-edit) are each built
 * by Vite with their own config file. Each config points at a different
 * root directory under src/ and outputs to static/<surface>/build/.
 *
 * In CI (detected via the CI environment variable set by GitHub Actions
 * and most CI providers), typecheck is skipped because it already runs
 * in the dedicated static_analysis job. Locally, typecheck runs first
 * to catch type errors before spending time on Vite builds.
 */
import { execFileSync } from 'node:child_process';

// ---- Typecheck (skipped in CI where it runs in a separate job) ----
const ci = process.env.CI === 'true';

if (!ci) {
  console.log('Running typecheck...');
  execFileSync('npx', ['tsc', '--noEmit'], { stdio: 'inherit' });
} else {
  console.log('CI detected - skipping typecheck (runs in static_analysis job).');
}

// ---- Vite builds (one per Custom UI surface) ----
// Each config builds a self-contained SPA with Atlaskit components and
// outputs to static/<surface>/build/. Forge zips these directories as-is
// during deployment.
const configs = ['vite.config.edit.ts', 'vite.config.admin.ts', 'vite.config.derived-edit.ts'];

for (const config of configs) {
  console.log(`Building ${config}...`);
  execFileSync('npx', ['vite', 'build', '--config', config], { stdio: 'inherit' });
}

console.log('All Custom UI bundles built.');
