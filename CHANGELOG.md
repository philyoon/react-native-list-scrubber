# Changelog

## Unreleased

- `onSectionChange`: called when a drag crosses into another section (e.g. a haptic tick per letter).
- Screen-reader value follows manual scrolling (re-read when the handle hides).
- `useListScrubber` returns stable `listProps` / `scrubberProps`.
- Example app: Maestro end-to-end flows on iOS and Android (`npm run e2e`, `npm run e2e:android`), an e2e mode
  that pins the list for them, `?demo=` links, and haptics via `onDragStart` / `onSectionChange`.
- Peer dependencies: `react >=19`, `react-native >=0.78`.
- Performance: section offsets, labels, metrics and the drag gesture keep their identity between renders, so
  they're no longer re-sent to the UI thread on every render (or every drag frame with `labelAt`).
- The screen-reader value calls `labelAt` only when the position changes, not on every render.
- Screen-reader steps use a binary search.
- `onSectionChange` is skipped if `sections` changed and the section no longer exists when it would fire.
- `LIST_SCRUBBER_DEFAULTS` is frozen.
- Removed the unused `children` prop.
- `useListScrubber({ onScroll, onLayout, onContentSizeChange })`: the list's own handlers, called after the
  scrubber's.
- `ListScrubber`: `onDragEnd`, `insets`, `enabled` and `testID` props, and `side` (`'left'` / `'right'`).
- **Breaking:** `right` is replaced by `side` + `edgeOffset`.
- **Breaking (types):** `sections` and `labelAt` are mutually exclusive, and `onSectionChange` requires
  `sections`.

## 0.1.0

- `ListScrubber`: drag handle with a label bubble; drag, scroll and section labels on the UI thread.
- `SectionLabel`: the current section's name for a pinned header, drawn on the UI thread.
- `usePinnedHeaderStyle`: the next section's header pushes the pinned one out.
- `useListScrubber`: list and scrubber props in one hook.
- Screen readers: an adjustable control that steps by section or by screen.
- `LIST_SCRUBBER_DEFAULTS` with `metrics` and `timing` overrides.
- Helpers: `labelProbe`, `sectionIndexAt`.
