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
  //   n=0   FROST   — heavy blur, milky white panel, thick border
  //   n=50  NEUTRAL — balanced mix, moderate blur & opacity
  //   n=100 GLASS   — minimal blur, nearly invisible, thin border
  //
  // All values interpolate linearly between frost (0) and glass (100).

  // Blur:   40 px  →  20 px  →  4 px
  const blur = (Math.max(4, 40 - n * 0.36)).toFixed(1) + "px";

  // Panel background opacity (dark mode white tint)
  // Frost 0.30  →  Neutral 0.15  →  Glass 0.03
  const bgDark  = Math.max(0.03, 0.30 - n * 0.0027);

  // Panel background opacity (light mode white tint)
  // Frost 0.60  →  Neutral 0.34  →  Glass 0.06
  const bgLight = Math.max(0.06, 0.60 - n * 0.0054);

  // ── Button tier  ≈ 1.7× panel ────────────────────────────────────────
  const bgBtnDark  = Math.min(0.50, bgDark  * 1.7);
  const bgBtnLight = Math.min(0.80, bgLight * 1.4);

  // ── Active / hover tier  ≈ 2.4× panel ───────────────────────────────
  const bgActiveDark  = Math.min(0.60, bgDark  * 2.4);
  const bgActiveLight = Math.min(0.88, bgLight * 1.6);

  // ── Borders ───────────────────────────────────────────────────────────
  // dark:  white border  Frost 0.38 → Neutral 0.22 → Glass 0.10
  const borderDark  = Math.max(0.10, 0.38 - n * 0.0028);
  // light: dark border   Frost 0.22 → Neutral 0.14 → Glass 0.08
  const borderLight = Math.max(0.08, 0.22 - n * 0.0014);

  // ── Drop shadow ───────────────────────────────────────────────────────
  const shadowA = (Math.max(0.05, 0.22 - n * 0.0017)).toFixed(3);
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
