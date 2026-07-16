import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(packageDir, "src", "db", "migrations");
const target = join(packageDir, "dist", "db", "migrations");

if (existsSync(source)) {
  cpSync(source, target, { recursive: true });
}
