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

## 4. Complexity lives in the library

The example app and the README's snippets show the API, not workarounds. If a demo needs a calculation, a
shared value or an effect to look right, that's a feature the library is missing: move it into the library and
leave the demo a few lines long.

## 5. Name what people see

Names describe what's on screen and what it's measured from, not how it's built.

- Distances say where they're measured from: `thumbEdgeGap` (from the list's edge), `bubbleGap` (from the
  thumb), `insets` (from the list's top and bottom).
- Suffixes: `*Props` is an object to spread, `*Style` a style, `on*` a callback, `is*` a boolean, `*Ms` a
  duration in milliseconds. Lengths are in points and carry no suffix.
- The same thing has the same name everywhere: in the props, the hook's result, the types and the docs.

## 6. The finger never waits for JS

Anything that follows a touch or a scroll runs on the UI thread: the drag, the list scroll and the bubble
label. Values that change while scrolling are shared values, so measuring the list doesn't re-render the app's
component. A callback that runs on the UI thread is a worklet, and the docs say so.

## 7. Accessible by default

Accessibility isn't an option to turn on.

- The screen-reader control is always there, and steps through sections.
- `accessibilityLabel` is required, so it's always in the app's language.
- On web, the same control is a keyboard stop.
- A new visual feature answers: what does a screen reader user get, and what does a keyboard user get?

## 8. Behave like the platform

When in doubt, do what the platform's own apps do: a pinned header pushed out by the next one, like iOS
Contacts; a thumb drawn where a native scroll indicator is; an indicator that fades when scrolling stops.
Where iOS and Android differ, follow each.

## 9. Small scope

This is a scrubber that works with any list. It isn't a list, and it isn't an A–Z index.

- Work with FlatList, SectionList, ScrollView, Legend List and FlashList, rather than wrapping one.
- Text and haptics are the app's: no built-in strings, no haptics dependency. The library gives the moments
  (`onDragStart`, `onSectionChange`) and the app does the rest.
- Say what isn't supported (see the README's Limits) rather than half-supporting it.

## 10. Change boldly before 1.0

Until 1.0, a simpler API beats a compatible one. A breaking change is fine when it makes the API simpler or
removes a way to get it wrong.

- Mark it `Breaking:` in `CHANGELOG.md`, with what to change in the app.
- Don't keep a deprecated alias around.
- Docs-only changes don't bump the version.

## 11. Prove it

- A test for a fix fails on the old code.
- Coverage stays at 100%, on the newest and the oldest peer versions CI checks.
- Anything on screen is checked on screen: the Maestro flows on iOS and Android, the Playwright tests on web.
