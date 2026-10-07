const jwksCache = new Map();

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

async function getJwks(issuer, fetchImpl, cacheMilliseconds = 10 * 60 * 1000) {
  const now = Date.now();
  const cached = jwksCache.get(issuer);
  if (cached?.expiresAt > now) return cached.keys;

  const response = await fetchImpl(`${issuer}/.well-known/jwks.json`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Could not load account signing keys.");

  const result = await response.json();
  if (!Array.isArray(result?.keys)) throw new Error("The account service returned invalid signing keys.");

  jwksCache.set(issuer, { keys: result.keys, expiresAt: now + cacheMilliseconds });
  return result.keys;
}

function bearerToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new Error("A signed-in account is required.");
  return match[1];
}

function decodeToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("The account session is invalid.");
  try {
    return {
      parts,
      header: decodeJsonSegment(parts[0]),
      payload: decodeJsonSegment(parts[1]),
    };
  } catch {
    throw new Error("The account session is invalid.");
  }
}

async function verifySignature({ parts, header }, issuer, fetchImpl, cacheMilliseconds) {
  const algorithms = {
    RS256: {
      keyType: "RSA",
      importAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      verifyAlgorithm: "RSASSA-PKCS1-v1_5",
    },
    ES256: {
      keyType: "EC",
      importAlgorithm: { name: "ECDSA", namedCurve: "P-256" },
      verifyAlgorithm: { name: "ECDSA", hash: "SHA-256" },
    },
  };
  const algorithm = algorithms[header.alg];
  if (!algorithm || typeof header.kid !== "string") {
    throw new Error("The account session uses an unsupported signature.");
  }

  const jwks = await getJwks(issuer, fetchImpl, cacheMilliseconds);
  const jwk = jwks.find(
    (candidate) => candidate.kid === header.kid && candidate.kty === algorithm.keyType,
  );
  if (!jwk) throw new Error("The account session signing key is unknown.");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    algorithm.importAlgorithm,
    false,
    ["verify"],
  );
  const validSignature = await crypto.subtle.verify(
    algorithm.verifyAlgorithm,
    key,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!validSignature) throw new Error("The account session signature is invalid.");
}

export async function verifyClerkRequest(request, env, fetchImpl = fetch) {
  const issuer = String(env.CLERK_ISSUER || "").replace(/\/$/, "");
  if (!issuer.startsWith("https://")) throw new Error("Clerk is not configured.");
  const decoded = decodeToken(bearerToken(request));
  const { header, payload } = decoded;
  if (header.alg !== "RS256") {
    throw new Error("The account session uses an unsupported signature.");
  }
  await verifySignature(decoded, issuer, fetchImpl, 60 * 60 * 1000);

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

  return {
    provider: "clerk",
    subject: payload.sub,
    sessionId: payload.sid || null,
  };
}

function audienceIncludes(audience, expected) {
  return audience === expected || (Array.isArray(audience) && audience.includes(expected));
}

export async function verifySupabaseRequest(request, env, fetchImpl = fetch) {
  const issuer = String(env.SUPABASE_ISSUER || "").replace(/\/$/, "");
  if (!issuer.startsWith("https://") || !issuer.endsWith("/auth/v1")) {
    throw new Error("Supabase Auth is not configured.");
  }

  const decoded = decodeToken(bearerToken(request));
  const { payload } = decoded;
  await verifySignature(decoded, issuer, fetchImpl, 10 * 60 * 1000);

  const now = Math.floor(Date.now() / 1000);
  if (
    payload.iss !== issuer ||
    typeof payload.sub !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sub) ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= now - 5 ||
    (Number.isFinite(payload.nbf) && payload.nbf > now + 5) ||
    !audienceIncludes(payload.aud, "authenticated") ||
    payload.role !== "authenticated"
  ) {
    throw new Error("The account session claims are invalid.");
  }

  return {
    provider: "supabase",
    subject: payload.sub,
    sessionId: payload.session_id || null,
    migrationSubject: typeof payload.app_metadata?.daily_undead_clerk_user_id === "string"
      && payload.app_metadata.daily_undead_clerk_user_id.startsWith("user_")
      ? payload.app_metadata.daily_undead_clerk_user_id
      : null,
  };
}

export async function verifyAccountRequest(request, env, fetchImpl = fetch) {
  const token = bearerToken(request);
  const { payload } = decodeToken(token);
  const clerkIssuer = String(env.CLERK_ISSUER || "").replace(/\/$/, "");
  const supabaseIssuer = String(env.SUPABASE_ISSUER || "").replace(/\/$/, "");
  if (payload.iss === clerkIssuer) return verifyClerkRequest(request, env, fetchImpl);
  if (payload.iss === supabaseIssuer) return verifySupabaseRequest(request, env, fetchImpl);
  throw new Error("The account session issuer is invalid.");
}

export function resetJwksCacheForTests() {
  jwksCache.clear();
}
