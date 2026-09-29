import { readFileSync } from "node:fs";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { makeHandler } from "./handler.mjs";

// Lambda@Edge has no environment variables, so Terraform zips config.json next to this bundle.
const config = JSON.parse(readFileSync(new URL("./config.json", import.meta.url), "utf8"));

// Module scope: the verifier's JWKS cache survives across warm invocations.
const verifier = CognitoJwtVerifier.create({
  userPoolId: config.userPoolId,
  tokenUse: "id",
  clientId: config.clientIds,
});

export const handler = makeHandler(config, verifier);
