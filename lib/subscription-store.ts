import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertDate } from "./reminder";
import type { ChatGptPlan, Subscription, SubscriptionInput } from "./types";

const dataFile = process.env.DATA_FILE || path.join(process.cwd(), "data", "subscriptions.json");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validStatuses = new Set(["active", "expired", "paused"]);
const validServiceTypes = new Set(["chatgpt", "apple", "anzhuo", "other"]);
const validChatGptPlans = new Set<ChatGptPlan>(["plus", "pro10", "pro20"]);

export function validateSubscriptionInput(input: SubscriptionInput): SubscriptionInput {
  const cleaned = {
    ...input,
    ownerEmail: input.ownerEmail.trim(),
    accountEmail: input.accountEmail.trim(),
    serviceType: input.serviceType.trim(),
    notificationEmail: input.notificationEmail.trim(),
    notes: input.notes.trim(),
    chatGptPlan: input.chatGptPlan,
  };
  if (!EMAIL.test(cleaned.notificationEmail)) throw new Error("请填写有效的接收邮箱。");
  if (!EMAIL.test(cleaned.ownerEmail)) throw new Error("请填写有效的美区账号邮箱。");
  if (!EMAIL.test(cleaned.accountEmail)) throw new Error("请填写有效的账号邮箱。");
  if (!cleaned.serviceType) throw new Error("请填写类型。");
  if (!validServiceTypes.has(cleaned.serviceType)) throw new Error("请选择有效的账号类型。");
  if (cleaned.serviceType === "chatgpt" && !validChatGptPlans.has(cleaned.chatGptPlan as ChatGptPlan)) {
    throw new Error("请选择 ChatGPT 套餐。");
  }
  if (cleaned.serviceType !== "chatgpt") cleaned.chatGptPlan = undefined;
  if (!validStatuses.has(cleaned.status)) throw new Error("状态无效。");
  assertDate(cleaned.activatedOn, "开通时间");
  assertDate(cleaned.expiresOn, "到期时间");
  if (cleaned.expiresOn < cleaned.activatedOn) throw new Error("到期时间不能早于开通时间。");
  if (
    cleaned.reminderDays !== undefined &&
    (!Number.isInteger(cleaned.reminderDays) || cleaned.reminderDays < 0 || cleaned.reminderDays > 60)
  ) {
    throw new Error("提醒天数必须是 0 到 60 的整数。");
  }
  return cleaned;
}

async function readAll(): Promise<Subscription[]> {
  try {
    const raw = await fs.readFile(dataFile, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Subscription[]) : [];
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeAll(subscriptions: Subscription[]): Promise<void> {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  const temporary = `${dataFile}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(subscriptions, null, 2)}\n`, "utf8");
  await fs.rename(temporary, dataFile);
}

export async function listSubscriptions(): Promise<Subscription[]> {
  return (await readAll()).sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
}

export async function createSubscription(
  input: SubscriptionInput,
  subscription: Pick<Subscription, "reminderRule">,
): Promise<Subscription> {
  const [created] = await createSubscriptions([{ input, reminderRule: subscription.reminderRule }]);
  return created;
}

export async function createSubscriptions(
  entries: Array<Pick<Subscription, "reminderRule"> & { input: SubscriptionInput }>,
): Promise<Subscription[]> {
  if (!entries.length) return [];
  const validatedEntries = entries.map((entry) => ({
    input: validateSubscriptionInput(entry.input),
    reminderRule: entry.reminderRule,
  }));
  const all = await readAll();
  const existingKeys = new Set(all.map((item) => `${item.accountEmail.toLowerCase()}:${item.expiresOn}`));
  const batchKeys = new Set<string>();
  const now = new Date().toISOString();
  const created = validatedEntries.map(({ input, reminderRule }) => {
    const key = `${input.accountEmail.toLowerCase()}:${input.expiresOn}`;
    if (existingKeys.has(key) || batchKeys.has(key)) {
      throw new Error(`账号 ${input.accountEmail} 在 ${input.expiresOn} 已存在，不能重复导入。`);
    }
    batchKeys.add(key);
    return {
      ...input,
      id: randomUUID(),
      reminderRule,
      sentReminders: [],
      createdAt: now,
      updatedAt: now,
    } satisfies Subscription;
  });
  all.push(...created);
  await writeAll(all);
  return created;
}

export async function updateSubscription(
  id: string,
  input: SubscriptionInput,
  subscription: Pick<Subscription, "reminderRule">,
): Promise<Subscription | null> {
  const validated = validateSubscriptionInput(input);
  const all = await readAll();
  const index = all.findIndex((item) => item.id === id);
  if (index < 0) return null;

  const existing = all[index];
  const expiryChanged = existing.expiresOn !== validated.expiresOn;
  const updated: Subscription = {
    ...existing,
    ...validated,
    reminderRule: subscription.reminderRule,
    sentReminders: expiryChanged ? existing.sentReminders.filter((item) => item.expiresOn !== existing.expiresOn) : existing.sentReminders,
    updatedAt: new Date().toISOString(),
  };
  all[index] = updated;
  await writeAll(all);
  return updated;
}

export async function deleteSubscription(id: string): Promise<boolean> {
  const all = await readAll();
  const remaining = all.filter((item) => item.id !== id);
  if (remaining.length === all.length) return false;
  await writeAll(remaining);
  return true;
}

export async function recordReminderSent(
  id: string,
  expiresOn: string,
  kind: "automatic" | "manual",
): Promise<Subscription | null> {
  const all = await readAll();
  const index = all.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const existing = all[index];
  const alreadySent = existing.sentReminders.some(
    (item) => item.expiresOn === expiresOn && item.kind === kind,
  );
  if (!alreadySent) {
    existing.sentReminders.push({ expiresOn, kind, sentAt: new Date().toISOString() });
  }
  existing.updatedAt = new Date().toISOString();
  all[index] = existing;
  await writeAll(all);
  return existing;
}
