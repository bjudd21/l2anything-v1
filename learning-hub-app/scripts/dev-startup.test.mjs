import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { test } from "node:test";
import { findUnavailablePorts, isPortAvailable, waitForHealth } from "./dev-startup.mjs";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

test("reports a required port that already has a listener", async () => {
  const server = createTcpServer();
  const address = await listen(server);

  try {
    assert.equal(typeof address, "object");
    assert.equal(await isPortAvailable(address.port), false);
    assert.deepEqual(await findUnavailablePorts([{ label: "Test server", port: address.port }]), [
      { available: false, label: "Test server", port: address.port }
    ]);
  } finally {
    await close(server);
  }
});

test("waits until the health endpoint returns a successful response", async () => {
  let requests = 0;
  const server = createHttpServer((_request, response) => {
    requests += 1;
    response.statusCode = requests === 1 ? 503 : 200;
    response.end();
  });
  const address = await listen(server);

  try {
    assert.equal(typeof address, "object");
    await waitForHealth(`http://127.0.0.1:${address.port}/health`, {
      intervalMs: 5,
      timeoutMs: 500
    });
    assert.ok(requests >= 2);
  } finally {
    await close(server);
  }
});
