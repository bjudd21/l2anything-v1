import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const HEALTH_URL = `http://${HOST}:8787/health`;

export const requiredPorts = [
  { label: "Web app", port: 5173 },
  { label: "API server", port: 8787 }
];

export async function isPortAvailable(port, host = HOST) {
  return await new Promise((resolveAvailability, reject) => {
    const probe = createServer();

    probe.unref();
    probe.once("error", (error) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolveAvailability(false);
        return;
      }

      reject(error);
    });
    probe.listen({ exclusive: true, host, port }, () => {
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolveAvailability(true);
      });
    });
  });
}

export async function findUnavailablePorts(ports = requiredPorts) {
  const availability = await Promise.all(
    ports.map(async (entry) => ({
      ...entry,
      available: await isPortAvailable(entry.port)
    }))
  );

  return availability.filter((entry) => !entry.available);
}

export async function waitForHealth(
  url = HEALTH_URL,
  { intervalMs = 100, timeoutMs = 30_000 } = {}
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The API process is still starting.
    }

    await delay(intervalMs);
  }

  throw new Error(`The API did not become ready at ${url} within ${timeoutMs / 1000} seconds.`);
}

async function checkPorts() {
  const unavailablePorts = await findUnavailablePorts();

  if (unavailablePorts.length === 0) {
    return;
  }

  console.error("\nL2Anything cannot start because a required local port is already in use:\n");
  for (const entry of unavailablePorts) {
    console.error(`  - ${entry.label}: http://${HOST}:${entry.port}`);
  }
  console.error(
    "\nStop the earlier L2Anything terminal with Ctrl+C, then run corepack pnpm dev again.\n"
  );
  process.exitCode = 1;
}

async function waitForApi() {
  try {
    await waitForHealth();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nL2Anything cannot start. ${message}`);
    console.error("Review the API message above, then run corepack pnpm dev again.\n");
    process.exitCode = 1;
  }
}

async function main() {
  const command = process.argv[2];

  if (command === "check") {
    await checkPorts();
    return;
  }

  if (command === "wait") {
    await waitForApi();
    return;
  }

  console.error("Usage: node scripts/dev-startup.mjs <check|wait>");
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
