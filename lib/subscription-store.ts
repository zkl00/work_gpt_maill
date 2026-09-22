import { randomUUID } from "node:crypto";
import { normalizeNotificationEmails } from "./notification-emails";
import { assertDate } from "./reminder";
import type { ChatGptPlan, ReminderRule, SentReminder, Subscription, SubscriptionInput } from "./types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validStatuses = new Set(["active", "expired", "paused"]);
const validServiceTypes = new Set(["chatgpt", "apple", "anzhuo", "other"]);
const validChatGptPlans = new Set<ChatGptPlan>(["plus", "pro10", "pro20"]);

type SubscriptionRow = {
  id: string;
  owner_email: string;
  account_email: string;
  service_type: string;
  chatgpt_plan: ChatGptPlan | null;
  activated_on: string;
  expires_on: string;
  status: Subscription["status"];
  cancelled: number;
  notes: string;
  notification_email: string;
  reminder_enabled: number;
  reminder_days_before: number;
  reminder_source: ReminderRule["source"];
  reminder_confidence: number | null;
  created_at: string;
  updated_at: string;
};

type SentReminderRow = {
  subscription_id: string;
  expires_on: string;
  sent_at: string;
  kind: SentReminder["kind"];
};

export function validateSubscriptionInput(input: SubscriptionInput): SubscriptionInput {
  const cleaned = {
    ...input,
    ownerEmail: input.ownerEmail.trim(),
    accountEmail: input.accountEmail.trim(),
    serviceType: input.serviceType.trim(),
    notificationEmail: normalizeNotificationEmails(input.notificationEmail),
    notes: input.notes.trim(),
    chatGptPlan: input.chatGptPlan,
  };
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

function mapSubscription(row: SubscriptionRow, sentReminders: SentReminder[]): Subscription {
  return {
    id: row.id,
    ownerEmail: row.owner_email,
    accountEmail: row.account_email,
    serviceType: row.service_type,
    chatGptPlan: row.chatgpt_plan ?? undefined,
    activatedOn: row.activated_on,
    expiresOn: row.expires_on,
    status: row.status,
    cancelled: Boolean(row.cancelled),
    notes: row.notes,
    notificationEmail: row.notification_email,
    reminderRule: {
      enabled: Boolean(row.reminder_enabled),
      daysBefore: row.reminder_days_before,
      source: row.reminder_source,
      confidence: row.reminder_confidence ?? undefined,
    },
    sentReminders,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function subscriptionInsert(database: D1Database, subscription: Subscription): D1PreparedStatement {
  return database.prepare(`
    INSERT INTO subscriptions (
      id, owner_email, account_email, service_type, chatgpt_plan, activated_on, expires_on,
      status, cancelled, notes, notification_email, reminder_enabled, reminder_days_before,
      reminder_source, reminder_confidence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    subscription.id,
    subscription.ownerEmail,
    subscription.accountEmail,
    subscription.serviceType,
    subscription.chatGptPlan ?? null,
    subscription.activatedOn,
    subscription.expiresOn,
    subscription.status,
    Number(subscription.cancelled),
    subscription.notes,
    subscription.notificationEmail,
    Number(subscription.reminderRule.enabled),
    subscription.reminderRule.daysBefore,
    subscription.reminderRule.source,
    subscription.reminderRule.confidence ?? null,
    subscription.createdAt,
    subscription.updatedAt,
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique constraint/i.test(error.message);
}

export async function listSubscriptions(database: D1Database): Promise<Subscription[]> {
  const subscriptions = await database.prepare(`
    SELECT id, owner_email, account_email, service_type, chatgpt_plan, activated_on, expires_on,
      status, cancelled, notes, notification_email, reminder_enabled, reminder_days_before,
      reminder_source, reminder_confidence, created_at, updated_at
    FROM subscriptions
    ORDER BY expires_on ASC, account_email COLLATE NOCASE ASC
  `).all<SubscriptionRow>();
  if (!subscriptions.results.length) return [];

  const reminders = await database.prepare(`
    SELECT subscription_id, expires_on, sent_at, kind
    FROM sent_reminders
    ORDER BY sent_at ASC
  `).all<SentReminderRow>();
  const remindersBySubscription = new Map<string, SentReminder[]>();
  for (const reminder of reminders.results) {
    const current = remindersBySubscription.get(reminder.subscription_id) || [];
    current.push({ expiresOn: reminder.expires_on, sentAt: reminder.sent_at, kind: reminder.kind });
    remindersBySubscription.set(reminder.subscription_id, current);
  }

  return subscriptions.results.map((row) => mapSubscription(row, remindersBySubscription.get(row.id) || []));
}

async function findSubscription(database: D1Database, id: string): Promise<Subscription | null> {
  return (await listSubscriptions(database)).find((subscription) => subscription.id === id) || null;
}

export async function createSubscription(
  database: D1Database,
  input: SubscriptionInput,
  subscription: Pick<Subscription, "reminderRule">,
): Promise<Subscription> {
  const [created] = await createSubscriptions(database, [{ input, reminderRule: subscription.reminderRule }]);
  return created;
}

export async function createSubscriptions(
  database: D1Database,
  entries: Array<Pick<Subscription, "reminderRule"> & { input: SubscriptionInput }>,
): Promise<Subscription[]> {
  if (!entries.length) return [];
  const now = new Date().toISOString();
  const created = entries.map(({ input, reminderRule }) => {
    const validated = validateSubscriptionInput(input);
    return {
      ...validated,
      id: randomUUID(),
      reminderRule,
      sentReminders: [],
      createdAt: now,
      updatedAt: now,
    } satisfies Subscription;
  });
  const duplicateKeys = new Set<string>();
  for (const subscription of created) {
    const key = `${subscription.accountEmail.toLowerCase()}:${subscription.expiresOn}`;
    if (duplicateKeys.has(key)) throw new Error(`账号 ${subscription.accountEmail} 在 ${subscription.expiresOn} 已存在，不能重复导入。`);
    duplicateKeys.add(key);
  }

  try {
    await database.batch(created.map((subscription) => subscriptionInsert(database, subscription)));
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error("相同账号与到期日已存在，不能重复导入。");
    throw error;
  }
  return created;
}

export async function updateSubscription(
  database: D1Database,
  id: string,
  input: SubscriptionInput,
  subscription: Pick<Subscription, "reminderRule">,
): Promise<Subscription | null> {
  const validated = validateSubscriptionInput(input);
  const existing = await findSubscription(database, id);
  if (!existing) return null;

  const updated: Subscription = {
    ...existing,
    ...validated,
    reminderRule: subscription.reminderRule,
    sentReminders: existing.expiresOn === validated.expiresOn
      ? existing.sentReminders
      : existing.sentReminders.filter((item) => item.expiresOn !== existing.expiresOn),
    updatedAt: new Date().toISOString(),
  };
  const statements: D1PreparedStatement[] = [database.prepare(`
    UPDATE subscriptions SET
      owner_email = ?, account_email = ?, service_type = ?, chatgpt_plan = ?, activated_on = ?,
      expires_on = ?, status = ?, cancelled = ?, notes = ?, notification_email = ?,
      reminder_enabled = ?, reminder_days_before = ?, reminder_source = ?, reminder_confidence = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    updated.ownerEmail,
    updated.accountEmail,
    updated.serviceType,
    updated.chatGptPlan ?? null,
    updated.activatedOn,
    updated.expiresOn,
    updated.status,
    Number(updated.cancelled),
    updated.notes,
    updated.notificationEmail,
    Number(updated.reminderRule.enabled),
    updated.reminderRule.daysBefore,
    updated.reminderRule.source,
    updated.reminderRule.confidence ?? null,
    updated.updatedAt,
    id,
  )];
  if (existing.expiresOn !== updated.expiresOn) {
    statements.push(database.prepare(
      "DELETE FROM sent_reminders WHERE subscription_id = ? AND expires_on = ?",
    ).bind(id, existing.expiresOn));
  }

  try {
    await database.batch(statements);
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error("相同账号与到期日已存在，不能保存。");
    throw error;
  }
  return updated;
}

export async function deleteSubscription(database: D1Database, id: string): Promise<boolean> {
  const [, result] = await database.batch([
    database.prepare("DELETE FROM sent_reminders WHERE subscription_id = ?").bind(id),
    database.prepare("DELETE FROM subscriptions WHERE id = ?").bind(id),
  ]);
  return (result.meta.changes || 0) > 0;
}

export async function recordReminderSent(
  database: D1Database,
  id: string,
  expiresOn: string,
  kind: SentReminder["kind"],
): Promise<Subscription | null> {
  const now = new Date().toISOString();
  await database.batch([
    database.prepare(`
      INSERT OR IGNORE INTO sent_reminders (subscription_id, expires_on, kind, sent_at)
      VALUES (?, ?, ?, ?)
    `).bind(id, expiresOn, kind, now),
    database.prepare("UPDATE subscriptions SET updated_at = ? WHERE id = ?").bind(now, id),
  ]);
  return findSubscription(database, id);
}
