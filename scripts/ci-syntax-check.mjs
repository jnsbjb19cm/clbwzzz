import { access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOTS = ['src', 'server', 'scripts', 'tests'];
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const SKIP_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  'resources',
  'public',
]);

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(directory, output) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) await collectFiles(fullPath, output);
      continue;
    }
    if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) output.push(fullPath);
  }
}

const files = [];
for (const root of ROOTS) {
  if (await exists(root)) await collectFiles(root, files);
}
files.sort((a, b) => a.localeCompare(b));

if (!files.length) {
  console.error('CI syntax check did not find any JavaScript files.');
  process.exit(1);
}

const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    failures.push({
      file,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    });
  }
}

if (failures.length) {
  console.error(`JavaScript syntax check failed in ${failures.length} file(s):`);
  for (const failure of failures) {
    console.error(`\n--- ${failure.file} ---\n${failure.output}`);
  }
  process.exit(1);
}

console.log(`JavaScript syntax check passed for ${files.length} file(s).`);
