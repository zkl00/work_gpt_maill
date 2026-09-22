const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEPARATORS = /[,;，；\n]+/;

/** Normalizes a user-entered recipient list into a stable, comma-separated value. */
export function normalizeNotificationEmails(value: string): string {
  const emails = value
    .split(SEPARATORS)
    .map((email) => email.trim())
    .filter(Boolean);

  if (!emails.length) throw new Error("请至少填写一个接收邮箱。");

  const invalid = emails.find((email) => !EMAIL.test(email));
  if (invalid) throw new Error(`接收邮箱格式无效：${invalid}`);

  return [...new Set(emails.map((email) => email.toLowerCase()))].join(", ");
}

export function notificationEmailList(value: string): string[] {
  return normalizeNotificationEmails(value).split(", ");
}
