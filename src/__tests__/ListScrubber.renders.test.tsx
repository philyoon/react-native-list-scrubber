import { baseProps, reactions, setup } from './support';
import { act } from '@testing-library/react-native';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { ListScrubber } from '../index';

// Counts real renders of the section label strip: it draws every section label, so each render is costly.
// Wraps the actual component's inner function in a new memo, so it counts what the actual memo would let through.
// The counter lives in the mocked module: the factory runs when ./support first imports the library.
jest.mock('../LabelStrip', () => {
  const React = require('react');
  const actual = jest.requireActual('../LabelStrip').LabelStrip;
  const counter = { renders: 0, isMemo: actual.$$typeof === Symbol.for('react.memo') };
  const Counted = (props: object) => {
    counter.renders++;
    return actual.type(props);
  };
  return { LabelStrip: React.memo(Counted), counter };
});
const mockStrip: { renders: number; isMemo: boolean } = require('../LabelStrip').counter;

type Handlers = Record<'onBegin' | 'onUpdate' | 'onFinalize', (e: object) => void>;
const pan = () => (getByGestureTestId('list-scrubber') as unknown as { handlers: Handlers }).handlers;
const sections = Array.from({ length: 300 }, (_, i) => ({ offset: i * 10, label: `S${i}` }));

beforeEach(() => (mockStrip.renders = 0));

it('LabelStrip is memoized', () => {
  expect(mockStrip.isMemo).toBe(true);
});

it('the label strip renders once, not again as the thumb shows, drags and hides', async () => {
  await setup({ sections, contentHeight: 20000 });
  expect(mockStrip.renders).toBe(1);
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
  expect(mockStrip.renders).toBe(1);
});

it('inline colours and text style with the same values do not re-render it; a change does', async () => {
  const props = { ...baseProps, sections, contentHeight: 20000 };
  const view = await setup({ sections, contentHeight: 20000, colors: { bubbleText: 'white' } });
  await view.rerender(<ListScrubber {...props} colors={{ bubbleText: 'white' }} bubbleTextStyle={{}} />);
  await view.rerender(<ListScrubber {...props} colors={{ bubbleText: 'white' }} bubbleTextStyle={{}} />);
  expect(mockStrip.renders).toBe(2); // mount, then once for the text style it didn't have
  await view.rerender(<ListScrubber {...props} colors={{ bubbleText: 'red' }} bubbleTextStyle={{}} />);
  expect(mockStrip.renders).toBe(3);
});
