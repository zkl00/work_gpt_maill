import { describe, expect, it } from "vitest";
import { normalizeNotificationEmails, notificationEmailList } from "../lib/notification-emails";

describe("notification email lists", () => {
  it("accepts comma, semicolon, and newline separated recipients and removes duplicates", () => {
    const value = normalizeNotificationEmails("first@example.com；second@example.com\nFIRST@example.com");

    expect(value).toBe("first@example.com, second@example.com");
    expect(notificationEmailList(value)).toEqual(["first@example.com", "second@example.com"]);
  });

  it("reports the invalid address", () => {
    expect(() => normalizeNotificationEmails("valid@example.com, not-an-email")).toThrow("not-an-email");
  });
});
