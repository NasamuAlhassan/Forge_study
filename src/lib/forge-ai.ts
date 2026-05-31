export type ChatMessage = { role: "user" | "model"; parts: string };

const GROQ_BASE = "https://api.groq.com/openai/v1";

function getKey(): string {
  const key = import.meta.env.VITE_GROQ_API_KEY as string;
  if (!key) throw new Error("VITE_GROQ_API_KEY is not set.");
  return key;
}

export function buildSystemPrompt(schedule: string, dateContext: string): string {
  return `You are Forge, a concise AI academic assistant inside a study planner.
${dateContext}

STUDENT'S SCHEDULE (recurring by day-of-week unless a YYYY-MM-DD date is shown):
${schedule}

RESPONSE RULES — follow strictly:
- Keep every reply to 1-3 short sentences. No lists, no headers, no filler.
- If asked a direct question, answer it directly in one sentence.
- Only elaborate when the student explicitly asks for more detail.

SCHEDULE CHANGE RULES:
- When changing or duplicating an existing event, ALWAYS copy its exact start and end times from the schedule above — never invent durations.
- When adding a new event without specified times, ask for the time first before acting.
- When adding a class, study session, or exam without a title/subject, ask for the subject or title before acting.
- Use normal human-readable time strings in every reply and action. Never describe a clock time as a calculated minute count.
- Append ONE action block at the very end of your message when making a change:

Add:    [FORGE_ACTION:{"action":"add_event","event":{"title":"...","type":"class|study|break|exam","date":"YYYY-MM-DD","startTime":"7:00 PM","endTime":"8:00 PM","subjectId":"ID_FROM_SCHEDULE"}}]
Edit:   [FORGE_ACTION:{"action":"edit_event","eventId":"ID_FROM_SCHEDULE","patch":{"date":"YYYY-MM-DD","startTime":"5:00 PM","endTime":"6:00 PM"}}]
Delete: [FORGE_ACTION:{"action":"delete_event","eventId":"ID_FROM_SCHEDULE"}]

When rescheduling or changing a time, ALWAYS use edit_event — never delete+add. Copy the exact duration from the schedule (end - start must stay the same unless the user specifies otherwise).
If the user gives a start time but no end time for a new event, use a default 1-hour duration.

Dates: resolve "today" and "tomorrow" using the current date above, then put the full YYYY-MM-DD date in the action.
Times: use strings like "9:00 AM", "7:00 PM", or "19:00".

- Only use IDs that appear in the schedule above — never invent them.
- If unclear, ask one short clarifying question.`.trim();
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
      max_tokens: 300,
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
