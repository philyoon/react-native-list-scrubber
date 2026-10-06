# react-native-list-scrubber

A drag handle for scrubbing through long React Native lists, with a label bubble beside the finger.

<img src="docs/demo.gif" width="320" alt="Dragging the handle through 3,000 contacts: the bubble and the pinned header follow letter by letter" />

- **Runs on the UI thread.** The drag, the handle, the list scroll *and the bubble label* are all driven by Reanimated and Gesture Handler. They keep up with your finger even while JS is busy rendering rows.
- **Label bubble.** Pass labelled `sections` (A–Z, months, chapters…). The bubble shows the one under your finger, and it reaches the last section even when that section is shorter than a screen.
- **Pinned header.** `SectionLabel` draws the current section's name, for a header pinned above the list. Unlike native sticky headers, it doesn't fall behind big jumps. `usePinnedHeaderStyle` lets the next section's header push it out, like iOS Contacts.
- **Screen readers.** An adjustable "Scroll position" control is always present. Swipe up or down to step to the next section, and VoiceOver or TalkBack reads its label.
- **Unstyled.** You pass the colours, text and haptics. Sizes and timings have defaults you can override.
- **Works with** FlatList, SectionList, ScrollView, Legend List and FlashList. See [Compatibility](#compatibility).

## Install

```sh
npm install react-native-list-scrubber
```

Peer dependencies (already in most Expo apps):

- `react-native-reanimated` ≥ 4 and `react-native-worklets`
- `react-native-gesture-handler` ≥ 2.20, with `GestureHandlerRootView` at your app root

Keep exactly one copy of react-native-gesture-handler, matching your native runtime. Check with `npm ls react-native-gesture-handler`. A second copy, pulled in by some other package's loose peer range, crashes at startup.

## Usage

```tsx
import Animated from 'react-native-reanimated';
import { ListScrubber, useListScrubber, type ListScrubberSection } from 'react-native-list-scrubber';

const ROW = 64;

function Contacts({ contacts }: { contacts: Contact[] }) {
  const scrubber = useListScrubber();

  // One section per first letter, at the offset of its first row
  const sections = useMemo(() => {
    const out: ListScrubberSection[] = [];
    contacts.forEach((c, i) => {
      const label = c.name[0]!.toUpperCase();
      if (out.at(-1)?.label !== label) out.push({ offset: i * ROW, label });
    });
    return out;
  }, [contacts]);

  return (
    <View style={{ flex: 1 }}>
      <Animated.FlatList
        {...scrubber.listProps}
        data={contacts}
        renderItem={renderContact}
        getItemLayout={(_, index) => ({ length: ROW, offset: ROW * index, index })}
      />
      <ListScrubber
        {...scrubber.scrubberProps}
        sections={sections}
        colors={{ thumb: '#7C7A96', thumbActive: '#4F46E5', bubble: '#1C1B3A', bubbleText: '#FFFFFF' }}
        accessibilityLabel="Scroll position"
      />
    </View>
  );
}
```

`listProps` holds `ref`, `onScroll`, `scrollEventThrottle`, `onLayout`, `onContentSizeChange` and hides the native indicator. If your list needs its own `onLayout` or `onContentSizeChange`, wire the pieces yourself: `useListScrubber()` also returns `listRef`, `scrollY` and `onScroll`, and `ListScrubber` takes `contentHeight` and `viewportHeight` directly.

The list must be an **Animated** component, so the scroll handler runs on the UI thread:

| List | Use |
|---|---|
| FlatList / ScrollView | `Animated.FlatList`, `Animated.ScrollView` |
| SectionList | `Animated.createAnimatedComponent(SectionList)` |
| Legend List | `AnimatedLegendList` from `@legendapp/list/reanimated` |
| FlashList | `Animated.createAnimatedComponent(FlashList)` |

### Pinned header

Put section headers in the list (with section `offset`s pointing at them), and pin a copy on top:

```tsx
const push = usePinnedHeaderStyle(scrubber.scrollY, sections, HEADER_HEIGHT);

<View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_HEIGHT, overflow: 'hidden' }} pointerEvents="none">
  <Animated.View style={[styles.header, push]}>
    <SectionLabel scrollY={scrubber.scrollY} sections={sections} style={styles.headerText} />
  </Animated.View>
</View>
```

- `SectionLabel` renders every label once in a column and slides it from the UI thread. It changes in the same frame as the list and survives React re-renders. That suits up to a few hundred sections. Its line height comes from the style's `lineHeight` (or 1.3 × `fontSize`), or set `height`.
- `usePinnedHeaderStyle` pushes the pinned header up as the next section's header reaches it, instead of swapping the letter underneath.
- With SectionList, turn off `stickySectionHeadersEnabled`: its native sticky headers only pin headers that are already rendered, so they lag behind scrubber jumps.

### Labels that aren't sections

`labelAt(offset)` computes any label on the JS thread, for example "42%". It can lag a frame or two behind a fast drag, so prefer `sections` when the labels are known ahead of time. Two helpers come from the same logic: `labelProbe(offset, contentHeight, viewportHeight)` gives the content position to describe, and `sectionIndexAt(starts, y)` does a binary search over section starts.

## Props

| Prop | Default | |
|---|---|---|
| `scrollY`, `listRef`, `contentHeight`, `viewportHeight` | required | From `scrubberProps` |
| `colors` | required | `thumb`, `thumbActive`, `bubble`, `bubbleText` |
| `accessibilityLabel` | required | Screen-reader name |
| `sections` | none | `{ offset, label }[]`, ascending. Bubble and screen-reader steps |
| `labelAt(offset)` | none | JS-thread label when there are no `sections` |
| `steps` | section offsets, else one screen | Screen-reader step targets |
| `formatPercent` | `40%` | Screen-reader value when there's no label |
| `onDragStart` | none | E.g. haptics |
| `right` | `0` | Negative to sit in a margin outside the list |
| `railWidth` | `20` | Width of the handle's strip |
| `metrics`, `timing` | see below | Partial overrides |
| `bubbleStyle`, `bubbleTextStyle` | none | Extra styles (shadow, font) |

### Defaults (`LIST_SCRUBBER_DEFAULTS`)

| `metrics` | pt | |
|---|---|---|
| `thumbLength` | 48 | Longer than a fingertip |
| `thumbWidth` / `thumbActiveWidth` | 6 / 8 | Thin when idle, thicker while grabbed |
| `thumbRadius` | 4 | |
| `bubbleSize` | 64 | Height and minimum width |
| `bubbleGap` | 40 | Keeps the bubble clear of the finger |
| `bubbleRadius` / `bubblePadding` | 16 / 16 | |
| `bubbleFontSize` / `bubbleLongFontSize` | 24 / 16 | Up to `bubbleShortLabelMax` (2) characters / longer |

| `timing` | ms | |
|---|---|---|
| `hideAfterMs` | 1500 | Delay before hiding once scrolling stops |
| `fadeMs` | 150 | Fade in and out |

The touch width is fixed at 44 pt, the minimum touch target.

## Compatibility

Tested on iOS in the example app (Expo SDK 57, React Native 0.86, Reanimated 4.5, Gesture Handler 2.32). The pinned header, push and section bubble were also checked on Android, in the app this library came from:

| List | Result |
|---|---|
| FlatList + `getItemLayout` | Exact. Bubble, pinned header and rows agree in every frame |
| ScrollView | Exact |
| Legend List + `getFixedItemSize` | Exact |
| SectionList + `getItemLayout` | Exact. Use the pinned header above instead of native sticky headers, which lag behind big jumps |
| FlashList v2 | Works, but positions are estimates. FlashList sizes unmeasured rows at 200 pt and has no prop for real sizes, so on unvisited parts of a long list the handle and labels can be off |

The scrubber needs to know where things are. Lists that measure rows as they render, such as FlatList without `getItemLayout` or variable-height rows, give estimated positions.

During very fast drags a list can show blank rows for a moment while JS renders them. The scrubber itself never waits for that. For FlatList, a small `windowSize` with a large `maxToRenderPerBatch` fills the screen fastest after a jump.

## Example app

```sh
cd example
npm install
npx expo start
```

It opens in Expo Go and has one screen per list type. It uses the library source from `../src`.

## License

MIT
