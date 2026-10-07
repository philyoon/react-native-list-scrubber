# Changelog

## 0.1.0

First release. See the [README](README.md) for usage.

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
