import { describe, expect, it } from "vitest";
import { buildLessonGenerationRequest, tutorSystemPreamble } from "./tutor.js";

describe("tutor prompts", () => {
  it("requires mission interview before replacing a missing or placeholder mission", () => {
    const prompt = tutorSystemPreamble();

    expect(prompt).toContain("ask mission questions before calling update_mission");
    expect(prompt).toContain("_To be established_");
    expect(prompt).toContain("Only read or write workspace files by calling the provided tools");
  });

  it("sets the lesson generation contract", () => {
    const prompt = buildLessonGenerationRequest({
      id: 1,
      slug: "typescript-basics",
      dirPath: "/tmp/typescript-basics",
      title: "TypeScript Basics",
      displayTitle: null,
      groupId: null,
      createdAt: "now",
      lastActiveAt: null
    });

    expect(prompt).toContain("self-contained HTML");
    expect(prompt).toContain("inline CSS");
    expect(prompt).toContain("inline JavaScript");
    expect(prompt).toContain("real citation links");
    expect(prompt).toContain("immediate-feedback exercise");
    expect(prompt).toContain("active-recall prompt");
    expect(prompt).toContain("web_search is unavailable");
    expect(prompt).toContain("call append_resource");
    expect(prompt).toContain("call write_reference");
    expect(prompt).toContain("Call write_lesson");
  });
});
