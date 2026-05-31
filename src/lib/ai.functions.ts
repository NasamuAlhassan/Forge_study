// AI server functions — Lovable API gateway removed.
// TODO: wire up Gemini API in src/services/ai.ts, then these functions will use it automatically.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { extractTimetableFromImage, generateStudyPlanFromContext } from "@/services/ai";

const ExtractInput = z.object({
  imageDataUrl: z.string().min(20),
});

const PlanInput = z.object({
  context: z.string().min(1).max(4000),
});

export const extractTimetable = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ExtractInput.parse(d))
  .handler(async ({ data }) => {
    // TODO: Gemini integration lives in src/services/ai.ts
    return extractTimetableFromImage(data.imageDataUrl);
  });

export const generateStudyPlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PlanInput.parse(d))
  .handler(async ({ data }) => {
    // TODO: Gemini integration lives in src/services/ai.ts
    return generateStudyPlanFromContext(data.context);
  });
