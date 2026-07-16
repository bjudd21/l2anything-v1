import { afterEach, describe, expect, it, vi } from "vitest";
import { parseChatSseEvents, rateReviewItem } from "./api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseChatSseEvents", () => {
  it("parses normalized chat stream events from SSE text", () => {
    expect(
      parseChatSseEvents(
        [
          'event: tool_started\ndata: {"type":"tool_started","name":"read_workspace_file","label":"Read Workspace File","sessionId":7}',
          'event: artifact_created\ndata: {"type":"artifact_created","kind":"lesson","ref":"0003-next.html","sessionId":7}',
          'event: text_delta\ndata: {"type":"text_delta","text":"Hello","sessionId":7}',
          'event: done\ndata: {"type":"done","sessionId":7,"usage":{"totalTokens":12}}'
        ].join("\n\n")
      )
    ).toEqual([
      {
        type: "tool_started",
        name: "read_workspace_file",
        label: "Read Workspace File",
        sessionId: 7
      },
      {
        type: "artifact_created",
        kind: "lesson",
        ref: "0003-next.html",
        sessionId: 7
      },
      {
        type: "text_delta",
        text: "Hello",
        sessionId: 7
      },
      {
        type: "done",
        sessionId: 7,
        usage: {
          totalTokens: 12
        }
      }
    ]);
  });

  it("sends a validated review rating to the topic review endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          item: {
            id: 9,
            topicId: 3,
            concept: "Narrow before casting",
            ease: 2.6,
            intervalDays: 3,
            dueAt: "2026-07-19T12:00:00.000Z"
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(rateReviewItem(3, 9, { rating: "remembered" })).resolves.toMatchObject({
      ok: true,
      item: {
        id: 9,
        intervalDays: 3
      }
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/topics/3/review/9", {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify({ rating: "remembered" })
    });
  });
});
