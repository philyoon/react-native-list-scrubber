/** A frame gap that counts as smooth (ms): a little over one at 60 Hz */
const SMOOTH_FRAME_MS = 25;
const FRAME_MS = 1000 / 60;
/** How long to keep counting frames after letting a scroll through (ms): the long frame it causes is later */
const KEEP_COUNTING_MS = 300;

/**
 * Runs a callback once JS has been free for about as long as it was busy (JS thread): each frame longer than
 * SMOOTH_FRAME_MS adds its overrun to a debt, each smooth frame pays it off, and the callback waits until
 * the debt is paid. Frames are counted only while a callback waits, a debt is left, or shortly after one ran.
 */
export class ScrollPacer {
  private debt = 0;
  private last = 0;
  private waiting: (() => void) | null = null;
  private running = false;
  private until = 0;

  afterIdle(callback: () => void): void {
    this.waiting = callback;
    if (this.running) return;
    this.running = true;
    this.last = 0;
    requestAnimationFrame(this.tick);
  }

  cancel(): void {
    this.waiting = null;
    this.debt = 0;
    this.until = 0;
  }

  private tick = (t: number): void => {
    if (this.last > 0) {
      const gap = t - this.last;
      if (gap > SMOOTH_FRAME_MS) this.debt += gap - FRAME_MS;
      else this.debt = Math.max(0, this.debt - gap);
    }
    this.last = t;
    const callback = this.waiting;
    if (callback && this.debt <= 0) {
      this.waiting = null;
      this.until = t + KEEP_COUNTING_MS;
      callback();
    }
    if (this.waiting || this.debt > 0 || t < this.until) requestAnimationFrame(this.tick);
    else this.running = false;
  };
}
