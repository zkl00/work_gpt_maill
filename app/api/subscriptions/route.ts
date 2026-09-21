import { NextResponse } from "next/server";
import { getAppEnv } from "@/lib/cloudflare";
import { getReminderDate, getReminderState } from "@/lib/reminder";
import { resolveReminderRule } from "@/lib/reminder-rule";
import { createSubscription, listSubscriptions } from "@/lib/subscription-store";
import type { SubscriptionInput, SubscriptionView } from "@/lib/types";

function toView(
  subscription: Awaited<ReturnType<typeof createSubscription>>,
  timeZone: string | undefined,
): SubscriptionView {
  return {
    ...subscription,
    nextSendOn: getReminderDate(subscription),
    reminderState: getReminderState(subscription, undefined, timeZone),
  };
}

export async function GET() {
  const env = await getAppEnv();
  const subscriptions = await listSubscriptions(env.EXPIRY_REMINDERS_DB);
  return NextResponse.json(subscriptions.map((subscription) => toView(subscription, env.APP_TIME_ZONE)));
}

export async function POST(request: Request) {
  try {
    const env = await getAppEnv();
    const input = (await request.json()) as SubscriptionInput;
    const reminderDays = input.reminderDays ?? 3;
    const reminderRule = await resolveReminderRule(input.notes || "", reminderDays, env.TYPESAFE_API_KEY);
    const subscription = await createSubscription(env.EXPIRY_REMINDERS_DB, input, { reminderRule });
    return NextResponse.json(toView(subscription, env.APP_TIME_ZONE), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存失败。" },
      { status: 400 },
    );
  }
}
