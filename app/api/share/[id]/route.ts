import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { getAppEnv } from "@/lib/cloudflare";
import { getExpiryState, getReminderDate, getReminderState } from "@/lib/reminder";
import { deleteSharedLink, getSharedSubscriptions } from "@/lib/share-store";
import type { Subscription, SubscriptionView } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

function toView(subscription: Subscription, timeZone: string | undefined): SubscriptionView {
  return {
    ...subscription,
    nextSendOn: getReminderDate(subscription),
    reminderState: getReminderState(subscription, undefined, timeZone),
    expiryState: getExpiryState(subscription, undefined, timeZone),
  };
}

function toMaskedView(
  subscription: Subscription,
  visibleColumns: string[],
  timeZone: string | undefined,
): SubscriptionView {
  const visible = new Set(visibleColumns);
  const view = toView(subscription, timeZone);
  return {
    ...view,
    ownerEmail: visible.has("ownerEmail") ? view.ownerEmail : "—",
    notificationEmail: visible.has("notificationEmail") ? view.notificationEmail : "—",
    reminderRule: visible.has("reminderRule")
      ? view.reminderRule
      : { enabled: false, daysBefore: 0, source: "manual" },
    chatGptPlan: visible.has("chatGptPlan") ? view.chatGptPlan : undefined,
  };
}

export async function GET(_request: Request, context: Context) {
  try {
    const env = await getAppEnv();
    const { id } = await context.params;
    const data = await getSharedSubscriptions(env.EXPIRY_REMINDERS_DB, id);
    if (!data) {
      return NextResponse.json({ error: "分享链接不存在或已失效。" }, { status: 404 });
    }

    const subscriptionsView = data.subscriptions.map((item) =>
      toMaskedView(item, data.link.visibleColumns, env.APP_TIME_ZONE),
    );

    return NextResponse.json({
      link: data.link,
      subscriptions: subscriptionsView,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取分享数据失败。" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const env = await getAppEnv();
    await assertAdmin(request, env.EXPIRY_REMINDERS_DB);
    const { id } = await context.params;
    const deleted = await deleteSharedLink(env.EXPIRY_REMINDERS_DB, id);
    if (!deleted) {
      return NextResponse.json({ error: "未找到该分享链接。" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除分享链接失败。" },
      { status: 500 },
    );
  }
}

