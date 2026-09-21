import * as XLSX from "xlsx";
import { getReminderDate, getReminderState } from "./reminder";
import type { Subscription } from "./types";

const serviceTypeNames: Record<string, string> = {
  chatgpt: "ChatGPT",
  apple: "Apple",
  anzhuo: "安卓",
  other: "其他",
};
const planNames: Record<string, string> = { plus: "Plus", pro10: "Pro 10", pro20: "Pro 20" };
const reminderStateNames: Record<string, string> = {
  cancelled: "已取消订阅",
  disabled: "已关闭提醒",
  scheduled: "待发送",
  due: "今日应发",
  sent: "已发送",
  expired: "已到期",
};

const headers = [
  "美区账号",
  "账号",
  "类型",
  "套餐",
  "开通时间",
  "到期时间",
  "状态",
  "是否取消订阅",
  "接收邮箱",
  "提前提醒天数",
  "预计发送日",
  "提醒状态",
  "备注",
] as const;

function serviceName(subscription: Subscription): string {
  return serviceTypeNames[subscription.serviceType] || subscription.serviceType;
}

export function exportSubscriptionsWorkbook(subscriptions: Subscription[]): Buffer {
  const rows = subscriptions.map((subscription) => ({
    "美区账号": subscription.ownerEmail,
    "账号": subscription.accountEmail,
    "类型": serviceName(subscription),
    "套餐": subscription.chatGptPlan ? planNames[subscription.chatGptPlan] : "",
    "开通时间": subscription.activatedOn,
    "到期时间": subscription.expiresOn,
    "状态": subscription.status === "active" ? "正常" : subscription.status === "paused" ? "暂停" : "已到期",
    "是否取消订阅": subscription.cancelled ? "是" : "否",
    "接收邮箱": subscription.notificationEmail,
    "提前提醒天数": subscription.reminderRule.daysBefore,
    "预计发送日": getReminderDate(subscription) || "",
    "提醒状态": reminderStateNames[getReminderState(subscription)],
    "备注": subscription.notes,
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...headers] });
  worksheet["!cols"] = [
    { wch: 28 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 12 },
    { wch: 15 }, { wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 34 },
  ];
  worksheet["!autofilter"] = { ref: `A1:M${Math.max(rows.length + 1, 2)}` };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "账号到期提醒");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true });
}
