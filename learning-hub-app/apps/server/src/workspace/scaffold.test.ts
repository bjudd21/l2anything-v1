import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scaffoldTopic } from "./scaffold.js";

const tempDirs: string[] = [];

function makeRoot() {
  const dir = mkdtempSync(join(tmpdir(), "learning-hub-scaffold-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("scaffoldTopic", () => {
  it("creates the teach-skill workspace files and directories", async () => {
    const root = makeRoot();

    await scaffoldTopic(root, {
      slug: "rust-cli",
      title: "Rust CLI"
    });

    const topicDir = join(root, "rust-cli");

    expect(existsSync(join(topicDir, "MISSION.md"))).toBe(true);
    expect(existsSync(join(topicDir, "NOTES.md"))).toBe(true);
    expect(existsSync(join(topicDir, "RESOURCES.md"))).toBe(true);
    expect(existsSync(join(topicDir, "lessons"))).toBe(true);
    expect(existsSync(join(topicDir, "learning-records"))).toBe(true);
    expect(existsSync(join(topicDir, "reference"))).toBe(true);

    expect(readFileSync(join(topicDir, "MISSION.md"), "utf8")).toContain("# Mission: Rust CLI");
    expect(readFileSync(join(topicDir, "RESOURCES.md"), "utf8")).toContain("# Rust CLI Resources");
  });

  it("rejects path-like slugs", async () => {
    await expect(scaffoldTopic(makeRoot(), { slug: "../bad", title: "Bad" })).rejects.toThrow();
  });
});
