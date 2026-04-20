import crypto from "node:crypto";
import type { Request } from "express";

type SessionPayload = {
  userId: string;
  iat: number;
  version: 1;
};

const SESSION_HEADER = "x-void-session";
const USER_ID_PATTERN = /^usr_[a-f0-9]{32}$/;

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSessionSecret(): string {
  const explicit = process.env.SESSION_SECRET?.trim();
  if (explicit) {
    return explicit;
  }

  return "development-session-secret-change-me";
}

function signPayload(payload: string): string {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

export function generateAnonymousUserId(): string {
  return `usr_${crypto.randomBytes(16).toString("hex")}`;
}

export function isValidAnonymousUserId(userId: string): boolean {
  return USER_ID_PATTERN.test(userId);
}

export function createSessionToken(userId: string): string {
  const payload: SessionPayload = {
    userId,
    iat: Date.now(),
    version: 1,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const provided = Buffer.from(providedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (provided.length !== expected.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (
      parsed?.version !== 1 ||
      typeof parsed?.userId !== "string" ||
      !isValidAnonymousUserId(parsed.userId) ||
      typeof parsed?.iat !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function readSessionToken(req: Request): string | null {
  const raw = req.header(SESSION_HEADER);
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function resolveSessionUserId(req: Request): string | null {
  const token = readSessionToken(req);
  if (!token) {
    return null;
  }

  return verifySessionToken(token)?.userId ?? null;
}

export function getSessionHeaderName(): string {
  return SESSION_HEADER;
}
