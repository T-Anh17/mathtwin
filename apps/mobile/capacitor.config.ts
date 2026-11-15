import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'vn.mathtwin.app', appName: 'MathTwin', webDir: 'dist',
  loggingBehavior: 'none',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
};
export default config;
