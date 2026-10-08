import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  StatusBar as NativeStatusBar,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEMOS } from './demos';
import { E2E, useE2ECard } from './e2e';
import { useColors } from './theme';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Main />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Main() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [demo, setDemo] = useState(0);
  // Each link opens its demo afresh: Expo Go may hand the link to the running app, scrolled where it was left
  const [opened, setOpened] = useState(0);
  const e2eCard = useE2ECard();
  // A link like exp://…/--/?demo=ScrollView opens that demo (the e2e flows use it)
  useEffect(() => {
    const open = (url: string | null) => {
      const name = url && decodeURIComponent(url.match(/[?&]demo=([^&]+)/)?.[1] ?? '');
      const i = DEMOS.findIndex((d) => d.name === name);
      if (i >= 0) {
        setDemo(i);
        setOpened((n) => n + 1);
      }
    };
    Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener('url', (e) => open(e.url));
    return () => sub.remove();
  }, []);
  const Demo = DEMOS[demo]!.Component;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Drawn behind the status bar on every Android version (it is from Android 15): the e2e flows'
          screen percentages (src/e2e.ts) then measure the whole screen, not a window that starts below
          the status bar */}
      <StatusBar style="auto" />
      <NativeStatusBar translucent backgroundColor="transparent" />
      <Text style={[styles.title, { color: colors.text }]}>List Scrubber</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={{ flexGrow: 0 }}
      >
        {DEMOS.map((d, i) => (
          <Pressable
            key={d.name}
            onPress={() => setDemo(i)}
            testID={`demo-${d.name}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === demo }}
            style={[
              styles.chip,
              { borderColor: colors.border, backgroundColor: i === demo ? colors.accent : colors.card },
            ]}
          >
            <Text
              numberOfLines={1}
              style={{ color: i === demo ? colors.onAccent : colors.text, fontWeight: '600' }}
            >
              {d.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={[styles.hint, { color: colors.secondary }]}>{DEMOS[demo]!.hint}</Text>
      <View
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, E2E && e2eCard]}
      >
        {/* key: each demo gets a fresh list and scrubber */}
        <Demo key={`${demo}-${opened}`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', paddingHorizontal: 20, paddingTop: 12 },
  chips: { gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  hint: { paddingHorizontal: 20, paddingBottom: 8, fontSize: 13 },
  card: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
