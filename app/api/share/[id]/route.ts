import { NextResponse } from "next/server";
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

export async function GET(_request: Request, context: Context) {
  try {
    const env = await getAppEnv();
    const { id } = await context.params;
    const data = await getSharedSubscriptions(env.EXPIRY_REMINDERS_DB, id);
    if (!data) {
      return NextResponse.json({ error: "分享链接不存在或已失效。" }, { status: 404 });
    }

    const subscriptionsView = data.subscriptions.map((item) => toView(item, env.APP_TIME_ZONE));

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

export async function DELETE(_request: Request, context: Context) {
  try {
    const env = await getAppEnv();
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

