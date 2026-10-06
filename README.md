# react-native-list-scrubber

A draggable thumb for scrubbing through long React Native lists, with a label bubble beside the finger.

<img src="docs/demo.gif" width="320" alt="Dragging the thumb through 3,000 contacts: the bubble and the pinned header follow letter by letter" />

- **Runs on the UI thread.** The drag, the thumb, the list scroll _and the bubble label_ are all driven by
  Reanimated and Gesture Handler. They keep up with your finger even while JS is busy rendering rows.
- **Label bubble.** Pass labelled `sections` (A–Z, months, chapters…). The bubble shows the one under your
  finger, and it reaches the last section even when that section is shorter than a screen.
- **Pinned header.** `PinnedSectionHeader` shows the current section's name in a header pinned above the list.
  Unlike native sticky headers, it doesn't fall behind big jumps, and the next section's header pushes it out,
  like iOS Contacts.
- **Screen readers.** An adjustable "Scroll position" control is always present. Swipe up or down to step to
  the next section, and VoiceOver or TalkBack reads its label.
- **Large text.** Labels follow the system text size up to 1.5×, so they grow without overflowing the bubble
  or the pinned header.
- **Unstyled.** You pass the colours, text and haptics. Sizes and timings have defaults you can override.
- **Works with** FlatList, SectionList, ScrollView, Legend List and FlashList. See
  [Compatibility](#compatibility).

## Install

```sh
npm install react-native-list-scrubber
```

Peer dependencies (already in most Expo apps):

- `react-native-reanimated` ≥ 4 and `react-native-worklets`
- `react-native-gesture-handler` ≥ 2.20, with `GestureHandlerRootView` at your app root

Keep exactly one copy of react-native-gesture-handler, matching your native runtime. Check with
`npm ls react-native-gesture-handler`. A second copy, pulled in by some other package's loose peer range,
crashes at startup.

## Usage

```tsx
import Animated from 'react-native-reanimated';
import { ListScrubber, useListScrubber, type ListScrubberSection } from 'react-native-list-scrubber';

const ROW = 64;

function Contacts({ contacts }: { contacts: Contact[] }) {
  // One section per first letter, at the offset of its first row
  const sections = useMemo(() => {
    const out: ListScrubberSection[] = [];
    contacts.forEach((c, i) => {
      const label = c.name[0]!.toUpperCase();
      if (out.at(-1)?.label !== label) out.push({ offset: i * ROW, label });
    });
    return out;
  }, [contacts]);
  const scrubber = useListScrubber({ sections });

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
        colors={{ thumb: '#7C7A96', thumbActive: '#4F46E5', bubble: '#1C1B3A', bubbleText: '#FFFFFF' }}
        accessibilityLabel="Scroll position"
      />
    </View>
  );
}
```

`listProps` holds `ref`, `onScroll`, `scrollEventThrottle`, `onLayout`, `onContentSizeChange` and hides the
native indicator. If your list needs its own handlers, pass them to the hook and they're called after the
scrubber's:

```tsx
const scrubber = useListScrubber({ onLayout, onContentSizeChange, onScroll: myScrollWorklet });
```

`onScroll` there is a worklet (it runs on the UI thread); keep its identity stable. The hook also returns the
pieces `listProps` and `scrubberProps` are made of (`listRef`, `scrollY`, `onScroll`, `contentHeight`,
`viewportHeight`) for wiring them by hand; all of these are public API.

The list must be an **Animated** component, so the scroll handler runs on the UI thread:

| List                  | Use                                                    |
| --------------------- | ------------------------------------------------------ |
| FlatList / ScrollView | `Animated.FlatList`, `Animated.ScrollView`             |
| SectionList           | `Animated.createAnimatedComponent(SectionList)`        |
| Legend List           | `AnimatedLegendList` from `@legendapp/list/reanimated` |
| FlashList             | `Animated.createAnimatedComponent(FlashList)`          |

### Pinned header

Put section headers in the list (with section `offset`s pointing at them), and pin a copy on top, next to the
list:

```tsx
<PinnedSectionHeader
  {...scrubber.headerProps}
  height={HEADER_HEIGHT}
  style={styles.header}
  textStyle={styles.headerText}
/>
```

`headerProps` carries `scrollY` and the `sections` given to `useListScrubber`, so the header and the scrubber
always read the same sections. (Both components also take `scrollY` and `sections` directly, for wiring by
hand.)

- It shows the current section's label, drawn on the UI thread: it changes in the same frame as the list, even
  during scrubber jumps. It renders every label once and slides them, which suits up to a few hundred
  sections.
- As the next section's header reaches it, it's pushed up and out, like iOS Contacts. If the list has no
  section headers of its own, pass `push={false}`.
- Give the scrubber `insets={{ top: HEADER_HEIGHT }}` to keep the thumb out from under it.
- `testID` names the header (default `list-scrubber-pinned-header`) and its label (`<testID>-label`).
- The label follows the system text size up to `maxFontSizeMultiplier` (default 1.5), since the header's
  height is fixed. Raise it if your header is tall enough for larger text.
- For a custom pinned header, build it from `CurrentSectionLabel` (the label alone; its line height comes from
  the style's `lineHeight` or 1.3 × `fontSize`, scaled with the system text size, or from `height` as is) and
  `usePinnedSectionHeaderStyle(scrollY, sections, height)` (the push, as an animated style).
- With SectionList, turn off `stickySectionHeadersEnabled`: its native sticky headers only pin headers that
  are already rendered, so they lag behind scrubber jumps.

### Labels that aren't sections

`labelAt(position, scrollOffset)` computes any label on the JS thread, for example "42%". It can lag a frame
or two behind a fast drag, so prefer `sections` when the labels are known ahead of time. `position` is the
content offset to describe: it slides from the top of the viewport at the start to its bottom at the end, so
the last rows get a label even when they're shorter than a screen. `scrollOffset` is the raw scroll position.
`sectionIndexAt(starts, y)` does a binary search over ascending section starts, if your labels come from a
list of your own.

## Props

Required:

- `scrollY`, `listRef`, `contentHeight`, `viewportHeight`: from `scrubberProps`.
- `colors`: `thumb`, `thumbActive`, `bubble`, `bubbleText`.
- `accessibilityLabel`: the screen-reader name.

Optional:

- `sections`: `{ offset, label }[]`. `offset` is where the section starts in the list's content, in points
  (its header's top, or its first row's), ascending (development builds warn if they aren't). Drives the
  bubble and the screen-reader steps.
- `labelAt(position, scrollOffset)`: a JS-thread label when there are no `sections`. The types accept one or
  the other.
- `accessibilitySteps`: screen-reader step targets. Default: the section offsets, else one screen. Dragging
  doesn't snap to them.
- `formatAccessibilityPercent`: the screen-reader value when there's no label. Default: `40%`.
- `onDragStart`, `onDragEnd`: the drag started or ended, e.g. for haptics.
- `onSectionChange(index, section)`: with `sections`, the finger crossed into another section while dragging,
  e.g. for a haptic tick.
- `side`: `'left'` or `'right'` edge of the list. Default: `'right'`. For RTL layouts, pass
  `I18nManager.isRTL ? 'left' : 'right'`.
- `edgeOffset`: distance from that edge, negative to sit in a margin outside the list. Default: `0`.
- `insets`: `{ top, bottom }` space the thumb stays out of, e.g. under a pinned header or above a toolbar.
- `enabled`: `false` hides the scrubber and its screen-reader control, keeping its state. Default: `true`.
- `testID`: prefix of the test IDs (`<testID>` for the drag gesture, `-thumb`, `-a11y`, `-label-strip`).
  Default: `list-scrubber`.
- `metrics`, `timing`: partial overrides of the defaults below.
- `bubbleStyle`, `bubbleTextStyle`: extra styles, e.g. a shadow or a font.

### Defaults (`LIST_SCRUBBER_DEFAULTS`)

| `metrics`                               | pt      |                                                     |
| --------------------------------------- | ------- | --------------------------------------------------- |
| `thumbLength`                           | 48      | Longer than a fingertip                             |
| `thumbWidth` / `thumbActiveWidth`       | 6 / 8   | Thin when idle, thicker while grabbed               |
| `thumbRadius`                           | 4       |                                                     |
| `bubbleSize`                            | 64      | Height and minimum width                            |
| `bubbleGap`                             | 40      | Keeps the bubble clear of the finger                |
| `bubbleRadius` / `bubblePadding`        | 16 / 16 |                                                     |
| `bubbleFontSize` / `bubbleLongFontSize` | 24 / 16 | Up to `bubbleShortLabelMax` (2) characters / longer |

| `timing`      | ms   |                                          |
| ------------- | ---- | ---------------------------------------- |
| `hideAfterMs` | 1500 | Delay before hiding once scrolling stops |
| `fadeMs`      | 150  | Fade in and out                          |

The touch width is fixed at 44 pt, the minimum touch target.

## Compatibility

Tested in the example app (Expo SDK 57, React Native 0.86, Reanimated 4.5, Gesture Handler 2.32): by hand on
iOS, and with the [end-to-end tests](#end-to-end-tests) on iOS and Android, which drag the thumb to both ends
of FlatList, SectionList, Legend List and ScrollView. The pinned header, push and section bubble were also
checked by hand on Android, in the app this library came from:

- **FlatList + `getItemLayout`**: exact. Bubble, pinned header and rows agree in every frame.
- **ScrollView**: exact.
- **Legend List + `getFixedItemSize`**: exact.
- **SectionList + `getItemLayout`**: exact. Use the pinned header above instead of native sticky headers,
  which lag behind big jumps.
- **FlashList v2**: works, but positions are estimates. FlashList sizes unmeasured rows at 200 pt and has no
  prop for real sizes, so on unvisited parts of a long list the thumb and labels can be off.

The scrubber needs to know where things are. Lists that measure rows as they render, such as FlatList without
`getItemLayout` or variable-height rows, give estimated positions.

During very fast drags a list can show blank rows for a moment while JS renders them. The scrubber itself
never waits for that. For FlatList, a small `windowSize` with a large `maxToRenderPerBatch` fills the screen
fastest after a jump.

## Limits

- **Vertical lists only.** Horizontal lists aren't supported.
- **No automatic RTL mirroring.** The thumb stays on `side`; pick the side from `I18nManager.isRTL`.
- **Inverted lists** aren't handled: the thumb follows the content offset, not the visual direction.
- **Web: works, with limits.** Checked in the example app on Expo web (React Native Web 0.21) in desktop
  Chromium: the thumb appears on scroll, dragging scrolls every list type, and the bubble, pinned header and
  screen-reader value follow. The screen-reader control is a Tab stop there: ↓/→ and ↑/← step like a screen
  reader, Page Down/Up move one screen, Home/End go to the ends. With no separate UI thread on web, everything
  runs on JS. Not tested on mobile browsers.
- `PinnedSectionHeader` renders every section label once, so it suits up to a few hundred sections.

## Example app

```sh
cd example
npm install
npx expo start
```

It opens in Expo Go and has one screen per list type. It uses the library source from `../src`.

### End-to-end tests

[Maestro](https://maestro.dev) flows in `example/e2e` drive the example in Expo Go on an iOS simulator or an
Android emulator: dragging the thumb to the end and back on each list type, touches passing through the hidden
thumb, and the screen-reader control. They run on iPhone SE, iPhone 17 Pro, iPhone 17 Pro Max and a Pixel 8
emulator.

Start Metro in e2e mode and keep it running:

```sh
cd example
npm run start:e2e
```

Then, with Expo Go installed on the device:

```sh
npm run e2e                 # iOS simulator
adb reverse tcp:8081 tcp:8081
npm run e2e:android         # Android emulator
```

With more than one device running, Maestro may pick the wrong one: add `--device <udid or emulator-5554>`, for
example `npx maestro --device emulator-5554 test -e APP_ID=host.exp.exponent e2e`.

How the flows find the thumb: it is hidden from screen readers, so Maestro, which finds elements through the
accessibility tree, can't target it, and Maestro's swipe points are fixed screen percentages. In e2e mode
(`EXPO_PUBLIC_E2E=1`) the example pins its list to fixed percentages of the screen (`example/src/e2e.ts`), so
the same points land on the thumb on any phone size. It also keeps the thumb up for 5 s instead of 1.5 s,
since Maestro's wait after each swipe can outlast the default on a slow device. A link like
`exp://127.0.0.1:8081/--/?demo=ScrollView` opens a given demo.

## License

MIT
