# Changelog

## 0.4.0

The top bar settles and can be driven from code: a scroll that leaves it partly shown snaps it shown or
hidden, `hide()` joins `show()`, and `onVisibilityChange` tells the app when it's shown or hidden. A thumb
drag to the top no longer brings it back on its own.

### Upgrading from 0.3

No code needs to change. Two defaults of the top bar behave differently; each has an option for 0.3.0's
behaviour:

- A thumb drag that ends at the top of the list leaves the bar as the drag left it, as a drag anywhere else
  does, and a scroll up brings it back. For 0.3.0's behaviour (the list scrolls to the very top and the bar
  slides in when the finger lifts), pass `topBar: { height, revealOnDragToTop: true }`.
- A touch scroll that ends with the bar partly shown settles it (below). For 0.3.0's behaviour, where it stays
  where the scroll left it, pass `topBar: { height, snap: false }`.

### New

- Snap: when a touch scroll ends with the top bar partly shown, the list scrolls the rest of the way, so the
  bar ends up shown if less than half of it was hidden, and hidden otherwise (shown, near the end of the list,
  where there's no room to hide it), as Android's collapsing app bars and iOS's large titles do. Not after a
  thumb drag or scrolling from code, and not on the web, which doesn't say when a scroll ends. On by default:
  `topBar.snap`. Fixes #70.
- `scrubber.topBar.hide()`, beside `show()`: the bar slides out over `revealMs`. Near the top of the list,
  where it covers the space above the rows, the list scrolls down by what shows instead, and the bar follows.
- `topBar: { onVisibilityChange }`: called on the JS thread with `'shown'` or `'hidden'` when the bar ends up
  shown or hidden in full, not while it's part way, e.g. to change the status bar. `topBar.visibleHeight`
  still gives its exact position, on the UI thread.
- `topBar: { revealOnDragToTop }`, off by default (see above).
- `LIST_SCRUBBER_DEFAULTS.topBar` has `snap` and `revealOnDragToTop` beside `revealMs`.

### Fixed

- The Jest mock (`react-native-list-scrubber/jest`): the list header drew the spacer for a top bar or pinned
  header one render late: right after their height changed it still had the old one, or none from a height
  of 0. It now follows in the same render, like the real hook's. Fixes #75.

## 0.3.0

A new, shorter way in: give the hook the list's layout and spread the props named after your list. A top bar
that slides away and a pinned header are now options of the hook, which places them and the list's rows
itself, so each height is written once. See the README's "Usage", now in steps.

### Upgrading from 0.2

- `listLayout` and `sectionListLayout` take `sectionLabel` instead of `label`.
- `useListScrubber`'s result: `headerProps` is now `pinnedHeaderProps`, so it isn't confused with a top bar.
  `listRef`, `onScroll`, `contentHeight` and `viewportHeight` are gone: they're in the spreads already, as
  `listProps.ref`, `listProps.onScroll`, `scrubberProps.contentHeight` and `scrubberProps.viewportHeight`.
  `scrollY` and `isDragging` stay.
- `UseListScrubberResult`'s type parameters are `<S, TList>`, sections first: replace
  `UseListScrubberResult<any, S>` with `UseListScrubberResult<S>`, and `UseListScrubberResult<L, S>` with
  `UseListScrubberResult<S, L>`.
- `ListScrubber`'s `insets` take numbers only again. 0.2.0's shared-value `insets.top` was for a header that
  slides away: use the hook's `topBar` instead.
- Nothing else needs to change: `{ sections }`, `listProps`, `getItemLayout` on the list and wiring by hand
  all work as before. The new path is optional.

### New

- `useListScrubber({ layout })` takes a `listLayout` / `sectionListLayout` result, and the hook returns a
  spread for each list (`flatListProps`, `sectionListProps`, `flashListProps`, `legendListProps`,
  `scrollViewProps`), each with only props that list documents. FlatList's and SectionList's carry the
  layout's `getItemLayout`, so it's no longer passed separately. `listProps` is unchanged, for any other
  scrollable component.
- `useListScrubber({ topBar: { height } })`: a bar over the top of the list (a title, a search field) that
  slides away as the list scrolls down and comes back on a scroll up. Draw it inside a view that spreads
  `topBarProps`. During a thumb drag it stays as it was, the drag reaches the first row rather than the space
  a hidden bar leaves, and a drag that ends at the top scrolls the list to the very top and slides the bar
  back in when the finger lifts (`revealMs`, default 250: `LIST_SCRUBBER_DEFAULTS.topBar.revealMs`).
  `scrubber.topBar` has its `height`, `visibleHeight`, `isFixed` and `show()`.
  - With a screen reader on (iOS and Android) it stays in place, so its contents are never reachable off
    screen. On the web, where a page can't tell, it comes back when something in it gets focus.
- `useListScrubber({ pinnedHeader: { height } })`: `pinnedHeaderProps` carry the pinned header's height and
  placement, so `PinnedSectionHeader`'s `height` is optional. Over a SectionList it sits on the list's own
  headers (layouts now say so, in `sectionHeaders`); over a flat list it takes its own space at the top, the
  scrubber stays below it with no `insets.top`, and it names the rows just below it.
- With a top bar, or a pinned header that takes its own space, the list's spread draws the space they need at
  its top (`scrubber.ListHeader`, `scrubber.spacerHeight`), and the hook places the layout's rows below it.
  Give your own list header to the hook's `ListHeaderComponent`. In a ScrollView, put
  `<scrubber.ListHeader />` first. Development builds warn when the space isn't drawn. Callbacks then get
  copies of your sections with the placed `offset`.
- `scrollToSection` and `scrollToOffset` land just below a top bar (where it will be once it has followed the
  scroll) and a pinned header.
- `PinnedSectionHeader` takes `top`: its distance from the top of the list, a number or a shared value.
- `ListScrubber` takes `maxFontSizeMultiplier` (default 1.5), the cap on the system text size for the bubble's
  label, like `PinnedSectionHeader` and `CurrentSectionLabel`.
- Development builds warn when `useListScrubber`'s `onScroll` is a new function on every render: it's a
  worklet, and each new one rebuilds the list's scroll handler.

### Changed

- `ListScrubber`'s top `insets` count as covered: screen-reader steps (and web keyboard keys) land below them
  and below a top bar, and the screen-reader value and the bubble's label name the rows there, not the ones
  they cover.
- `sections` rebuilt on every render with the same contents count as unchanged: nothing is copied to the UI
  thread again. Development builds still warn, since whatever builds them runs again on each render.

## 0.2.0

- Fixed: a drag ends where the finger lifts. The last stretch of a drag can come only with the finger lifting,
  with no move event for it, and the list stopped a little short: a fast drag to the end of the list could
  miss the last section.
- Changed: the thumb is drawn 3pt from the list's edge, like a native scroll indicator, instead of centred in
  its 44pt touch area (22pt in). It sits in the margin beside the rows without an `edgeOffset`; its touch area
  stays where it was. New `metrics.thumbEdgeGap` sets the distance; `19` restores the old look.
- Changed: `metrics.bubbleGap` is measured from the thumb (as drawn while grabbed), not from its touch area,
  so the bubble moves with `thumbEdgeGap`. The default, 57, keeps the bubble where it was; an app that set it
  to `n` gets the same place with `n + 33`.
- `insets.top` / `insets.bottom` take shared values too, for space that moves, such as a header that slides
  away as the list scrolls: the thumb's track follows on the UI thread, and a drag keeps the track it started
  on.
- `useListScrubber` returns `isDragging`, a shared value set while the thumb is dragged (passed to
  `ListScrubber` in `scrubberProps`, or as its `isDragging` prop), for worklets that react to a drag.
- README: a recipe for a header that slides away; the example app has it as the Collapsible demo.

## 0.1.1

- Fixed: development builds no longer warn that `listProps`' `onLayout` or `onContentSizeChange` never ran
  when the scrubber is given that size itself (`contentHeight` / `viewportHeight` as numbers).
- `react-native-list-scrubber/jest`: `ListScrubber`, `PinnedSectionHeader` and `CurrentSectionLabel` follow
  the scroll position and the list's size, so tests can scroll and check the current section.

## 0.1.0

First release. See the [README](https://github.com/philyoon/react-native-list-scrubber#readme) for usage.

- `ListScrubber`: a draggable thumb with a label bubble. Drag, scroll and labels run on the UI thread.
- `useListScrubber`: wires the list, the scrubber and a pinned header together; `scrollToSection` /
  `scrollToOffset` move the list from code.
- `PinnedSectionHeader`, `CurrentSectionLabel`, `usePinnedSectionHeaderStyle`: the current section pinned over
  the list.
- `listLayout`, `sectionListLayout`: `sections` and `getItemLayout` from row heights.
- Screen-reader control, large-text support, RTL, and a keyboard-operable control on the web.
- `react-native-list-scrubber/jest`: a Jest mock for apps that use the package.
- Works with FlatList, SectionList, ScrollView, FlashList and Legend List. Requires the New Architecture:
  React Native 0.78+, React 19+, Reanimated 4.1+ with Worklets 0.5+, Gesture Handler 2.20+.
