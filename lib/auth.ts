import { randomUUID } from "node:crypto";

export const COOKIE_NAME = "admin_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

type AdminAuthRow = {
  id: number;
  password_hash: string;
  salt: string;
  session_secret: string;
  updated_at: string;
};

let tableEnsured = false;

export async function ensureAdminAuthTable(database: D1Database): Promise<void> {
  if (tableEnsured) return;
  await database.prepare(`
    CREATE TABLE IF NOT EXISTS admin_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      session_secret TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  tableEnsured = true;
}

// 使用 Web Crypto API 进行 SHA-256 哈希
async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}:expiry-admin-salt`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// 基于 sessionSecret 进行 HMAC 签名生成 Token
async function createToken(secret: string): Promise<string> {
  const exp = Date.now() + SESSION_MAX_AGE * 1000;
  const nonce = randomUUID().replace(/-/g, "").slice(0, 16);
  const payload = `${exp}.${nonce}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const sigHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${payload}.${sigHex}`;
}

// 校验 Token
async function verifyToken(token: string, secret: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [expStr, nonce, sigHex] = parts;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;

    const payload = `${expStr}.${nonce}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const sigBytes = new Uint8Array(
      sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
    );
    return await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payload));
  } catch {
    return false;
  }
}

async function getAuthRow(database: D1Database): Promise<AdminAuthRow | null> {
  await ensureAdminAuthTable(database);
  return (await database.prepare("SELECT * FROM admin_auth WHERE id = 1").first<AdminAuthRow>()) || null;
}

export async function isAuthInitialized(database: D1Database): Promise<boolean> {
  const row = await getAuthRow(database);
  return Boolean(row && row.password_hash);
}

export async function setupAdminPassword(database: D1Database, password: string): Promise<string> {
  await ensureAdminAuthTable(database);
  const existing = await getAuthRow(database);
  if (existing) {
    throw new Error("管理员密码已设置，请直接登录。");
  }
  if (!password || password.trim().length < 6) {
    throw new Error("密码长度不能少于 6 位。");
  }

  const salt = randomUUID().replace(/-/g, "");
  const sessionSecret = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();

  await database.prepare(`
    INSERT INTO admin_auth (id, password_hash, salt, session_secret, updated_at)
    VALUES (1, ?, ?, ?, ?)
  `).bind(passwordHash, salt, sessionSecret, now).run();

  return createToken(sessionSecret);
}

export async function verifyAdminPassword(
  database: D1Database,
  password: string,
): Promise<{ valid: boolean; token?: string }> {
  const row = await getAuthRow(database);
  if (!row) return { valid: false };

  const hash = await hashPassword(password, row.salt);
  if (hash !== row.password_hash) {
    return { valid: false };
  }

  const token = await createToken(row.session_secret);
  return { valid: true, token };
}

export async function changeAdminPassword(
  database: D1Database,
  oldPassword: string,
  newPassword: string,
): Promise<string> {
  const row = await getAuthRow(database);
  if (!row) throw new Error("系统尚未设置密码。");

  const oldHash = await hashPassword(oldPassword, row.salt);
  if (oldHash !== row.password_hash) {
    throw new Error("当前密码错误。");
  }
  if (!newPassword || newPassword.trim().length < 6) {
    throw new Error("新密码长度不能少于 6 位。");
  }

  const newSalt = randomUUID().replace(/-/g, "");
  const newSecret = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const newHash = await hashPassword(newPassword, newSalt);
  const now = new Date().toISOString();

  await database.prepare(`
    UPDATE admin_auth SET password_hash = ?, salt = ?, session_secret = ?, updated_at = ?
    WHERE id = 1
  `).bind(newHash, newSalt, newSecret, now).run();

  return createToken(newSecret);
}

export async function verifySession(database: D1Database, token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const row = await getAuthRow(database);
  if (!row) return false;
  return verifyToken(token, row.session_secret);
}

export function parseCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function buildSessionCookie(token: string): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax; HttpOnly`;
}

export function buildClearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;
}

export async function assertAdmin(request: Request, database: D1Database): Promise<void> {
  const initialized = await isAuthInitialized(database);
  if (!initialized) return;
  const cookieHeader = request.headers.get("cookie");
  const token = parseCookie(cookieHeader, COOKIE_NAME);
  const ok = await verifySession(database, token);
  if (!ok) {
    const error = new Error("未登录或登录已过期，请重新登录。");
    (error as any).status = 401;
    throw error;
  }
}
