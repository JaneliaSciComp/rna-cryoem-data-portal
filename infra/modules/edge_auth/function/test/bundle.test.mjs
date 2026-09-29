import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Mirrors the Lambda zip: the bundle plus a config.json beside it, nothing else.
test("bundle loads config.json from its own directory and runs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "edge-auth-"));
  cpSync(new URL("../dist/index.mjs", import.meta.url), join(dir, "index.mjs"));
  writeFileSync(join(dir, "config.json"), JSON.stringify({
    userPoolId: "us-east-2_TestPool1", clientIds: ["c"], requiredGroup: "g",
    gatedPaths: ["/*"], publicPaths: [], loginPath: "/login.html",
  }));
  const { handler } = await import(pathToFileURL(join(dir, "index.mjs")).href);

  const request = { uri: "/login.html", querystring: "", headers: {} };
  assert.equal(await handler({ Records: [{ cf: { request } }] }), request);
  const res = await handler({ Records: [{ cf: { request: { uri: "/x", querystring: "", headers: {} } } }] });
  assert.equal(res.status, "302");
});
