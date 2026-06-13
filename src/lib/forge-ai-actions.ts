const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * Strips the "id:" prefix and surrounding brackets that free models sometimes
 * copy verbatim from the schedule format "[id:UUID]" into action fields.
 * Input "id:abc-123" → "abc-123", "[id:abc-123]" → "abc-123", "abc-123" → "abc-123"
 */
function sanitizeId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw
    .trim()
    .replace(/^\[/, "").replace(/\]$/, "")  // strip surrounding brackets
    .replace(/^id:\s*/i, "")                // strip "id:" prefix
    .trim() || undefined;
}

export type ForgeEventType = "class" | "study" | "break" | "exam";

export interface ForgeEventInput {
  title: string;
  type: ForgeEventType;
  date?: string;
  day?: number;
  startTime?: unknown;
  endTime?: unknown;
  subjectId?: string;
  venue?: string;
}

export interface NormalizedForgeEvent {
  title: string;
  type: ForgeEventType;
  /** undefined = recurring (stored with NULL event_date, appears every matching weekday) */
  date?: string;
  day: number;
  startTime: string;
  endTime: string;
  subjectId?: string;
  venue?: string;
}

export interface AddEventAction {
  action: "add_event";
  event: NormalizedForgeEvent;
}

export interface EditEventAction {
  action: "edit_event";
  eventId: string;
  patch: {
    date?: string;
    day?: number;
    startTime?: string;
    endTime?: string;
    title?: string;
    venue?: string;
  };
}

export interface DeleteEventAction {
  action: "delete_event";
  eventId: string;
}

export type ForgeAction = AddEventAction | EditEventAction | DeleteEventAction;

type RawForgeAction =
  | { action: "add_event"; event: ForgeEventInput }
  | { action: "edit_event"; eventId: string; patch: Record<string, unknown> }
  | { action: "delete_event"; eventId: string };

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dayIndexForDate(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(base.getDate() + days);
  return next;
}

function resolveDate(input: string | undefined, now: Date): string {
  const clean = input?.trim().toLowerCase();
  if (!clean || clean === "today") return toDateString(now);
  if (clean === "tomorrow") return toDateString(addDays(now, 1));
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  throw new Error("Event date must be today, tomorrow, or YYYY-MM-DD.");
}

function parseTimeString(value: unknown, field: "startTime" | "endTime"): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a human-readable time string.`);
  }

  const clean = value.trim().toLowerCase().replace(/\s+/g, "");
  const match = clean.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/);
  if (!match) throw new Error(`${field} must be a human-readable time string.`);

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3];

  if (minutes < 0 || minutes > 59) throw new Error(`${field} has invalid minutes.`);
  if (meridiem) {
    if (hours < 1 || hours > 12) throw new Error(`${field} has invalid hours.`);
    if (meridiem === "pm" && hours !== 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  } else if (hours === 24 && minutes === 0) {
    hours = 0; // normalize "24:00" → "00:00" (midnight)
  } else if (hours < 0 || hours > 23) {
    throw new Error(`${field} has invalid hours.`);
  }

  return `${pad2(hours)}:${pad2(minutes)}`;
}

function addOneHour(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${pad2((hours + 1) % 24)}:${pad2(minutes)}`;
}

export function timeStringToMinutes(time: string): number {
  const parsed = parseTimeString(time, "startTime");
  const [hours, minutes] = parsed.split(":").map(Number);
  return hours * 60 + minutes;
}

function assertValidLocalDateTime(date: string, time: string, field: string): Date {
  const value = new Date(`${date}T${time}:00`);
  if (Number.isNaN(value.getTime())) throw new Error(`${field} is not a valid date/time.`);
  return value;
}

export function displayTime(time: string): string {
  const parsed = parseTimeString(time, "startTime");
  const [hours, minutes] = parsed.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${pad2(minutes)} ${suffix}`;
}

export function displayTimeFromMinutes(minutes: number): string {
  // Normalize to 0-1439 to guard against AI-generated out-of-range values
  // already stored in DB (e.g. "24:00" → 1440 → wraps to 0 = midnight)
  const norm = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 || 12;
  return `${displayHour}:${pad2(m)} ${suffix}`;
}

export function describeEventTime(event: NormalizedForgeEvent): string {
  return `${DAY_SHORT[event.day]} ${displayTime(event.startTime)}-${displayTime(event.endTime)}`;
}

export function buildAssistantDateContext(now = new Date()): string {
  const currentTime = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const today = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `Current time: ${currentTime}. Today is ${today}.`;
}

export function normalizeForgeAction(raw: RawForgeAction, now = new Date()): ForgeAction {
  if (raw.action === "delete_event") {
    return { action: "delete_event", eventId: sanitizeId(raw.eventId) ?? raw.eventId };
  }

  if (raw.action === "edit_event") {
    const patch: EditEventAction["patch"] = {};
    if (typeof raw.patch.title === "string") patch.title = raw.patch.title;
    if (typeof raw.patch.venue === "string") patch.venue = raw.patch.venue;
    if (typeof raw.patch.date === "string") {
      patch.date = resolveDate(raw.patch.date, now);
      patch.day = dayIndexForDate(new Date(`${patch.date}T00:00:00`));
    } else if (typeof raw.patch.day === "number") {
      patch.day = raw.patch.day;
    }
    if (raw.patch.startTime !== undefined)
      patch.startTime = parseTimeString(raw.patch.startTime, "startTime");
    if (raw.patch.endTime !== undefined)
      patch.endTime = parseTimeString(raw.patch.endTime, "endTime");
    return { action: "edit_event", eventId: sanitizeId(raw.eventId) ?? raw.eventId, patch };
  }

  const startTime = parseTimeString(raw.event.startTime, "startTime");
  const endTime =
    raw.event.endTime === undefined
      ? addOneHour(startTime)
      : parseTimeString(raw.event.endTime, "endTime");

  // Recurring weekly event — AI supplied a day index instead of a specific date.
  // Store with NULL event_date so the calendar shows it every matching weekday.
  if (typeof raw.event.day === "number" && raw.event.date === undefined) {
    return {
      action: "add_event",
      event: {
        title: raw.event.title,
        type: raw.event.type,
        day: Math.max(0, Math.min(6, raw.event.day)),
        startTime,
        endTime,
        subjectId: sanitizeId(raw.event.subjectId),
        venue: raw.event.venue,
      },
    };
  }

  // One-time event — resolve the specific date and derive the day from it.
  const date = resolveDate(raw.event.date, now);
  const eventDate = new Date(`${date}T00:00:00`);

  assertValidLocalDateTime(date, startTime, "startTime");
  assertValidLocalDateTime(date, endTime, "endTime");

  return {
    action: "add_event",
    event: {
      title: raw.event.title,
      type: raw.event.type,
      date,
      day: dayIndexForDate(eventDate),
      startTime,
      endTime,
      subjectId: sanitizeId(raw.event.subjectId),
      venue: raw.event.venue,
    },
  };
}

export function buildEventInsert(event: NormalizedForgeEvent, userId: string) {
  // Only validate full datetime when we have a specific date (one-time events).
  // Recurring events have no date — just validate the time strings are parseable.
  if (event.date) {
    assertValidLocalDateTime(event.date, event.startTime, "startTime");
    assertValidLocalDateTime(event.date, event.endTime, "endTime");
  }

  return {
    user_id: userId,
    subject_id: event.subjectId || null,
    title: event.title,
    type: event.type,
    day_of_week: event.day,
    start_minute: timeStringToMinutes(event.startTime),
    end_minute: timeStringToMinutes(event.endTime),
    event_date: event.date ?? null, // null = recurring weekly; string = one-time
    venue: event.venue ?? null,
  };
}
