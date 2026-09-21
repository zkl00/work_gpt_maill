import type { AppEnv } from "./cloudflare";
import { getEmailCredentials } from "./email-config";
import { dateInTimezone } from "./reminder";
import type { Subscription } from "./types";

const serviceTypeNames: Record<string, string> = {
  chatgpt: "ChatGPT",
  apple: "Apple",
  anzhuo: "安卓",
  other: "其他",
};
const planNames: Record<string, string> = { plus: "Plus", pro10: "Pro 10", pro20: "Pro 20" };

function serviceName(subscription: Subscription): string {
  const type = serviceTypeNames[subscription.serviceType] || subscription.serviceType;
  return subscription.serviceType === "chatgpt" && subscription.chatGptPlan
    ? `${type} ${planNames[subscription.chatGptPlan]}`
    : type;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;",
  })[character] ?? character);
}

function message(subscription: Subscription, timeZone: string | undefined): { subject: string; html: string; text: string } {
  const today = dateInTimezone(timeZone);
  const remainingDays = Math.round(
    (Date.parse(`${subscription.expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  const deadline = remainingDays === 0
    ? "今天"
    : remainingDays > 0
      ? `${remainingDays} 天后`
      : `已过期 ${Math.abs(remainingDays)} 天`;
  const service = serviceName(subscription);
  const subject = `${service} 账号将在 ${subscription.expiresOn} 到期`;
  const text = [
    "到期提醒",
    `${service} 账号 ${subscription.accountEmail} 将在 ${subscription.expiresOn} 到期（${deadline}）。`,
    subscription.notes ? `备注：${subscription.notes}` : "",
    "请及时处理续费或取消订阅。",
  ].filter(Boolean).join("\n");
  const html = `<main style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.65;color:#1f2937">\n<h2>到期提醒</h2>\n<p><strong>${escapeHtml(service)}</strong> 账号 <strong>${escapeHtml(subscription.accountEmail)}</strong> 将在 <strong>${escapeHtml(subscription.expiresOn)}</strong> 到期（${escapeHtml(deadline)}）。</p>\n${subscription.notes ? `<p>备注：${escapeHtml(subscription.notes)}</p>` : ""}\n<p>请及时处理续费或取消订阅。</p>\n</main>`;
  return { subject, text, html };
}

export async function sendExpirationReminder(subscription: Subscription, env: AppEnv): Promise<void> {
  const payload = message(subscription, env.APP_TIME_ZONE);
  if (env.EMAIL_DELIVERY_MODE === "console") {
    console.info("[email preview]", { to: subscription.notificationEmail, ...payload });
    return;
  }

  const credentials = await getEmailCredentials(env);
  if (!credentials) {
    throw new Error("邮件未配置：请先在“邮件发送设置”中保存 Resend 发件配置。");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: credentials.from, to: [subscription.notificationEmail], ...payload }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`邮件服务拒绝发送（${response.status}）：${detail}`);
  }
}
