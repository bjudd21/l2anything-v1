import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertInsideRoot, ensureWorkspaceDir, WorkspacePathError } from "./path.js";

const tempDirs: string[] = [];

function makeRoot() {
  const dir = mkdtempSync(join(tmpdir(), "learning-hub-path-"));
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

describe("workspace path safety", () => {
  it("resolves paths inside the workspace root", () => {
    const root = makeRoot();

    expect(assertInsideRoot(root, "topic/MISSION.md")).toBe(join(root, "topic", "MISSION.md"));
  });

  it("rejects traversal outside the workspace root", () => {
    const root = makeRoot();

    expect(() => assertInsideRoot(root, "../outside.md")).toThrow(WorkspacePathError);
  });

  it("rejects absolute paths outside the workspace root", () => {
    const root = makeRoot();

    expect(() => assertInsideRoot(root, join(tmpdir(), "outside.md"))).toThrow(WorkspacePathError);
  });

  it("creates directories only after resolving them inside the root", async () => {
    const root = makeRoot();

    await expect(ensureWorkspaceDir(root, "topic/lessons")).resolves.toBe(
      join(root, "topic", "lessons")
    );
    await expect(ensureWorkspaceDir(root, "../outside")).rejects.toThrow(WorkspacePathError);
  });
});
