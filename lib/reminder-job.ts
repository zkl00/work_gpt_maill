import type { AppEnv } from "./cloudflare";
import { sendExpirationReminder } from "./mailer";
import { dateInTimezone, shouldSendAutomaticReminder } from "./reminder";
import { listSubscriptions, recordReminderSent } from "./subscription-store";

export type ReminderJobResult = {
  date: string;
  due: number;
  results: Array<{ id: string; ok: boolean; error?: string }>;
};

export async function runReminderJob(env: AppEnv): Promise<ReminderJobResult> {
  const today = dateInTimezone(env.APP_TIME_ZONE);
  const due = (await listSubscriptions(env.EXPIRY_REMINDERS_DB)).filter((subscription) =>
    shouldSendAutomaticReminder(subscription, today),
  );
  const results: ReminderJobResult["results"] = [];

  for (const subscription of due) {
    try {
      await sendExpirationReminder(subscription, env);
      await recordReminderSent(env.EXPIRY_REMINDERS_DB, subscription.id, subscription.expiresOn, "automatic");
      results.push({ id: subscription.id, ok: true });
    } catch (error) {
      results.push({
        id: subscription.id,
        ok: false,
        error: error instanceof Error ? error.message : "发送失败。",
      });
    }
  }

  return { date: today, due: due.length, results };
}
