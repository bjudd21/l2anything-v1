import { closeSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatWorkspaceNumber, getNextWorkspaceNumber } from "./numbering.js";

const tempDirs: string[] = [];

function makeRoot() {
  const dir = mkdtempSync(join(tmpdir(), "learning-hub-numbering-"));
  tempDirs.push(dir);
  return dir;
}

function touch(path: string) {
  closeSync(openSync(path, "w"));
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("workspace numbering", () => {
  it("formats numbers as four digits", () => {
    expect(formatWorkspaceNumber(7)).toBe("0007");
  });

  it("computes the next number from files on disk", () => {
    const root = makeRoot();
    touch(join(root, "0001-values.html"));
    touch(join(root, "0007-functions.html"));
    touch(join(root, "notes.html"));

    expect(getNextWorkspaceNumber(root)).toEqual({ number: 8, padded: "0008" });
  });
});
