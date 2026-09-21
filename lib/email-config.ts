import type { AppEnv } from "./cloudflare";

type EncryptedConfig = {
  version: 2;
  iv: string;
  ciphertext: string;
};

export type ResendEmailConfig = {
  provider: "resend";
  apiKey: string;
  from: string;
};

export type EmailConfigStatus = {
  configured: boolean;
  from: string | null;
  provider: "resend" | null;
  storageReady: boolean;
};

const FROM_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function assertFrom(from: string): string {
  const trimmed = from.trim();
  const email = trimmed.match(/<([^>]+)>/)?.[1] || trimmed;
  if (!FROM_EMAIL.test(email)) {
    throw new Error("发件人格式无效。可填写 sender@your-domain.com 或 名称 <sender@your-domain.com>。");
  }
  return trimmed;
}

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(text);
}

function fromBase64(value: string): ArrayBuffer {
  const text = atob(value);
  const bytes = Uint8Array.from(text, (character) => character.charCodeAt(0));
  return bytes.buffer as ArrayBuffer;
}

async function encryptionKey(env: AppEnv): Promise<CryptoKey | null> {
  const secret = env.EMAIL_CONFIG_ENCRYPTION_KEY?.trim();
  if (!secret) return null;
  const material = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(`expiry-email-config-v2:${secret}`),
  );
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function parseStoredConfig(value: unknown): ResendEmailConfig | null {
  if (!value || typeof value !== "object") return null;
  const config = value as Record<string, unknown>;
  if (config.provider === "resend" && typeof config.apiKey === "string" && typeof config.from === "string") {
    return { provider: "resend", apiKey: config.apiKey, from: config.from };
  }
  return null;
}

async function readStoredConfig(env: AppEnv): Promise<ResendEmailConfig | null> {
  const key = await encryptionKey(env);
  if (!key) return null;
  try {
    const row = await env.EXPIRY_REMINDERS_DB.prepare(
      "SELECT encrypted_config FROM email_settings WHERE id = 1",
    ).first<{ encrypted_config: string }>();
    if (!row) return null;
    const encrypted = JSON.parse(row.encrypted_config) as EncryptedConfig;
    if (encrypted.version !== 2) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(encrypted.iv) },
      key,
      fromBase64(encrypted.ciphertext),
    );
    return parseStoredConfig(JSON.parse(textDecoder.decode(plaintext)));
  } catch (error) {
    console.error("Unable to read encrypted email configuration.", error);
    return null;
  }
}

async function writeStoredConfig(env: AppEnv, config: ResendEmailConfig): Promise<void> {
  const key = await encryptionKey(env);
  if (!key) {
    throw new Error("Cloudflare 未设置 EMAIL_CONFIG_ENCRYPTION_KEY，不能从页面安全保存 Resend 密钥。");
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(JSON.stringify(config)),
  );
  const encrypted: EncryptedConfig = {
    version: 2,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
  await env.EXPIRY_REMINDERS_DB.prepare(`
    INSERT INTO email_settings (id, encrypted_config, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET encrypted_config = excluded.encrypted_config, updated_at = excluded.updated_at
  `).bind(JSON.stringify(encrypted), new Date().toISOString()).run();
}

export async function getEmailCredentials(env: AppEnv): Promise<ResendEmailConfig | null> {
  const saved = await readStoredConfig(env);
  if (saved) return saved;
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  return apiKey && from ? { provider: "resend", apiKey, from } : null;
}

export async function getEmailConfigStatus(env: AppEnv): Promise<EmailConfigStatus> {
  const config = await getEmailCredentials(env);
  return {
    configured: Boolean(config),
    from: config?.from || null,
    provider: config?.provider || null,
    storageReady: Boolean(await encryptionKey(env)),
  };
}

export async function saveEmailConfig(
  env: AppEnv,
  input: Record<string, unknown>,
): Promise<EmailConfigStatus> {
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (!apiKey.startsWith("re_")) throw new Error("请输入有效的 Resend API Key（以 re_ 开头）。");
  const from = assertFrom(typeof input.from === "string" ? input.from : "");
  await writeStoredConfig(env, { provider: "resend", apiKey, from });
  return getEmailConfigStatus(env);
}
