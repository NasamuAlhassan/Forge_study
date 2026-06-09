import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "forgeGlassIntensity";
const DEFAULT_INTENSITY = 50;

/**
 * Compute all glass CSS variables from a 0–100 intensity value.
 *
 * DESIGN RULES
 * ─────────────────────────────────────────────────────────────────────────
 * • All backgrounds are NEUTRAL WHITE — rgba(255,255,255, alpha).
 *   No blue/purple tint; no saturate() in backdrop-filter.
 *   The wallpaper shows through as-is, just frosted.
 *
 * • intensity = 0  → frost  (40 px blur, highest opacity)
 * • intensity = 100 → liquid (15 px blur, lowest opacity)
 *
 * • btn tier  ≈ 1.5× standard  (interactive elements slightly more opaque)
 * • active tier ≈ 2× standard  (active / hover states clearly brighter)
 *
 * All values are applied as CSS custom properties on <html>.
 */
export function applyGlassIntensity(intensity: number): void {
  const n = Math.max(0, Math.min(100, intensity));
  const root = document.documentElement;

  // ── Blur: 64 px (heavy frost) → 8 px (crystal liquid) ──────────────────
  const blur = (Math.max(8, 64 - n * 0.56)).toFixed(1) + "px";

  // ── Standard panel opacity ─────────────────────────────────────────────
  // dark:  0.45 (opaque frost) → 0.04 (barely-there liquid)
  // light: 0.80 (milky frost)  → 0.12 (clear liquid)
  const bgDark  = Math.max(0.04, 0.45 - n * 0.0041);
  const bgLight = Math.max(0.12, 0.80 - n * 0.0068);

  // ── Button tier — ~1.4× standard ─────────────────────────────────────
  const bgBtnDark  = Math.min(0.58, bgDark  * 1.4);
  const bgBtnLight = Math.min(0.90, bgLight * 1.2);

  // ── Active / hover tier — ~2× standard ──────────────────────────────
  const bgActiveDark  = Math.min(0.68, bgDark  * 2.0);
  const bgActiveLight = Math.min(0.95, bgLight * 1.4);

  // ── Borders: thicker/brighter at frost, finer at liquid ─────────────
  const borderDark  = Math.max(0.10, 0.40 - n * 0.003);  // 0.40 → 0.10
  const borderLight = Math.max(0.20, 0.70 - n * 0.005);  // 0.70 → 0.20

  // ── Drop shadow ───────────────────────────────────────────────────────
  const shadowA = (Math.max(0.08, 0.30 - n * 0.0022)).toFixed(3);
  const shadow  = `0 8px 32px rgba(0,0,0,${shadowA}), 0 2px 8px rgba(0,0,0,${(Number(shadowA)*0.55).toFixed(3)})`;

  const f = (v: number) => v.toFixed(3);
  const w = (a: number) => `rgba(255,255,255,${f(a)})`;

  root.style.setProperty("--glass-intensity",       String(n));
  root.style.setProperty("--glass-blur",            blur);
  root.style.setProperty("--glass-bg-dark",         w(bgDark));
  root.style.setProperty("--glass-bg-light",        w(bgLight));
  root.style.setProperty("--glass-bg-btn-dark",     w(bgBtnDark));
  root.style.setProperty("--glass-bg-btn-light",    w(bgBtnLight));
  root.style.setProperty("--glass-bg-active-dark",  w(bgActiveDark));
  root.style.setProperty("--glass-bg-active-light", w(bgActiveLight));
  root.style.setProperty("--glass-border-dark",     w(borderDark));
  root.style.setProperty("--glass-border-light",    w(borderLight));
  root.style.setProperty("--glass-shadow",          shadow);
}

/**
 * Hook: manages glass intensity state, persists to localStorage,
 * applies CSS variables live.  Used by the Settings slider.
 */
export function useGlassIntensity() {
  const [intensity, setIntensity] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_INTENSITY;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? Math.max(0, Math.min(100, Number(stored))) : DEFAULT_INTENSITY;
  });

  // Safety-net apply on mount (index.html inline script runs first)
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
