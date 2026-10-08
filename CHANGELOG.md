# Changelog

## Unreleased

- `useListScrubber({ topBar: { height } })`: a bar over the top of the list that slides away as the list
  scrolls down and comes back on a scroll up. Draw it with `topBarStyle`; `scrubberProps` and
  `pinnedHeaderProps` keep the scrubber and a pinned header below it. During a thumb drag it stays as it was,
  the drag reaches the first row rather than the space a hidden bar leaves, and the bar slides back in when
  the finger lifts. `scrubber.topBar` has its `height`, `visibleHeight` and `show()`. See the README's "A top
  bar that slides away".
- Breaking: `headerProps` is now `pinnedHeaderProps`, so it isn't confused with a top bar. It also carries the
  pinned header's new `top` prop.
- Breaking: `ListScrubber`'s `insets` take numbers only again. For a header that slides away, use `topBar`
  instead of a shared-value `insets.top`.
- `PinnedSectionHeader` takes `top`: its distance from the top of the list, a number or a shared value.
- With a screen reader on (iOS and Android), the top bar stays in place, so its contents are never reachable
  off screen. The scrubber's screen-reader steps (and web keyboard keys) bring a section to just below the
  bar, and its value and the bubble's label name the rows below the bar, not the ones it covers.

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
