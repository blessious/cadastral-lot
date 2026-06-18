const encoder = new TextEncoder();

export const AUTH_COOKIE = "boac_gis_session";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

type SessionPayload = {
  sub: string;
  username: string;
  role: string;
  iat: number;
  exp: number;
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

function getAuthSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

async function getSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(user: {
  id: string;
  username: string;
  role: string;
}): Promise<string> {
  const secret = getAuthSecret();
  if (!secret) throw new Error("AUTH_SECRET must contain at least 32 characters");

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await getSigningKey(secret);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(encodedPayload))
  );
  return `${encodedPayload}.${toBase64Url(signature)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  const secret = getAuthSecret();
  if (!secret || !token) return null;

  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;

  try {
    const key = await getSigningKey(secret);
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(encodedSignature),
      encoder.encode(encodedPayload)
    );
    if (!validSignature) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(encodedPayload))
    ) as Partial<SessionPayload>;
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof payload.sub !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      payload.iat > now + 60 ||
      payload.exp <= now ||
      payload.exp - payload.iat > SESSION_MAX_AGE_SECONDS
    ) {
      return null;
    }
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
