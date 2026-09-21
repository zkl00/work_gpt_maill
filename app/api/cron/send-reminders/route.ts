import { NextResponse } from "next/server";
import { sendExpirationReminder } from "@/lib/mailer";
import { dateInTimezone, shouldSendAutomaticReminder } from "@/lib/reminder";
import { listSubscriptions, recordReminderSent } from "@/lib/subscription-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const suppliedSecret = request.headers.get("authorization");
  if (!cronSecret || suppliedSecret !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "未授权的定时任务请求。" }, { status: 401 });
  }

  const today = dateInTimezone();
  const due = (await listSubscriptions()).filter((subscription) =>
    shouldSendAutomaticReminder(subscription, today),
  );
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const subscription of due) {
    try {
      await sendExpirationReminder(subscription);
      await recordReminderSent(subscription.id, subscription.expiresOn, "automatic");
      results.push({ id: subscription.id, ok: true });
    } catch (error) {
      results.push({ id: subscription.id, ok: false, error: error instanceof Error ? error.message : "发送失败。" });
    }
  }

  return NextResponse.json({ date: today, due: due.length, results });
}
