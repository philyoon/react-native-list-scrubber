// Prints the CHANGELOG.md section for a version (the lines under `## <version>`, up to the next `## `), for
// the GitHub Release the Release workflow creates. Fails if there's no such section or it's empty, so a
// version can't be released without notes.
//   node scripts/release-notes.mjs 0.1.1
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version>');
  process.exit(1);
}
const changelog = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'CHANGELOG.md'), 'utf8');
const lines = changelog.split('\n');
// The heading may carry more after the version, e.g. "## 0.1.1 – 2026-10-20"
const start = lines.findIndex((line) =>
  new RegExp(`^## v?${version.replace(/\./g, '\\.')}(\\s|$)`).test(line),
);
if (start < 0) {
  console.error(`CHANGELOG.md has no "## ${version}" section. Add the release notes before tagging.`);
  process.exit(1);
}
const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
const notes = lines
  .slice(start + 1, end < 0 ? undefined : end)
  .join('\n')
  .trim();
if (!notes) {
  console.error(`CHANGELOG.md's "## ${version}" section is empty.`);
  process.exit(1);
}
console.log(notes);
