# API principles

How this library's API is designed. Check a new option, prop or behaviour against these before adding it, and
in review. When two principles pull apart, the earlier one wins.

## 1. Doing nothing does the right thing

The defaults are the product. An app that spreads the hook's props and sets nothing else should get what most
apps want: the right place, size, colours, timing and accessibility.

- If most apps would set an option, change its default instead.
- If apps would compute a value from things the library already knows, the library computes it. A default that
  needs a formula in the app is a bug.
- Examples: the thumb sits `thumbEdgeGap` from the list's edge, in the margin most lists leave beside their
  rows, so `edgeOffset` is `0` and usually stays that way. Right-to-left layouts mirror on iOS and Android
  without a prop. Labels follow the system text size.
- The defaults are public (`LIST_SCRUBBER_DEFAULTS`), and grouped options take partial overrides (`metrics`,
  `timing`): changing one value never means restating the others.

## 2. Spreads carry the wiring

The hook owns the state. The parts get it through spreads (`listProps`, `scrubberProps`, the pinned header's
props), which carry every value they need to agree on. Apps don't copy values from one component to another.

- A new value that two parts must share goes into the spreads, not into the docs as a step for apps.
- The pieces the spreads are made of (`listRef`, `scrollY`, the height shared values) are public too, for
  wiring by hand. That's the escape hatch, not the main path.
- App handlers are passed to the hook and called after the library's (`onScroll`, `onLayout`,
  `onContentSizeChange`), so a spread never has to be taken apart to add one.

## 3. One fact, one place

No two inputs that must agree. If they can disagree, one day they will.

- `listLayout` computes the sections and `getItemLayout` from the same row heights.
- A component takes `sections` or `labelAt`, never both; the types enforce it.
- Derive instead of asking: a range, an offset or a size the library can work out from what it has isn't an
  option.

## 4. One coordinate system

Every offset is in points from the top of the list's content: `sections[].offset`, `scrollToOffset`,
`listLayout`'s offsets. Never from the top of the screen or of what's visible. Where something covers the
list, like a top bar, the library works out what lies below it; that's never a second kind of offset for apps
to convert.

## 5. Complexity lives in the library

The example app and the README's snippets show the API, not workarounds. If a demo needs a calculation, a
shared value or an effect to look right, that's a feature the library is missing: move it into the library and
leave the demo a few lines long.

## 6. Name what people see

Names describe what's on screen and what it's measured from, not how it's built.

- Distances say where they're measured from: `thumbEdgeGap` (from the list's edge), `bubbleGap` (from the
  thumb), `insets` (from the list's top and bottom).
- Where React Native has a name for something, use it: `onLayout`, `testID`, `accessibilityLabel`,
  `maxFontSizeMultiplier`, `style` and `textStyle`.
- Suffixes: `*Props` is an object to spread, `*Style` a style, `on*` a callback, `*Ms` a duration in
  milliseconds. Distances, sizes and offsets are in points and carry no suffix.
- Booleans: `is*` is for state the library sets and you read (`isDragging`). Options you set are plain words,
  as in React Native (`enabled`, `animated`, `push`).
- What you call to make something happen is a verb (`scrollToSection`, `show`); what computes a value is named
  for the value (`listLayout`, `sectionIndexAt`); hooks are `use*`.
- Groups of overrides are named for what they hold and take a partial object: `colors`, `metrics`, `timing`.
- Exported types start with `ListScrubber` (`ListScrubberSection`), except a component's props
  (`<Component>Props`) and the hook's `UseListScrubberOptions` and `UseListScrubberResult`. Constants are
  `UPPER_SNAKE_CASE` (`LIST_SCRUBBER_DEFAULTS`).
- The same thing has the same name everywhere: in the props, the hook's result, the types and the docs.

## 7. Types follow your data

- Your data keeps its type through the API: extra fields on a section (`{ offset, label, id }`) reach
  `onSectionChange` typed.
- Options that rule each other out are enforced by the types, not checked at runtime (`sections` or
  `labelAt`).
- Type a new API so that misusing it doesn't compile.

## 8. The finger never waits for JS

Anything that follows a touch or a scroll runs on the UI thread: the drag, the list scroll and the bubble
label. Values that change while scrolling are shared values, so measuring the list doesn't re-render the app's
component. A callback that runs on the UI thread is a worklet, and the docs say so.

## 9. Accessible by default

Accessibility isn't an option to turn on.

- The screen-reader control is always there, and steps through sections.
- `accessibilityLabel` is required, so it's always in the app's language.
- On web, the same control is a keyboard stop.
- Respect the user's settings: text follows the system size (up to 1.5×), layouts mirror for right-to-left
  languages, and animations keep Reanimated's default of following the system's reduce motion setting. Don't
  override it.
- A new visual feature answers: what does a screen reader user get, and what does a keyboard user get?

## 10. Behave like the platform

When in doubt, do what the platform's own apps do: a pinned header pushed out by the next one, like iOS
Contacts; a thumb drawn where a native scroll indicator is; an indicator that fades when scrolling stops.
Where iOS and Android differ, follow each.

## 11. Small scope

This is a scrubber that works with any list. It isn't a list, and it isn't an A–Z index.

- Work with FlatList, SectionList, ScrollView, Legend List and FlashList, rather than wrapping one.
- Text and haptics are the app's: no built-in strings, no haptics dependency. The library gives the moments
  (`onDragStart`, `onSectionChange`) and the app does the rest.
- Compose, don't configure: a new feature is a new piece that plugs into the spreads (like
  `PinnedSectionHeader` and `CurrentSectionLabel`), not more props on the scrubber.
- Say what isn't supported (see the README's Limits) rather than half-supporting it.

## 12. No runtime dependencies

Only peer dependencies: the React Native platform the app already has. CI checks the lowest versions the peer
ranges allow. Adding a dependency or raising a minimum needs a reason in the pull request.

## 13. Warn in development, stay quiet in production

Bad input (sections out of order, an empty label, sections rebuilt on every render) gets a warning in
development builds, behind `__DEV__`. Production never throws: it does the best it can with what it's given.

## 14. Testable from the app

Apps can test their screens without the library's native parts: `react-native-list-scrubber/jest` is a mock
with the same shapes as the real thing, and the test IDs (`testID` and its suffixes) stay stable. A change to
the API changes the mock and the test IDs in the same pull request.

## 15. Change boldly before 1.0

Until 1.0, a simpler API beats a compatible one. A breaking change is fine when it makes the API simpler or
removes a way to get it wrong.

- Mark it `Breaking:` in `CHANGELOG.md`, with what to change in the app.
- Don't keep a deprecated alias around.
- Docs-only changes don't bump the version.

## 16. Prove it

- A test for a fix fails on the old code.
- Coverage stays at 100%, on the newest and the oldest peer versions CI checks.
- Anything on screen is checked on screen: the Maestro flows on iOS and Android, the Playwright tests on web.
