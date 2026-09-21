import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const source = path.resolve("data/subscriptions.json");
const destination = path.resolve("data/subscriptions-cloudflare-import.xlsx");

if (!existsSync(source)) {
  console.error(`未找到旧数据文件：${source}`);
  process.exit(1);
}

const subscriptions = JSON.parse(readFileSync(source, "utf8"));
if (!Array.isArray(subscriptions)) {
  console.error("旧数据文件格式无效。");
  process.exit(1);
}

const serviceTypeNames = { chatgpt: "ChatGPT", apple: "Apple", anzhuo: "安卓", other: "其他" };
const planNames = { plus: "Plus", pro10: "Pro 10", pro20: "Pro 20" };
const rows = subscriptions.map((subscription) => ({
  "美区账号": subscription.ownerEmail || "",
  "账号": subscription.accountEmail || "",
  "类型": serviceTypeNames[subscription.serviceType] || subscription.serviceType || "其他",
  "套餐": subscription.chatGptPlan ? planNames[subscription.chatGptPlan] || subscription.chatGptPlan : "",
  "开通时间": subscription.activatedOn || "",
  "到期时间": subscription.expiresOn || "",
  "状态": subscription.status === "paused" ? "暂停" : subscription.status === "expired" ? "已到期" : "正常",
  "是否取消订阅": subscription.cancelled ? "是" : "否",
  "接收邮箱": subscription.notificationEmail || subscription.ownerEmail || "",
  "提前提醒天数": subscription.reminderRule?.daysBefore ?? 3,
  "备注": subscription.notes || "",
}));

const worksheet = XLSX.utils.json_to_sheet(rows, {
  header: ["美区账号", "账号", "类型", "套餐", "开通时间", "到期时间", "状态", "是否取消订阅", "接收邮箱", "提前提醒天数", "备注"],
});
worksheet["!cols"] = [
  { wch: 28 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 13 },
  { wch: 12 }, { wch: 15 }, { wch: 28 }, { wch: 16 }, { wch: 34 },
];
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "账号到期提醒");
XLSX.writeFile(workbook, destination, { compression: true });
console.log(`已导出 ${rows.length} 条旧记录：${destination}`);
