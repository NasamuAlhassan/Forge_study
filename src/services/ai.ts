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

export type StudyPlanOption = {
  name: "Intensive" | "Balanced" | "Relaxed";
  rationale: string;
  sessions: StudySession[];
};

export type StudyPlanOptions = {
  options: StudyPlanOption[];
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

// Reusable session item schema
const sessionItemSchema = {
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
};

const saveStudyPlanFn: FunctionDeclaration = {
  name: "save_study_plan",
  description: "Save three weekly schedule options (Intensive, Balanced, Relaxed) each containing full life + study blocks.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      options: {
        type: SchemaType.ARRAY,
        description: "Exactly 3 plan options in order: Intensive, Balanced, Relaxed.",
        items: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: "Intensive | Balanced | Relaxed",
            },
            rationale: {
              type: SchemaType.STRING,
              description: "Warm, personal explanation of why THIS specific option was built this way (2-3 sentences, written like a thoughtful friend, specific to the student's goals).",
            },
            sessions: {
              type: SchemaType.ARRAY,
              items: sessionItemSchema,
            },
          },
          required: ["name", "rationale", "sessions"],
        },
      },
    },
    required: ["options"],
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

function parseSessions(raw: Array<Record<string, unknown>>): StudySession[] {
  return raw.map((s) => {
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
  });
}

export async function generateStudyPlanFromContext(context: string): Promise<StudyPlanOptions> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [{ functionDeclarations: [saveStudyPlanFn] }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY, allowedFunctionNames: ["save_study_plan"] } },
    systemInstruction: `You are Forge, a thoughtful personal advisor helping a student build a realistic, human weekly schedule — not just a study timetable.

You will produce EXACTLY THREE plan options named "Intensive", "Balanced", and "Relaxed" — in that order. Each option is a full, complete weekly schedule.

WHAT EACH OPTION MEANS:
- Intensive: maximise study hours, fewer leisure blocks, only essential downtime. For students who want to grind.
- Balanced: the thoughtful middle ground — good study coverage, meals, exercise, social time, and real leisure. The default recommendation.
- Relaxed: lighter study load, lots of breathing room, more social/leisure/personal time. For students who need sustainability over hustle.

WHAT TO INCLUDE IN EACH OPTION (every waking hour, every day):
1. SLEEP — Schedule first. 7–9 h/night at consistent times. category: "sleep"
2. MORNING ROUTINE — Wake-up, shower, ready. 30–45 min. category: "personal"
3. MEALS — Breakfast (~30 min), Lunch (~45 min), Dinner (~60 min with cooking). category: "meal"
4. EXISTING EVENTS — NEVER overlap anything listed in EXISTING CALENDAR. Skip those time slots entirely.
5. STUDY — 60–120 min focused sessions. Use ONLY subject names from STUDENT SUBJECTS. category: "study"
6. SIESTA — 20–45 min afternoon rest. category: "nap"
7. EXERCISE — 30–60 min. category: "exercise"
8. SOCIAL TIME — Friends, calls, hangouts. category: "social"
9. DOWNTIME — Scrolling, TV, reading, gaming. category: "leisure"
10. EVENING WIND-DOWN — 20–30 min before sleep. category: "personal"

CRITICAL RULES (apply to ALL three options):
- Honour stated preferences. Missing info → defaults: wake 07:00, sleep 23:00, 3 meals/day.
- NEVER place any block — study or life — over a time already in EXISTING CALENDAR.
- Study blocks: use ONLY subjects from STUDENT SUBJECTS. Never invent subject names.
- intensity: "deep" = hard subject / exam soon, "moderate" = medium, "light" = easy review. Life blocks always "light".
- Life block titles: short and human — "Sleep", "Breakfast", "Lunch", "Dinner", "Siesta", "Gym", "Walk", "Social time", "Free time", "Scrolling", "Morning routine", "Evening wind-down", "Cooking".
- category must be exactly one of: study | sleep | meal | nap | exercise | social | leisure | personal
- Each option's rationale is 2-3 sentences, warm, personal, specific to this student — never generic.
- Always call save_study_plan with all three options — never reply in plain text.`,
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: context }] }],
  });

  const calls = result.response.functionCalls();
  const args = calls?.[0]?.args as { options?: Array<Record<string, unknown>> } | undefined;

  const rawOptions = args?.options ?? [];

  // Fallback: if Gemini returns the old single-plan shape, wrap it
  if (rawOptions.length === 0) {
    const legacy = calls?.[0]?.args as { rationale?: string; sessions?: Array<Record<string, unknown>> } | undefined;
    if (legacy?.sessions) {
      return {
        options: [{
          name: "Balanced",
          rationale: typeof legacy.rationale === "string" ? legacy.rationale : "",
          sessions: parseSessions(legacy.sessions),
        }],
      };
    }
    return { options: [] };
  }

  const VALID_NAMES = new Set(["Intensive", "Balanced", "Relaxed"]);

  return {
    options: rawOptions.map((o) => ({
      name: (VALID_NAMES.has(String(o.name)) ? o.name : "Balanced") as StudyPlanOption["name"],
      rationale: typeof o.rationale === "string" ? o.rationale : "",
      sessions: parseSessions(Array.isArray(o.sessions) ? o.sessions as Array<Record<string, unknown>> : []),
    })),
  };
}
