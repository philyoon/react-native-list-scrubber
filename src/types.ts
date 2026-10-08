import type { SharedValue } from 'react-native-reanimated';

/**
 * A bar over the top of the list that slides away as the list scrolls down and comes back on a scroll up
 * (`useListScrubber`'s `topBar` option). The scrubber and a pinned header stay below its visible part.
 */
export interface ListScrubberTopBar {
  /** Its full height (pt) */
  height: number;
  /** How much of it shows now (pt), on the UI thread */
  visibleHeight: SharedValue<number>;
  /** True while it stays in place as the list scrolls (with a screen reader on), on the UI thread */
  isFixed: SharedValue<boolean>;
}

/**
 * A list's layout, as `listLayout` and `sectionListLayout` give it: pass it to `useListScrubber`'s `layout`.
 * Its offsets count from the top of your content; the hook places it below a top bar or pinned header.
 */
export interface ListScrubberLayout<S extends ListScrubberSection = ListScrubberSection> {
  sections: S[];
  /** For FlatList and SectionList (`flatListProps` and `sectionListProps` carry it) */
  getItemLayout: (data: unknown, index: number) => { length: number; offset: number; index: number };
  /** The list draws section headers of its own (a SectionList's): a pinned header sits over them */
  sectionHeaders: boolean;
}

/** A labelled section start, e.g. `{ offset: 0, label: 'A' }`. */
export interface ListScrubberSection {
  /**
   * Where the section starts in the list's content (pt): its header's top, or its first row's.
   * Offsets ascend.
   */
  offset: number;
  label: string;
}

/** Override any subset with `colors`; the rest come from LIST_SCRUBBER_DEFAULTS.colors. */
export interface ListScrubberColors {
  /** Idle thumb; aim for 3:1 contrast against the background */
  thumb: string;
  /** While dragging */
  thumbActive: string;
  bubble: string;
  bubbleText: string;
}
