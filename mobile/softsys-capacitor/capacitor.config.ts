import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alpx.lanapp',
  appName: 'ALPX SYSTEM',
  webDir: 'www',
  server: {
    cleartext: true,
    errorPath: "index.html?reconnect=1",
    allowNavigation: [
      '*'
    ]
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
