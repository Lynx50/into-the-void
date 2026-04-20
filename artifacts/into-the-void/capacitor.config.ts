import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.intothevoid.app",
  appName: "Into the Void",
  webDir: "dist/public",
  server: {
    cleartext: true,
  },
  android: {
    cleartext: true,
    allowMixedContent: true,
    loggingBehavior: "debug",
  },
};

export default config;
