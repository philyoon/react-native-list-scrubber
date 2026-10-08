// Installs the lowest version each peer dependency range allows (">=x.y.z" → x.y.z), without saving, so CI
// can check the library against the oldest versions it claims to support. Reads the ranges from package.json,
// so raising a minimum there changes what's tested. React's companions (react-test-renderer, @types/react)
// follow React's version so npm can resolve the tree.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { peerDependencies } = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
);
const specs = Object.entries(peerDependencies).map(([name, range]) => {
  const min = /^>=\s*(\d+\.\d+\.\d+)$/.exec(range)?.[1];
  if (!min) throw new Error(`${name}: expected a ">=x.y.z" range, got "${range}"`);
  return `${name}@${min}`;
});
const react = /^>=\s*(\d+\.\d+)\.\d+$/.exec(peerDependencies.react)[1];
specs.push(`react-test-renderer@${peerDependencies.react.replace(/^>=\s*/, '')}`, `@types/react@~${react}.0`);

console.log(`Installing ${specs.join(' ')}`);
execFileSync('npm', ['install', '--no-save', ...specs], { stdio: 'inherit' });
