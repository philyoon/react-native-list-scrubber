# Changelog

## Unreleased

- Development builds warn when the list has been mounted a few seconds but the `onLayout` or
  `onContentSizeChange` from `listProps` never ran (a prop after `{...listProps}` replaced it, or the props
  weren't spread on the list): the scrubber stayed hidden without a word.
- `onSectionChange`'s `section` has your sections' own type, extra fields included (`ListScrubberProps<S>`).
- Peer dependencies: `react-native-reanimated >=4.1.0` (was `>=4.0.0`). Reanimated 4.0 only runs with Worklets
  0.4, which lacks the functions this library uses, so it never worked; nobody who could use the package
  before is dropped.
- `useListScrubber` returns `scrollToSection(index)` and `scrollToOffset(y)`, to move the list from code (e.g.
  a tappable A–Z index), without animating by default. The example app's Index screen shows it.
- `react-native-list-scrubber/jest`: a Jest mock for testing apps that use the package, with no Reanimated,
  Worklets or Gesture Handler needed.
- Development builds warn when `sections` keeps arriving as a new array with the same contents (not memoized).
- README: a Troubleshooting section.
- `listLayout` and `sectionListLayout`: compute `sections` and the list's `getItemLayout` from row heights,
  for flat lists and SectionList.
- Performance: the section bubble and `PinnedSectionHeader` / `CurrentSectionLabel` draw the current section
  in one native text field, its text set on the UI thread (no React render), instead of mounting every section
  label and sliding them. The bubble still fits its widest label: each distinct label is laid out once,
  invisibly, once the app is idle (or the thumb shows), then unmounted; new labels are measured on their own,
  200 per commit, so thousands of them never make one long JS task. **Breaking (test IDs):** the bubble's
  label is `<testID>-label` (was `-label-strip`), and `CurrentSectionLabel`'s is `<testID>-text` (was
  `-strip`); they hold the shown label as the field's text, not one text per section.
- `colors` is optional, and each colour can be overridden on its own; defaults are in
  `LIST_SCRUBBER_DEFAULTS.colors`.
- Performance: measuring the list no longer re-renders the component calling `useListScrubber`; only
  `ListScrubber` re-renders.
- **Breaking:** `useListScrubber` returns `contentHeight` and `viewportHeight` as shared values (read them
  with `.get()`). `ListScrubber` accepts numbers or shared values for both.
- Development builds also warn about section offsets or `accessibilitySteps` that aren't finite numbers, and
  about empty section labels.
- Screen-reader actions other than increment and decrement are ignored (they used to step back).
- Fix: the bubble widens to fit long labels; on Android, "Jul 2025" was cut to "Ju…".
- Web: no more "props.pointerEvents is deprecated" warning; `pointerEvents` is set in styles (React Native
  0.78+ supports it there on every platform).
- `onSectionChange`: called when a drag crosses into another section (e.g. a haptic tick per letter).
- Screen-reader value follows manual scrolling (re-read when the thumb hides).
- `useListScrubber` returns stable `listProps` / `scrubberProps`.
- Example app: Maestro end-to-end flows on iOS and Android (`npm run e2e:ios`, `npm run e2e:android`), an e2e
  mode that pins the list for them, `?demo=` links, and haptics via `onDragStart` / `onSectionChange`.
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
- **Breaking:** `labelAt(position, scrollOffset)` receives the content position to describe, already
  converted; `labelProbe` is no longer exported.
- `PinnedSectionHeader`: the pinned header in one component (container, clipping, push).
- **Breaking:** `SectionLabel` is renamed `CurrentSectionLabel` and `usePinnedHeaderStyle`
  `usePinnedSectionHeaderStyle`; both stay exported for custom headers.
- **Breaking:** `steps` and `formatPercent` are renamed `accessibilitySteps` and `formatAccessibilityPercent`:
  they only affect screen readers.
- **Breaking:** `railWidth` is removed. The thumb is centred in its 44 pt touch area (it was centred off a 20
  pt rail it didn't sit in), about 3 pt closer to the edge than before; use `edgeOffset` to move it. The
  screen-reader control now covers the same 44 pt strip (it was 20 pt).
- **Breaking:** the `list-scrubber-handle` test ID is now `list-scrubber-thumb` (`<testID>-thumb`): the docs
  call the draggable control the thumb throughout.
- `PinnedSectionHeader` and `CurrentSectionLabel` take a `testID`. **Breaking:** `CurrentSectionLabel`'s strip
  is `<testID>-strip` (`list-scrubber-section-label-strip`), no longer the scrubber bubble's
  `list-scrubber-label-strip`, so the two don't share an ID.
- Large system text sizes: labels follow the system text size up to 1.5× (`maxFontSizeMultiplier` on
  `CurrentSectionLabel` and `PinnedSectionHeader`), and `CurrentSectionLabel` sizes its rows from the scaled
  text. Before, large text was clipped, or showed parts of two labels.
- The screen-reader value is set with `aria-valuetext` (same value on iOS and Android), so React Native Web
  exposes it too; it was empty on web. The README describes what works on web.
- Web: the screen-reader control is keyboard-operable: a Tab stop where the arrows step (like a screen
  reader), Page Up/Down move one screen and Home/End go to the ends. iOS and Android are unchanged.
- `useListScrubber({ sections })`: the hook carries the sections into `scrubberProps` and a new `headerProps`
  (`scrollY` + `sections`) for `PinnedSectionHeader`, so the scrubber and the header can't be given different
  ones. Passing `sections` to either component directly still works.
- Development builds warn (once per array) when `sections` or `accessibilitySteps` aren't in ascending order:
  they're looked up by binary search, so out of order the wrong section showed without a hint.
- Types: `UseListScrubberOptions`, `UseListScrubberResult` (the hook's result, named),
  `PinnedSectionHeaderProps` and `CurrentSectionLabelProps` are exported.
- `onSectionChange`'s parameters are typed when `sections` come in a spread (`{...scrubber.scrubberProps}`);
  before, strict TypeScript rejected `(index, section) => …` there as implicitly `any`.
- The package includes `CHANGELOG.md`. CI tests the packed package (`npm run smoke:package`): its entry
  points, the built modules' imports, and an app using every export, typechecked with strict and legacy React
  Native types.
- Right-to-left: the bubble no longer disappears in RTL web layouts (it was placed with flex alignment, which
  flips in RTL while React Native Web keeps `left`/`right`, so it landed off-screen). The docs no longer say
  to flip `side` for RTL: React Native already mirrors `left`/`right` on iOS and Android, so that flipped it
  twice. A README section describes RTL on each platform.
- Performance: the section bubble's labels (all of them, rendered at once) no longer re-render when the thumb
  shows or hides or a drag starts or ends. The strip is memoized, and `colors` and `bubbleTextStyle` are
  compared by value, so inline objects don't defeat it.
- Performance: `PinnedSectionHeader` / `CurrentSectionLabel` compare their text style by value, so an inline
  `textStyle={{…}}` no longer re-renders every section label each time the app renders.
- Performance: with `labelAt`, a busy JS thread no longer collects one stale call per drag frame. One call is
  in flight at a time; frames arriving meanwhile only keep the newest offset, sent when JS has answered.
- **Breaking:** `metrics.bubbleShortLabelMax` is renamed `bubbleShortLabelMaxLength` (labels up to this many
  characters count as short).
- Section bubble: each label gets its own font size by its length, so one long label no longer shrinks every
  letter.
- **Breaking:** `right` is replaced by `side` + `edgeOffset`.
- **Breaking (types):** `sections` and `labelAt` are mutually exclusive. (`onSectionChange` is accepted with
  either and fires only with `sections`, so its parameters are typed even when `sections` arrive in a spread.)

## 0.1.0

- `ListScrubber`: drag handle with a label bubble; drag, scroll and section labels on the UI thread.
- `SectionLabel`: the current section's name for a pinned header, drawn on the UI thread.
- `usePinnedHeaderStyle`: the next section's header pushes the pinned one out.
- `useListScrubber`: list and scrubber props in one hook.
- Screen readers: an adjustable control that steps by section or by screen.
- `LIST_SCRUBBER_DEFAULTS` with `metrics` and `timing` overrides.
- Helpers: `labelProbe`, `sectionIndexAt`.
