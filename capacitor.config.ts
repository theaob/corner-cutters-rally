import type { CapacitorConfig } from '@capacitor/cli';

// The Android app: the same web build (dist/) in a WebView, played offline.
const config: CapacitorConfig = {
  appId: 'io.github.theaob.cornercutters',
  appName: 'Corner Cutters',
  webDir: 'dist',
  backgroundColor: '#0e0d16',
  android: {
    // the game has its own on-screen controls: no pinch-zoom or text selection to get in the way
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
