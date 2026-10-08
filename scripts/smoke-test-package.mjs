// Tests the package as users get it: packs it (which builds it), unpacks it into .smoke/node_modules,
// and checks that its entry points exist, that the built modules' relative imports resolve, and that an
// app using every public export typechecks against React Native's strict and legacy types.
// Peer dependencies resolve from the repo's own node_modules (.smoke sits inside the repo).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const smoke = join(root, '.smoke');
const pkgDir = join(smoke, 'node_modules', 'react-native-list-scrubber');
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};
const run = (cmd, args, what) => {
  try {
    return execFileSync(cmd, args, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  } catch (e) {
    fail(`${what}:\n${e.stdout}${e.stderr}`);
  }
};

rmSync(smoke, { recursive: true, force: true });
mkdirSync(pkgDir, { recursive: true });

// 1. Pack (its prepare script builds the package first) and unpack
run('npm', ['pack', '--pack-destination', smoke], 'npm pack failed');
const tarball = readdirSync(smoke).find((f) => f.endsWith('.tgz'));
if (!tarball) fail('npm pack produced no tarball');
run('tar', ['-xzf', join(smoke, tarball), '-C', pkgDir, '--strip-components=1'], 'unpacking failed');
console.log(`✓ packed ${tarball}`);

// 2. Every path the package's entry points name exists
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const targets = [
  pkg.main,
  pkg.types,
  ...Object.values(pkg.exports['.']),
  ...Object.values(pkg.exports['./jest']),
];
for (const target of targets) {
  if (!existsSync(join(pkgDir, target))) fail(`package.json points at ${target}, which isn't in the package`);
}
console.log(`✓ entry points exist (${targets.length})`);

// 3. Relative imports in the built modules resolve (ES modules need the exact file)
const moduleDir = join(pkgDir, 'lib', 'module');
let imports = 0;
for (const file of readdirSync(moduleDir).filter((f) => f.endsWith('.js'))) {
  const code = readFileSync(join(moduleDir, file), 'utf8');
  for (const [, spec] of code.matchAll(/(?:from|import)\s*['"](\.[^'"]+)['"]/g)) {
    imports++;
    if (!existsSync(join(moduleDir, spec))) fail(`lib/module/${file} imports ${spec}, which doesn't exist`);
  }
}
console.log(`✓ relative imports resolve (${imports})`);

// 3b. The Jest mock loads none of the native libraries it stands in for, however deep its imports go
const native = /(?:from|import)\s*['"](react-native-(?:reanimated|worklets|gesture-handler)[^'"]*)['"]/;
const seen = new Set();
const visit = (file) => {
  if (seen.has(file)) return;
  seen.add(file);
  const code = readFileSync(join(moduleDir, file), 'utf8');
  const hit = code.match(native);
  if (hit) fail(`the Jest mock loads ${hit[1]} (through lib/module/${file})`);
  for (const [, spec] of code.matchAll(/(?:from|import)\s*['"]\.\/([^'"]+)['"]/g)) visit(spec);
};
visit('jest.js');
console.log(`✓ the Jest mock loads no native libraries (${seen.size} modules)`);

// 4. An app using every public export typechecks, with strict and with legacy React Native types
writeFileSync(
  join(smoke, 'app.tsx'),
  `import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  CurrentSectionLabel,
  LIST_SCRUBBER_DEFAULTS,
  ListScrubber,
  PinnedSectionHeader,
  listLayout,
  sectionIndexAt,
  sectionListLayout,
  useListScrubber,
  usePinnedSectionHeaderStyle,
  type CurrentSectionLabelProps,
  type ListScrubberColors,
  type ListScrubberMetrics,
  type ListScrubberProps,
  type ListScrubberSection,
  type ListScrubberTiming,
  type ListScrubberTopBar,
  type PinnedSectionHeaderProps,
  type UseListScrubberOptions,
  type UseListScrubberResult,
} from 'react-native-list-scrubber';
import * as mock from 'react-native-list-scrubber/jest';

const colors: ListScrubberColors = { thumb: 'gray', thumbActive: 'blue', bubble: 'black', bubbleText: 'white' };
const metrics: Partial<ListScrubberMetrics> = { thumbLength: LIST_SCRUBBER_DEFAULTS.metrics.thumbLength + 8 };
const timing: Partial<ListScrubberTiming> = { fadeMs: 100 };
type Sections = readonly ListScrubberSection[];
const contacts = [{ name: 'Ada' }, { name: 'Bea' }];
const flat = listLayout(contacts, { label: (c) => c.name[0]!, itemHeight: 64 });
const grouped = sectionListLayout([{ title: 'A', data: contacts }], { itemHeight: 64, sectionHeaderHeight: 32 });
export const layouts: Sections[] = [flat.sections, grouped.sections];

function Scrubber({ scrubber }: { scrubber: UseListScrubberResult<Sections> }) {
  return (
    <ListScrubber
      {...scrubber.scrubberProps}
      colors={colors}
      accessibilityLabel="Scroll position"
      metrics={metrics}
      timing={timing}
      onSectionChange={(index, section) => sectionIndexAt([section.offset], index)}
    />
  );
}

export function WithSections({ sections }: { sections: Sections }) {
  const options: UseListScrubberOptions<Sections> = { sections, topBar: { height: 120 } };
  const scrubber = useListScrubber(options);
  const header: PinnedSectionHeaderProps = { ...scrubber.pinnedHeaderProps, height: 32, push: false };
  const bar: ListScrubberTopBar | undefined = scrubber.topBar;
  const label: CurrentSectionLabelProps = { scrollY: scrubber.scrollY, sections };
  const push = usePinnedSectionHeaderStyle(scrubber.scrollY, sections, 32);
  return (
    <View style={{ flex: 1 }}>
      <Animated.FlatList
        {...scrubber.listProps}
        data={contacts}
        renderItem={() => null}
        getItemLayout={flat.getItemLayout}
      />
      <Animated.View {...scrubber.topBarProps}>
        <View style={{ flex: 1, backgroundColor: 'white' }} />
      </Animated.View>
      <PinnedSectionHeader {...header} top={bar?.visibleHeight} />
      <Animated.View style={push}>
        <CurrentSectionLabel {...label} />
      </Animated.View>
      <Scrubber scrubber={scrubber} />
    </View>
  );
}

export function JumpTo({ sections }: { sections: Sections }) {
  const scrubber = useListScrubber({ sections });
  const jest: typeof import('react-native-list-scrubber') = mock;
  return (
    <View>
      <Animated.FlatList {...scrubber.listProps} data={[]} renderItem={() => null} />
      <Animated.View onTouchEnd={() => scrubber.scrollToSection(0, { animated: true })} />
      <Animated.View onTouchEnd={() => jest.useListScrubber().scrollToOffset(0)} />
    </View>
  );
}

export function WithLabelAt() {
  const scrubber = useListScrubber();
  const props: ListScrubberProps = {
    ...scrubber.scrubberProps,
    colors,
    accessibilityLabel: 'Scroll position',
    labelAt: (position) => String(Math.round(position)),
  };
  return (
    <View style={{ flex: 1 }}>
      <Animated.ScrollView {...scrubber.listProps} />
      <ListScrubber {...props} />
      {/* @ts-expect-error sections and labelAt are mutually exclusive */}
      <ListScrubber {...props} sections={[]} />
    </View>
  );
}
`,
);
const tsc = join(root, 'node_modules', '.bin', 'tsc');
for (const [name, customConditions] of [
  ['strict', ['react-native-strict-api']],
  ['legacy', []],
]) {
  const config = join(smoke, `tsconfig.${name}.json`);
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        jsx: 'react-jsx',
        target: 'esnext',
        lib: ['esnext'],
        module: 'esnext',
        moduleResolution: 'bundler',
        customConditions,
        types: [],
        skipLibCheck: true,
      },
      files: ['app.tsx'],
    }),
  );
  run(tsc, ['-p', config], `an app using the package doesn't typecheck with ${name} React Native types`);
  console.log(`✓ typechecks with ${name} React Native types`);
}

rmSync(smoke, { recursive: true, force: true });
console.log('Package smoke test passed');
