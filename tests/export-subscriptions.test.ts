import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { exportSubscriptionsWorkbook } from "../lib/export-subscriptions";
import type { Subscription } from "../lib/types";

const subscription: Subscription = {
  id: "one",
  ownerEmail: "owner@example.com",
  accountEmail: "account@example.com",
  serviceType: "chatgpt",
  chatGptPlan: "plus",
  activatedOn: "2026-09-01",
  expiresOn: "2026-10-03",
  status: "active",
  cancelled: false,
  notes: "提前 3 天提醒",
  notificationEmail: "notify@example.com",
  reminderRule: { enabled: true, daysBefore: 3, source: "manual" },
  sentReminders: [],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

describe("subscription spreadsheet export", () => {
  it("exports the account fields with Chinese headers and the ChatGPT plan", () => {
    const workbook = XLSX.read(exportSubscriptionsWorkbook([subscription]), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["账号到期提醒"]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      "美区账号": "owner@example.com",
      "账号": "account@example.com",
      "类型": "ChatGPT",
      "套餐": "Plus",
      "接收邮箱": "notify@example.com",
      "预计发送日": "2026-09-30",
    });
  });
});
