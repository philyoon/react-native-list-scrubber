// Checks that the installed React Native and Worklets versions are ones the installed Reanimated lists as
// compatible (its compatibility.json, New Architecture section). Peer ranges alone don't catch a bad pair:
// Reanimated 4.0 declares Worklets ">=0.3.0" but only runs with 0.4.x, and throws at startup otherwise.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const version = (name) => require(`${name}/package.json`).version;
const reanimated = version('react-native-reanimated');
const reactNative = version('react-native');
const worklets = version('react-native-worklets');

// Keys and values look like "4.1.x" (or "0.81" for React Native): match on the leading numbers
const matches = (pattern, v) => {
  const fixed = pattern.replace(/\.x$/, '').split('.');
  return fixed.every((part, i) => part === v.split('.')[i]);
};

let table;
try {
  table = JSON.parse(readFileSync(require.resolve('react-native-reanimated/compatibility.json'), 'utf8'));
} catch {
  console.error(
    `✗ Reanimated ${reanimated} ships no compatibility.json (it's in 4.1 and later), so this can't be checked`,
  );
  process.exit(1);
}
// Newer versions group entries under "fabric" (New Architecture); 4.1 lists them at the top level
const entry = Object.entries(table.fabric ?? table).find(([key]) => matches(key, reanimated))?.[1];
const problems = [];
if (!entry) problems.push(`Reanimated ${reanimated} has no entry in its compatibility.json`);
else {
  if (!entry['react-native'].some((p) => matches(p, reactNative)))
    problems.push(
      `React Native ${reactNative} isn't listed for Reanimated ${reanimated}: ${entry['react-native'].join(', ')}`,
    );
  if (!entry['react-native-worklets'].some((p) => matches(p, worklets)))
    problems.push(
      `Worklets ${worklets} isn't listed for Reanimated ${reanimated}: ${entry['react-native-worklets'].join(', ')}`,
    );
}
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(
  `✓ Reanimated ${reanimated} lists React Native ${reactNative} and Worklets ${worklets} as compatible`,
);
