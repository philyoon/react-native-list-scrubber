// One screen per list type. Each wires the same scrubber the same way: useListScrubber + sections.
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import { FlashList } from '@shopify/flash-list';
import { useMemo, type ComponentType } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  ListScrubber,
  SectionLabel,
  useListScrubber,
  usePinnedHeaderStyle,
  type ListScrubberSection,
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
import { useColors, type Colors } from './theme';

const ROW = 64;
const HEADER = 32;
const CONTACTS = makeContacts(3000);
const ENTRIES = makeEntries(4000);

function Scrubber(props: {
  scrubber: ReturnType<typeof useListScrubber>;
  sections: readonly ListScrubberSection[];
}) {
  const colors = useColors();
  return (
    <ListScrubber
      {...props.scrubber.scrubberProps}
      sections={props.sections}
      colors={{
        thumb: colors.thumb,
        thumbActive: colors.accent,
        bubble: colors.bubble,
        bubbleText: colors.bubbleText,
      }}
      accessibilityLabel="Scroll position"
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

/** Month sections for fixed-height rows, newest first */
function monthSections(entries: Entry[]): ListScrubberSection[] {
  const out: ListScrubberSection[] = [];
  entries.forEach((e, i) => {
    const label = monthLabel(e.date);
    if (out[out.length - 1]?.label !== label) out.push({ offset: i * ROW, label });
  });
  return out;
}

// FlatList: fixed rows via getItemLayout, sections from the first row of each letter,
// and a pinned letter header drawn on the UI thread (SectionLabel).
function FlatListDemo() {
  const colors = useColors();
  const scrubber = useListScrubber();
  const sections = useMemo(() => {
    const out: ListScrubberSection[] = [];
    CONTACTS.forEach((c, i) => {
      const label = c.last[0]!.toUpperCase();
      if (out[out.length - 1]?.label !== label) out.push({ offset: i === 0 ? 0 : HEADER + i * ROW, label });
    });
    return out;
  }, []);
  return (
    <>
      <Animated.FlatList
        {...scrubber.listProps}
        data={CONTACTS}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={<View style={{ height: HEADER }} />}
        renderItem={({ item }) => <ContactRow item={item} colors={colors} />}
        getItemLayout={(_, index) => ({ length: ROW, offset: HEADER + ROW * index, index })}
        // Fill the screen quickly after a jump: a small window, rendered in big batches
        windowSize={5}
        maxToRenderPerBatch={24}
        updateCellsBatchingPeriod={16}
      />
      <View style={[styles.header, styles.pinned, { backgroundColor: colors.header }]} pointerEvents="none">
        <SectionLabel
          scrollY={scrubber.scrollY}
          sections={sections}
          style={{ color: colors.secondary, fontWeight: '700', fontSize: 14 }}
        />
      </View>
      <Scrubber scrubber={scrubber} sections={sections} />
    </>
  );
}

const AnimatedSectionList = Animated.createAnimatedComponent(SectionList<Contact, Section>);

// SectionList with the recommended pinned header: native sticky headers only pin headers that are already
// rendered, so they lag behind scrubber jumps. SectionLabel + usePinnedHeaderStyle draw it on the UI thread,
// and the next header pushes it out like iOS Contacts. getItemLayout counts a header and a footer per section.
function SectionListDemo() {
  const colors = useColors();
  const scrubber = useListScrubber();
  const data = useMemo(() => groupByLetter(CONTACTS), []);
  const { layout, sections } = useMemo(() => {
    const layout: { length: number; offset: number }[] = [];
    const sections: ListScrubberSection[] = [];
    let y = 0;
    for (const s of data) {
      sections.push({ offset: y, label: s.title });
      layout.push({ length: HEADER, offset: y });
      y += HEADER;
      for (let i = 0; i < s.data.length; i++) {
        layout.push({ length: ROW, offset: y });
        y += ROW;
      }
      layout.push({ length: 0, offset: y });
    }
    return { layout, sections };
  }, [data]);
  const push = usePinnedHeaderStyle(scrubber.scrollY, sections, HEADER);
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
        getItemLayout={(_, index) => ({ ...layout[index]!, index })}
      />
      <View style={[styles.pinned, { height: HEADER, overflow: 'hidden' }]} pointerEvents="none">
        <Animated.View style={[styles.header, { backgroundColor: colors.header }, push]}>
          <SectionLabel
            scrollY={scrubber.scrollY}
            sections={sections}
            style={{ color: colors.secondary, fontWeight: '700', fontSize: 14 }}
          />
        </Animated.View>
      </View>
      <Scrubber scrubber={scrubber} sections={sections} />
    </>
  );
}

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList<Entry>);

// FlashList v2 measures rows itself; content height comes from onContentSizeChange.
function FlashListDemo() {
  const colors = useColors();
  const scrubber = useListScrubber();
  const sections = useMemo(() => monthSections(ENTRIES), []);
  return (
    <>
      <AnimatedFlashList
        {...scrubber.listProps}
        data={ENTRIES}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EntryRow item={item} colors={colors} />}
      />
      <Scrubber scrubber={scrubber} sections={sections} />
    </>
  );
}

// Legend List: exact sizes with getFixedItemSize, Reanimated entry point.
function LegendListDemo() {
  const colors = useColors();
  const scrubber = useListScrubber();
  const sections = useMemo(() => monthSections(ENTRIES), []);
  return (
    <>
      <AnimatedLegendList
        {...scrubber.listProps}
        data={ENTRIES}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EntryRow item={item} colors={colors} />}
        getFixedItemSize={() => ROW}
        recycleItems
      />
      <Scrubber scrubber={scrubber} sections={sections} />
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
  const scrubber = useListScrubber();
  const sections = CHAPTERS.map((n) => ({ offset: (n - 1) * CHAPTER, label: `Ch. ${n}` }));
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
      <Scrubber scrubber={scrubber} sections={sections} />
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
  pinned: { position: 'absolute', top: 0, left: 0, right: 0 },
});
