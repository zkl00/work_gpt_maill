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

type SharedLinkRow = {
  id: string;
  subscription_ids: string;
  allow_edit: number;
  allow_delete: number;
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
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
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
  return {
    id: row.id,
    subscriptionIds,
    allowEdit: Boolean(row.allow_edit),
    allowDelete: Boolean(row.allow_delete),
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
  // 生成短而安全的随机 token，如 16 字符
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  const allowEdit = input.allowEdit ? 1 : 0;
  const allowDelete = input.allowDelete ? 1 : 0;
  const title = (input.title || "").trim();
  const subscriptionIdsJson = JSON.stringify(Array.from(new Set(input.subscriptionIds)));

  await database.prepare(`
    INSERT INTO shared_links (id, subscription_ids, allow_edit, allow_delete, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, subscriptionIdsJson, allowEdit, allowDelete, title, now, now).run();

  return {
    id,
    subscriptionIds: Array.from(new Set(input.subscriptionIds)),
    allowEdit: Boolean(allowEdit),
    allowDelete: Boolean(allowDelete),
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
    SELECT id, subscription_ids, allow_edit, allow_delete, title, created_at, updated_at
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
    SELECT id, subscription_ids, allow_edit, allow_delete, title, created_at, updated_at
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

  return updateSubscription(database, subscriptionId, input, rule);
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

  // 1. 从主库删除账号
  const deleted = await deleteSubscription(database, subscriptionId);

  // 2. 从该分享链接列表中移除此 subscriptionId
  const remainingIds = link.subscriptionIds.filter((id) => id !== subscriptionId);
  await database.prepare(`
    UPDATE shared_links SET subscription_ids = ?, updated_at = ? WHERE id = ?
  `).bind(JSON.stringify(remainingIds), new Date().toISOString(), shareId).run();

  return deleted;
}

