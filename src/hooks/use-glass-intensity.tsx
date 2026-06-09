import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "forgeGlassIntensity";
const DEFAULT_INTENSITY = 50;

/** Compute and apply all glass CSS variables from an intensity value (0–100). */
export function applyGlassIntensity(intensity: number): void {
  const n = Math.max(0, Math.min(100, intensity));
  const blur        = (Math.max(5,    40   - n * 0.25 )).toFixed(1) + "px";
  const bgDark      = `rgba(8,8,24,${(Math.max(0.08, 0.45 - n * 0.003)).toFixed(3)})`;
  const bgLight     = `rgba(255,255,255,${(Math.max(0.05, 0.28 - n * 0.002)).toFixed(3)})`;
  const borderDark  = `rgba(255,255,255,${(Math.max(0.05, 0.18 - n * 0.001)).toFixed(3)})`;
  const borderLight = `rgba(255,255,255,${(Math.max(0.15, 0.55 - n * 0.003)).toFixed(3)})`;

  const root = document.documentElement;
  root.style.setProperty("--glass-intensity",    String(n));
  root.style.setProperty("--glass-blur",         blur);
  root.style.setProperty("--glass-bg-dark",      bgDark);
  root.style.setProperty("--glass-bg-light",     bgLight);
  root.style.setProperty("--glass-border-dark",  borderDark);
  root.style.setProperty("--glass-border-light", borderLight);
}

/**
 * Hook: reads glass intensity from localStorage, applies CSS variables,
 * and exposes an `update` function for the settings slider.
 *
 * Usage:
 *   const { intensity, update } = useGlassIntensity();
 *   <input type="range" min={0} max={100} value={intensity}
 *          onChange={e => update(Number(e.target.value))} />
 */
export function useGlassIntensity() {
  const [intensity, setIntensity] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_INTENSITY;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? Math.max(0, Math.min(100, Number(stored))) : DEFAULT_INTENSITY;
  });

  // Apply on mount (index.html script runs first, this is a safety net)
  useEffect(() => {
    applyGlassIntensity(intensity);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(100, value));
    setIntensity(clamped);
    localStorage.setItem(STORAGE_KEY, String(clamped));
    applyGlassIntensity(clamped);
  }, []);

  return { intensity, update };
}
