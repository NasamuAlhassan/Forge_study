import { GoogleGenerativeAI, SchemaType, FunctionCallingMode } from "@google/generative-ai";
import type { FunctionDeclaration } from "@google/generative-ai";

export type TimetableEntry = {
  course: string;
  code?: string;
  lecturer?: string;
  venue?: string;
  day: string;
  start: string;
  end: string;
};

export type LifeCategory =
  | "study"
  | "sleep"
  | "meal"
  | "nap"
  | "exercise"
  | "social"
  | "leisure"
  | "personal";

export type StudySession = {
  day: string;
  start: string;
  end: string;
  /** For study blocks: subject name. For life blocks: block title (Sleep, Lunch, Gym, etc.) */
  subject: string;
  /** Brief description of the block's purpose */
  focus: string;
  intensity: "light" | "moderate" | "deep";
  category: LifeCategory;
};

export type StudyPlan = {
  rationale: string;
  sessions: StudySession[];
};

function getGenAI(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Add it to your .env file.");
  return new GoogleGenerativeAI(apiKey);
}

const saveTimetableFn: FunctionDeclaration = {
  name: "save_timetable",
  description: "Save a parsed weekly timetable extracted from an image.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      entries: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            course: { type: SchemaType.STRING },
            code: { type: SchemaType.STRING },
            lecturer: { type: SchemaType.STRING },
            venue: { type: SchemaType.STRING },
            day: { type: SchemaType.STRING, description: "Mon | Tue | Wed | Thu | Fri | Sat | Sun" },
            start: { type: SchemaType.STRING, description: "HH:MM 24-hour format" },
            end: { type: SchemaType.STRING, description: "HH:MM 24-hour format" },
          },
          required: ["course", "day", "start", "end"],
        },
      },
    },
    required: ["entries"],
  },
};

const saveStudyPlanFn: FunctionDeclaration = {
  name: "save_study_plan",
  description: "Save a generated full weekly schedule including study sessions and all life blocks (sleep, meals, exercise, social time, leisure, etc.).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      rationale: {
        type: SchemaType.STRING,
        description: "Warm, personal explanation of why this plan was built this way — specific to the student's goals and lifestyle (2-3 sentences, written like a thoughtful friend, not an algorithm).",
      },
      sessions: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            day: { type: SchemaType.STRING, description: "Mon | Tue | Wed | Thu | Fri | Sat | Sun" },
            start: { type: SchemaType.STRING, description: "HH:MM 24-hour format" },
            end: { type: SchemaType.STRING, description: "HH:MM 24-hour format" },
            subject: {
              type: SchemaType.STRING,
              description: "For study blocks: the academic subject name. For life blocks: a short human title — Sleep, Breakfast, Lunch, Dinner, Cooking, Siesta, Gym, Walk, Social time, Free time, Scrolling, Morning routine, Evening wind-down, etc.",
            },
            focus: {
              type: SchemaType.STRING,
              description: "For study: what to focus on. For life blocks: a very brief description (e.g. 'Rest and recharge', 'Cook and eat dinner', 'Hang out with friends').",
            },
            intensity: {
              type: SchemaType.STRING,
              description: "deep | moderate | light. Use deep/moderate/light for study based on subject difficulty. Use 'light' for ALL non-study life blocks.",
            },
            category: {
              type: SchemaType.STRING,
              description: "study | sleep | meal | nap | exercise | social | leisure | personal",
            },
          },
          required: ["day", "start", "end", "subject", "focus", "intensity", "category"],
        },
      },
    },
    required: ["rationale", "sessions"],
  },
};

export async function extractTimetableFromImage(
  imageDataUrl: string
): Promise<{ entries: TimetableEntry[] }> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [{ functionDeclarations: [saveTimetableFn] }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY, allowedFunctionNames: ["save_timetable"] } },
    systemInstruction: "You are an expert academic timetable parser. Extract every class entry from the image. Always call the save_timetable tool — never reply in plain text.",
  });

  // Split data URL: "data:<mime>;base64,<b64>" → inlineData
  const comma = imageDataUrl.indexOf(",");
  const meta = imageDataUrl.slice(0, comma);
  const b64 = imageDataUrl.slice(comma + 1);
  const mimeType = (meta.match(/:(.*?);/) ?? [])[1] ?? "image/jpeg";

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: "Extract the structured weekly timetable from this image. Use 24-hour times." },
          { inlineData: { mimeType, data: b64 } },
        ],
      },
    ],
  });

  const calls = result.response.functionCalls();
  const args = calls?.[0]?.args as { entries: TimetableEntry[] } | undefined;
  return { entries: args?.entries ?? [] };
}

const VALID_CATEGORIES = new Set<LifeCategory>([
  "study", "sleep", "meal", "nap", "exercise", "social", "leisure", "personal",
]);

export async function generateStudyPlanFromContext(context: string): Promise<StudyPlan> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [{ functionDeclarations: [saveStudyPlanFn] }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY, allowedFunctionNames: ["save_study_plan"] } },
    systemInstruction: `You are Forge, a thoughtful personal advisor helping a student build a realistic, human weekly schedule — not just a study timetable.

Think like a real person who genuinely cares about the student's wellbeing AND grades. A good schedule covers all of life.

WHAT TO INCLUDE (cover every waking hour across the week):
1. SLEEP — Schedule this first. 7–9 hours per night at consistent times. category: "sleep"
2. MORNING ROUTINE — Wake-up, shower, getting ready. 30–45 min. category: "personal"
3. MEALS — Breakfast (~30 min), Lunch (~45 min), Dinner (~60 min with cooking). category: "meal"
4. CLASSES — DO NOT add these — they already exist in the student's calendar. Just never overlap them.
5. STUDY — 60–120 min focused sessions in the student's best energy windows. Use ONLY subject names from STUDENT SUBJECTS. category: "study"
6. SIESTA — A 20–45 min afternoon rest when a natural gap exists. category: "nap"
7. EXERCISE — 30–60 min when energy is available. category: "exercise"
8. SOCIAL TIME — Friends, calls, hangouts. Humans need connection. category: "social"
9. DOWNTIME — Scrolling, TV, reading, gaming — intentional rest, not guilt. category: "leisure"
10. EVENING WIND-DOWN — 20–30 min before sleep to decompress. category: "personal"

CRITICAL RULES:
- Honour the student's stated preferences (sleep time, wake time, preferred activities, goals).
- If they don't specify something, use sensible defaults: wake 7:00, sleep 23:00, 3 meals/day.
- NEVER schedule anything during class times from CLASS SCHEDULE.
- For study blocks, use ONLY subjects listed in STUDENT SUBJECTS — never invent or rename.
- intensity for study: "deep" = hard subject / exam soon, "moderate" = medium difficulty, "light" = easy review. For ALL non-study blocks, always use "light".
- Life block titles must be short and human: "Sleep", "Breakfast", "Lunch", "Dinner", "Siesta", "Gym", "Walk", "Social time", "Free time", "Scrolling", "Morning routine", "Evening wind-down", "Cooking", etc.
- category must be exactly one of: study | sleep | meal | nap | exercise | social | leisure | personal
- The plan should feel hand-crafted. Consider energy rhythms (most people focus best in the morning), exam urgency, and what the student enjoys.
- The rationale must read like a thoughtful friend wrote it — warm, specific to this student, never generic.
- Always call save_study_plan — never reply in plain text.`,
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: context }] }],
  });

  const calls = result.response.functionCalls();
  const args = calls?.[0]?.args as { rationale?: string; sessions?: Array<Record<string, unknown>> } | undefined;

  return {
    rationale: typeof args?.rationale === "string" ? args.rationale : "",
    sessions: (args?.sessions ?? []).map((s) => {
      const category = VALID_CATEGORIES.has(s.category as LifeCategory)
        ? (s.category as LifeCategory)
        : "study";
      return {
        day: String(s.day ?? "Mon"),
        start: String(s.start ?? "09:00"),
        end: String(s.end ?? "10:00"),
        subject: String(s.subject ?? ""),
        focus: String(s.focus ?? ""),
        intensity: (["light", "moderate", "deep"].includes(s.intensity as string)
          ? s.intensity
          : category === "study" ? "moderate" : "light") as StudySession["intensity"],
        category,
      };
    }),
  };
}
