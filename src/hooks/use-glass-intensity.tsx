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

  // ── Blur ────────────────────────────────────────────────────────────────
  const blur = (Math.max(15, 40 - n * 0.25)).toFixed(1) + "px";

  // ── Standard panel opacity ────────────────────────────────────────────
  const bgDark  = Math.max(0.02, 0.14 - n * 0.0011); // 0.14 → 0.03
  const bgLight = Math.max(0.10, 0.55 - n * 0.0043); // 0.55 → 0.12

  // ── Button tier (interactive elements) ───────────────────────────────
  const bgBtnDark  = Math.min(0.22, bgDark  * 1.55);
  const bgBtnLight = Math.min(0.70, bgLight * 1.38);

  // ── Active / hover tier ───────────────────────────────────────────────
  const bgActiveDark  = Math.min(0.26, bgDark  * 2.1);
  const bgActiveLight = Math.min(0.75, bgLight * 1.60);

  // ── Borders ────────────────────────────────────────────────────────────
  const borderDark  = Math.max(0.08, 0.22 - n * 0.0014); // 0.22 → 0.08
  const borderLight = Math.max(0.28, 0.65 - n * 0.0037); // 0.65 → 0.28

  // ── Drop shadow ────────────────────────────────────────────────────────
  const shadowA = (Math.max(0.06, 0.20 - n * 0.0014)).toFixed(3);
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
