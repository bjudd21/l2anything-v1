import { existsSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspacePathError";
  }
}

export function normalizeWorkspaceRoot(rootDir: string) {
  const absoluteRoot = resolve(rootDir);

  if (existsSync(absoluteRoot) && !statSync(absoluteRoot).isDirectory()) {
    throw new WorkspacePathError(`Workspace root is not a directory: ${absoluteRoot}`);
  }

  return absoluteRoot;
}

export function assertInsideRoot(rootDir: string, requestedPath = ".") {
  const root = normalizeWorkspaceRoot(rootDir);
  const target = resolve(root, requestedPath);
  const rel = relative(root, target);

  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return target;
  }

  throw new WorkspacePathError(`Path escapes workspace root: ${requestedPath}`);
}

export async function ensureWorkspaceDir(rootDir: string, requestedPath = ".") {
  const target = assertInsideRoot(rootDir, requestedPath);
  await mkdir(target, { recursive: true });
  return target;
}
