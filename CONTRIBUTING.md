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
installs them (without saving), then the library's types and `smoke:package` must still pass. Raising a
minimum in `peerDependencies` changes what that job tests. Run `npm ci` afterwards to get back to the usual
versions.

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
cd example
npm run start:e2e      # keep Metro running in e2e mode
npm run e2e            # iOS simulator
npm run e2e:android    # Android emulator (after adb reverse tcp:8081 tcp:8081)
```

The README's [End-to-end tests](README.md#end-to-end-tests) section explains how the flows find the thumb.

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
