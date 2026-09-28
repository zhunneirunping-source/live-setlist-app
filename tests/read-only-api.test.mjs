import assert from "node:assert/strict";
import test from "node:test";

import { rejectSetlistWrite } from "../lib/read-only-api.js";

test("rejects setlist writes without touching a data store", async () => {
  const response = rejectSetlistWrite();

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
  assert.deepEqual(await response.json(), {
    error: "Setlist data is read-only. Update the archive JSON and redeploy.",
  });
});
