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

export type StudySession = {
  day: string;
  start: string;
  end: string;
  subject: string;
  focus: string;
  intensity: "light" | "moderate" | "deep";
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
  description: "Save a generated weekly study plan.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      rationale: {
        type: SchemaType.STRING,
        description: "Short explanation of why this plan was generated (2-3 sentences).",
      },
      sessions: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            day: { type: SchemaType.STRING, description: "Mon | Tue | Wed | Thu | Fri | Sat | Sun" },
            start: { type: SchemaType.STRING, description: "HH:MM 24-hour format" },
            end: { type: SchemaType.STRING, description: "HH:MM 24-hour format" },
            subject: { type: SchemaType.STRING },
            focus: { type: SchemaType.STRING, description: "What to focus on in this session" },
            intensity: { type: SchemaType.STRING, description: "light | moderate | deep" },
          },
          required: ["day", "start", "end", "subject", "focus", "intensity"],
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

export async function generateStudyPlanFromContext(context: string): Promise<StudyPlan> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [{ functionDeclarations: [saveStudyPlanFn] }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY, allowedFunctionNames: ["save_study_plan"] } },
    systemInstruction:
      "You are Forge, an academic study coach. Generate a balanced weekly study plan.\n\nCRITICAL RULES:\n- Use ONLY the subjects listed under 'STUDENT SUBJECTS' — never invent or rename any subject.\n- Never schedule study during the student's existing class times listed under 'CLASS SCHEDULE'.\n- Keep sessions 60–120 min. Include short breaks.\n- Consider sleep schedule, free periods, exam urgency, and difficulty levels.\n- Always call the save_study_plan tool — never reply in plain text.",
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: context }] }],
  });

  const calls = result.response.functionCalls();
  const args = calls?.[0]?.args as StudyPlan | undefined;
  return {
    rationale: args?.rationale ?? "",
    sessions: (args?.sessions ?? []).map((s) => ({
      ...s,
      intensity: (["light", "moderate", "deep"].includes(s.intensity)
        ? s.intensity
        : "moderate") as StudySession["intensity"],
    })),
  };
}
