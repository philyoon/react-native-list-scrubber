# Changelog

## Unreleased

- `onSectionChange`: called when a drag crosses into another section (e.g. a haptic tick per letter).
- Screen-reader value follows manual scrolling (re-read when the handle hides).
- `useListScrubber` returns stable `listProps` / `scrubberProps`.
- Example app: Maestro end-to-end flows on iOS and Android (`npm run e2e`, `npm run e2e:android`), an e2e mode
  that pins the list for them, `?demo=` links, and haptics via `onDragStart` / `onSectionChange`.
- Peer dependencies: `react >=19`, `react-native >=0.78`.

## 0.1.0

- `ListScrubber`: drag handle with a label bubble; drag, scroll and section labels on the UI thread.
- `SectionLabel`: the current section's name for a pinned header, drawn on the UI thread.
- `usePinnedHeaderStyle`: the next section's header pushes the pinned one out.
- `useListScrubber`: list and scrubber props in one hook.
- Screen readers: an adjustable control that steps by section or by screen.
- `LIST_SCRUBBER_DEFAULTS` with `metrics` and `timing` overrides.
- Helpers: `labelProbe`, `sectionIndexAt`.
