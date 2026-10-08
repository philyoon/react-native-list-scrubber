// The example's web build in a browser: what unit tests can't see (real layout) and the native e2e can't
// reach (mouse, keyboard, RTL pages). Run with npm run web:e2e.
import { expect, test, type Page } from '@playwright/test';

/** Opens a demo; `rtl` makes the page right-to-left before the app loads, `side` is the ?side= option */
async function open(page: Page, demo: string, options: { rtl?: boolean; side?: 'left' } = {}) {
  await page.goto(`/?demo=${encodeURIComponent(demo)}${options.side ? `&side=${options.side}` : ''}`);
  await expect(page.getByTestId('list-scrubber-a11y')).toBeAttached();
  // React Native Web lays out by the page's direction, and follows a change to it
  if (options.rtl) await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
}

/** The pinned header's label: the section at the top of the list, as the user sees it */
const header = (page: Page) => page.getByTestId('list-scrubber-pinned-header').locator('input');

/** The thumb only shows once the list scrolls: scroll a little, then return its centre */
async function showThumb(page: Page) {
  // Over the middle of the list, whichever edge the scrubber is on
  const rail = (await page.getByTestId('list-scrubber-a11y').boundingBox())!;
  await page.mouse.move(page.viewportSize()!.width / 2, rail.y + rail.height / 2);
  await page.mouse.wheel(0, 100);
  const thumb = page.getByTestId('list-scrubber-thumb');
  await expect(thumb).toHaveCSS('opacity', '1');
  const t = (await thumb.boundingBox())!;
  return { x: t.x + t.width / 2, y: t.y + t.height / 2, left: t.x, right: t.x + t.width };
}

/** Presses on the thumb and moves to y, without letting go */
async function grab(page: Page, from: { x: number; y: number }, toY: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, toY, { steps: 20 });
}

/** The bubble while dragging: its box, and the label it shows */
async function bubble(page: Page) {
  // The label is a read-only text field whose text the UI thread sets (SectionText)
  return page.getByTestId('list-scrubber-label').evaluate((input: HTMLInputElement) => {
    const box = input.parentElement!.parentElement!.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      label: input.value,
      clipped: input.scrollWidth > input.clientWidth,
      viewport: document.documentElement.clientWidth,
    };
  });
}

// Any warning or error in the console fails the test (React Native Web warns about deprecated props there)
let messages: string[];
test.beforeEach(({ page }) => {
  messages = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') messages.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));
});
test.afterEach(() => expect(messages).toEqual([]));

test('drags to the end of the list and back', async ({ page }) => {
  await open(page, 'FlatList');
  await expect(page.getByText('Ada Abby')).toBeInViewport();
  const thumb = await showThumb(page);
  await grab(page, thumb, page.viewportSize()!.height);
  await page.mouse.up();
  await expect(header(page)).toHaveValue('Z');
  await expect(page.getByText('Ada Abby')).not.toBeInViewport();

  const end = (await page.getByTestId('list-scrubber-thumb').boundingBox())!;
  await grab(page, { x: end.x + end.width / 2, y: end.y + end.height / 2 }, 0);
  await page.mouse.up();
  await expect(page.getByText('Ada Abby')).toBeInViewport();
});

test('the bubble shows the whole label, beside the thumb', async ({ page }) => {
  // Month labels like "Jul 2025" were once cut to "Ju…"
  await open(page, 'Legend List');
  const thumb = await showThumb(page);
  await grab(page, thumb, thumb.y + 200);
  const b = await bubble(page);
  await page.mouse.up();
  expect(b.label).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
  expect(b.clipped).toBe(false);
  expect(b.right).toBeLessThanOrEqual(thumb.left);
  expect(b.left).toBeGreaterThanOrEqual(0);
});

test('on a right-to-left page the bubble stays on screen beside the thumb', async ({ page }) => {
  // React Native Web keeps left/right as written, so the thumb stays at the right edge; the bubble once
  // landed off-screen here
  await open(page, 'FlatList', { rtl: true });
  const thumb = await showThumb(page);
  expect(thumb.right).toBeGreaterThan(page.viewportSize()!.width * 0.8);
  await grab(page, thumb, thumb.y + 200);
  const b = await bubble(page);
  await page.mouse.up();
  expect(b.label).toMatch(/^[A-Z]$/);
  expect(b.right).toBeLessThanOrEqual(thumb.left);
  expect(b.left).toBeGreaterThanOrEqual(0);
});

test('side="left" on a right-to-left page: the thumb at the left edge, the bubble on its right', async ({
  page,
}) => {
  // What the README advises for RTL web pages
  await open(page, 'FlatList', { rtl: true, side: 'left' });
  const thumb = await showThumb(page);
  expect(thumb.left).toBeLessThan(page.viewportSize()!.width * 0.2);
  await grab(page, thumb, page.viewportSize()!.height);
  const b = await bubble(page);
  await page.mouse.up();
  expect(b.left).toBeGreaterThanOrEqual(thumb.right);
  expect(b.right).toBeLessThanOrEqual(b.viewport);
  await expect(header(page)).toHaveValue('Z');
});

test('the screen-reader control works from the keyboard', async ({ page }) => {
  await open(page, 'FlatList');
  const control = page.getByTestId('list-scrubber-a11y');
  await control.focus();
  await expect(control).toHaveAttribute('aria-valuetext', 'A');
  // The arrows step a section, like a screen reader's swipe
  await page.keyboard.press('ArrowDown');
  await expect(control).toHaveAttribute('aria-valuetext', 'B');
  await expect(page.getByText('Ada Abby')).not.toBeInViewport();
  await page.keyboard.press('End');
  await expect(header(page)).toHaveValue('Z');
  await expect(control).toHaveAttribute('aria-valuetext', 'Z');
  await page.keyboard.press('Home');
  await expect(page.getByText('Ada Abby')).toBeInViewport();
  await expect(control).toHaveAttribute('aria-valuetext', 'A');
});

test('a collapsible header: the thumb, the bubble and the pinned header follow it', async ({ page }) => {
  await open(page, 'Collapsible');
  const bar = page.getByTestId('collapsible-header');
  const pinned = page.getByTestId('list-scrubber-pinned-header');
  const box = async (locator: ReturnType<Page['getByTestId']>) => (await locator.boundingBox())!;
  /** The letter of the contact row just below the pinned header: what that header should name */
  const rowLetter = async () => {
    const p = await box(pinned);
    const name = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.textContent ?? '', {
      x: page.viewportSize()!.width / 2,
      y: p.y + p.height + 20,
    });
    return name.trim().split(' ').at(-1)![0];
  };

  // Scrolled a little: the header is partly hidden, and the thumb starts below what's left of it
  const thumb = await showThumb(page);
  const shown = await box(bar);
  expect(shown.y + shown.height).toBeGreaterThan((await box(page.getByTestId('list-scrubber-a11y'))).y);
  expect(thumb.y - 24).toBeGreaterThanOrEqual(shown.y + shown.height - 1);
  await expect(header(page)).toHaveValue((await rowLetter())!);

  // A drag hides the header, and the bubble, the pinned header and the rows agree
  await grab(page, thumb, thumb.y + 300);
  const b = await bubble(page);
  await page.mouse.up();
  const hidden = await box(bar);
  expect(hidden.y + hidden.height).toBeLessThanOrEqual(
    (await box(page.getByTestId('list-scrubber-a11y'))).y + 1,
  );
  await expect(header(page)).toHaveValue(b.label);
  await expect(header(page)).toHaveValue((await rowLetter())!);

  // A short scroll up brings the header back; the pinned header moves below it and still names the rows it covers
  await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2); // over the rows
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await box(pinned)).y).toBeGreaterThan(hidden.y + hidden.height + 100);
  await expect(header(page)).toHaveValue((await rowLetter())!);

  // The last section is still reachable
  const again = (await page.getByTestId('list-scrubber-thumb').boundingBox())!;
  await grab(
    page,
    { x: again.x + again.width / 2, y: again.y + again.height / 2 },
    page.viewportSize()!.height,
  );
  await page.mouse.up();
  await expect(header(page)).toHaveValue('Z');

  // Dragged back to the top, the header is shown again
  const end = (await page.getByTestId('list-scrubber-thumb').boundingBox())!;
  await grab(page, { x: end.x + end.width / 2, y: end.y + end.height / 2 }, 0);
  await page.mouse.up();
  await expect(page.getByText('3,000 people')).toBeInViewport();
  await expect(page.getByText('Ada Abby')).toBeInViewport();
  await expect(header(page)).toHaveValue('A');
});
