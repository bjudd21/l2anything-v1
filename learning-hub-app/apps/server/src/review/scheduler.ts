export interface ReviewScheduleInput {
  correct: boolean;
  ease?: number;
  intervalDays?: number;
  now?: Date;
}

const dayMs = 24 * 60 * 60 * 1000;

export function nextReviewSchedule({
  correct,
  ease = 2.5,
  intervalDays = 1,
  now = new Date()
}: ReviewScheduleInput) {
  const nextEase = correct ? Math.max(1.3, ease + 0.1) : Math.max(1.3, ease - 0.2);
  const nextIntervalDays = correct
    ? intervalDays <= 1
      ? 3
      : Math.max(1, Math.round(intervalDays * nextEase))
    : 1;

  return {
    ease: nextEase,
    intervalDays: nextIntervalDays,
    dueAt: new Date(now.getTime() + nextIntervalDays * dayMs).toISOString()
  };
}
