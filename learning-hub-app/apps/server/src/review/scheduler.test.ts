import { describe, expect, it } from "vitest";
import { nextReviewSchedule } from "./scheduler.js";

const now = new Date("2026-07-08T12:00:00.000Z");

describe("nextReviewSchedule", () => {
  it("advances correct answers with a slightly higher ease", () => {
    expect(nextReviewSchedule({ correct: true, ease: 2.5, intervalDays: 1, now })).toEqual({
      ease: 2.6,
      intervalDays: 3,
      dueAt: "2026-07-11T12:00:00.000Z"
    });
  });

  it("resets wrong answers to tomorrow and lowers ease", () => {
    expect(nextReviewSchedule({ correct: false, ease: 2.5, intervalDays: 6, now })).toEqual({
      ease: 2.3,
      intervalDays: 1,
      dueAt: "2026-07-09T12:00:00.000Z"
    });
  });
});
