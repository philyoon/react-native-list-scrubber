// One screen per list type. Each wires the same scrubber the same way: useListScrubber + sections.
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';
import { useMemo, type ComponentType } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
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
import { useColors, type Colors } from './theme';

const ROW = 64;
const HEADER = 32;
const CONTACTS = makeContacts(3000);
const ENTRIES = makeEntries(4000);

/** useListScrubber given sections: its scrubberProps and headerProps carry them */
type SectionScrubber = UseListScrubberResult<any, readonly ListScrubberSection[]>;

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

/** The current month pinned over the list, so the bubble's month matches something on screen (rows only show the day) */
function MonthHeader(props: { scrubber: SectionScrubber }) {
  const colors = useColors();
  return (
    <PinnedSectionHeader
      {...props.scrubber.headerProps}
      height={HEADER}
      push={false}
      style={[styles.header, { backgroundColor: colors.header }]}
      textStyle={{ color: colors.secondary, fontWeight: '700', fontSize: 14 }}
    />
  );
}

/** Month sections for fixed-height rows under a HEADER spacer, newest first */
function monthSections(entries: Entry[]): ListScrubberSection[] {
  return listLayout(entries, { label: (e) => monthLabel(e.date), itemHeight: ROW, listHeaderHeight: HEADER })
    .sections;
}

// FlatList: fixed rows via getItemLayout, sections from the first row of each letter,
// and a pinned letter header drawn on the UI thread (PinnedSectionHeader; the list has no headers to push it).
function FlatListDemo() {
  const colors = useColors();
  const { sections, getItemLayout } = useMemo(
    () =>
      listLayout(CONTACTS, {
        label: (c) => c.last[0]!.toUpperCase(),
        itemHeight: ROW,
        listHeaderHeight: HEADER,
      }),
    [],
  );
  const scrubber = useListScrubber({ sections });
  return (
    <>
      <Animated.FlatList
        {...scrubber.listProps}
        data={CONTACTS}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={<View style={{ height: HEADER }} />}
        renderItem={({ item }) => <ContactRow item={item} colors={colors} />}
        getItemLayout={getItemLayout}
        // Fill the screen quickly after a jump: a small window, rendered in big batches
        windowSize={5}
        maxToRenderPerBatch={24}
        updateCellsBatchingPeriod={16}
      />
      <PinnedSectionHeader
        {...scrubber.headerProps}
        height={HEADER}
        push={false}
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
// and the next header pushes it out like iOS Contacts. sectionListLayout counts a header and a footer per section.
function SectionListDemo() {
  const colors = useColors();
  const data = useMemo(() => groupByLetter(CONTACTS), []);
  const { sections, getItemLayout } = useMemo(
    () => sectionListLayout(data, { itemHeight: ROW, sectionHeaderHeight: HEADER }),
    [data],
  );
  const scrubber = useListScrubber({ sections });
  return (
    <>
      <AnimatedSectionList
        {...scrubber.listProps}
        sections={data}
        keyExtractor={(c) => c.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={[styles.header, { backgroundColor: colors.header }]}>
            <Text style={{ color: colors.secondary, fontWeight: '700' }}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => <ContactRow item={item} colors={colors} />}
        getItemLayout={getItemLayout}
      />
      <PinnedSectionHeader
        {...scrubber.headerProps}
        height={HEADER}
        style={[styles.header, { backgroundColor: colors.header }]}
        textStyle={{ color: colors.secondary, fontWeight: '700', fontSize: 14 }}
      />
      <Scrubber scrubber={scrubber} />
    </>
  );
}

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList<Entry>);

// FlashList v2 measures rows itself; content height comes from onContentSizeChange.
function FlashListDemo() {
  const colors = useColors();
  const sections = useMemo(() => monthSections(ENTRIES), []);
  const scrubber = useListScrubber({ sections });
  return (
    <>
      <AnimatedFlashList
        {...scrubber.listProps}
        data={ENTRIES}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={<View style={{ height: HEADER }} />}
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
  const sections = useMemo(() => monthSections(ENTRIES), []);
  const scrubber = useListScrubber({ sections });
  return (
    <>
      <AnimatedLegendList
        {...scrubber.listProps}
        data={ENTRIES}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EntryRow item={item} colors={colors} />}
        ListHeaderComponent={<View style={{ height: HEADER }} />}
        getFixedItemSize={() => ROW}
        recycleItems
      />
      <MonthHeader scrubber={scrubber} />
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
  const { sections } = useMemo(
    () => listLayout(CHAPTERS, { label: (n) => `Ch. ${n}`, itemHeight: CHAPTER }),
    [],
  );
  const scrubber = useListScrubber({ sections });
  return (
    <>
      <Animated.ScrollView {...scrubber.listProps}>
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
});
