/**
 * Timetable export utilities — zero external dependencies.
 *
 * exportICS  → .ics  RFC-5545 calendar file (import into Google Calendar, Apple Calendar, etc.)
 * exportPNG  → .png  high-resolution canvas render of the current week
 * exportPDF  → opens a print window pre-loaded with the canvas image; user saves as PDF
 */

import type { EventBlock, Subject } from "@/lib/demo-data";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function eventOccursOnDay(e: EventBlock, dayDate: Date): boolean {
  if (e.date) return e.date === dateStr(dayDate);
  return e.day === (dayDate.getDay() + 6) % 7;
}

// ─── ICS export ───────────────────────────────────────────────────────────────

const ICAL_DAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Fold long lines at 75 octets as required by RFC 5545 §3.1 */
function icsFold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  let pos = 75;
  while (pos < line.length) {
    chunks.push(" " + line.slice(pos, pos + 74));
    pos += 74;
  }
  return chunks.join("\r\n");
}

function icsProp(name: string, value: string): string {
  return icsFold(`${name}:${value}`);
}

function icsDateTime(d: Date): string {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}${pad2(d.getMinutes())}00`
  );
}

/** Returns the date of the next (or today's) occurrence of dayIndex 0=Mon…6=Sun */
function nextWeekdayDate(dayIndex: number): Date {
  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7;
  const diff = (dayIndex - todayDow + 7) % 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}

export function exportICS(events: EventBlock[], subjects: Subject[]): void {
  if (events.length === 0) return;

  const subjectById = (id: string) => subjects.find((s) => s.id === id);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Forge Study Plans//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Forge Study Plan",
  ];

  for (const e of events) {
    const subj = e.subjectId ? subjectById(e.subjectId) : undefined;
    const sh = Math.floor(e.start / 60);
    const sm = e.start % 60;
    const eh = Math.floor(e.end / 60);
    const em = e.end % 60;

    const desc = icsEscape(
      [
        subj
          ? `${e.type.charAt(0).toUpperCase() + e.type.slice(1)} · ${subj.name}${subj.code ? ` (${subj.code})` : ""}`
          : e.type,
        e.venue ? `Location: ${e.venue}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );

    const uid = `forge-${e.id}@forgestudyplans`;

    if (e.date) {
      const [yr, mo, dy] = e.date.split("-").map(Number);
      const dtStart = new Date(yr, mo - 1, dy, sh, sm, 0);
      const dtEnd = new Date(yr, mo - 1, dy, eh, em, 0);
      lines.push(
        "BEGIN:VEVENT",
        icsProp("DTSTART", icsDateTime(dtStart)),
        icsProp("DTEND", icsDateTime(dtEnd)),
        icsProp("SUMMARY", icsEscape(e.title)),
        icsProp("DESCRIPTION", desc),
        ...(e.venue ? [icsProp("LOCATION", icsEscape(e.venue))] : []),
        icsProp("UID", uid),
        "END:VEVENT",
      );
    } else {
      const base = nextWeekdayDate(e.day);
      base.setHours(sh, sm, 0, 0);
      const end = new Date(base);
      end.setHours(eh, em, 0, 0);
      lines.push(
        "BEGIN:VEVENT",
        icsProp("DTSTART", icsDateTime(base)),
        icsProp("DTEND", icsDateTime(end)),
        `RRULE:FREQ=WEEKLY;BYDAY=${ICAL_DAY[e.day]}`,
        icsProp("SUMMARY", icsEscape(e.title)),
        icsProp("DESCRIPTION", desc),
        ...(e.venue ? [icsProp("LOCATION", icsEscape(e.venue))] : []),
        icsProp("UID", uid),
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR");
  downloadBlob(
    new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" }),
    "forge-timetable.ics",
  );
}

// ─── Canvas schedule renderer (shared by PNG + PDF) ───────────────────────────

// Map Tailwind gradient class → hex for canvas fill
const TW_COLOR: Record<string, string> = {
  "from-indigo-500 to-purple-500": "#6366f1",
  "from-blue-500 to-cyan-500": "#3b82f6",
  "from-fuchsia-500 to-pink-500": "#d946ef",
  "from-violet-500 to-indigo-500": "#8b5cf6",
  "from-emerald-500 to-teal-500": "#10b981",
  "from-amber-500 to-orange-500": "#f59e0b",
  "from-rose-500 to-red-500": "#f43f5e",
};

const TYPE_COLOR: Record<string, string> = {
  class: "#6366f1",
  study: "#8b5cf6",
  exam: "#f43f5e",
  break: "#475569",
};

/** Semantic break color by title keyword (mirrors WeekCalendar.tsx breakGradient) */
function breakColor(title: string): string {
  const t = title.toLowerCase();
  if (/sleep|night|bed/.test(t)) return "#334155";
  if (/siesta|nap/.test(t)) return "#7c3aed";
  if (/meal|lunch|dinner|breakfast|cook|eat|food|snack/.test(t)) return "#d97706";
  if (/gym|exercise|walk|run|jog|workout|sport/.test(t)) return "#059669";
  if (/social|friend|chill|hang|party|call/.test(t)) return "#db2777";
  if (/free|leisure|scroll|relax|tv|game|movie/.test(t)) return "#0284c7";
  if (/morning|routine|prep|prayer|meditat/.test(t)) return "#b45309";
  if (/wind.?down|evening|rest/.test(t)) return "#4338ca";
  return "#475569";
}

function eventColor(subj: Subject | undefined, e: EventBlock): string {
  if (e.type === "exam") return "#f43f5e";
  if (e.type === "break") return breakColor(e.title);
  if (subj?.color) return TW_COLOR[subj.color] ?? TYPE_COLOR[e.type] ?? "#6366f1";
  return TYPE_COLOR[e.type] ?? "#6366f1";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function clampText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function renderScheduleCanvas(
  events: EventBlock[],
  subjects: Subject[],
  weekStart: Date,
  weekLabel: string,
  isDark: boolean,
): HTMLCanvasElement {
  const subjectById = (id: string) => subjects.find((s) => s.id === id);

  // Week dates Mon…Sun
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  // Layout constants
  const DPR = Math.min(window.devicePixelRatio || 2, 2);
  const W = 1200;
  const TITLE_H = 44;
  const HEADER_H = 56;
  const TIME_W = 60;
  const START_H = 7;
  const END_H = 23;
  const HOURS = END_H - START_H; // 16
  const HOUR_PX = 52;
  const BODY_H = HOURS * HOUR_PX;
  const H = TITLE_H + HEADER_H + BODY_H;
  const DAY_W = Math.floor((W - TIME_W) / 7);

  const canvas = document.createElement("canvas");
  canvas.width = W * DPR;
  canvas.height = H * DPR;

  const ctx = canvas.getContext("2d")!;
  ctx.scale(DPR, DPR);

  // Theme palette
  const bg = isDark ? "#111827" : "#ffffff";
  const headerBg = isDark ? "#1e2433" : "#f8f9ff";
  const borderC = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const timeC = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)";
  const dayC = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)";
  const titleC = isDark ? "#f1f5f9" : "#0f172a";
  const subC = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)";
  const todayStr = dateStr(new Date());

  // ── Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Title bar
  ctx.fillStyle = headerBg;
  ctx.fillRect(0, 0, W, TITLE_H);

  // Logo pill
  const logoGrad = ctx.createLinearGradient(14, 10, 36, 34);
  logoGrad.addColorStop(0, "#818cf8");
  logoGrad.addColorStop(1, "#7c3aed");
  roundRect(ctx, 14, 10, 24, 24, 6);
  ctx.fillStyle = logoGrad;
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px system-ui,-apple-system,sans-serif";
  ctx.fillText("F", 21, 26);

  ctx.fillStyle = titleC;
  ctx.font = "600 14px system-ui,-apple-system,sans-serif";
  ctx.fillText("Forge", 44, 27);

  ctx.fillStyle = subC;
  ctx.font = "400 11px system-ui,-apple-system,sans-serif";
  const labelW = ctx.measureText(weekLabel).width;
  ctx.fillText(weekLabel, W - labelW - 16, 27);

  ctx.strokeStyle = borderC;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, TITLE_H);
  ctx.lineTo(W, TITLE_H);
  ctx.stroke();

  // ── Day headers
  ctx.fillStyle = headerBg;
  ctx.fillRect(0, TITLE_H, W, HEADER_H);

  for (let i = 0; i < 7; i++) {
    const x = TIME_W + i * DAY_W;
    const d = weekDates[i];
    const isToday = dateStr(d) === todayStr;
    const cx = x + DAY_W / 2;

    // Day label
    ctx.fillStyle = isToday ? "#818cf8" : dayC;
    ctx.font = "500 10px system-ui,-apple-system,sans-serif";
    const dLabelW = ctx.measureText(DAYS_SHORT[i]).width;
    ctx.fillText(DAYS_SHORT[i], cx - dLabelW / 2, TITLE_H + 17);

    // Date number
    const dateNum = String(d.getDate());
    const numCy = TITLE_H + 38;
    if (isToday) {
      ctx.fillStyle = "#7c3aed";
      ctx.beginPath();
      ctx.arc(cx, numCy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "600 11px system-ui,-apple-system,sans-serif";
    } else {
      ctx.fillStyle = dayC;
      ctx.font = "400 12px system-ui,-apple-system,sans-serif";
    }
    const numW = ctx.measureText(dateNum).width;
    ctx.fillText(dateNum, cx - numW / 2, numCy + 4);

    // Column separator
    if (i > 0) {
      ctx.strokeStyle = borderC;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, TITLE_H);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = borderC;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, TITLE_H + HEADER_H);
  ctx.lineTo(W, TITLE_H + HEADER_H);
  ctx.stroke();

  // ── Time grid
  for (let h = 0; h <= HOURS; h++) {
    const y = TITLE_H + HEADER_H + h * HOUR_PX;
    if (h < HOURS) {
      ctx.fillStyle = timeC;
      ctx.font = "400 9px system-ui,-apple-system,sans-serif";
      const label = `${(START_H + h).toString().padStart(2, "0")}:00`;
      const lw = ctx.measureText(label).width;
      ctx.fillText(label, TIME_W - lw - 6, y + 11);
    }
    ctx.strokeStyle = borderC;
    ctx.lineWidth = h % 2 === 0 ? 1 : 0.4;
    ctx.beginPath();
    ctx.moveTo(TIME_W, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // Time column right edge
  ctx.strokeStyle = borderC;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(TIME_W, TITLE_H);
  ctx.lineTo(TIME_W, H);
  ctx.stroke();

  // ── Events
  for (let di = 0; di < 7; di++) {
    const dayDate = weekDates[di];
    const dayEvts = events
      .filter((e) => eventOccursOnDay(e, dayDate))
      .sort((a, b) => a.start - b.start);

    for (const e of dayEvts) {
      const startMin = e.start - START_H * 60;
      const endMin = e.end - START_H * 60;
      if (startMin < 0 || endMin <= 0) continue;

      const top = Math.round(TITLE_H + HEADER_H + (startMin / 60) * HOUR_PX) + 2;
      const bot = Math.round(TITLE_H + HEADER_H + (endMin / 60) * HOUR_PX) - 2;
      const ht = bot - top;
      if (ht < 6) continue;

      const ex = TIME_W + di * DAY_W + 2;
      const ew = DAY_W - 4;
      const subj = e.subjectId ? subjectById(e.subjectId) : undefined;
      const hex = eventColor(subj, e);

      // Fill
      roundRect(ctx, ex, top, ew, ht, 5);
      ctx.fillStyle = hex;
      ctx.globalAlpha = e.type === "break" ? 0.8 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Specular overlay
      ctx.save();
      roundRect(ctx, ex, top, ew, ht, 5);
      ctx.clip();
      const spec = ctx.createLinearGradient(ex, top, ex + ew, top + ht * 0.55);
      spec.addColorStop(0, "rgba(255,255,255,0.22)");
      spec.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = spec;
      ctx.fill();
      ctx.restore();

      // Title text
      const pad = 6;
      ctx.fillStyle = "#fff";
      ctx.font = "600 9.5px system-ui,-apple-system,sans-serif";
      ctx.fillText(clampText(ctx, e.title, ew - pad * 2), ex + pad, top + 14);

      // Time text
      if (ht > 24) {
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.font = "400 8.5px system-ui,-apple-system,sans-serif";
        const ts = `${pad2(Math.floor(e.start / 60))}:${pad2(e.start % 60)}`;
        ctx.fillText(ts, ex + pad, top + 25);
      }
    }
  }

  return canvas;
}

// ─── PNG export ───────────────────────────────────────────────────────────────

export function exportPNG(
  events: EventBlock[],
  subjects: Subject[],
  weekStart: Date,
  weekLabel: string,
  isDark: boolean,
): void {
  const canvas = renderScheduleCanvas(events, subjects, weekStart, weekLabel, isDark);
  canvas.toBlob(
    (blob) => {
      if (blob) downloadBlob(blob, "forge-timetable.png");
    },
    "image/png",
    1,
  );
}

// ─── PDF export ───────────────────────────────────────────────────────────────

export function exportPDF(
  events: EventBlock[],
  subjects: Subject[],
  weekStart: Date,
  weekLabel: string,
): void {
  // Always render on white for a clean print
  const canvas = renderScheduleCanvas(events, subjects, weekStart, weekLabel, false);
  const dataUrl = canvas.toDataURL("image/png");

  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow pop-ups for this site, then try exporting again.");
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Forge Timetable – ${weekLabel}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #fff;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      min-height: 100vh; padding: 20px;
      font-family: system-ui, -apple-system, sans-serif;
    }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    .hint { margin-top: 14px; font-size: 12px; color: #94a3b8; text-align: center; }
    @media print {
      body { padding: 0; min-height: unset; justify-content: flex-start; }
      img { border-radius: 0; width: 100%; }
      .hint { display: none; }
    }
    @page { margin: 0.4cm; size: A4 landscape; }
  </style>
</head>
<body>
  <img src="${dataUrl}" alt="Forge weekly timetable">
  <p class="hint">Use your browser's Print dialog to save as PDF &rarr; choose "Save as PDF" as the destination.</p>
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 350);
    });
  </script>
</body>
</html>`);
  win.document.close();
}
