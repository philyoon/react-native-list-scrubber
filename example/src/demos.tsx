// One screen per list type. Each wires the same scrubber the same way: useListScrubber + sections.
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';
import { useMemo, type ComponentType } from 'react';
import { Platform, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
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

// The web tests (web-e2e/) open the page with ?side=left for the scrubber on the left edge, as an RTL page would
const WEB_SIDE =
  Platform.OS === 'web' && new URLSearchParams(globalThis.location?.search).get('side') === 'left'
    ? 'left'
    : 'right';
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

/**
 * For FlatList and SectionList: fill the screen quickly after a jump (a drag, or scrollToSection from the
 * index). The list scrolls on the UI thread at once; the rows there render on JS, so until then it is blank.
 * A small window rendered in big batches keeps that short.
 */
const FAST_FILL = { windowSize: 5, maxToRenderPerBatch: 24, updateCellsBatchingPeriod: 16 } as const;

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
        {...FAST_FILL}
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
        {...FAST_FILL}
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

// A tappable A–Z index above a SectionList, like iOS Contacts: each letter calls scrubber.scrollToSection,
// which jumps on the UI thread. The jump lands the section's header under the pinned one, and the scrubber,
// the pinned header and the screen-reader value all follow.
function IndexDemo() {
  const colors = useColors();
  const data = useMemo(() => groupByLetter(CONTACTS), []);
  const { sections, getItemLayout } = useMemo(
    () => sectionListLayout(data, { itemHeight: ROW, sectionHeaderHeight: HEADER }),
    [data],
  );
  const scrubber = useListScrubber({ sections });
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.index, { borderColor: colors.border }]}
        contentContainerStyle={styles.indexContent}
      >
        {sections.map((section, i) => (
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
          {...FAST_FILL}
        />
        <PinnedSectionHeader
          {...scrubber.headerProps}
          height={HEADER}
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

/** The collapsible header's height */
const BAR = 120;

// A screen header drawn over the list that slides away as you scroll down and comes back on a scroll up
// ("diff-clamp"), stays hidden while the thumb is dragged, and is shown at the top of the list. Only a
// transform moves: the list starts with a spacer as tall as the header and the pinned letter header, so row
// offsets never change. The scrubber's track starts below the header (an animated `insets.top`), and the
// pinned letter header sits below it and names the section of the rows it covers.
function CollapsibleDemo() {
  const colors = useColors();
  const { sections, getItemLayout } = useMemo(
    () =>
      listLayout(CONTACTS, {
        label: (c) => c.last[0]!.toUpperCase(),
        itemHeight: ROW,
        listHeaderHeight: BAR + HEADER,
      }),
    [],
  );
  const scrubber = useListScrubber({ sections });
  const { scrollY, isDragging } = scrubber;
  /** How much of the header is hidden: 0 to BAR */
  const hidden = useSharedValue(0);
  /** The header is sliding back in after a drag */
  const revealing = useSharedValue(false);
  useAnimatedReaction(
    () => Math.max(0, scrollY.get()), // pull-to-refresh and iOS bounce don't move it
    (y, prev) => {
      // Frozen while the thumb is dragged, like the thumb's own track (big jumps would show and hide it), even at
      // the top of the list: it comes back when the finger lifts (below). Otherwise always shown at the very top
      if (isDragging.get()) return;
      // The drag's last scroll can arrive as the header slides back: it mustn't stop the slide
      else if (revealing.get()) return;
      else if (prev !== null) hidden.set(Math.min(Math.max(hidden.get() + y - prev, 0), BAR, y));
    },
  );
  // Back when the finger lifts, as other apps' headers come back once you're done scrolling
  useAnimatedReaction(
    () => isDragging.get(),
    (dragging, was) => {
      if (!was || dragging) return;
      revealing.set(true);
      hidden.set(
        withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) }, () => revealing.set(false)),
      );
    },
  );
  /** The header's visible height: the space it covers at the top of the list */
  const shown = useDerivedValue(() => BAR - hidden.get());
  // What the pinned letter header covers: the list's content just below the collapsible header
  const headerScrollY = useDerivedValue(() => scrollY.get() + shown.get());
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -hidden.get() }] }));
  const pinnedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: shown.get() }] }));
  return (
    <>
      <Animated.FlatList
        {...scrubber.listProps}
        data={CONTACTS}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={<View style={{ height: BAR + HEADER }} />}
        renderItem={({ item }) => <ContactRow item={item} colors={colors} />}
        getItemLayout={getItemLayout}
        windowSize={5}
        maxToRenderPerBatch={24}
        updateCellsBatchingPeriod={16}
      />
      <Animated.View style={[styles.overlay, { height: HEADER }, pinnedStyle]}>
        <PinnedSectionHeader
          scrollY={headerScrollY}
          sections={sections}
          height={HEADER}
          push={false}
          style={[styles.header, { backgroundColor: colors.header }]}
          textStyle={{ color: colors.secondary, fontWeight: '700', fontSize: 14 }}
        />
      </Animated.View>
      <Animated.View
        style={[styles.overlay, styles.bar, { height: BAR, backgroundColor: colors.card }, barStyle]}
        testID="collapsible-header"
      >
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>Contacts</Text>
        <Text style={{ color: colors.secondary }}>3,000 people</Text>
        <View style={[styles.search, { backgroundColor: colors.header }]}>
          <Text style={{ color: colors.secondary }}>Search</Text>
        </View>
      </Animated.View>
      <ListScrubber
        {...scrubber.scrubberProps}
        insets={{ top: shown }}
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
        onSectionChange={() => Haptics.selectionAsync()}
      />
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
  { name: 'Index', hint: 'Tap a letter to jump: scrollToSection', Component: IndexDemo },
  { name: 'Collapsible', hint: 'A header that slides away as you scroll', Component: CollapsibleDemo },
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
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  bar: { paddingHorizontal: 16, paddingTop: 12, gap: 4 },
  search: { height: 36, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 12, marginTop: 8 },
  index: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  indexContent: { paddingHorizontal: 8, paddingVertical: 4 },
  // 44pt tall: the minimum touch target
  indexLetter: { minWidth: 32, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
