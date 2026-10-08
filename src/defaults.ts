import type { ListScrubberColors } from './types';

/** Adjustable sizes (pt). Override any subset with `metrics`. */
export interface ListScrubberMetrics {
  /** Thumb length, longer than a fingertip */
  thumbLength: number;
  /** Idle thumb width, thin so it doesn't cover row content */
  thumbWidth: number;
  /**
   * Gap between the list's edge and the thumb, like a native scroll indicator's: the thumb sits in the margin
   * most lists leave beside their rows. Its touch area is wider, reaching into the list.
   */
  thumbEdgeGap: number;
  /** Width while dragging, shows it's grabbed */
  thumbActiveWidth: number;
  thumbRadius: number;
  /** Bubble height and minimum width, big enough to read a letter beside the finger */
  bubbleSize: number;
  /** Gap between the thumb's touch area and the bubble, so the finger doesn't cover it */
  bubbleGap: number;
  bubbleRadius: number;
  bubblePadding: number;
  /** Font size for short labels (e.g. index letters) */
  bubbleFontSize: number;
  /** Font size for longer labels (e.g. dates), keeps the bubble from getting too wide */
  bubbleLongFontSize: number;
  /** Labels up to this many characters count as short */
  bubbleShortLabelMaxLength: number;
}

/** Adjustable durations (ms). Override any subset with `timing`. */
export interface ListScrubberTiming {
  /** Delay after scrolling or dragging stops before hiding */
  hideAfterMs: number;
  /** Fade in/out duration */
  fadeMs: number;
}

export const LIST_SCRUBBER_DEFAULTS: Readonly<{
  colors: Readonly<ListScrubberColors>;
  metrics: Readonly<ListScrubberMetrics>;
  timing: Readonly<ListScrubberTiming>;
}> = Object.freeze({
  // Neutral greys and blue that read on light and dark backgrounds alike (thumb ≥ 3:1 on white and black)
  colors: Object.freeze({
    thumb: '#8E8E93',
    thumbActive: '#007AFF',
    bubble: '#3A3A3C',
    bubbleText: '#FFFFFF',
  }),
  metrics: Object.freeze({
    thumbLength: 48,
    thumbWidth: 6,
    thumbEdgeGap: 3,
    thumbActiveWidth: 8,
    thumbRadius: 4,
    bubbleSize: 64,
    bubbleGap: 40,
    bubbleRadius: 16,
    bubblePadding: 16,
    bubbleFontSize: 24,
    bubbleLongFontSize: 16,
    bubbleShortLabelMaxLength: 2,
  }),
  timing: Object.freeze({ hideAfterMs: 1500, fadeMs: 150 }),
});

// Fixed values
/** Width of the thumb's touch area, wider than the thumb itself: the 44pt minimum touch target */
export const TOUCH_WIDTH = 44;
/** Screen-reader step without `accessibilitySteps`, as a share of the viewport; the previous screen's last row stays visible */
export const A11Y_PAGE = 0.9;
/**
 * Labels follow the system text size up to this multiple (React Native's `maxFontSizeMultiplier`):
 * the bubble and the pinned header have fixed heights, so the text can't grow without limit.
 * At 1.5×, the bubble's 24pt letters still fit its default 64pt.
 */
export const MAX_FONT_SCALE = 1.5;
/** Below this opacity the thumb counts as hidden and touches pass through to the list */
export const VISIBLE_MIN = 0.01;
/** Distance (pt) treated as "already at this step", so rounding can't keep the reader in place */
export const STEP_SLACK = 1;
/**
 * Fills the parent, like StyleSheet.absoluteFill, spelled out: that's an opaque registered style in older React
 * Native types (0.78), so it can't be spread there, and absoluteFillObject is gone from newer ones.
 */
export const FILL = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const;
