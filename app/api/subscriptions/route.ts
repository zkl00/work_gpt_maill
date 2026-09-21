import { NextResponse } from "next/server";
import { getReminderDate, getReminderState } from "@/lib/reminder";
import { resolveReminderRule } from "@/lib/reminder-rule";
import { createSubscription, listSubscriptions } from "@/lib/subscription-store";
import type { SubscriptionInput, SubscriptionView } from "@/lib/types";

export const runtime = "nodejs";

function toView(subscription: Awaited<ReturnType<typeof createSubscription>>): SubscriptionView {
  return {
    ...subscription,
    nextSendOn: getReminderDate(subscription),
    reminderState: getReminderState(subscription),
  };
}

export async function GET() {
  const subscriptions = await listSubscriptions();
  return NextResponse.json(subscriptions.map(toView));
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as SubscriptionInput;
    const reminderDays = input.reminderDays ?? 3;
    const reminderRule = await resolveReminderRule(input.notes || "", reminderDays);
    const subscription = await createSubscription(input, { reminderRule });
    return NextResponse.json(toView(subscription), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存失败。" },
      { status: 400 },
    );
  }
}
