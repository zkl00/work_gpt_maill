import { describe, expect, it, vi } from "vitest";
import {
  assertAdmin,
  buildSessionCookie,
  changeAdminPassword,
  COOKIE_NAME,
  isAuthInitialized,
  parseCookie,
  setupAdminPassword,
  verifyAdminPassword,
  verifySession,
} from "../lib/auth";

function createMockDatabase() {
  let authRecord: any = null;

  return {
    prepare: vi.fn((query: string) => {
      let boundValues: any[] = [];
      const stmt = {
        bind: vi.fn((...values: any[]) => {
          boundValues = values;
          return stmt;
        }),
        run: vi.fn(async () => {
          if (query.includes("INSERT INTO admin_auth")) {
            const [password_hash, salt, session_secret, updated_at] = boundValues;
            authRecord = {
              id: 1,
              password_hash,
              salt,
              session_secret,
              updated_at,
            };
            return { meta: { changes: 1 } };
          }
          if (query.includes("UPDATE admin_auth")) {
            const [password_hash, salt, session_secret, updated_at] = boundValues;
            authRecord = {
              id: 1,
              password_hash,
              salt,
              session_secret,
              updated_at,
            };
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }),
        first: vi.fn(async () => {
          if (query.includes("FROM admin_auth")) {
            return authRecord;
          }
          return null;
        }),
      };
      return stmt;
    }),
  } as unknown as D1Database;
}

describe("auth", () => {
  it("checks uninitialized state and sets up password", async () => {
    const db = createMockDatabase();
    expect(await isAuthInitialized(db)).toBe(false);

    const token = await setupAdminPassword(db, "admin123456");
    expect(token).toBeDefined();
    expect(await isAuthInitialized(db)).toBe(true);

    // 再次设置应被拒绝
    await expect(setupAdminPassword(db, "newpwd123456")).rejects.toThrow("管理员密码已设置");
  });

  it("verifies correct and incorrect password", async () => {
    const db = createMockDatabase();
    await setupAdminPassword(db, "mySecretPassword");

    const invalid = await verifyAdminPassword(db, "wrongPassword");
    expect(invalid.valid).toBe(false);

    const valid = await verifyAdminPassword(db, "mySecretPassword");
    expect(valid.valid).toBe(true);
    expect(valid.token).toBeDefined();

    const sessionOk = await verifySession(db, valid.token);
    expect(sessionOk).toBe(true);
  });

  it("changes password successfully", async () => {
    const db = createMockDatabase();
    await setupAdminPassword(db, "oldPassword123");

    // 错误旧密码
    await expect(changeAdminPassword(db, "wrongOld", "newPassword123")).rejects.toThrow("当前密码错误");

    const newToken = await changeAdminPassword(db, "oldPassword123", "newPassword123");
    expect(newToken).toBeDefined();

    // 验证新密码能登入，旧密码失效
    expect((await verifyAdminPassword(db, "oldPassword123")).valid).toBe(false);
    expect((await verifyAdminPassword(db, "newPassword123")).valid).toBe(true);
  });

  it("asserts admin auth", async () => {
    const db = createMockDatabase();
    await setupAdminPassword(db, "adminPassword");

    const reqWithoutCookie = new Request("http://localhost/api/subscriptions");
    await expect(assertAdmin(reqWithoutCookie, db)).rejects.toMatchObject({
      message: "未登录或登录已过期，请重新登录。",
      status: 401,
    });

    const loginRes = await verifyAdminPassword(db, "adminPassword");
    const cookie = buildSessionCookie(loginRes.token!);
    const parsed = parseCookie(cookie, COOKIE_NAME);
    expect(parsed).toBe(loginRes.token);

    const reqWithCookie = new Request("http://localhost/api/subscriptions", {
      headers: { cookie },
    });
    await expect(assertAdmin(reqWithCookie, db)).resolves.toBeUndefined();
  });
});

