import {
  FetchError,
  JwksNotAvailableInCacheError,
  JwksValidationError,
  WaitPeriodNotYetEndedJwkError,
} from "aws-jwt-verify/error";

// Failures the user can't fix by signing in again. A login redirect would loop: the login page
// refreshes silently and sends the user straight back.
const SERVER_SIDE = [FetchError, JwksNotAvailableInCacheError, JwksValidationError, WaitPeriodNotYetEndedJwkError];

// A trailing "*" is a prefix match ("/*", "/data/*"); anything else is exact.
export function matches(uri, patterns) {
  return patterns.some((p) => (p.endsWith("*") ? uri.startsWith(p.slice(0, -1)) : uri === p));
}

function readCookie(headers, name) {
  for (const { value } of headers.cookie ?? []) {
    for (const part of value.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === name) return rest.join("=");
    }
  }
  return "";
}

function respond(status, statusDescription, extraHeaders = {}, body) {
  const headers = { "cache-control": [{ key: "Cache-Control", value: "no-store" }], ...extraHeaders };
  if (body) headers["content-type"] = [{ key: "Content-Type", value: "text/plain; charset=utf-8" }];
  return { status, statusDescription, headers, ...(body && { body }) };
}

export function makeHandler(config, verifier) {
  return async (event) => {
    const request = event.Records[0].cf.request;
    const { uri, querystring } = request;

    // Origins (S3, nginx) decode and resolve the path, so check both forms and fail closed:
    // gated if either form is gated, public only if both forms are public.
    let normalized;
    try {
      normalized = decodeURIComponent(new URL(uri, "https://edge.invalid").pathname);
    } catch {
      return respond("400", "Bad Request", {}, "Malformed URL.");
    }
    const forms = [uri, normalized];
    const isPublic = (u) => u === config.loginPath || matches(u, config.publicPaths);
    if (forms.every(isPublic) || !forms.some((u) => matches(u, config.gatedPaths))) {
      return request;
    }

    let payload;
    try {
      const token = readCookie(request.headers, "id_token");
      if (!token) throw new Error("no id_token cookie");
      payload = await verifier.verify(token);
    } catch (err) {
      if (SERVER_SIDE.some((E) => err instanceof E)) return respond("503", "Service Unavailable", {}, "Sign-in check unavailable. Try again shortly.");
      const next = encodeURIComponent(uri + (querystring ? `?${querystring}` : ""));
      return respond("302", "Found", { location: [{ key: "Location", value: `${config.loginPath}?next=${next}` }] });
    }

    if (!(payload["cognito:groups"] ?? []).includes(config.requiredGroup)) {
      return respond("403", "Forbidden", {}, "You don't have access to this site. Contact the site administrator.");
    }
    return request;
  };
}
