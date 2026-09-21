import { getCloudflareContext } from "@opennextjs/cloudflare";

export type AppEnv = Pick<
  CloudflareEnv,
  | "EXPIRY_REMINDERS_DB"
  | "APP_TIME_ZONE"
  | "CRON_SECRET"
  | "EMAIL_CONFIG_ENCRYPTION_KEY"
  | "EMAIL_DELIVERY_MODE"
  | "EMAIL_FROM"
  | "RESEND_API_KEY"
  | "TYPESAFE_API_KEY"
>;

export async function getAppEnv(): Promise<AppEnv> {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.EXPIRY_REMINDERS_DB) {
    throw new Error("Cloudflare D1 未绑定。请设置 EXPIRY_REMINDERS_DB 后重试。");
  }
  return env as AppEnv;
}
