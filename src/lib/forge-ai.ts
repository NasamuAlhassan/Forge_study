export type ChatMessage = { role: "user" | "model"; parts: string };

// Chat completions — OpenRouter (tool-capable paid tier + free fallbacks)
const OR_BASE = "https://openrouter.ai/api/v1";
// Audio transcription — Groq Whisper (separate quota, very generous)
const GROQ_BASE = "https://api.groq.com/openai/v1";

export function isForgeConfigured(): boolean {
  return !!(import.meta.env.VITE_OPENROUTER_API_KEY as string);
}

function getORKey(): string {
  const key = import.meta.env.VITE_OPENROUTER_API_KEY as string;
  if (!key) throw new Error("VITE_OPENROUTER_API_KEY is not set.");
  return key;
}

function getGroqKey(): string {
  const key = import.meta.env.VITE_GROQ_API_KEY as string;
  if (!key) throw new Error("VITE_GROQ_API_KEY is not set.");
  return key;
}

// Structured action returned from either a tool call or parsed text
export interface ForgeRawAction {
  action: string;
  event?: Record<string, unknown>;
  eventId?: string;
  patch?: Record<string, unknown>;
}

export interface ForgeResponse {
  text: string;
  rawActions: ForgeRawAction[];
}

// ── OpenAI-compatible tool definition ─────────────────────────────────────────
// Used by tool-capable models (gpt-4o-mini, gemini-flash) to emit structured
// calendar mutations without embedding JSON in free-form text.
const CALENDAR_TOOL = {
  type: "function" as const,
  function: {
    name: "calendar_action",
    description:
      "Add, edit, or delete a single calendar event. Call once per change; multiple changes = multiple parallel calls.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["add_event", "edit_event", "delete_event"],
        },
        event: {
          type: "object",
          description:
            "For add_event. Provide EITHER 'day' (recurring weekly) OR 'date' (one-time) — never both.",
          properties: {
            title:     { type: "string" },
            type:      { type: "string", enum: ["class", "study", "break", "exam"] },
            day:       { type: "integer", minimum: 0, maximum: 6,
                         description: "0=Mon 1=Tue 2=Wed 3=Thu 4=Fri 5=Sat 6=Sun. Use for recurring weekly events." },
            date:      { type: "string",
                         description: "YYYY-MM-DD. Use ONLY for genuine one-time events (exams, appointments). Never combine with day." },
            startTime: { type: "string", description: "Human-readable, e.g. '9:00 AM' or '14:30'." },
            endTime:   { type: "string", description: "Human-readable, e.g. '10:00 AM' or '15:30'." },
            subjectId: { type: "string",
                         description: "Raw UUID from schedule (no 'id:' prefix, no brackets). Only for class/study/exam." },
            venue:     { type: "string" },
          },
          required: ["title", "type", "startTime", "endTime"],
        },
        eventId: {
          type: "string",
          description:
            "Raw UUID for edit_event or delete_event. Copy only the UUID from [id:UUID] — strip brackets and 'id:' prefix entirely.",
        },
        patch: {
          type: "object",
          description: "Fields to update for edit_event.",
          properties: {
            title:     { type: "string" },
            day:       { type: "integer", minimum: 0, maximum: 6 },
            date:      { type: "string", description: "YYYY-MM-DD" },
            startTime: { type: "string" },
            endTime:   { type: "string" },
            venue:     { type: "string" },
          },
        },
      },
      required: ["action"],
    },
  },
};

// Tier 1 — reliable function calling, very cheap (~$0.001–0.003/msg)
const TOOL_MODELS = [
  "openai/gpt-4o-mini",
  "google/gemini-flash-1.5",
];

// Tier 2 — free text-based fallbacks; use [FORGE_ACTION:…] embedded format
const TEXT_MODELS = [
  "google/gemma-4-31b-it:free",
  "nex-agi/nex-n2-pro:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "google/gemma-4-26b-a4b-it:free",
];

function orHeaders(key: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": "https://forge-study.app",
    "X-Title": "Forge Study Planner",
  };
}

export function buildSystemPrompt(
  schedule: string,
  dateContext: string,
  memory?: string,
  useTools = false,
): string {
  // Action instructions differ by model tier:
  //   useTools=true  → tell the model to call the calendar_action tool
  //   useTools=false → tell the model to embed [FORGE_ACTION:{…}] in its text
  const actionSection = useTools
    ? `CALENDAR CHANGES:
Use the calendar_action tool to add, edit, or delete events. Rules:
- Recurring weekly (classes, church, gym, routines, weekly habits): use "day" (0–6), no "date"
- One-time only (exams, doctor appointments, specific deadlines): use "date" (YYYY-MM-DD), no "day"
- When in doubt, use "day" — most user requests repeat weekly
- eventId: raw UUID only — strip the "id:" prefix and brackets from [id:UUID]
- One tool call per event; multiple changes = multiple parallel calls`
    : `SCHEDULE CHANGE RULES:
- When changing or duplicating an existing event, ALWAYS copy its exact start and end times from the schedule above — never invent durations.
- For new academic events without a time, ask for the time first.
- For new life events without a time, use a sensible default (lunch → 12:00–13:00, gym → 60 min, nap → 20 min) and mention it in your reply rather than asking.
- For new events without a title, use the type as the title (e.g. "Lunch", "Gym", "Nap") — don't ask.
- Use normal human-readable time strings in every reply and action. Never describe a clock time as a minute count.
- When making a calendar change, append one [FORGE_ACTION] block per event at the very end of your message.
  Adding events on Tue, Thu, AND Sat? Append THREE blocks in sequence — one per day. Never combine multiple days into one block.

Add recurring (weekly):  [FORGE_ACTION:{"action":"add_event","event":{"title":"...","type":"class|study|break|exam","day":6,"startTime":"7:00 PM","endTime":"8:00 PM","subjectId":"ID_FROM_SCHEDULE"}}]
Add one-time (specific): [FORGE_ACTION:{"action":"add_event","event":{"title":"...","type":"class|study|break|exam","date":"YYYY-MM-DD","startTime":"7:00 PM","endTime":"8:00 PM","subjectId":"ID_FROM_SCHEDULE"}}]
Edit:   [FORGE_ACTION:{"action":"edit_event","eventId":"ID_FROM_SCHEDULE","patch":{"date":"YYYY-MM-DD","startTime":"5:00 PM","endTime":"6:00 PM"}}]
Delete: [FORGE_ACTION:{"action":"delete_event","eventId":"ID_FROM_SCHEDULE"}]

DAY INDEX — use for recurring "day" field: 0=Monday 1=Tuesday 2=Wednesday 3=Thursday 4=Friday 5=Saturday 6=Sunday
RECURRING vs ONE-TIME rule (critical):
- Use "day": N (no "date") for anything that repeats weekly: classes, church, gym, routines, weekly habits.
- Use "date": "YYYY-MM-DD" (no "day") only for genuine one-off events: exams, doctor appointments, specific deadlines.
- When in doubt, use "day" — it is almost always what the user wants.

TYPE GUIDE — choose the right type for every new event:
- "class"  → recurring academic class or lecture
- "exam"   → test, quiz, or exam
- "study"  → study session, homework, revision, group study
- "break"  → everything else: meals, gym, nap, social time, errand, appointment, free time, personal routine

subjectId is only needed for class/study/exam events — leave it out for life events (type "break").

When rescheduling, ALWAYS use edit_event — never delete+add. Preserve the original duration unless the user says otherwise.
If the user gives a start time but no end time for a new event, default to 1-hour duration.

Dates (one-time only): resolve "today"/"tomorrow" using the current date above, then put the full YYYY-MM-DD.
Times: use strings like "9:00 AM", "7:00 PM", or "19:00".

- Only use IDs that appear in the schedule above — never invent them.`;

  return `You are Forge, a concise personal assistant inside a study planner — but you understand ALL of life, not just academics.
${dateContext}

${
  memory
    ? `WHAT YOU KNOW ABOUT THIS USER (from past conversations — use this to personalise every reply):
${memory}`
    : `MEMORY: You don't know this user yet. As you chat, pick up on their name, how they talk, their study style, preferences, and goals. Update memory whenever you learn something new.`
}

MEMORY RULE:
When you learn something meaningful about the user — their name, personality, communication style, study habits, goals, struggles, preferences — append a [FORGE_MEMORY: ...] block at the very end of your reply. Write a concise updated summary of everything you know (max 150 words), replacing the old memory entirely. Natural tone: "Prince is a CS student at UG. Very casual — uses 'yh', 'sharp'. Finds algorithms hard, prefers morning study. Wants to focus on DSA this semester." Only emit this block when something new is worth remembering — not every message.

STUDENT'S SCHEDULE (recurring events appear every week; dated events are one-time):
${schedule}

RESPONSE RULES — follow strictly:
- Keep every reply to 1-3 short sentences. No lists, no headers, no filler.
- If asked a direct question, answer it directly in one sentence.
- Only elaborate when the student explicitly asks for more detail.

WHAT YOU CAN ADD TO THE CALENDAR:
You can add ANY kind of event a real person has in their day:
- Academic: classes, study sessions, revision, exams, group projects
- Life: meals, gym, naps, social hangouts, errands, chores, cooking, calls, appointments
- Personal: morning routines, wind-downs, walks, hobbies, prayer, meditation, free time
- Reminders: anything the student wants to remember or block off

SURGICAL CHANGE RULE (most important):
- ONLY touch events the user explicitly asked you to change or add. Never move, delete, or modify anything else.
- When rescheduling one event, ONLY touch that event — leave everything else exactly as-is.
- One request = one focused change (or a few closely related ones). Never rewrite the whole schedule unprompted.
- If the user says "can you move X" and X is the only thing they mentioned, emit exactly one edit_event for X — nothing more.

CONFLICT CHECK RULE:
- Before proposing any add or reschedule, mentally scan the schedule above for the target day and time.
- If the new time overlaps with an existing event on the same day, mention the conflict conversationally in your reply — never silently schedule over something.
- Then ask what they'd like to do: (a) move the existing event, (b) pick a different time for the new one, or (c) replace it.
- Only emit a calendar action once the intent is clear. If there is a conflict and you're unsure what to do, ask first, emit no action yet.

DIFFICULTY-AWARE SCHEDULING:
The schedule above shows each subject's difficulty rating. Apply these rules automatically when suggesting study sessions or planning time:
- easy: 30–60 min blocks, flexible timing, lower priority
- medium: 60–90 min blocks, morning or afternoon preferred
- hard: 90–120 min blocks, place in morning (08:00–12:00) when focus is sharpest, higher priority
- very_hard: 120–180 min blocks, multiple sessions spread across the week, always schedule first and in peak hours, highest priority
When the user asks for study help or scheduling, apply this automatically without being asked.

${actionSection}

- If truly unclear, ask one short clarifying question.`.trim();
}

export async function sendForgeMessage(
  messages: ChatMessage[],
  schedule: string,
  dateContext: string,
  memory?: string,
): Promise<ForgeResponse> {
  const key = getORKey();

  const msgList = messages.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.parts,
  }));

  // ── Tier 1: tool-capable models ───────────────────────────────────────────
  // These models receive a tool schema and return structured tool calls instead
  // of embedding JSON in free-form text — zero parsing errors, zero format drift.
  const toolBody = {
    messages: [
      { role: "system", content: buildSystemPrompt(schedule, dateContext, memory, true) },
      ...msgList,
    ],
    temperature: 0.5,
    max_tokens: 500,
    tools: [CALENDAR_TOOL],
    tool_choice: "auto",
    parallel_tool_calls: true,
  };

  for (const model of TOOL_MODELS) {
    const res = await fetch(`${OR_BASE}/chat/completions`, {
      method: "POST",
      headers: orHeaders(key),
      body: JSON.stringify({ ...toolBody, model }),
    });

    if (res.status === 429 || res.status === 503) continue;

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      choices: {
        message: {
          content: string | null;
          tool_calls?: { function: { name: string; arguments: string } }[];
        };
      }[];
    };

    const msg = data.choices[0].message;
    const text = msg.content ?? "";
    const rawActions: ForgeRawAction[] = [];

    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.function.name === "calendar_action") {
          try {
            rawActions.push(JSON.parse(tc.function.arguments) as ForgeRawAction);
          } catch { /* skip malformed */ }
        }
      }
    }

    return { text, rawActions };
  }

  // ── Tier 2: free text-based fallbacks ─────────────────────────────────────
  // These models embed [FORGE_ACTION:{…}] JSON blocks in their text output.
  // We parse them out here so the caller always gets rawActions.
  const textBody = {
    messages: [
      { role: "system", content: buildSystemPrompt(schedule, dateContext, memory, false) },
      ...msgList,
    ],
    temperature: 0.5,
    max_tokens: 400,
  };

  for (const model of TEXT_MODELS) {
    const res = await fetch(`${OR_BASE}/chat/completions`, {
      method: "POST",
      headers: orHeaders(key),
      body: JSON.stringify({ ...textBody, model }),
    });

    if (res.status === 429 || res.status === 503) continue;

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${err}`);
    }

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const text = data.choices[0].message.content;

    const ACTION_RE = /\[FORGE_ACTION:\s*(\{[\s\S]*?\})\s*\]/g;
    const rawActions: ForgeRawAction[] = [];
    for (const match of text.matchAll(ACTION_RE)) {
      try {
        rawActions.push(JSON.parse(match[1]) as ForgeRawAction);
      } catch { /* skip malformed */ }
    }

    return { text, rawActions };
  }

  throw new Error("All models are busy right now — try again in a moment.");
}

// ── Teaching pipeline ─────────────────────────────────────────────────────────
// Two-agent flow:
//   Agent 1 — Perplexity Sonar: searches the web and returns synthesised content
//   Agent 2 — GPT-4o-mini: takes that content and delivers a structured lesson

const TEACH_SYSTEM = `You are Forge — a patient, engaging teacher who speaks like a smart friend, not a textbook.

Teaching rules:
- Open with ONE sentence that gives the big picture of the topic
- Then explain the first key concept clearly (3-5 sentences max)
- After the concept, give a short real-world analogy or example
- End every message with a natural check-in: "Make sense? Want me to go deeper or move on?"
- Keep messages SHORT — never dump everything at once. One concept per message.
- After all concepts are covered, offer: "Want a quick 3-question quiz to lock this in?"
- Never start with "Great question!" or any filler. Jump straight in.
- Write like you're texting a friend who wants to actually understand, not pass a test.`;

export async function searchAndTeach(
  topic: string,
  history: ChatMessage[],
  dateContext: string,
  memory?: string,
): Promise<ForgeResponse> {
  const key = getORKey();

  // ── Agent 1: Perplexity Sonar — web search ────────────────────────────────
  let webContent = "";
  try {
    const sr = await fetch(`${OR_BASE}/chat/completions`, {
      method: "POST",
      headers: orHeaders(key),
      body: JSON.stringify({
        model: "perplexity/sonar",
        messages: [{
          role: "user",
          content: `Give me comprehensive, accurate information about: "${topic}". Cover definitions, how it works, key concepts, and real-world examples. Be thorough and factual.`,
        }],
        max_tokens: 900,
      }),
    });
    if (sr.ok) {
      const sd = await sr.json() as { choices: { message: { content: string } }[] };
      webContent = sd.choices[0].message.content;
    }
  } catch { /* fall through — Agent 2 will use training knowledge */ }

  // ── Agent 2: GPT-4o-mini — teaching ──────────────────────────────────────
  const system = [
    TEACH_SYSTEM,
    webContent
      ? `\nWEB RESEARCH (use this as your primary source material):\n${webContent}`
      : "\nUse your training knowledge to teach this topic.",
    `\n${dateContext}`,
    memory ? `\nUSER MEMORY:\n${memory}` : "",
  ].filter(Boolean).join("\n");

  const msgList = history.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.parts,
  }));

  for (const model of [...TOOL_MODELS, ...TEXT_MODELS]) {
    const res = await fetch(`${OR_BASE}/chat/completions`, {
      method: "POST",
      headers: orHeaders(key),
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...msgList],
        temperature: 0.55,
        max_tokens: 450,
      }),
    });
    if (res.status === 429 || res.status === 503) continue;
    if (!res.ok) continue;
    const data = await res.json() as { choices: { message: { content: string } }[] };
    return { text: data.choices[0].message.content, rawActions: [] };
  }

  throw new Error("All models are busy right now — try again in a moment.");
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const key = getGroqKey();

  const form = new FormData();
  form.append("file", audioBlob, "recording.webm");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "text");
  form.append("language", "en");

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq transcription ${res.status}: ${err}`);
  }

  return (await res.text()).trim();
}
