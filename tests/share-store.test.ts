import { describe, expect, it, vi } from "vitest";
import {
  createSharedLink,
  deleteSharedLink,
  deleteSharedSubscription,
  getSharedLink,
  updateSharedSubscription,
} from "../lib/share-store";

function createMockDatabase() {
  const store = new Map<string, any>();

  return {
    prepare: vi.fn((query: string) => {
      let boundValues: any[] = [];
      const stmt = {
        bind: vi.fn((...values: any[]) => {
          boundValues = values;
          return stmt;
        }),
        run: vi.fn(async () => {
          if (query.includes("CREATE TABLE")) {
            return { meta: { changes: 0 } };
          }
          if (query.includes("INSERT INTO shared_links")) {
            const [id, subscription_ids, allow_edit, allow_delete, title, created_at, updated_at] = boundValues;
            store.set(id, {
              id,
              subscription_ids,
              allow_edit,
              allow_delete,
              title,
              created_at,
              updated_at,
            });
            return { meta: { changes: 1 } };
          }
          if (query.includes("DELETE FROM shared_links")) {
            const [id] = boundValues;
            const existed = store.delete(id);
            return { meta: { changes: existed ? 1 : 0 } };
          }
          if (query.includes("UPDATE shared_links")) {
            const [subscription_ids, updated_at, id] = boundValues;
            const existing = store.get(id);
            if (existing) {
              store.set(id, { ...existing, subscription_ids, updated_at });
            }
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }),
        first: vi.fn(async () => {
          const normalized = query.replace(/\s+/g, " ");
          if (normalized.includes("FROM shared_links WHERE id = ?")) {
            const [id] = boundValues;
            return store.get(id) || null;
          }
          return null;
        }),
        all: vi.fn(async () => {
          const normalized = query.replace(/\s+/g, " ");
          if (normalized.includes("FROM shared_links")) {
            return { results: Array.from(store.values()) };
          }
          return { results: [] };
        }),
      };
      return stmt;
    }),
  } as unknown as D1Database;
}

describe("share-store", () => {
  it("creates a shared link with given permissions and retrieves it", async () => {
    const db = createMockDatabase();
    const link = await createSharedLink(db, {
      subscriptionIds: ["sub-1", "sub-2"],
      allowEdit: true,
      allowDelete: false,
      title: "测试分享",
    });

    expect(link.id).toBeDefined();
    expect(link.subscriptionIds).toEqual(["sub-1", "sub-2"]);
    expect(link.allowEdit).toBe(true);
    expect(link.allowDelete).toBe(false);
    expect(link.title).toBe("测试分享");

    const fetched = await getSharedLink(db, link.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.subscriptionIds).toEqual(["sub-1", "sub-2"]);
    expect(fetched?.allowEdit).toBe(true);
  });

  it("fails to create a shared link with empty subscriptionIds", async () => {
    const db = createMockDatabase();
    await expect(createSharedLink(db, { subscriptionIds: [] })).rejects.toThrow("请选择至少一个账号进行分享。");
  });

  it("checks allowEdit permission on updateSharedSubscription", async () => {
    const db = createMockDatabase();
    const link = await createSharedLink(db, {
      subscriptionIds: ["sub-1"],
      allowEdit: false,
      allowDelete: false,
    });

    await expect(
      updateSharedSubscription(db, link.id, "sub-1", {} as any, { reminderRule: {} as any }),
    ).rejects.toThrow("该分享链接没有修改权限。");
  });

  it("checks subscription ownership on deleteSharedSubscription", async () => {
    const db = createMockDatabase();
    const link = await createSharedLink(db, {
      subscriptionIds: ["sub-1"],
      allowEdit: true,
      allowDelete: true,
    });

    await expect(
      deleteSharedSubscription(db, link.id, "sub-unauthorized"),
    ).rejects.toThrow("无权删除未授权的账号。");
  });

  it("deletes a shared link", async () => {
    const db = createMockDatabase();
    const link = await createSharedLink(db, {
      subscriptionIds: ["sub-1"],
    });

    const deleted = await deleteSharedLink(db, link.id);
    expect(deleted).toBe(true);

    const fetched = await getSharedLink(db, link.id);
    expect(fetched).toBeNull();
  });
});
