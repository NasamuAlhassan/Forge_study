import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { EventBlock, Subject } from "@/lib/demo-data";

const DAY_MAP: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

const PALETTE = [
  "from-indigo-500 to-purple-500",
  "from-blue-500 to-cyan-500",
  "from-fuchsia-500 to-pink-500",
  "from-violet-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-red-500",
];

export function dayToIndex(day: string): number {
  return DAY_MAP[day] ?? 0;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(m: number): string {
  return `${Math.floor(m / 60)
    .toString()
    .padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`;
}

export function indexToDay(i: number): string {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] ?? "Mon";
}

export async function updateEvent(
  id: string,
  patch: {
    title?: string;
    day_of_week?: number;
    start_minute?: number;
    end_minute?: number;
    notes?: string | null;
    venue?: string | null;
  },
) {
  const { error } = await supabase.from("events").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;
}

// Module-level subscriber set — shared across all useSchedule instances
const _subscribers = new Set<() => void>();

export function broadcastScheduleUpdate() {
  _subscribers.forEach((cb) => cb());
}

export function useSchedule() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [events, setEvents] = useState<EventBlock[]>([]);
  const [loading, setLoading] = useState(true);

  const doFetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: subs }, { data: evts }] = await Promise.all([
      supabase.from("subjects").select("*").eq("user_id", user.id),
      supabase.from("events").select("*").eq("user_id", user.id),
    ]);
    const mappedSubs: Subject[] = (subs ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code ?? "",
      color: s.color,
      lecturer: s.instructor ?? undefined,
      difficulty: ((s as Record<string, unknown>).difficulty as Subject["difficulty"]) ?? undefined,
    }));
    const mappedEvts: EventBlock[] = (evts ?? []).map((e) => ({
      id: e.id,
      subjectId: e.subject_id ?? "",
      title: e.title,
      type: e.type as EventBlock["type"],
      day: e.day_of_week,
      start: e.start_minute,
      end: e.end_minute,
      date: e.event_date ?? undefined,
      venue: e.venue ?? undefined,
    }));
    setSubjects(mappedSubs);
    setEvents(mappedEvts);
    setLoading(false);
  }, [user]);

  // Re-fetch when another instance (e.g. ForgeAssistant) makes a change
  useEffect(() => {
    _subscribers.add(doFetch);
    return () => {
      _subscribers.delete(doFetch);
    };
  }, [doFetch]);

  const refetch = useCallback(async () => {
    await doFetch();
    broadcastScheduleUpdate();
  }, [doFetch]);

  useEffect(() => {
    if (user) doFetch();
    else setLoading(false);
  }, [user, doFetch]);

  return { subjects, events, loading, refetch, hasData: events.length > 0 };
}

export async function persistTimetableEntries(
  userId: string,
  entries: Array<{
    course: string;
    code?: string;
    lecturer?: string;
    venue?: string;
    day: string;
    start: string;
    end: string;
  }>,
) {
  const courseMap = new Map<string, { name: string; code?: string; lecturer?: string }>();
  for (const e of entries) {
    const key = `${e.course}|${e.code ?? ""}`;
    if (!courseMap.has(key))
      courseMap.set(key, { name: e.course, code: e.code, lecturer: e.lecturer });
  }

  const courseList = Array.from(courseMap.values());
  const subjectRows = courseList.map((c, i) => ({
    user_id: userId,
    name: c.name,
    code: c.code ?? null,
    instructor: c.lecturer ?? null,
    color: PALETTE[i % PALETTE.length],
  }));

  const { data: insertedSubs, error: subErr } = await supabase
    .from("subjects")
    .insert(subjectRows)
    .select();
  if (subErr) throw subErr;

  const subjectIdByKey = new Map<string, string>();
  insertedSubs?.forEach((s, i) => {
    const c = courseList[i];
    subjectIdByKey.set(`${c.name}|${c.code ?? ""}`, s.id);
  });

  const eventRows = entries.map((e) => ({
    user_id: userId,
    subject_id: subjectIdByKey.get(`${e.course}|${e.code ?? ""}`) ?? null,
    title: e.course,
    type: "class",
    day_of_week: dayToIndex(e.day),
    start_minute: timeToMinutes(e.start),
    end_minute: timeToMinutes(e.end),
    venue: e.venue ?? null,
  }));

  const { error: evtErr } = await supabase.from("events").insert(eventRows);
  if (evtErr) throw evtErr;
}

export async function persistStudySessions(
  userId: string,
  sessions: Array<{
    day: string;
    start: string;
    end: string;
    subject: string;
    focus: string;
    intensity: string;
    category?: string;
  }>,
  subjects: Subject[],
) {
  const findSub = (name: string) =>
    subjects.find(
      (s) =>
        s.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(s.name.toLowerCase()),
    );

  const rows = sessions.map((s) => {
    const isStudy = !s.category || s.category === "study";
    const sub = isStudy ? findSub(s.subject) : null;
    return {
      user_id: userId,
      subject_id: sub?.id ?? null,
      // Study blocks: "Subject: focus". Life blocks: just the block title.
      title: isStudy ? `${s.subject}: ${s.focus}` : s.subject,
      type: isStudy ? "study" : "break",
      day_of_week: dayToIndex(s.day),
      start_minute: timeToMinutes(s.start),
      end_minute: timeToMinutes(s.end),
      notes: s.intensity,
    };
  });

  const { error } = await supabase.from("events").insert(rows);
  if (error) throw error;
}
