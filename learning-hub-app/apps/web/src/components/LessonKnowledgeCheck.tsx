import type { Quiz, QuizAttemptResponse } from "@learning-hub/shared";
import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { ZapIcon } from "./icons.js";
import { Badge, button, card, InlineNotice, SectionHeader, Textarea } from "./ui.js";

export function LessonKnowledgeCheck({
  onComplete,
  onSubmit,
  quiz
}: {
  onComplete: () => Promise<void>;
  onSubmit: (quizId: number, answers: Record<string, string>) => Promise<QuizAttemptResponse>;
  quiz: Quiz;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState<QuizAttemptResponse["attempt"]>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const answeredAll = quiz.questions.every((question) => answers[question.id]?.trim());
  const feedbackByQuestion = useMemo(
    () => new Map(attempt?.feedback.map((item) => [item.questionId, item]) ?? []),
    [attempt]
  );

  const handleSubmit = async () => {
    if (!answeredAll || submitting || attempt) {
      return;
    }

    setSubmitting(true);
    setError(undefined);

    try {
      const response = await onSubmit(quiz.id, answers);
      await onComplete();
      setAttempt(response.attempt);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The knowledge check could not be submitted."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section aria-labelledby={`knowledge-check-${quiz.id}`} className={`${card} p-5`}>
      <SectionHeader
        count={`${quiz.questions.length} questions`}
        icon={<ZapIcon size={16} />}
        title={
          <span id={`knowledge-check-${quiz.id}`}>
            {attempt ? "Knowledge check complete" : "Check your understanding"}
          </span>
        }
      />
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        {attempt
          ? "Your lesson is complete and these concepts are now scheduled for future review."
          : "Answer from memory. Submitting this check completes the lesson and schedules review."}
      </p>

      <div className="mt-5 grid">
        {quiz.questions.map((question, index) => {
          const feedback = feedbackByQuestion.get(question.id);

          return (
            <div
              className="grid gap-3 border-t border-border py-5 first:border-t-0 first:pt-0 last:pb-0"
              key={question.id}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="tnum grid size-7 shrink-0 place-items-center rounded-md border border-border bg-secondary/55 text-xs font-bold text-muted-foreground">
                  {index + 1}
                </span>
                <p className="pt-0.5 text-sm font-semibold leading-6 text-foreground">
                  {question.prompt}
                </p>
              </div>

              {question.type === "mcq" ? (
                <fieldset className="grid gap-2 pl-0 sm:pl-10" disabled={Boolean(attempt)}>
                  <legend className="sr-only">Choose one answer</legend>
                  {question.options.map((option) => {
                    const selected = answers[question.id] === option.id;

                    return (
                      <label
                        className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm transition-colors ${
                          selected
                            ? "border-primary/45 bg-primary-soft/40 text-foreground"
                            : "border-border bg-secondary/20 text-muted-foreground hover:bg-secondary/45 hover:text-foreground"
                        }`}
                        key={option.id}
                      >
                        <input
                          checked={selected}
                          className="size-4 shrink-0 cursor-pointer accent-primary"
                          name={`quiz-${quiz.id}-${question.id}`}
                          onChange={() =>
                            setAnswers((current) => ({
                              ...current,
                              [question.id]: option.id
                            }))
                          }
                          type="radio"
                          value={option.id}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </fieldset>
              ) : (
                <label className="grid gap-1.5 pl-0 sm:pl-10">
                  <span className="text-xs font-semibold text-muted-foreground">Your answer</span>
                  <Textarea
                    className="min-h-28 resize-y"
                    disabled={Boolean(attempt)}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: value
                      }));
                    }}
                    placeholder="Explain it in your own words."
                    value={answers[question.id] ?? ""}
                  />
                </label>
              )}

              {feedback ? (
                <div
                  className={`ml-0 flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm sm:ml-10 ${
                    feedback.correct
                      ? "border-success/30 bg-success-soft/35 text-success"
                      : "border-warning/30 bg-warning-soft/35 text-foreground"
                  }`}
                >
                  {feedback.correct ? (
                    <CheckCircle2 className="mt-0.5 shrink-0" size={15} />
                  ) : (
                    <CircleAlert className="mt-0.5 shrink-0 text-warning" size={15} />
                  )}
                  <span>{feedback.feedback}</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <div className="mt-5">
          <InlineNotice body={error} title="Knowledge check needs attention" tone="error" />
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {attempt ? (
          <>
            <div className="flex items-center gap-2">
              <Badge tone="success">
                <CheckCircle2 size={12} />
                Lesson complete
              </Badge>
              <span className="text-sm text-muted-foreground">
                Score:{" "}
                <span className="tnum font-semibold">{Math.round(attempt.score * 100)}%</span>
              </span>
            </div>
            <span className="text-sm text-muted-foreground">Progress saved automatically</span>
          </>
        ) : (
          <>
            <span className="text-sm text-muted-foreground">
              {answeredAll ? "Ready to submit" : "Answer every question to continue"}
            </span>
            <button
              className={button.primary}
              disabled={!answeredAll || submitting}
              onClick={() => {
                void handleSubmit();
              }}
              type="button"
            >
              {submitting ? (
                <LoaderCircle className="animate-spin" size={14} />
              ) : (
                <CheckCircle2 size={14} />
              )}
              {submitting ? "Checking answers..." : "Submit and complete lesson"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
