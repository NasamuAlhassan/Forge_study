import assert from "node:assert/strict";
import {
  buildAssistantDateContext,
  buildEventInsert,
  describeEventTime,
  normalizeForgeAction,
} from "../src/lib/forge-ai-actions.js";
import { buildSystemPrompt } from "../src/lib/forge-ai.js";

const now = new Date("2026-05-30T13:45:00");

assert.equal(
  buildAssistantDateContext(now),
  "Current time: 1:45 PM. Today is Saturday, May 30, 2026.",
);

const prompt = buildSystemPrompt("Saturday: Math 7:00 PM-8:00 PM", buildAssistantDateContext(now));
assert.match(prompt, /Current time: 1:45 PM\. Today is Saturday, May 30, 2026\./);
assert.doesNotMatch(prompt, /minutes since midnight/i);
assert.match(prompt, /startTime/);
assert.match(prompt, /endTime/);

const todayAction = normalizeForgeAction(
  {
    action: "add_event",
    event: {
      title: "Math",
      type: "class",
      date: "2026-05-30",
      startTime: "7:00 PM",
      endTime: "8:00 PM",
      subjectId: "math",
    },
  },
  now,
);

assert.equal(todayAction.action, "add_event");
assert.equal(todayAction.event.date, "2026-05-30");
assert.equal(todayAction.event.day, 5);
assert.equal(todayAction.event.startTime, "19:00");
assert.equal(todayAction.event.endTime, "20:00");
assert.equal(describeEventTime(todayAction.event), "Sat 7:00 PM-8:00 PM");

assert.deepEqual(buildEventInsert(todayAction.event, "user-1"), {
  user_id: "user-1",
  subject_id: "math",
  title: "Math",
  type: "class",
  day_of_week: 5,
  start_minute: 1140,
  end_minute: 1200,
  event_date: "2026-05-30",
  venue: null,
});

const tomorrowAction = normalizeForgeAction(
  {
    action: "add_event",
    event: {
      title: "Math",
      type: "class",
      date: "tomorrow",
      startTime: "9am",
    },
  },
  now,
);

assert.equal(tomorrowAction.action, "add_event");
assert.equal(tomorrowAction.event.date, "2026-05-31");
assert.equal(tomorrowAction.event.day, 6);
assert.equal(tomorrowAction.event.startTime, "09:00");
assert.equal(tomorrowAction.event.endTime, "10:00");

assert.throws(
  () =>
    normalizeForgeAction(
      {
        action: "add_event",
        event: {
          title: "Bad",
          type: "class",
          date: "2026-05-30",
          startTime: 1140,
        },
      },
      now,
    ),
  /startTime must be a human-readable time string/,
);

console.log("forge-ai-actions regression tests passed");
