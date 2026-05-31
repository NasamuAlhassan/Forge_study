import { useEffect, useMemo, useRef, useState } from "react";
import { useSchedule } from "@/hooks/use-schedule";

export type NotifLevel = "now" | "soon" | "today" | "tomorrow" | "exam";

export interface Notification {
  id: string;
  level: NotifLevel;
  title: string;
  subtitle: string;
  minsUntil: number; // minutes until event starts (negative = already started)
}

/** Convert JS getDay() (0=Sun) → app day index (0=Mon) */
function jsDayToApp(jsDay: number): number {
  return (jsDay + 6) % 7;
}

function label(minsUntil: number): string {
  if (minsUntil <= 0) return "Happening now";
  if (minsUntil < 60) return `In ${minsUntil} min`;
  const h = Math.floor(minsUntil / 60);
  const m = minsUntil % 60;
  return m > 0 ? `In ${h}h ${m}m` : `In ${h}h`;
}

export function useNotifications() {
  // Tick every 60 s so "in X min" labels stay fresh
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { events, subjects } = useSchedule();

  const notifications = useMemo<Notification[]>(() => {
    const todayApp = jsDayToApp(now.getDay());
    const tomorrowApp = (todayApp + 1) % 7;
    const nowMins = now.getHours() * 60 + now.getMinutes();

    const subjectName = (subjectId: string, fallback: string) =>
      subjects.find((s) => s.id === subjectId)?.name ?? fallback;

    const notifs: Notification[] = [];

    for (const e of events) {
      const minsUntil = e.day === todayApp ? e.start - nowMins : null;

      // Already ended today — skip
      if (e.day === todayApp && e.end <= nowMins) continue;

      // Today: happening now, starting soon (≤30 min), or later today
      if (e.day === todayApp) {
        const level: NotifLevel =
          minsUntil! <= 0 ? "now" :
          minsUntil! <= 30 ? "soon" : "today";

        notifs.push({
          id: e.id,
          level,
          title: subjectName(e.subjectId, e.title),
          subtitle: `${level === "now" ? "Now" : label(minsUntil!)} · ${e.type}`,
          minsUntil: minsUntil!,
        });
        continue;
      }

      // Tomorrow
      if (e.day === tomorrowApp) {
        notifs.push({
          id: e.id,
          level: "tomorrow",
          title: subjectName(e.subjectId, e.title),
          subtitle: `Tomorrow · ${String(Math.floor(e.start / 60)).padStart(2, "0")}:${String(e.start % 60).padStart(2, "0")}`,
          minsUntil: (24 - nowMins / 60 + e.start / 60) * 60,
        });
        continue;
      }

      // Exams this week
      if (e.type === "exam") {
        const daysAway = (e.day - todayApp + 7) % 7;
        if (daysAway > 0 && daysAway <= 7) {
          const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
          notifs.push({
            id: e.id,
            level: "exam",
            title: subjectName(e.subjectId, e.title),
            subtitle: `Exam · ${DAYS[e.day]} in ${daysAway} day${daysAway > 1 ? "s" : ""}`,
            minsUntil: daysAway * 24 * 60,
          });
        }
      }
    }

    // Sort: now → soon → today → tomorrow → exam
    const order: Record<NotifLevel, number> = { now: 0, soon: 1, today: 2, tomorrow: 3, exam: 4 };
    return notifs
      .sort((a, b) => order[a.level] - order[b.level] || a.minsUntil - b.minsUntil)
      .slice(0, 12);
  }, [now, events, subjects]);

  const urgentCount = notifications.filter((n) => n.level === "now" || n.level === "soon").length;

  return { notifications, urgentCount };
}

// ─── Browser push alerts ───────────────────────────────────────────────────────

/** Call once in the dashboard layout. Fires OS notifications at lesson time. */
export function useEventAlerts() {
  const { events, subjects } = useSchedule();
  const firedRef = useRef<Set<string>>(new Set());

  // Request permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!("Notification" in window)) return;

    const fire = () => {
      if (Notification.permission !== "granted") return;

      const now = new Date();
      const todayApp = jsDayToApp(now.getDay());
      const nowMins = now.getHours() * 60 + now.getMinutes();
      // Key includes today's date so alerts reset each day automatically
      const dateKey = now.toISOString().slice(0, 10);

      for (const e of events) {
        if (e.day !== todayApp) continue;

        const minsUntil = e.start - nowMins;
        const subjectName =
          subjects.find((s) => s.id === e.subjectId)?.name ?? e.title;

        // 5-minute warning
        if (minsUntil >= 4 && minsUntil <= 5) {
          const key = `${e.id}-${dateKey}-5min`;
          if (!firedRef.current.has(key)) {
            firedRef.current.add(key);
            new Notification(`⏰ Starting in 5 min — ${subjectName}`, {
              body: e.venue ? `📍 ${e.venue}` : `${e.type} session`,
              icon: "/favicon.ico",
              tag: key,
            });
          }
        }

        // At start time (within 1-minute window)
        if (minsUntil >= 0 && minsUntil <= 1) {
          const key = `${e.id}-${dateKey}-now`;
          if (!firedRef.current.has(key)) {
            firedRef.current.add(key);
            const notif = new Notification(`🔔 Time for ${subjectName}`, {
              body: e.venue ? `📍 ${e.venue}` : `Your ${e.type} is starting now`,
              icon: "/favicon.ico",
              tag: key,
              requireInteraction: true,
            });
            notif.onclick = () => {
              window.focus();
              notif.close();
            };
          }
        }
      }
    };

    fire(); // check immediately on mount / data change
    const id = setInterval(fire, 60_000);
    return () => clearInterval(id);
  }, [events, subjects]);
}
