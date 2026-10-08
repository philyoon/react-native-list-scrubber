// One screen per list type. Each wires the same scrubber the same way: useListScrubber + sections.
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';
import { useMemo, type ComponentType } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import {
  ListScrubber,
  PinnedSectionHeader,
  listLayout,
  sectionListLayout,
  useListScrubber,
  type ListScrubberSection,
  type UseListScrubberResult,
} from 'react-native-list-scrubber';
import {
  dayLabel,
  groupByLetter,
  makeContacts,
  makeEntries,
  monthLabel,
  type Contact,
  type Entry,
  type Section,
} from './data';
import { E2E, E2E_TIMING } from './e2e';

// The web tests (web-e2e/) open the page with ?side=left for the scrubber on the left edge,
// as an RTL page would
const WEB_SIDE =
  Platform.OS === 'web' && new URLSearchParams(globalThis.location?.search).get('side') === 'left'
    ? 'left'
    : 'right';
import { useColors, type Colors } from './theme';

const ROW = 64;
const HEADER = 32;
const CONTACTS = makeContacts(3000);
const ENTRIES = makeEntries(4000);

/** useListScrubber given sections: its scrubberProps and pinnedHeaderProps carry them */
type SectionScrubber = UseListScrubberResult<readonly ListScrubberSection[]>;

function Scrubber(props: { scrubber: SectionScrubber }) {
  const colors = useColors();
  return (
    <ListScrubber
      {...props.scrubber.scrubberProps}
      colors={{
        thumb: colors.thumb,
        thumbActive: colors.accent,
        bubble: colors.bubble,
        bubbleText: colors.bubbleText,
      }}
      accessibilityLabel="Scroll position"
      side={WEB_SIDE}
      timing={E2E ? E2E_TIMING : undefined}
      onDragStart={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      // A tick per section crossed, like the iOS Contacts index
      onSectionChange={() => Haptics.selectionAsync()}
    />
  );
}

function ContactRow({ item, colors }: { item: Contact; colors: Colors }) {
  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <View style={[styles.avatar, { backgroundColor: colors.header }]}>
        <Text style={{ color: colors.accent, fontWeight: '700' }}>{item.last[0]}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.rowText, { color: colors.text }]}>
        {item.name}
      </Text>
    </View>
  );
}

function EntryRow({ item, colors }: { item: Entry; colors: Colors }) {
  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[styles.rowText, { color: colors.text }]}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.secondary, fontSize: 13 }}>
          {dayLabel(item.date)}
        </Text>
      </View>
    </View>
  );
}

/**
 * The current month pinned over the list, so the bubble's month matches something on screen
 * (rows only show the day)
 */
function MonthHeader(props: { scrubber: SectionScrubber }) {
  const colors = useColors();
  return (
    <PinnedSectionHeader
      {...props.scrubber.pinnedHeaderProps}
      style={[styles.header, { backgroundColor: colors.header }]}
      textStyle={{ color: colors.secondary, fontWeight: '700', fontSize: 14 }}
    />
  );
}

/** Month sections for fixed-height rows, newest first */
function monthLayout(entries: Entry[]) {
  return listLayout(entries, { sectionLabel: (e) => monthLabel(e.date), itemHeight: ROW });
}

/**
 * For FlatList and SectionList: fill the screen quickly after a jump (a drag, or scrollToSection from the
 * index). The list scrolls on the UI thread at once; the rows there render on JS, so until then it is blank.
 * A small window rendered in big batches keeps that short.
 */
const FAST_FILL = { windowSize: 5, maxToRenderPerBatch: 24, updateCellsBatchingPeriod: 16 } as const;

// FlatList: fixed rows via getItemLayout, sections from the first row of each letter, and a pinned letter
// header drawn on the UI thread. The list has no headers of its own, so the pinned one takes its own space
// at the top: the list's spread draws it, and the scrubber stays below it.
function FlatListDemo() {
  const colors = useColors();
  const layout = useMemo(
    () => listLayout(CONTACTS, { sectionLabel: (c) => c.last[0]!.toUpperCase(), itemHeight: ROW }),
    [],
  );
  const scrubber = useListScrubber({ layout, pinnedHeader: { height: HEADER } });
  return (
    <>
      <Animated.FlatList
        {...scrubber.flatListProps}
        data={CONTACTS}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <ContactRow item={item} colors={colors} />}
        {...FAST_FILL}
      />
      <PinnedSectionHeader
        {...scrubber.pinnedHeaderProps}
        style={[styles.header, { backgroundColor: colors.header }]}
        textStyle={{ color: colors.secondary, fontWeight: '700', fontSize: 14 }}
      />
      <Scrubber scrubber={scrubber} />
    </>
  );
}

const AnimatedSectionList = Animated.createAnimatedComponent(SectionList<Contact, Section>);

// SectionList with the recommended pinned header: native sticky headers only pin headers that are already
// rendered, so they lag behind scrubber jumps. PinnedSectionHeader draws it on the UI thread,
// and the next header pushes it out like iOS Contacts.
// sectionListLayout counts a header and a footer per section.
function SectionListDemo() {
  const colors = useColors();
  const data = useMemo(() => groupByLetter(CONTACTS), []);
  const layout = useMemo(
    () => sectionListLayout(data, { itemHeight: ROW, sectionHeaderHeight: HEADER }),
    [data],
  );
  const scrubber = useListScrubber({ layout, pinnedHeader: { height: HEADER } });
  return (
    <>
      <AnimatedSectionList
        {...scrubber.sectionListProps}
        sections={data}
        keyExtractor={(c) => c.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={[styles.header, { backgroundColor: colors.header }]}>
            <Text style={{ color: colors.secondary, fontWeight: '700' }}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => <ContactRow item={item} colors={colors} />}
        {...FAST_FILL}
      />
      <PinnedSectionHeader
        {...scrubber.pinnedHeaderProps}
        style={[styles.header, { backgroundColor: colors.header }]}
        textStyle={{ color: colors.secondary, fontWeight: '700', fontSize: 14 }}
      />
      <Scrubber scrubber={scrubber} />
    </>
  );
}

// A tappable A–Z index above a SectionList, like iOS Contacts: each letter calls scrubber.scrollToSection,
// which jumps on the UI thread. The jump lands the section's header under the pinned one, and the scrubber,
// the pinned header and the screen-reader value all follow.
function IndexDemo() {
  const colors = useColors();
  const data = useMemo(() => groupByLetter(CONTACTS), []);
  const layout = useMemo(
    () => sectionListLayout(data, { itemHeight: ROW, sectionHeaderHeight: HEADER }),
    [data],
  );
  const scrubber = useListScrubber({ layout, pinnedHeader: { height: HEADER } });
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.index, { borderColor: colors.border }]}
        contentContainerStyle={styles.indexContent}
      >
        {layout.sections.map((section, i) => (
          <Pressable
            key={section.label}
            onPress={() => scrubber.scrollToSection(i)}
            accessibilityRole="button"
            accessibilityLabel={`Jump to ${section.label}`}
            testID={`index-${section.label}`}
            style={({ pressed }) => [styles.indexLetter, pressed && { backgroundColor: colors.header }]}
          >
            <Text style={{ color: colors.accent, fontWeight: '700' }}>{section.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={{ flex: 1 }}>
        <AnimatedSectionList
          {...scrubber.sectionListProps}
          sections={data}
          keyExtractor={(c) => c.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={[styles.header, { backgroundColor: colors.header }]}>
              <Text style={{ color: colors.secondary, fontWeight: '700' }}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => <ContactRow item={item} colors={colors} />}
          {...FAST_FILL}
        />
        <PinnedSectionHeader
          {...scrubber.pinnedHeaderProps}
          style={[styles.header, { backgroundColor: colors.header }]}
          textStyle={{ color: colors.secondary, fontWeight: '700', fontSize: 14 }}
        />
        <Scrubber scrubber={scrubber} />
      </View>
    </>
  );
}

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList<Entry>);

// FlashList v2 measures rows itself; content height comes from onContentSizeChange.
function FlashListDemo() {
  const colors = useColors();
  const layout = useMemo(() => monthLayout(ENTRIES), []);
  const scrubber = useListScrubber({ layout, pinnedHeader: { height: HEADER } });
  return (
    <>
      <AnimatedFlashList
        {...scrubber.flashListProps}
        data={ENTRIES}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EntryRow item={item} colors={colors} />}
      />
      <MonthHeader scrubber={scrubber} />
      <Scrubber scrubber={scrubber} />
    </>
  );
}

// Legend List: exact sizes with getFixedItemSize, Reanimated entry point.
function LegendListDemo() {
  const colors = useColors();
  const layout = useMemo(() => monthLayout(ENTRIES), []);
  const scrubber = useListScrubber({ layout, pinnedHeader: { height: HEADER } });
  return (
    <>
      <AnimatedLegendList
        {...scrubber.legendListProps}
        data={ENTRIES}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EntryRow item={item} colors={colors} />}
        getFixedItemSize={() => ROW}
        recycleItems
      />
      <MonthHeader scrubber={scrubber} />
      <Scrubber scrubber={scrubber} />
    </>
  );
}

/** The top bar's height */
const BAR = 120;

// A top bar (title, count, search field) over the list that slides away as it scrolls down and comes back on
// a scroll up: useListScrubber's `topBar`. The list's spread draws the space the bar and the pinned letter
// header need at its top; scrubberProps and pinnedHeaderProps keep both below the bar's visible part.
function CollapsibleDemo() {
  const colors = useColors();
  const layout = useMemo(
    () => listLayout(CONTACTS, { sectionLabel: (c) => c.last[0]!.toUpperCase(), itemHeight: ROW }),
    [],
  );
  const scrubber = useListScrubber({ layout, topBar: { height: BAR }, pinnedHeader: { height: HEADER } });
  return (
    <>
      <Animated.FlatList
        {...scrubber.flatListProps}
        data={CONTACTS}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <ContactRow item={item} colors={colors} />}
        {...FAST_FILL}
      />
      <PinnedSectionHeader
        {...scrubber.pinnedHeaderProps}
        style={[styles.header, { backgroundColor: colors.header }]}
        textStyle={{ color: colors.secondary, fontWeight: '700', fontSize: 14 }}
      />
      <Animated.View {...scrubber.topBarProps} testID="collapsible-header">
        <View style={[styles.bar, { backgroundColor: colors.card }]}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>Contacts</Text>
          <Text style={{ color: colors.secondary }}>3,000 people</Text>
          <TextInput
            placeholder="Search"
            placeholderTextColor={colors.secondary}
            style={[styles.search, { backgroundColor: colors.header, color: colors.text }]}
            testID="collapsible-search"
          />
        </View>
      </Animated.View>
      <Scrubber scrubber={scrubber} />
    </>
  );
}

const CHAPTER = 420;
const CHAPTERS = Array.from({ length: 60 }, (_, i) => i + 1);
const LOREM =
  'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump. ';

// ScrollView: a long document with fixed-height chapters.
function ScrollViewDemo() {
  const colors = useColors();
  const layout = useMemo(
    () => listLayout(CHAPTERS, { sectionLabel: (n) => `Ch. ${n}`, itemHeight: CHAPTER }),
    [],
  );
  const scrubber = useListScrubber({ layout });
  return (
    <>
      <Animated.ScrollView {...scrubber.scrollViewProps}>
        {CHAPTERS.map((n) => (
          <View key={n} style={{ height: CHAPTER, padding: 20 }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 8 }}>
              Chapter {n}
            </Text>
            <Text style={{ color: colors.secondary, fontSize: 15, lineHeight: 22 }} numberOfLines={14}>
              {LOREM.repeat(6)}
            </Text>
          </View>
        ))}
      </Animated.ScrollView>
      <Scrubber scrubber={scrubber} />
    </>
  );
}

export const DEMOS: { name: string; hint: string; Component: ComponentType }[] = [
  { name: 'FlatList', hint: '3,000 contacts A–Z, pinned letter header', Component: FlatListDemo },
  {
    name: 'SectionList',
    hint: 'Pinned header pushed out by the next one',
    Component: SectionListDemo,
  },
  { name: 'FlashList', hint: 'Positions are estimates until rows are measured', Component: FlashListDemo },
  { name: 'Legend List', hint: '4,000 entries by month, exact sizes', Component: LegendListDemo },
  { name: 'ScrollView', hint: '60 chapters', Component: ScrollViewDemo },
  { name: 'Index', hint: 'Tap a letter to jump: scrollToSection', Component: IndexDemo },
  { name: 'Collapsible', hint: 'A top bar that slides away as you scroll', Component: CollapsibleDemo },
];

const styles = StyleSheet.create({
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingRight: 32,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowText: { fontSize: 16, fontWeight: '500' },
  header: { height: HEADER, justifyContent: 'center', paddingHorizontal: 16 },
  bar: { flex: 1, paddingHorizontal: 16, paddingTop: 12, gap: 4 },
  search: { height: 36, borderRadius: 10, paddingHorizontal: 12, marginTop: 8 },
  index: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  indexContent: { paddingHorizontal: 8, paddingVertical: 4 },
  // 44pt tall: the minimum touch target
  indexLetter: { minWidth: 32, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
