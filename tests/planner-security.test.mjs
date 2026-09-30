import assert from "node:assert/strict";
import test from "node:test";

import { GET, POST, PUT } from "../app/api/planner/route.ts";

for (const [method, handler] of [["GET", GET], ["POST", POST], ["PUT", PUT]]) {
  test(`${method} /api/planner rejects an unauthenticated non-local request`, async () => {
    const response = await handler(new Request("https://planner.example/api/planner", {
      method,
      ...(method === "GET" ? {} : {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ store: { version: 1, trackingEnabledAt: "2026-09-30", events: [], songs: [] }, revision: 0 }),
      }),
    }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Authentication required" });
  });
}

for (const [method, handler] of [["POST", POST], ["PUT", PUT]]) {
  test(`${method} /api/planner rejects an oversized local request before database access`, async () => {
    const response = await handler(new Request("http://localhost/api/planner", {
      method,
      headers: {
        "content-type": "application/json",
        "content-length": "1048577",
      },
      body: "{}",
    }));
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "Planner request is too large" });
  });
}
