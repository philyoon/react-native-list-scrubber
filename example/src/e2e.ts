// e2e mode (EXPO_PUBLIC_E2E=1, npm run start:e2e) for the Maestro flows in e2e/.
import type { ViewStyle } from 'react-native';

export const E2E = process.env.EXPO_PUBLIC_E2E === '1';

/**
 * Maestro can't target the thumb (it is hidden from screen readers, and Maestro finds elements through
 * the accessibility tree) and its swipe points must be fixed screen percentages. So in e2e mode the list
 * card is pinned to fixed percentages of the screen, and the flows' points land on the thumb on any
 * phone: x 91% is inside the 44pt touch area 16pt from the right edge, y 28% / 95% inside the 48pt thumb
 * at the top / bottom of the card. Checked on iPhone SE, 17 Pro and 17 Pro Max.
 * Keep the flows' points in step with these numbers.
 */
export const E2E_CARD: ViewStyle = {
  position: 'absolute',
  top: '25%',
  bottom: '2%',
  left: 16,
  right: 16,
  // The card's own margins would move its edges off these percentages (the specific ones win over margin)
  marginHorizontal: 0,
  marginBottom: 0,
};

/**
 * Flows show the thumb with a short scroll, then grab it. Maestro waits for the screen to settle after
 * each swipe, which on a slow simulator outlasts the default 1.5 s before the thumb hides.
 */
export const E2E_TIMING = { hideAfterMs: 5000 };
