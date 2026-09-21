import type { ReminderState, Subscription } from "@/lib/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertDate(value: string, fieldName: string): void {
  if (!ISO_DATE.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
    throw new Error(`${fieldName} 必须是有效的 YYYY-MM-DD 日期。`);
  }
}

export function addDays(date: string, days: number): string {
  assertDate(date, "日期");
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dateInTimezone(timeZone = "Asia/Shanghai"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getReminderDate(subscription: Subscription): string | null {
  if (!subscription.reminderRule.enabled || subscription.cancelled) return null;
  return addDays(subscription.expiresOn, -subscription.reminderRule.daysBefore);
}

export function hasAutomaticReminderForCurrentExpiry(subscription: Subscription): boolean {
  return subscription.sentReminders.some(
    (reminder) =>
      reminder.kind === "automatic" && reminder.expiresOn === subscription.expiresOn,
  );
}

export function getReminderState(
  subscription: Subscription,
  today?: string,
  timeZone?: string,
): ReminderState {
  const currentDate = today || dateInTimezone(timeZone);
  if (subscription.cancelled) return "cancelled";
  if (!subscription.reminderRule.enabled) return "disabled";
  if (subscription.expiresOn < currentDate) return "expired";
  if (hasAutomaticReminderForCurrentExpiry(subscription)) return "sent";

  const reminderDate = getReminderDate(subscription);
  return reminderDate !== null && reminderDate <= currentDate ? "due" : "scheduled";
}

export function shouldSendAutomaticReminder(
  subscription: Subscription,
  today?: string,
  timeZone?: string,
): boolean {
  return getReminderState(subscription, today, timeZone) === "due";
}
