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

  // ── Three-point design ──────────────────────────────────────────────────
  //   n=0   FROST   — blur 22px, dark 0.165, light 0.33  (old neutral)
  //   n=50  NEUTRAL — blend of frost & glass
  //   n=100 GLASS   — blur 2px,  dark 0.01,  light 0.03  (crystal clear)
  //
  // All values interpolate linearly.

  // Blur:   22 px → 12 px → 2 px
  const blur = (Math.max(2, 22 - n * 0.20)).toFixed(1) + "px";

  // Dark panel bg:  0.165 → 0.088 → 0.01
  const bgDark  = Math.max(0.01, 0.165 - n * 0.00155);

  // Light panel bg: 0.33 → 0.18 → 0.03
  const bgLight = Math.max(0.03, 0.33 - n * 0.003);

  // ── Button tier  ≈ 1.8× panel ────────────────────────────────────────
  const bgBtnDark  = Math.min(0.35, bgDark  * 1.8);
  const bgBtnLight = Math.min(0.55, bgLight * 1.7);

  // ── Active / hover tier  ≈ 2.5× panel ───────────────────────────────
  const bgActiveDark  = Math.min(0.45, bgDark  * 2.5);
  const bgActiveLight = Math.min(0.65, bgLight * 2.0);

  // ── Borders ───────────────────────────────────────────────────────────
  // dark white:  0.24 → 0.14 → 0.06
  const borderDark  = Math.max(0.06, 0.24 - n * 0.0018);
  // light dark:  0.14 → 0.09 → 0.04
  const borderLight = Math.max(0.04, 0.14 - n * 0.001);

  // ── Drop shadow ───────────────────────────────────────────────────────
  const shadowA = (Math.max(0.03, 0.16 - n * 0.0013)).toFixed(3);
  const shadow  = `0 8px 32px rgba(0,0,0,${shadowA}), 0 2px 8px rgba(0,0,0,${(Number(shadowA)*0.55).toFixed(3)})`;

  const f = (v: number) => v.toFixed(3);
  const white = (a: number) => `rgba(255,255,255,${f(a)})`;
  const dark  = (a: number) => `rgba(0,0,0,${f(a)})`;

  root.style.setProperty("--glass-intensity",        String(n));
  root.style.setProperty("--glass-blur",             blur);
  // dark mode — white tint
  root.style.setProperty("--glass-bg-dark",          white(bgDark));
  root.style.setProperty("--glass-bg-btn-dark",      white(bgBtnDark));
  root.style.setProperty("--glass-bg-active-dark",   white(bgActiveDark));
  root.style.setProperty("--glass-border-dark",      white(borderDark));
  // light mode — white tint backgrounds, dark borders
  root.style.setProperty("--glass-bg-light",         white(bgLight));
  root.style.setProperty("--glass-bg-btn-light",     white(bgBtnLight));
  root.style.setProperty("--glass-bg-active-light",  white(bgActiveLight));
  root.style.setProperty("--glass-border-light",     dark(borderLight)); // dark border on light bg
  root.style.setProperty("--glass-shadow",           shadow);
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
