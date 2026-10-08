// e2e mode (EXPO_PUBLIC_E2E=1, npm run e2e:start) for the Maestro flows in e2e/, and its right-to-left
// variant (EXPO_PUBLIC_E2E_RTL=1 too, npm run e2e:start:rtl) for the flows in e2e/rtl.
import { I18nManager, useWindowDimensions, type ViewStyle } from 'react-native';

export const E2E = process.env.EXPO_PUBLIC_E2E === '1';
export const E2E_RTL = E2E && process.env.EXPO_PUBLIC_E2E_RTL === '1';

/**
 * Half the scrubber's 44pt touch area: its centre is this far in from the card's edge
 * (the thumb itself is drawn nearer the edge)
 */
const THUMB_HALF = 22;

/**
 * Maestro can't target the thumb (it is hidden from screen readers, and Maestro finds elements through
 * the accessibility tree) and its swipe points must be fixed screen percentages. So in e2e mode the list
 * card is pinned to fixed percentages of the screen, and the flows' points land on the thumb on any
 * phone, in portrait or landscape: the centre of its 44pt touch area is at x 91% (9% in right-to-left
 * layouts, where it moves to the left edge), and y 28% / 95% are inside the 48pt thumb at the top / bottom
 * of the card. Below a 32pt pinned header that takes its own space (the FlatList, FlashList, Legend List and
 * Collapsible demos) the track starts lower: y 31% in portrait, 39% in landscape.
 * Checked on iPhone SE, 17 Pro and 17 Pro Max, and a Pixel 8 emulator.
 * Keep the flows' points in step with these numbers.
 */
export function useE2ECard(): ViewStyle {
  const { width } = useWindowDimensions();
  const side = width * 0.09 - THUMB_HALF;
  return {
    position: 'absolute',
    top: '25%',
    bottom: '2%',
    left: side,
    right: side,
    // The card's own margins would move its edges off these percentages (the specific ones win over margin)
    marginHorizontal: 0,
    marginBottom: 0,
  };
}

/**
 * Flows show the thumb with a short scroll, then grab it. Maestro waits for the screen to settle after
 * each swipe, which on a slow simulator outlasts the default 1.5 s before the thumb hides.
 */
export const E2E_TIMING = { hideAfterMs: 5000 };

/*
 * The layout direction is set as the app's code loads, before its first view: iOS and Android apply it
 * straight away. Setting it in every e2e run also undoes an RTL run, which Expo Go may otherwise keep.
 */
if (E2E) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(E2E_RTL);
}
