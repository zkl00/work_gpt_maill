import { NextResponse } from "next/server";
import { getAppEnv } from "@/lib/cloudflare";
import { getExpiryState, getReminderDate, getReminderState } from "@/lib/reminder";
import { resolveReminderRule } from "@/lib/reminder-rule";
import { deleteSharedSubscription, updateSharedSubscription } from "@/lib/share-store";
import type { Subscription, SubscriptionInput, SubscriptionView } from "@/lib/types";

type Context = { params: Promise<{ id: string; subId: string }> };

function toView(subscription: Subscription, timeZone: string | undefined): SubscriptionView {
  return {
    ...subscription,
    nextSendOn: getReminderDate(subscription),
    reminderState: getReminderState(subscription, undefined, timeZone),
    expiryState: getExpiryState(subscription, undefined, timeZone),
  };
}

export async function PUT(request: Request, context: Context) {
  try {
    const env = await getAppEnv();
    const { id: shareId, subId } = await context.params;
    const input = (await request.json()) as SubscriptionInput;

    const reminderRule = await resolveReminderRule(
      input.notes || "",
      input.reminderDays ?? 3,
      env.TYPESAFE_API_KEY,
    );

    const updated = await updateSharedSubscription(
      env.EXPIRY_REMINDERS_DB,
      shareId,
      subId,
      input,
      { reminderRule },
    );

    if (!updated) {
      return NextResponse.json({ error: "未找到该账号。" }, { status: 404 });
    }

    return NextResponse.json(toView(updated, env.APP_TIME_ZONE));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存修改失败。" },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const env = await getAppEnv();
    const { id: shareId, subId } = await context.params;

    const deleted = await deleteSharedSubscription(env.EXPIRY_REMINDERS_DB, shareId, subId);
    if (!deleted) {
      return NextResponse.json({ error: "未找到该账号。" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除失败。" },
      { status: 400 },
    );
  }
}

