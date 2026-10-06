// Resolve the library from ../src so edits show up without a build,
// and use only this app's node_modules so there is one copy of React, Reanimated and Gesture Handler.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const root = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);

config.watchFolders = [root];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;
config.resolver.blockList = [new RegExp(`^${path.join(root, 'node_modules').replace(/[/\\.]/g, '\\$&')}/.*`)];
config.resolver.resolveRequest = (context, moduleName, platform) =>
  moduleName === 'react-native-list-scrubber'
    ? { type: 'sourceFile', filePath: path.join(root, 'src/index.tsx') }
    : context.resolveRequest(context, moduleName, platform);

module.exports = config;
