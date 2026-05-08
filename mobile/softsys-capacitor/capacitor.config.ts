import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.softsys.lanapp',
  appName: 'SoftSys',
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
