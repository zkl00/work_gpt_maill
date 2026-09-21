import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

type EncryptedConfig = {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
};

export type ResendEmailConfig = {
  provider: "resend";
  apiKey: string;
  from: string;
};

export type SmtpEmailConfig = {
  provider: "smtp";
  from: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
};

export type StoredEmailConfig = ResendEmailConfig | SmtpEmailConfig;

export type EmailConfigStatus = {
  configured: boolean;
  from: string | null;
  provider: StoredEmailConfig["provider"] | null;
  storageReady: boolean;
};

const configFile = process.env.EMAIL_CONFIG_FILE || path.join(process.cwd(), "data", "email-config.json");
const FROM_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOSTNAME = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

function encryptionKey(): Buffer | null {
  const secret = process.env.EMAIL_CONFIG_ENCRYPTION_KEY;
  return secret ? scryptSync(secret, "expiry-email-config-v1", 32) : null;
}

function assertFrom(from: string): string {
  const trimmed = from.trim();
  const email = trimmed.match(/<([^>]+)>/)?.[1] || trimmed;
  if (!FROM_EMAIL.test(email)) {
    throw new Error("发件人格式无效。可填写 sender@your-domain.com 或 名称 <sender@your-domain.com>。");
  }
  return trimmed;
}

function parseStoredConfig(value: unknown): StoredEmailConfig | null {
  if (!value || typeof value !== "object") return null;
  const config = value as Record<string, unknown>;
  // Saved Resend configurations from the previous version are migrated on read.
  if ((config.provider === "resend" || config.provider === undefined) && typeof config.apiKey === "string" && typeof config.from === "string") {
    return { provider: "resend", apiKey: config.apiKey, from: config.from };
  }
  if (
    config.provider === "smtp" &&
    typeof config.from === "string" &&
    typeof config.host === "string" &&
    typeof config.port === "number" &&
    typeof config.secure === "boolean" &&
    typeof config.username === "string" &&
    typeof config.password === "string"
  ) {
    return {
      provider: "smtp",
      from: config.from,
      host: config.host,
      port: config.port,
      secure: config.secure,
      username: config.username,
      password: config.password,
    };
  }
  return null;
}

async function readStoredConfig(): Promise<StoredEmailConfig | null> {
  const key = encryptionKey();
  if (!key) return null;
  try {
    const raw = await fs.readFile(configFile, "utf8");
    const encrypted = JSON.parse(raw) as EncryptedConfig;
    if (encrypted.version !== 1) throw new Error("邮件配置版本不受支持。");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return parseStoredConfig(JSON.parse(plaintext));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.error("Unable to read encrypted email configuration.", error);
    return null;
  }
}

async function writeStoredConfig(config: StoredEmailConfig): Promise<void> {
  const key = encryptionKey();
  if (!key) {
    throw new Error("服务器未设置 EMAIL_CONFIG_ENCRYPTION_KEY，不能从页面安全保存邮件密钥。");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), "utf8"), cipher.final()]);
  const encrypted: EncryptedConfig = {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  await fs.mkdir(path.dirname(configFile), { recursive: true });
  const temporary = `${configFile}.${randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(encrypted)}\n`, "utf8");
  await fs.rename(temporary, configFile);
}

export async function getEmailCredentials(): Promise<StoredEmailConfig | null> {
  const saved = await readStoredConfig();
  if (saved) return saved;

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const smtpFrom = process.env.SMTP_FROM;
  if (smtpHost && smtpUser && smtpPassword && smtpFrom) {
    return {
      provider: "smtp",
      host: smtpHost,
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE !== "false",
      username: smtpUser,
      password: smtpPassword,
      from: smtpFrom,
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  return apiKey && from ? { provider: "resend", apiKey, from } : null;
}

export async function getEmailConfigStatus(): Promise<EmailConfigStatus> {
  const config = await getEmailCredentials();
  return {
    configured: Boolean(config),
    from: config?.from || null,
    provider: config?.provider || null,
    storageReady: Boolean(encryptionKey()),
  };
}

function assertSmtpHost(host: string): string {
  const value = host.trim().toLowerCase();
  if (!HOSTNAME.test(value)) throw new Error("SMTP 服务器地址无效，例如 smtp.qq.com。");
  return value;
}

function assertPort(port: unknown): number {
  const value = Number(port);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) throw new Error("SMTP 端口无效。");
  return value;
}

export async function saveEmailConfig(input: Record<string, unknown>): Promise<EmailConfigStatus> {
  const provider = input.provider;
  const from = assertFrom(typeof input.from === "string" ? input.from : "");
  if (provider === "resend") {
    const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    if (!apiKey.startsWith("re_")) throw new Error("请输入有效的 Resend API Key（以 re_ 开头）。");
    await writeStoredConfig({ provider, apiKey, from });
  } else if (provider === "smtp") {
    const username = typeof input.username === "string" ? input.username.trim() : "";
    const password = typeof input.password === "string" ? input.password.trim() : "";
    if (!FROM_EMAIL.test(username)) throw new Error("请填写 SMTP 登录邮箱。");
    if (!password) throw new Error("请填写邮箱授权码或应用专用密码，不要填写网页登录密码。");
    await writeStoredConfig({
      provider,
      from,
      host: assertSmtpHost(typeof input.host === "string" ? input.host : ""),
      port: assertPort(input.port),
      secure: input.secure === true,
      username,
      password,
    });
  } else {
    throw new Error("请选择发件方式。");
  }
  return getEmailConfigStatus();
}
