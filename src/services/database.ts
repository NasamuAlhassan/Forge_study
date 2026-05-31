// TODO: replace each function body with real API calls to your backend.
// Currently backed by in-memory arrays seeded with demo data.
// Swap to fetch() calls, tRPC, Drizzle, Prisma, or Supabase as needed.

import type { EventBlock, Subject } from "@/lib/demo-data";
import { SUBJECTS, EVENTS } from "@/lib/demo-data";

let _subjects: Subject[] = [...SUBJECTS];
let _events: EventBlock[] = [...EVENTS];

export const db = {
  subjects: {
    async list(_userId: string): Promise<Subject[]> {
      // TODO: GET /api/subjects?userId=...
      return [..._subjects];
    },

    async insert(items: Omit<Subject, "id">[]): Promise<Subject[]> {
      // TODO: POST /api/subjects
      const inserted: Subject[] = items.map((s, i) => ({
        ...s,
        id: `sub_${Date.now()}_${i}`,
      }));
      _subjects = [..._subjects, ...inserted];
      return inserted;
    },
  },

  events: {
    async list(_userId: string): Promise<EventBlock[]> {
      // TODO: GET /api/events?userId=...
      return [..._events];
    },

    async insert(items: Omit<EventBlock, "id">[]): Promise<EventBlock[]> {
      // TODO: POST /api/events
      const inserted: EventBlock[] = items.map((e, i) => ({
        ...e,
        id: `evt_${Date.now()}_${i}`,
      }));
      _events = [..._events, ...inserted];
      return inserted;
    },

    async update(id: string, patch: Partial<EventBlock>): Promise<void> {
      // TODO: PATCH /api/events/:id
      _events = _events.map((e) => (e.id === id ? { ...e, ...patch } : e));
    },

    async delete(id: string): Promise<void> {
      // TODO: DELETE /api/events/:id
      _events = _events.filter((e) => e.id !== id);
    },
  },

  studyPlans: {
    async insert(
      _userId: string,
      _plan: { context: string; rationale: string; sessions: unknown }
    ): Promise<void> {
      // TODO: POST /api/study-plans
      console.log("Study plan saved (stub — wire up your backend in src/services/database.ts)");
    },
  },
};
