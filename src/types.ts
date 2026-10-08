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
}

/** A labelled section start, e.g. `{ offset: 0, label: 'A' }`. */
export interface ListScrubberSection {
  /** Where the section starts in the list's content (pt): its header's top, or its first row's. Offsets ascend. */
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
