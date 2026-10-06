# Contributing

Thanks for helping! Bug reports and pull requests are welcome. For a larger change, open an issue first so we
can agree on the approach.

## Setup

Use Node 22 (`nvm use` reads `.nvmrc`), then:

```sh
npm install
```

## Checks

CI runs these on every pull request. Run them before you push:

```sh
npm run format:check   # Prettier (npx prettier --write … to fix)
npm run typecheck
npm run lint
npm test -- --coverage # must stay at 100% statements, branches, functions and lines
npm run smoke:package  # packs the package and checks it as users get it
```

CI also checks the oldest versions the peer dependency ranges allow: `node scripts/install-min-peers.mjs`
installs them (without saving), then `node scripts/check-reanimated-compat.mjs` confirms Reanimated supports
that React Native and Worklets pair, and the types, the unit tests and `smoke:package` must still pass.
Raising a minimum in `peerDependencies` changes what that job tests. Run `npm ci` afterwards to get back to
the usual versions. `jest.config.js` and `jest.setup.js` pick the Jest preset, resolver and Worklets mock by
what's installed, so the same tests run on both.

Tests run in Jest with the Reanimated, Worklets and Gesture Handler mocks set up in
`src/__tests__/support.tsx`. They check logic, not UI-thread behaviour, so changes to the drag, the bubble or
anything on screen also need a look on a device.

## Example app

The example app in `example/` uses the library source from `../src`, so changes show up without a build:

```sh
cd example
npm install
npx expo start         # Expo Go on a device or simulator
npm run web            # or in the browser
```

## End-to-end tests

The Maestro flows in `example/e2e` drive the example in Expo Go. Run them for any change to what's on screen:

```sh
npm run e2e:start      # keep Metro running in e2e mode, then in another terminal:
npm run e2e:ios        # iOS simulator
npm run e2e:android    # Android emulator
```

Set `MAESTRO_DEVICE` (a simulator UDID or an emulator serial) when more than one is running, and pass flow
paths after `--` to run only some. The right-to-left flows run against Metro in RTL mode:
`npm run e2e:start:rtl`, then `npm run e2e:ios -- e2e/rtl`. The README's
[End-to-end tests](README.md#end-to-end-tests) section has the details, and how the flows find the thumb.

## Web tests

The Playwright tests in `example/web-e2e` run in CI. Run them for any change to what's on screen on web:
`npm --prefix example exec -- playwright install chromium` once, then `npm run example web:e2e`.

## Dependency updates

Dependabot opens monthly, grouped pull requests for tooling only. Upgrade these by hand, as one pull request
that runs every check, including the example app and the Maestro flows:

- The React Native platform: `react`, `react-native`, Reanimated, Worklets, Gesture Handler, and their types
  and presets. They set what the library is tested against.
- Major versions of anything, which usually need config or code changes.

## Pull requests

- Keep each pull request to one change.
- Add an entry under `## Unreleased` in `CHANGELOG.md` for anything users will notice.
- Update the README when the API or behaviour changes.

## Releasing (maintainers)

Releases are published by the Release workflow (`.github/workflows/release.yml`) with npm trusted publishing:
npm trusts that workflow, so there's no npm token to store.

1. Set `version` in `package.json`, and turn `## Unreleased` in `CHANGELOG.md` into `## <version>`.
2. Merge that to `main`.
3. Tag it: `git tag v<version> && git push origin v<version>`. The workflow checks that the tag matches
   `package.json`, runs the checks, and publishes to npm with provenance.

After a release, the next change that users will notice starts a new `## Unreleased` section at the top of
`CHANGELOG.md`.

### One-time setup

- If the package doesn't exist on npm yet, publish the first version by hand from a clean checkout of the
  tagged commit: `npm ci && npm publish --access public` (with two-factor authentication).
- In the package's settings on npmjs.com, add a trusted publisher: GitHub Actions, owner `philyoon`,
  repository `react-native-list-scrubber`, workflow `release.yml`.
- Then, if npm offers it, set the package's publishing access to require two-factor authentication and
  disallow tokens, so only the workflow (or a maintainer with two-factor authentication) can publish.
- npm adds provenance only when the repository is public.
