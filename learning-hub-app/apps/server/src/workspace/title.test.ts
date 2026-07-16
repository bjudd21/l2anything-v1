import { describe, expect, it } from "vitest";
import { parseLessonTitle, parseRecordTitle, parseTopicTitle, titleFromSlug } from "./title.js";

describe("title parsing", () => {
  it("prefers lesson title tags over h1 tags", () => {
    expect(
      parseLessonTitle("<title>Values &amp; Types</title><h1>Wrong</h1>", "0001-values.html")
    ).toBe("Values & Types");
  });

  it("falls back to lesson h1 tags", () => {
    expect(parseLessonTitle("<h1>Function Inputs</h1>", "0002-functions.html")).toBe(
      "Function Inputs"
    );
  });

  it("falls back to a file title when lesson HTML has no title", () => {
    expect(parseLessonTitle("<p>No heading</p>", "0003-type-narrowing.html")).toBe(
      "Type Narrowing"
    );
  });

  it("parses learning record headings", () => {
    expect(parseRecordTitle("# Values are the runtime floor\n\nBody", "0001-values.md")).toBe(
      "Values are the runtime floor"
    );
  });

  it("parses mission topic titles", () => {
    expect(parseTopicTitle("# Mission: TypeScript Basics", "typescript-basics")).toBe(
      "TypeScript Basics"
    );
  });

  it("title-cases slugs", () => {
    expect(titleFromSlug("half-scaffolded")).toBe("Half Scaffolded");
  });
});
