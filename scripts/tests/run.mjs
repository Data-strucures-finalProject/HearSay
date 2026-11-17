import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const browserSuites = ['smoke', 'admin', 'google-link', 'google-profile', 'account-data', 'artist-feed', 'theme'];
const suite = process.argv[2] || 'all';
const selected = suite === 'all' ? ['runtime', 'insights', ...browserSuites] : suite === 'browser' ? browserSuites : [suite];
if (selected.some(name => !['runtime', 'insights'].includes(name) && !browserSuites.includes(name))) {
  throw new Error(`Unknown test suite: ${suite}`);
}
process.chdir('/app');
for (const name of selected) {
  process.stdout.write(`\nRunning ${name} tests\n`);
  const file = name === 'runtime' ? 'runtime.mjs' : name === 'insights' ? 'insights.mjs' : `browser/${name}.mjs`;
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(file, import.meta.url)), ...(name === 'insights' ? ['--browser'] : [])], { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    process.stderr.write(`${name} failed. If test tools are missing, rerun scripts/tests/run.cmd with --setup.\n`);
    process.exit(result.status || 1);
  }
}
process.stdout.write(`\nPassed ${selected.length} test suite(s).\n`);
