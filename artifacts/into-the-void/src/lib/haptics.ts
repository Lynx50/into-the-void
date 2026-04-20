import { Haptics, ImpactStyle } from "@capacitor/haptics";

export const HAPTICS_ENABLED_KEY = "into_the_void_haptics_enabled_v1";

export function getHapticsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(HAPTICS_ENABLED_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HAPTICS_ENABLED_KEY, String(enabled));
  } catch {
    // Silent fail
  }
}

export async function triggerHaptic(
  type: "light" | "medium" = "light"
): Promise<void> {
  try {
    if (!getHapticsEnabled()) return;

    await Haptics.impact({
      style: type === "light" ? ImpactStyle.Light : ImpactStyle.Medium,
    });
  } catch {
    // Silent fail on unsupported devices
  }
}