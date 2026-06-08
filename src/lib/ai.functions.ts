// AI functions — called directly from the client (no server round-trip needed).
// The Gemini API key is available via VITE_GEMINI_API_KEY in the client bundle.

import { extractTimetableFromImage, generateStudyPlanFromContext } from "@/services/ai";

export {
  extractTimetableFromImage as extractTimetable,
  generateStudyPlanFromContext as generateStudyPlan,
};
