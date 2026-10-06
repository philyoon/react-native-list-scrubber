import { useColorScheme } from 'react-native';

const light = {
  background: '#F6F5FB',
  card: '#FFFFFF',
  text: '#1C1B3A',
  secondary: '#5E5C78',
  border: '#E4E2F0',
  header: '#ECEAF6',
  accent: '#4F46E5',
  onAccent: '#FFFFFF',
  // Scrubber: idle handle needs 3:1 against the card
  thumb: '#7C7A96',
  bubble: '#1C1B3A',
  bubbleText: '#FFFFFF',
};

const dark: typeof light = {
  background: '#0F0E1A',
  card: '#1A1929',
  text: '#F2F1FA',
  secondary: '#A9A7C2',
  border: '#2C2A40',
  header: '#24223A',
  accent: '#8B85FF',
  onAccent: '#0F0E1A',
  thumb: '#8F8DAA',
  bubble: '#F2F1FA',
  bubbleText: '#0F0E1A',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
