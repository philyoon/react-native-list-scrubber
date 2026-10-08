# Changelog

## Unreleased

- Changed: the thumb is drawn 3pt from the list's edge, like a native scroll indicator, instead of centred in
  its 44pt touch area (22pt in). It sits in the margin beside the rows without an `edgeOffset`; its touch area
  stays where it was. New `metrics.thumbEdgeGap` sets the distance; `19` restores the old look. The default
  `bubbleGap` is now 24 (was 40), so the bubble stays as far from the thumb as before.

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
