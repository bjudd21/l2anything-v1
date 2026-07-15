import { describe, expect, it } from "vitest";
import { parseChatSseEvents } from "./api.js";

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
});
