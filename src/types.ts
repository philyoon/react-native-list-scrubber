/** A labelled section start, e.g. `{ offset: 0, label: 'A' }`. Offsets ascend. */
export interface ListScrubberSection {
  offset: number;
  label: string;
}

export interface ListScrubberColors {
  /** Idle handle; aim for 3:1 contrast against the background */
  thumb: string;
  /** While dragging */
  thumbActive: string;
  bubble: string;
  bubbleText: string;
}
