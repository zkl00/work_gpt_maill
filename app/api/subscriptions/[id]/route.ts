import { NextResponse } from "next/server";
import { getReminderDate, getReminderState } from "@/lib/reminder";
import { resolveReminderRule } from "@/lib/reminder-rule";
import { deleteSubscription, updateSubscription } from "@/lib/subscription-store";
import type { SubscriptionInput, SubscriptionView } from "@/lib/types";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

function toView(subscription: NonNullable<Awaited<ReturnType<typeof updateSubscription>>>): SubscriptionView {
  return {
    ...subscription,
    nextSendOn: getReminderDate(subscription),
    reminderState: getReminderState(subscription),
  };
}

export async function PUT(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const input = (await request.json()) as SubscriptionInput;
    const reminderRule = await resolveReminderRule(input.notes || "", input.reminderDays ?? 3);
    const subscription = await updateSubscription(id, input, { reminderRule });
    if (!subscription) return NextResponse.json({ error: "未找到该账号。" }, { status: 404 });
    return NextResponse.json(toView(subscription));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存失败。" },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const deleted = await deleteSubscription(id);
  if (!deleted) return NextResponse.json({ error: "未找到该账号。" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
