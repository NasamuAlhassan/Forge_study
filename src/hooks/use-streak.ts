/**
 * Real calendar-day streak tracking.
 *
 * Stores the set of dates (YYYY-MM-DD) where the user opened the app while
 * authenticated. Persists in localStorage across logouts and logins — the key
 * is userId-scoped so different accounts don't share history.
 */
import { useEffect, useMemo, useState } from "react";

const BASE_KEY = "forge-activity-log";

function storageKey(userId: string): string {
  return `${BASE_KEY}:${userId}`;
}

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function loadDates(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDates(userId: string, dates: Set<string>): void {
  try {
    // Keep only the last 365 dates to bound storage
    const sorted = Array.from(dates).sort().slice(-365);
    localStorage.setItem(storageKey(userId), JSON.stringify(sorted));
  } catch {
    // ignore quota errors
  }
}

/**
 * Record today's date for this user. Returns true if today was newly added
 * (i.e. first call of the day), false if already recorded.
 */
export function recordActivity(userId: string): boolean {
  const today = getTodayDate();
  const dates = loadDates(userId);
  if (dates.has(today)) return false;
  dates.add(today);
  saveDates(userId, dates);
  return true;
}

function prevDateString(date: string): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function nextDateString(date: string): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function computeStreak(dates: Set<string>): { streak: number; bestStreak: number } {
  const sorted = Array.from(dates).sort();
  if (sorted.length === 0) return { streak: 0, bestStreak: 0 };

  // Current streak: count consecutive days ending today (or yesterday if today
  // hasn't been recorded yet, though recordActivity is called on mount so today
  // should always be in the set by the time this runs).
  let streak = 0;
  let d = getTodayDate();
  while (dates.has(d)) {
    streak++;
    d = prevDateString(d);
  }

  // Best streak: longest consecutive run across all recorded dates
  let bestStreak = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || sorted[i] === nextDateString(sorted[i - 1])) {
      run++;
    } else {
      run = 1;
    }
    bestStreak = Math.max(bestStreak, run);
  }

  return { streak, bestStreak };
}

type StreakCell = { active: boolean; today: boolean; future: boolean };

function computeGrid(dates: Set<string>): { grid: StreakCell[][]; thisWeekActive: Set<number> } {
  const now = new Date();
  const todayDow = (now.getDay() + 6) % 7; // 0=Mon..6=Sun

  // Monday of the current week
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - todayDow);
  weekStart.setHours(0, 0, 0, 0);

  const thisWeekActive = new Set<number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const ds = d.toISOString().split("T")[0];
    if (dates.has(ds)) thisWeekActive.add(i);
  }

  // 3 weeks: 2 weeks ago → last week → this week
  const grid: StreakCell[][] = Array.from({ length: 3 }, (_, wi) =>
    Array.from({ length: 7 }, (__, di) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() - (2 - wi) * 7 + di);
      const ds = d.toISOString().split("T")[0];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        active: dates.has(ds),
        today: wi === 2 && di === todayDow,
        future: d > today,
      };
    }),
  );

  return { grid, thisWeekActive };
}

export interface StreakData {
  streak: number;
  bestStreak: number;
  activeDaysThisWeek: number;
  streakGrid: StreakCell[][];
}

/**
 * Hook that records today's activity and computes real streak data.
 * Must be called with the authenticated user's ID.
 */
export function useStreak(userId: string | null | undefined): StreakData {
  // revision ticks when we record a new day so useMemo re-computes
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const isNew = recordActivity(userId);
    if (isNew) setRevision((r) => r + 1);
  }, [userId]);

  return useMemo((): StreakData => {
    if (!userId) {
      return { streak: 0, bestStreak: 0, activeDaysThisWeek: 0, streakGrid: [] };
    }
    const dates = loadDates(userId);
    const { streak, bestStreak } = computeStreak(dates);
    const { grid, thisWeekActive } = computeGrid(dates);
    return {
      streak,
      bestStreak,
      activeDaysThisWeek: thisWeekActive.size,
      streakGrid: grid,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, revision]);
}
