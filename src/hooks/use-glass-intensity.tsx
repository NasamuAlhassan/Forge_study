import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "forgeGlassIntensity";
const DEFAULT_INTENSITY = 50;

/**
 * Compute all glass CSS variables from a 0–100 intensity value.
 *
 * DESIGN RULES
 * ─────────────────────────────────────────────────────────────────────────
 * • Dark mode backgrounds use a BLUE TINT — rgba(25,65,185, alpha).
 *   This creates the liquid blue glass look matching the deep navy/teal bg.
 *   Active state uses a brighter blue rgba(45,110,245, alpha) for the
 *   pill-shaped highlight seen in the reference design.
 *
 * • Light mode backgrounds remain neutral white (works on light-bg.jpg).
 *
 * • intensity = 0  → frost  (22 px blur, highest opacity)
 * • intensity = 100 → glass  (2 px blur,  lowest opacity)
 *
 * • btn tier  ≈ 1.7× panel   (interactive elements slightly more opaque)
 * • active tier ≈ 2.5× panel  (active / hover states clearly brighter)
 */
export function applyGlassIntensity(intensity: number): void {
  const n = Math.max(0, Math.min(100, intensity));
  const root = document.documentElement;

  // Blur: 22 px → 12 px → 2 px
  const blur = (Math.max(2, 22 - n * 0.20)).toFixed(1) + "px";

  // ── Dark panel bg (blue tint): n=0 → 0.35, n=50 → 0.22, n=100 → 0.08 ─
  const bgDark  = Math.max(0.08, 0.35 - n * 0.0027);

  // Light panel bg (white): 0.33 → 0.18 → 0.03 (unchanged)
  const bgLight = Math.max(0.03, 0.33 - n * 0.003);

  // ── Button tier ≈ 1.7× panel ─────────────────────────────────────────
  const bgBtnDark  = Math.min(0.55, bgDark  * 1.7);
  const bgBtnLight = Math.min(0.55, bgLight * 1.7);

  // ── Active / hover tier ≈ 2.5× panel ─────────────────────────────────
  const bgActiveDark  = Math.min(0.72, bgDark  * 2.5);
  const bgActiveLight = Math.min(0.65, bgLight * 2.0);

  // ── Borders ──────────────────────────────────────────────────────────
  // dark (blue-white): n=0 → 0.32, n=50 → 0.22, n=100 → 0.10
  const borderDark  = Math.max(0.10, 0.32 - n * 0.0022);
  // light (dark): 0.14 → 0.09 → 0.04
  const borderLight = Math.max(0.04, 0.14 - n * 0.001);

  // ── Drop shadow (navy-tinted) ─────────────────────────────────────────
  const shadowA = (Math.max(0.14, 0.32 - n * 0.0018)).toFixed(3);
  const shadow  = `0 8px 32px rgba(4,8,45,${shadowA}), 0 2px 8px rgba(4,8,45,${(Number(shadowA)*0.55).toFixed(3)})`;

  const f = (v: number) => v.toFixed(3);
  // Blue glass tints for dark mode
  const glass  = (a: number) => `rgba(25,65,185,${f(a)})`;    // panel
  const glassB = (a: number) => `rgba(30,75,200,${f(a)})`;    // btn
  const glassA = (a: number) => `rgba(45,110,245,${f(a)})`;   // active pill
  const bord   = (a: number) => `rgba(140,180,255,${f(a)})`;  // border
  // Light mode: white frost panels, soft-blue border + active
  const white   = (a: number) => `rgba(255,255,255,${f(a)})`;
  const bordL   = (a: number) => `rgba(80,130,220,${f(a)})`;  // blue border on light bg
  const glassAL = (a: number) => `rgba(50,100,210,${f(Math.min(0.18, a * 0.45))})`;  // light blue active

  root.style.setProperty("--glass-intensity",        String(n));
  root.style.setProperty("--glass-blur",             blur);
  // dark mode — blue-tinted glass
  root.style.setProperty("--glass-bg-dark",          glass(bgDark));
  root.style.setProperty("--glass-bg-btn-dark",      glassB(bgBtnDark));
  root.style.setProperty("--glass-bg-active-dark",   glassA(bgActiveDark));
  root.style.setProperty("--glass-border-dark",      bord(borderDark));
  // light mode — white frost + blue borders/active
  root.style.setProperty("--glass-bg-light",         white(bgLight));
  root.style.setProperty("--glass-bg-btn-light",     white(bgBtnLight));
  root.style.setProperty("--glass-bg-active-light",  glassAL(bgActiveLight));
  root.style.setProperty("--glass-border-light",     bordL(borderLight));
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
