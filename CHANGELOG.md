# Changelog

## 0.1.0

First release.

- `ListScrubber`: a draggable thumb with a label bubble beside the finger. The drag, the thumb, the list
  scroll and the bubble's section label all run on the UI thread (Reanimated + Gesture Handler), so they keep
  up while JS is busy. It appears on scroll and hides a moment after.
- `sections` (`{ offset, label }[]`) drive the bubble, picked and drawn on the UI thread; `labelAt` is the JS
  fallback for labels that aren't known ahead of time. The two are mutually exclusive in the types.
- `useListScrubber`: one hook for the list and the scrubber, returning `listProps`, `scrubberProps` and
  `headerProps` to spread, so the scrubber and a pinned header read the same sections. The list's own
  `onScroll`, `onLayout` and `onContentSizeChange` go through it. Measuring the list doesn't re-render the
  component calling it.
- `scrollToSection(index)` and `scrollToOffset(y)` from the hook move the list from code, e.g. for a tappable
  A–Z index (the example app's Index screen).
- `listLayout` and `sectionListLayout`: compute `sections` and the list's `getItemLayout` from row heights,
  for flat lists and SectionList.
- `PinnedSectionHeader`: the current section's label pinned over the list, drawn on the UI thread so it keeps
  up with scrubber jumps, and pushed out by the next section's header like iOS Contacts. `CurrentSectionLabel`
  and `usePinnedSectionHeaderStyle` build custom ones.
- Light on the JS thread: the bubble and the pinned header show the current section in one native text field,
  its text set on the UI thread with no React render, so lists with thousands of sections stay cheap. The
  bubble sizes itself to its widest label, laid out once while the app is idle, and a list that grows a page
  at a time measures only the new labels, in batches, so even thousands of labels never make one long JS task.
  Inline `colors` or text styles don't cause re-renders, and with `labelAt` a busy JS thread handles one call
  at a time with the newest position instead of a backlog of drag frames.
- Screen readers: an adjustable control that steps by section (or `accessibilitySteps`, or one screen) and
  reads the section label or a percentage. On the web it's a keyboard Tab stop (arrows, Page Up/Down,
  Home/End).
- Large text: labels follow the system text size up to 1.5×.
- Right-to-left layouts mirror on iOS and Android without any change; on the web, pass `side="left"`.
- Customisation: `colors`, `metrics` and `timing`, each overridable one value at a time
  (`LIST_SCRUBBER_DEFAULTS`); `side`, `edgeOffset`, `insets`, `enabled`, `testID`, bubble styles;
  `onDragStart`, `onDragEnd` and `onSectionChange` for haptics (its `section` keeps your sections' own type,
  extra fields included).
- Development warnings for sections that aren't ascending, finite or labelled, for `sections` rebuilt on every
  render, and for a list whose `listProps` handlers never ran (so the scrubber would stay hidden).
- `react-native-list-scrubber/jest`: a Jest mock for testing apps that use the package, with no Reanimated,
  Worklets or Gesture Handler needed.
- Works with FlatList, SectionList, ScrollView, FlashList and Legend List. Requires React Native's New
  Architecture: React Native 0.78+, React 19+, Reanimated 4.1+ with Worklets 0.5+ (a pair Reanimated
  supports), and Gesture Handler 2.20+. CI checks the oldest of these as well as the newest.
