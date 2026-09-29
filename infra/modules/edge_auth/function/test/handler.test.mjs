import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { FetchError, WaitPeriodNotYetEndedJwkError } from "aws-jwt-verify/error";
import { makeHandler } from "../src/handler.mjs";

const POOL = "us-east-2_TestPool1";
const CLIENT = "portalclient";
const ISS = `https://cognito-idp.us-east-2.amazonaws.com/${POOL}`;

// Stubbed JWKS: sign tokens with a local key and pre-load its public half, so verify() never fetches.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const verifier = CognitoJwtVerifier.create({ userPoolId: POOL, tokenUse: "id", clientId: [CLIENT] });
verifier.cacheJwks({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test", alg: "RS256", use: "sig" }] });

const config = {
  userPoolId: POOL,
  clientIds: [CLIENT],
  requiredGroup: "data-portal",
  gatedPaths: ["/*"],
  publicPaths: ["/login.html", "/auth.js", "/favicon.ico"],
  loginPath: "/login.html",
};
const handler = makeHandler(config, verifier);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "RS256", kid: "test", typ: "JWT" })}.${b64({
    sub: "u1", iss: ISS, aud: CLIENT, token_use: "id", iat: now, exp: now + 3600,
    "cognito:groups": ["data-portal"], ...claims,
  })}`;
  return `${body}.${sign("sha256", Buffer.from(body), privateKey).toString("base64url")}`;
}
function event(uri, { cookie, querystring = "" } = {}) {
  const headers = cookie ? { cookie: [{ key: "Cookie", value: cookie }] } : {};
  return { Records: [{ cf: { request: { uri, querystring, method: "GET", headers } } }] };
}
const passes = async (h, e) => assert.equal(await h(e), e.Records[0].cf.request);
const location = (res) => res.headers.location[0].value;

test("public path passes without cookie", () => passes(handler, event("/auth.js")));

test("login path passes with its own query string", () =>
  passes(handler, event("/login.html", { querystring: "next=%2Fx" })));

test("gated path without cookie redirects to login with encoded next", async () => {
  const res = await handler(event("/datasets", { querystring: "page=2" }));
  assert.equal(res.status, "302");
  assert.equal(location(res), "/login.html?next=%2Fdatasets%3Fpage%3D2");
});

test("valid token in required group passes", () =>
  passes(handler, event("/datasets", { cookie: `id_token=${token()}` })));

test("id_token found among other cookies", () =>
  passes(handler, event("/", { cookie: `a=1; xid_token=junk; id_token=${token()}` })));

test("lookalike cookie name is ignored", async () => {
  const res = await handler(event("/", { cookie: `xid_token=${token()}` }));
  assert.equal(res.status, "302");
});

test("valid token wrong group returns 403", async () => {
  const res = await handler(event("/", { cookie: `id_token=${token({ "cognito:groups": ["rna-atlas"] })}` }));
  assert.equal(res.status, "403");
  assert.match(res.body, /contact/i);
});

test("token without groups claim returns 403", async () => {
  const res = await handler(event("/", { cookie: `id_token=${token({ "cognito:groups": undefined })}` }));
  assert.equal(res.status, "403");
});

test("expired token redirects to login", async () => {
  const past = Math.floor(Date.now() / 1000) - 60;
  const res = await handler(event("/", { cookie: `id_token=${token({ iat: past - 3600, exp: past })}` }));
  assert.equal(res.status, "302");
});

test("token for a non-listed client id redirects to login", async () => {
  const res = await handler(event("/", { cookie: `id_token=${token({ aud: "rnanixweb" })}` }));
  assert.equal(res.status, "302");
});

test("access token redirects to login", async () => {
  const res = await handler(event("/", { cookie: `id_token=${token({ token_use: "access" })}` }));
  assert.equal(res.status, "302");
});

test("malformed cookie redirects to login", async () => {
  const res = await handler(event("/", { cookie: "id_token=not.a.jwt" }));
  assert.equal(res.status, "302");
});

test("path outside gated_paths passes without cookie", () =>
  passes(makeHandler({ ...config, gatedPaths: ["/data/*"] }, verifier), event("/index.html")));

test("jwks fetch failure returns 503, not a login redirect", async () => {
  const failing = { verify: async () => { throw new FetchError(`${ISS}/.well-known/jwks.json`, "timeout"); } };
  const res = await makeHandler(config, failing)(event("/", { cookie: `id_token=${token()}` }));
  assert.equal(res.status, "503");
});

test("jwks back-off after key rotation returns 503, not a login redirect", async () => {
  const failing = { verify: async () => { throw new WaitPeriodNotYetEndedJwkError("wait"); } };
  const res = await makeHandler(config, failing)(event("/", { cookie: `id_token=${token()}` }));
  assert.equal(res.status, "503");
});

// S3 and nginx decode and normalize the path, so the gate must not match only the raw form.
const prefixGated = makeHandler({ ...config, gatedPaths: ["/data/*"], publicPaths: ["/static/*"] }, verifier);

test("percent-encoded gated prefix still requires sign-in", async () => {
  const res = await prefixGated(event("/%64ata/secret.mrc"));
  assert.equal(res.status, "302");
});

test("dot segments cannot escape a public prefix", async () => {
  const res = await prefixGated(event("/static/%2e%2e/data/secret.mrc"));
  assert.equal(res.status, "302");
});

test("malformed percent-encoding returns 400", async () => {
  const res = await prefixGated(event("/data/%E0%A4%A"));
  assert.equal(res.status, "400");
});
