import { randomUUID } from "node:crypto";
import {
  deleteSubscription,
  listSubscriptions,
  updateSubscription,
} from "./subscription-store";
import type {
  CreateSharedLinkInput,
  ReminderRule,
  SharedLink,
  Subscription,
  SubscriptionInput,
} from "./types";

export const DEFAULT_VISIBLE_COLUMNS: string[] = [
  "accountEmail",
  "serviceType",
  "chatGptPlan",
  "expiresOn",
  "expiryState",
  "status",
];

type SharedLinkRow = {
  id: string;
  subscription_ids: string;
  allow_edit: number;
  allow_delete: number;
  visible_columns?: string | null;
  title: string;
  created_at: string;
  updated_at: string;
};

let tableEnsured = false;

export async function ensureSharedLinksTable(database: D1Database): Promise<void> {
  if (tableEnsured) return;
  await database.prepare(`
    CREATE TABLE IF NOT EXISTS shared_links (
      id TEXT PRIMARY KEY,
      subscription_ids TEXT NOT NULL,
      allow_edit INTEGER NOT NULL DEFAULT 0 CHECK (allow_edit IN (0, 1)),
      allow_delete INTEGER NOT NULL DEFAULT 0 CHECK (allow_delete IN (0, 1)),
      visible_columns TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  try {
    await database.prepare("ALTER TABLE shared_links ADD COLUMN visible_columns TEXT NOT NULL DEFAULT ''").run();
  } catch {
    // 字段已存在时忽略
  }

  tableEnsured = true;
}

function mapRow(row: SharedLinkRow): SharedLink {
  let subscriptionIds: string[] = [];
  try {
    subscriptionIds = JSON.parse(row.subscription_ids);
    if (!Array.isArray(subscriptionIds)) subscriptionIds = [];
  } catch {
    subscriptionIds = [];
  }

  let visibleColumns = DEFAULT_VISIBLE_COLUMNS;
  if (row.visible_columns) {
    try {
      const parsed = JSON.parse(row.visible_columns);
      if (Array.isArray(parsed) && parsed.length > 0) {
        visibleColumns = parsed;
      }
    } catch {
      visibleColumns = DEFAULT_VISIBLE_COLUMNS;
    }
  }

  return {
    id: row.id,
    subscriptionIds,
    allowEdit: Boolean(row.allow_edit),
    allowDelete: Boolean(row.allow_delete),
    visibleColumns,
    title: row.title || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createSharedLink(
  database: D1Database,
  input: CreateSharedLinkInput,
): Promise<SharedLink> {
  await ensureSharedLinksTable(database);
  if (!input.subscriptionIds || !input.subscriptionIds.length) {
    throw new Error("请选择至少一个账号进行分享。");
  }

  const now = new Date().toISOString();
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  const allowEdit = input.allowEdit ? 1 : 0;
  const allowDelete = input.allowDelete ? 1 : 0;
  const title = (input.title || "").trim();
  const subscriptionIdsJson = JSON.stringify(Array.from(new Set(input.subscriptionIds)));
  const visibleColumns = input.visibleColumns && input.visibleColumns.length > 0
    ? input.visibleColumns
    : DEFAULT_VISIBLE_COLUMNS;
  const visibleColumnsJson = JSON.stringify(visibleColumns);

  await database.prepare(`
    INSERT INTO shared_links (id, subscription_ids, allow_edit, allow_delete, visible_columns, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, subscriptionIdsJson, allowEdit, allowDelete, visibleColumnsJson, title, now, now).run();

  return {
    id,
    subscriptionIds: Array.from(new Set(input.subscriptionIds)),
    allowEdit: Boolean(allowEdit),
    allowDelete: Boolean(allowDelete),
    visibleColumns,
    title,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getSharedLink(
  database: D1Database,
  id: string,
): Promise<SharedLink | null> {
  await ensureSharedLinksTable(database);
  const row = await database.prepare(`
    SELECT id, subscription_ids, allow_edit, allow_delete, visible_columns, title, created_at, updated_at
    FROM shared_links
    WHERE id = ?
  `).bind(id).first<SharedLinkRow>();

  if (!row) return null;
  return mapRow(row);
}

export async function listSharedLinks(
  database: D1Database,
): Promise<SharedLink[]> {
  await ensureSharedLinksTable(database);
  const result = await database.prepare(`
    SELECT id, subscription_ids, allow_edit, allow_delete, visible_columns, title, created_at, updated_at
    FROM shared_links
    ORDER BY created_at DESC
  `).all<SharedLinkRow>();

  return result.results.map(mapRow);
}

export async function deleteSharedLink(
  database: D1Database,
  id: string,
): Promise<boolean> {
  await ensureSharedLinksTable(database);
  const result = await database.prepare(`
    DELETE FROM shared_links WHERE id = ?
  `).bind(id).run();

  return (result.meta.changes || 0) > 0;
}

export async function getSharedSubscriptions(
  database: D1Database,
  shareId: string,
): Promise<{ link: SharedLink; subscriptions: Subscription[] } | null> {
  const link = await getSharedLink(database, shareId);
  if (!link) return null;

  const allSubscriptions = await listSubscriptions(database);
  const idSet = new Set(link.subscriptionIds);
  const subscriptions = allSubscriptions.filter((item) => idSet.has(item.id));

  return {
    link,
    subscriptions,
  };
}

export async function updateSharedSubscription(
  database: D1Database,
  shareId: string,
  subscriptionId: string,
  input: SubscriptionInput,
  rule: { reminderRule: ReminderRule },
): Promise<Subscription | null> {
  const link = await getSharedLink(database, shareId);
  if (!link) throw new Error("分享链接不存在或已失效。");
  if (!link.allowEdit) throw new Error("该分享链接没有修改权限。");
  if (!link.subscriptionIds.includes(subscriptionId)) {
    throw new Error("无权修改未授权的账号。");
  }

  const all = await listSubscriptions(database);
  const existing = all.find((item) => item.id === subscriptionId);
  if (!existing) return null;

  const visible = new Set(link.visibleColumns);
  const safeInput: SubscriptionInput = {
    ...input,
    ownerEmail: visible.has("ownerEmail") ? input.ownerEmail : existing.ownerEmail,
    accountEmail: visible.has("accountEmail") ? input.accountEmail : existing.accountEmail,
    serviceType: visible.has("serviceType") ? input.serviceType : existing.serviceType,
    chatGptPlan: visible.has("chatGptPlan") ? input.chatGptPlan : existing.chatGptPlan,
    notificationEmail: visible.has("notificationEmail") ? input.notificationEmail : existing.notificationEmail,
    activatedOn: input.activatedOn || existing.activatedOn,
    expiresOn: visible.has("expiresOn") ? input.expiresOn : existing.expiresOn,
    status: visible.has("status") ? input.status : existing.status,
    notes: input.notes !== undefined ? input.notes : existing.notes,
    cancelled: input.cancelled !== undefined ? input.cancelled : existing.cancelled,
    reminderDays: visible.has("reminderRule") ? input.reminderDays : existing.reminderRule.daysBefore,
  };

  return updateSubscription(database, subscriptionId, safeInput, rule);
}

export async function deleteSharedSubscription(
  database: D1Database,
  shareId: string,
  subscriptionId: string,
): Promise<boolean> {
  const link = await getSharedLink(database, shareId);
  if (!link) throw new Error("分享链接不存在或已失效。");
  if (!link.allowDelete) throw new Error("该分享链接没有删除权限。");
  if (!link.subscriptionIds.includes(subscriptionId)) {
    throw new Error("无权删除未授权的账号。");
  }

  const deleted = await deleteSubscription(database, subscriptionId);

  const remainingIds = link.subscriptionIds.filter((id) => id !== subscriptionId);
  await database.prepare(`
    UPDATE shared_links SET subscription_ids = ?, updated_at = ? WHERE id = ?
  `).bind(JSON.stringify(remainingIds), new Date().toISOString(), shareId).run();

  return deleted;
}
