// CI: prints the download URL of the Expo Go build for this app's Expo SDK, for `ios` (a simulator build,
// a .tar.gz of the .app) or `android` (an .apk), from Expo's versions API (what `expo start` itself uses).
import { readFileSync } from 'node:fs';

const platform = process.argv[2];
if (platform !== 'ios' && platform !== 'android') {
  console.error('usage: node scripts/expo-go-url.mjs ios|android');
  process.exit(1);
}
const expo = JSON.parse(readFileSync(new URL('../node_modules/expo/package.json', import.meta.url), 'utf8'));
const sdk = `${expo.version.split('.')[0]}.0.0`;
// The endpoint `expo start` reads; the versions come wrapped in `data`
const response = await fetch('https://api.expo.dev/v2/versions/latest');
if (!response.ok) throw new Error(`Expo versions API: ${response.status}`);
const body = await response.json();
const versions = body.data ?? body;
const url = versions.sdkVersions?.[sdk]?.[`${platform}ClientUrl`];
if (!url) {
  throw new Error(
    `No Expo Go ${platform} build listed for SDK ${sdk} (response keys: ${Object.keys(versions).join(', ')}; ` +
      `SDKs: ${Object.keys(versions.sdkVersions ?? {})
        .slice(-5)
        .join(', ')})`,
  );
}
console.log(url);
