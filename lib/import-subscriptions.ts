import * as XLSX from "xlsx";
import { validateSubscriptionInput } from "./subscription-store";
import type { ChatGptPlan, SubscriptionInput } from "./types";

export type ImportError = { line: number; message: string };
export type ImportCandidate = { line: number; input: SubscriptionInput };
export type ImportPreview = { candidates: ImportCandidate[]; errors: ImportError[] };

const headerAliases: Record<string, string[]> = {
  ownerEmail: ["美区账号", "美国账号", "美区账号邮箱", "owneremail", "owneremailaddress"],
  accountEmail: ["账号", "账号邮箱", "account", "accountemail"],
  serviceType: ["类型", "服务类型", "type", "servicetype"],
  chatGptPlan: ["套餐", "chatgpt套餐", "chatgptplan", "plan"],
  activatedOn: ["开通时间", "开通日期", "activatedon", "startdate"],
  expiresOn: ["到期时间", "到期日期", "expireson", "expirationdate", "expirydate"],
  status: ["状态", "status"],
  cancelled: ["是否取消订阅", "取消订阅", "是否取消", "cancelled"],
  notes: ["备注", "notes", "note"],
  notificationEmail: ["接收邮箱", "提醒邮箱", "通知邮箱", "notificationemail", "email"],
  reminderDays: ["提前提醒天数", "提醒天数", "reminderdays", "reminderdaysbefore"],
};

function normaliseHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_\-（）()]/g, "");
}

function text(value: unknown): string {
  return value instanceof Date ? dateToIso(value) : String(value ?? "").trim();
}

function dateToIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normaliseDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return dateToIso(value);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const match = text(value).match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!match) return text(value);
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function normaliseServiceType(value: unknown): { serviceType: string; rawType?: string } {
  const source = text(value);
  const normalized = source.toLowerCase().replace(/\s/g, "");
  if (normalized.includes("chatgpt") || normalized === "gpt") return { serviceType: "chatgpt" };
  if (normalized.includes("apple")) return { serviceType: "apple" };
  if (normalized.includes("android") || normalized.includes("安卓") || normalized.includes("anzhuo")) return { serviceType: "anzhuo" };
  return { serviceType: "other", rawType: source };
}

function normalisePlan(value: unknown): ChatGptPlan | undefined {
  const normalized = text(value).toLowerCase().replace(/[\s_-]/g, "");
  if (normalized === "plus" || normalized === "plust") return "plus";
  if (normalized === "pro10") return "pro10";
  if (normalized === "pro20") return "pro20";
  return undefined;
}

function normaliseStatus(value: unknown): SubscriptionInput["status"] {
  const normalized = text(value).toLowerCase();
  if (normalized.includes("暂停") || normalized === "paused") return "paused";
  if (normalized.includes("到期") || normalized === "expired") return "expired";
  return "active";
}

function isCancelled(value: unknown): boolean {
  return ["是", "yes", "true", "1", "已取消", "取消", "y"].includes(text(value).toLowerCase());
}

function columnIndexes(headers: unknown[]): Record<string, number | undefined> {
  const normalised = headers.map(normaliseHeader);
  const indexes: Record<string, number | undefined> = {};
  for (const [field, aliases] of Object.entries(headerAliases)) {
    const index = normalised.findIndex((header) => aliases.includes(header));
    indexes[field] = index === -1 ? undefined : index;
  }
  return indexes;
}

function at(row: unknown[], columns: Record<string, number | undefined>, field: string): unknown {
  const index = columns[field];
  return index === undefined ? undefined : row[index];
}

export function parseSubscriptionWorkbook(buffer: ArrayBuffer): ImportPreview {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { candidates: [], errors: [{ line: 0, message: "文件中没有可读取的工作表。" }] };

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  if (!rows.length) return { candidates: [], errors: [{ line: 0, message: "文件为空。" }] };
  const columns = columnIndexes(rows[0]);
  const missingHeaders = ["ownerEmail", "accountEmail", "serviceType", "activatedOn", "expiresOn"]
    .filter((field) => columns[field] === undefined);
  if (missingHeaders.length) {
    return {
      candidates: [],
      errors: [{ line: 1, message: `缺少必填表头：${missingHeaders.map((field) => headerAliases[field][0]).join("、")}。` }],
    };
  }

  const candidates: ImportCandidate[] = [];
  const errors: ImportError[] = [];
  rows.slice(1).forEach((row, rowIndex) => {
    const line = rowIndex + 2;
    if (row.every((value) => !text(value))) return;
    try {
      const type = normaliseServiceType(at(row, columns, "serviceType"));
      const notes = text(at(row, columns, "notes"));
      const input: SubscriptionInput = {
        ownerEmail: text(at(row, columns, "ownerEmail")),
        accountEmail: text(at(row, columns, "accountEmail")),
        serviceType: type.serviceType,
        chatGptPlan: normalisePlan(at(row, columns, "chatGptPlan")),
        activatedOn: normaliseDate(at(row, columns, "activatedOn")),
        expiresOn: normaliseDate(at(row, columns, "expiresOn")),
        status: normaliseStatus(at(row, columns, "status")),
        cancelled: isCancelled(at(row, columns, "cancelled")),
        notes: type.rawType ? `[导入类型：${type.rawType}]${notes ? ` ${notes}` : ""}` : notes,
        notificationEmail: text(at(row, columns, "notificationEmail")) || text(at(row, columns, "ownerEmail")),
        reminderDays: (() => {
          const value = at(row, columns, "reminderDays");
          return value === undefined || text(value) === "" ? 3 : Number(value);
        })(),
      };
      candidates.push({ line, input: validateSubscriptionInput(input) });
    } catch (error) {
      errors.push({ line, message: error instanceof Error ? error.message : "该行格式无效。" });
    }
  });
  return { candidates, errors };
}
