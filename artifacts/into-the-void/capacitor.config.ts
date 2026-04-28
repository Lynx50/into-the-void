import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.intothevoid.app",
  appName: "Into the Void",
  webDir: "dist/public",
  server: {
    cleartext: false,
  },
  android: {
    cleartext: false,
    allowMixedContent: false,
    loggingBehavior: "debug",
  },
};

export default config;
