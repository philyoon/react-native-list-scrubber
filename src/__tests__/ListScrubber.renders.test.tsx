import { baseProps, reactions, setup } from './support';
import { act } from '@testing-library/react-native';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { render } from '@testing-library/react-native';
import { ListScrubber, PinnedSectionHeader } from '../index';
import { sharedZero } from './support';

// Counts real renders of the section label. It no longer draws every label, but a render still recomputes
// its UI-thread worklets and sizing copies, so it should happen only when something it draws changes.
// Wraps the actual component's inner function in a new memo, so it counts what the actual memo would let through.
// The counter lives in the mocked module: the factory runs when ./support first imports the library.
jest.mock('../SectionText', () => {
  const React = require('react');
  const actual = jest.requireActual('../SectionText').SectionText;
  const counter = { renders: 0, isMemo: actual.$$typeof === Symbol.for('react.memo') };
  const Counted = (props: object) => {
    counter.renders++;
    return actual.type(props);
  };
  return { SectionText: React.memo(Counted), counter };
});
const mockLabel: { renders: number; isMemo: boolean } = require('../SectionText').counter;

type Handlers = Record<'onBegin' | 'onUpdate' | 'onFinalize', (e: object) => void>;
const pan = () => (getByGestureTestId('list-scrubber') as unknown as { handlers: Handlers }).handlers;
const sections = Array.from({ length: 300 }, (_, i) => ({ offset: i * 10, label: `S${i}` }));

beforeEach(() => (mockLabel.renders = 0));

it('SectionText is memoized', () => {
  expect(mockLabel.isMemo).toBe(true);
});

it('the section label renders only to measure, not again as the thumb shows, drags and hides', async () => {
  await setup({ sections, contentHeight: 20000 });
  expect(mockLabel.renders).toBe(1);
  const [fade, visible] = reactions();
  await act(async () => {
    fade.react(10, 0); // scrolling starts
    visible.react(true, false); // the thumb shows
  });
  await act(async () => {
    pan().onBegin({});
    pan().onUpdate({ translationY: 30 });
  });
  await act(async () => pan().onFinalize({}));
  await act(async () => visible.react(false, true)); // the thumb hides
  await act(async () => visible.react(true, false)); // and shows again
  await act(async () => visible.react(false, true));
  // Once more, to measure the labels when the thumb first showed; never again
  expect(mockLabel.renders).toBe(2);
});

it('inline colours and text style with the same values do not re-render it; a change does', async () => {
  const props = { ...baseProps, sections, contentHeight: 20000 };
  const view = await setup({ sections, contentHeight: 20000, colors: { bubbleText: 'white' } });
  await view.rerender(<ListScrubber {...props} colors={{ bubbleText: 'white' }} bubbleTextStyle={{}} />);
  await view.rerender(<ListScrubber {...props} colors={{ bubbleText: 'white' }} bubbleTextStyle={{}} />);
  expect(mockLabel.renders).toBe(2); // mount, then once for the text style it didn't have
  await view.rerender(<ListScrubber {...props} colors={{ bubbleText: 'red' }} bubbleTextStyle={{}} />);
  expect(mockLabel.renders).toBe(3);
});

it("the pinned header's labels don't re-render when the app renders with the same inline textStyle", async () => {
  const scrollY = sharedZero();
  const header = (fontSize: number) => (
    <PinnedSectionHeader scrollY={scrollY} sections={sections} height={32} textStyle={{ fontSize }} />
  );
  const view = await render(header(14));
  await view.rerender(header(14));
  await view.rerender(header(14));
  expect(mockLabel.renders).toBe(1);
  await view.rerender(header(16)); // a real change does
  expect(mockLabel.renders).toBe(2);
});
