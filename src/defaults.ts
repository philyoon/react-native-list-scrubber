/**
 * Adjustable sizes (pt). Override any subset with `metrics`.
 * The thumb is the visible bar; the handle is the draggable touch area around it (44pt wide).
 */
export interface ListScrubberMetrics {
  /** Thumb length (and the handle's), longer than a fingertip */
  thumbLength: number;
  /** Idle thumb width, thin so it doesn't cover row content */
  thumbWidth: number;
  /** Width while dragging, shows it's grabbed */
  thumbActiveWidth: number;
  thumbRadius: number;
  /** Bubble height and minimum width, big enough to read a letter beside the finger */
  bubbleSize: number;
  /** Gap between the handle's touch area and the bubble, so the finger doesn't cover it */
  bubbleGap: number;
  bubbleRadius: number;
  bubblePadding: number;
  /** Font size for short labels (e.g. index letters) */
  bubbleFontSize: number;
  /** Font size for longer labels (e.g. dates), keeps the bubble from getting too wide */
  bubbleLongFontSize: number;
  /** Labels up to this many characters count as short */
  bubbleShortLabelMax: number;
}

/** Adjustable durations (ms). Override any subset with `timing`. */
export interface ListScrubberTiming {
  /** Delay after scrolling or dragging stops before hiding */
  hideAfterMs: number;
  /** Fade in/out duration */
  fadeMs: number;
}

export const LIST_SCRUBBER_DEFAULTS: Readonly<{
  metrics: Readonly<ListScrubberMetrics>;
  timing: Readonly<ListScrubberTiming>;
}> = Object.freeze({
  metrics: Object.freeze({
    thumbLength: 48,
    thumbWidth: 6,
    thumbActiveWidth: 8,
    thumbRadius: 4,
    bubbleSize: 64,
    bubbleGap: 40,
    bubbleRadius: 16,
    bubblePadding: 16,
    bubbleFontSize: 24,
    bubbleLongFontSize: 16,
    bubbleShortLabelMax: 2,
  }),
  timing: Object.freeze({ hideAfterMs: 1500, fadeMs: 150 }),
});

// Fixed values
/** Handle touch width: the 44pt minimum touch target */
export const TOUCH_WIDTH = 44;
/** Screen-reader step without `accessibilitySteps`, as a share of the viewport; the previous screen's last row stays visible */
export const A11Y_PAGE = 0.9;
/** Below this opacity the handle counts as hidden and touches pass through to the list */
export const VISIBLE_MIN = 0.01;
/** Distance (pt) treated as "already at this step", so rounding can't keep the reader in place */
export const STEP_SLACK = 1;
