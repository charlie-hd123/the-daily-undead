let cachedJwks = null;
let cachedJwksIssuer = null;
let cachedJwksExpiresAt = 0;

function decodeBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(`${normalized}${padding}`);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonSegment(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

function getAuthorizedParties(env) {
  return new Set(
    String(env.CLERK_AUTHORIZED_PARTIES || env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

async function getJwks(issuer, fetchImpl) {
  const now = Date.now();
  if (cachedJwks && cachedJwksIssuer === issuer && cachedJwksExpiresAt > now) {
    return cachedJwks;
  }

  const response = await fetchImpl(`${issuer}/.well-known/jwks.json`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Could not load Clerk signing keys.");

  const result = await response.json();
  if (!Array.isArray(result?.keys)) throw new Error("Clerk returned invalid signing keys.");

  cachedJwks = result.keys;
  cachedJwksIssuer = issuer;
  cachedJwksExpiresAt = now + 60 * 60 * 1000;
  return cachedJwks;
}

export async function verifyClerkRequest(request, env, fetchImpl = fetch) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new Error("A signed-in account is required.");

  const issuer = String(env.CLERK_ISSUER || "").replace(/\/$/, "");
  if (!issuer.startsWith("https://")) throw new Error("Clerk is not configured.");

  const parts = match[1].split(".");
  if (parts.length !== 3) throw new Error("The account session is invalid.");

  let header;
  let payload;
  try {
    header = decodeJsonSegment(parts[0]);
    payload = decodeJsonSegment(parts[1]);
  } catch {
    throw new Error("The account session is invalid.");
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("The account session uses an unsupported signature.");
  }

  const jwks = await getJwks(issuer, fetchImpl);
  const jwk = jwks.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!jwk) throw new Error("The account session signing key is unknown.");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const validSignature = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!validSignature) throw new Error("The account session signature is invalid.");

  const now = Math.floor(Date.now() / 1000);
  const authorizedParties = getAuthorizedParties(env);
  if (
    payload.iss !== issuer ||
    typeof payload.sub !== "string" ||
    !payload.sub.startsWith("user_") ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= now - 5 ||
    (Number.isFinite(payload.nbf) && payload.nbf > now + 5) ||
    typeof payload.azp !== "string" ||
    !authorizedParties.has(payload.azp.replace(/\/$/, ""))
  ) {
    throw new Error("The account session claims are invalid.");
  }

  return { userId: payload.sub, sessionId: payload.sid || null };
}

export function resetJwksCacheForTests() {
  cachedJwks = null;
  cachedJwksIssuer = null;
  cachedJwksExpiresAt = 0;
}
