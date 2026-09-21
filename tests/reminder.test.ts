import { describe, expect, it } from "vitest";
import { addDays, getReminderDate, getReminderState, shouldSendAutomaticReminder } from "../lib/reminder";
import type { Subscription } from "../lib/types";

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "one",
    ownerEmail: "owner@example.com",
    accountEmail: "account@example.com",
    serviceType: "Apple",
    activatedOn: "2026-09-01",
    expiresOn: "2026-10-03",
    status: "active",
    cancelled: false,
    notes: "",
    notificationEmail: "notify@example.com",
    reminderRule: { enabled: true, daysBefore: 3, source: "manual" },
    sentReminders: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("expiration reminder schedule", () => {
  it("calculates a reminder date across month boundaries", () => {
    expect(addDays("2026-10-03", -3)).toBe("2026-09-30");
    expect(getReminderDate(subscription())).toBe("2026-09-30");
  });

  it("sends on and after the reminder date, but not after expiration", () => {
    const item = subscription();
    expect(getReminderState(item, "2026-09-29")).toBe("scheduled");
    expect(shouldSendAutomaticReminder(item, "2026-09-30")).toBe(true);
    expect(shouldSendAutomaticReminder(item, "2026-10-02")).toBe(true);
    expect(shouldSendAutomaticReminder(item, "2026-10-04")).toBe(false);
  });

  it("never auto-sends cancelled subscriptions or a date already sent", () => {
    expect(getReminderState(subscription({ cancelled: true }), "2026-09-30")).toBe("cancelled");
    expect(getReminderState(subscription({ sentReminders: [{ expiresOn: "2026-10-03", sentAt: "2026-09-30T01:00:00Z", kind: "automatic" }] }), "2026-09-30")).toBe("sent");
  });
});
