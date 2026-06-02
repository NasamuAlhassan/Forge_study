export type ChatMessage = { role: "user" | "model"; parts: string };

const GROQ_BASE = "https://api.groq.com/openai/v1";

function getKey(): string {
  const key = import.meta.env.VITE_GROQ_API_KEY as string;
  if (!key) throw new Error("VITE_GROQ_API_KEY is not set.");
  return key;
}

export function buildSystemPrompt(schedule: string, dateContext: string): string {
  return `You are Forge, a concise personal assistant inside a study planner — but you understand ALL of life, not just academics.
${dateContext}

STUDENT'S SCHEDULE (recurring by day-of-week unless a YYYY-MM-DD date is shown):
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

SCHEDULE CHANGE RULES:
- When changing or duplicating an existing event, ALWAYS copy its exact start and end times from the schedule above — never invent durations.
- For new academic events without a time, ask for the time first.
- For new life events without a time, use a sensible default (lunch → 12:00–13:00, gym → 60 min, nap → 20 min) and mention it in your reply rather than asking.
- For new events without a title, use the type as the title (e.g. "Lunch", "Gym", "Nap") — don't ask.
- Use normal human-readable time strings in every reply and action. Never describe a clock time as a minute count.
- When making a calendar change, append one [FORGE_ACTION] block per event at the very end of your message.
  Adding events on Tue, Thu, AND Sat? Append THREE blocks in sequence — one per day. Never combine multiple days into one block.

Add:    [FORGE_ACTION:{"action":"add_event","event":{"title":"...","type":"class|study|break|exam","date":"YYYY-MM-DD","startTime":"7:00 PM","endTime":"8:00 PM","subjectId":"ID_FROM_SCHEDULE"}}]
Edit:   [FORGE_ACTION:{"action":"edit_event","eventId":"ID_FROM_SCHEDULE","patch":{"date":"YYYY-MM-DD","startTime":"5:00 PM","endTime":"6:00 PM"}}]
Delete: [FORGE_ACTION:{"action":"delete_event","eventId":"ID_FROM_SCHEDULE"}]

TYPE GUIDE — choose the right type for every new event:
- "class"  → recurring academic class or lecture
- "exam"   → test, quiz, or exam
- "study"  → study session, homework, revision, group study
- "break"  → everything else: meals, gym, nap, social time, errand, appointment, free time, personal routine

subjectId is only needed for class/study/exam events — leave it out for life events (type "break").

When rescheduling, ALWAYS use edit_event — never delete+add. Preserve the original duration unless the user says otherwise.
If the user gives a start time but no end time for a new event, default to 1-hour duration.

Dates: resolve "today"/"tomorrow" using the current date above, then put the full YYYY-MM-DD in the action.
Times: use strings like "9:00 AM", "7:00 PM", or "19:00".

- Only use IDs that appear in the schedule above — never invent them.
- If truly unclear, ask one short clarifying question.`.trim();
}

export async function sendForgeMessage(
  messages: ChatMessage[],
  schedule: string,
  dateContext: string,
): Promise<string> {
  const key = getKey();

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: buildSystemPrompt(schedule, dateContext) },
        ...messages.map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.parts,
        })),
      ],
      temperature: 0.5,
      max_tokens: 700,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const key = getKey();

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
