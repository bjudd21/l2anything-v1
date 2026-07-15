import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { watchWorkspace } from "./watcher.js";

const tempDirs: string[] = [];

function makeRoot() {
  const dir = mkdtempSync(join(tmpdir(), "learning-hub-watch-"));
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

describe("watchWorkspace", () => {
  it("calls back after a file change", async () => {
    const root = makeRoot();
    const topicDir = join(root, "topic");
    mkdirSync(topicDir);

    let callbackCount = 0;
    const watcher = watchWorkspace(root, () => {
      callbackCount += 1;
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      writeFileSync(join(topicDir, "MISSION.md"), "# Mission: Watcher\n");
      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(callbackCount).toBeGreaterThanOrEqual(1);
    } finally {
      await watcher.close();
    }
  });
});
