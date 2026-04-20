import { Capacitor } from "@capacitor/core";
import { FirebaseAnalytics } from "@capacitor-firebase/analytics";

type EventParams = Record<string, string | number | boolean>;

export async function trackEvent(
  name: string,
  params?: EventParams,
): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;

    await FirebaseAnalytics.logEvent({
      name,
      params,
    });
  } catch (error) {
    console.error("Analytics error:", error);
  }
}