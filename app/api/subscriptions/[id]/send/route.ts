import { NextResponse } from "next/server";
import { sendExpirationReminder } from "@/lib/mailer";
import { listSubscriptions, recordReminderSent } from "@/lib/subscription-store";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const subscription = (await listSubscriptions()).find((item) => item.id === id);
    if (!subscription) return NextResponse.json({ error: "未找到该账号。" }, { status: 404 });
    if (subscription.cancelled) {
      return NextResponse.json({ error: "该账号已取消订阅，不能发送提醒。" }, { status: 409 });
    }
    if (!subscription.reminderRule.enabled) {
      return NextResponse.json({ error: "备注规则已禁用邮件提醒。" }, { status: 409 });
    }

    await sendExpirationReminder(subscription);
    await recordReminderSent(subscription.id, subscription.expiresOn, "manual");
    return NextResponse.json({ ok: true, message: `已发送到 ${subscription.notificationEmail}` });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发送失败。" },
      { status: 502 },
    );
  }
}
