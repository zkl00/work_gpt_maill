import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseSubscriptionWorkbook } from "../lib/import-subscriptions";

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "账号");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("subscription spreadsheet import", () => {
  it("maps Chinese headers and normalizes a ChatGPT plan", () => {
    const preview = parseSubscriptionWorkbook(workbookBuffer([
      ["美区账号", "账号", "类型", "套餐", "开通时间", "到期时间", "接收邮箱", "是否取消订阅", "提前提醒天数", "备注"],
      ["owner@example.com", "account@example.com", "ChatGPT", "Pro 10", "2026/09/01", "2026/10/01", "notify@example.com", "否", 3, "需要提前 3 天充值"],
    ]));

    expect(preview.errors).toEqual([]);
    expect(preview.candidates).toHaveLength(1);
    expect(preview.candidates[0].input).toMatchObject({
      serviceType: "chatgpt",
      chatGptPlan: "pro10",
      activatedOn: "2026-09-01",
      expiresOn: "2026-10-01",
      cancelled: false,
      notificationEmail: "notify@example.com",
      reminderDays: 3,
    });
  });

  it("uses the owner email as notification email when the optional column is absent", () => {
    const preview = parseSubscriptionWorkbook(workbookBuffer([
      ["美区账号", "账号", "类型", "开通时间", "到期时间"],
      ["owner@example.com", "account@example.com", "Apple", "2026-09-01", "2026-10-01"],
    ]));

    expect(preview.errors).toEqual([]);
    expect(preview.candidates[0].input.notificationEmail).toBe("owner@example.com");
  });

  it("flags ChatGPT rows that do not specify a plan", () => {
    const preview = parseSubscriptionWorkbook(workbookBuffer([
      ["美区账号", "账号", "类型", "开通时间", "到期时间"],
      ["owner@example.com", "account@example.com", "ChatGPT", "2026-09-01", "2026-10-01"],
    ]));

    expect(preview.candidates).toHaveLength(0);
    expect(preview.errors[0]).toMatchObject({ line: 2, message: "请选择 ChatGPT 套餐。" });
  });
});
