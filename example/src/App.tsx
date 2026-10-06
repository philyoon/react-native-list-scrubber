import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEMOS } from './demos';
import { E2E, E2E_CARD } from './e2e';
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
  // A link like exp://…/--/?demo=ScrollView opens that demo (the e2e flows use it)
  useEffect(() => {
    const open = (url: string | null) => {
      const name = url && decodeURIComponent(url.match(/[?&]demo=([^&]+)/)?.[1] ?? '');
      const i = DEMOS.findIndex((d) => d.name === name);
      if (i >= 0) setDemo(i);
    };
    Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener('url', (e) => open(e.url));
    return () => sub.remove();
  }, []);
  const Demo = DEMOS[demo]!.Component;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <StatusBar style="auto" />
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
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, E2E && E2E_CARD]}
      >
        {/* key: each demo gets a fresh list and scrubber */}
        <Demo key={demo} />
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
