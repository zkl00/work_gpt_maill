import { NextResponse } from "next/server";
import {
  buildClearCookie,
  buildSessionCookie,
  changeAdminPassword,
  COOKIE_NAME,
  isAuthInitialized,
  parseCookie,
  setupAdminPassword,
  verifyAdminPassword,
  verifySession,
} from "@/lib/auth";
import { getAppEnv } from "@/lib/cloudflare";

export async function GET(request: Request) {
  try {
    const env = await getAppEnv();
    const initialized = await isAuthInitialized(env.EXPIRY_REMINDERS_DB);
    const cookieHeader = request.headers.get("cookie");
    const token = parseCookie(cookieHeader, COOKIE_NAME);
    const authenticated = initialized ? await verifySession(env.EXPIRY_REMINDERS_DB, token) : false;

    return NextResponse.json({
      initialized,
      authenticated,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取认证状态失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const env = await getAppEnv();
    const body = await request.json().catch(() => ({}));
    const { action, password, oldPassword, newPassword } = body as {
      action?: string;
      password?: string;
      oldPassword?: string;
      newPassword?: string;
    };

    if (action === "setup") {
      if (!password) return NextResponse.json({ error: "请输入密码。" }, { status: 400 });
      const token = await setupAdminPassword(env.EXPIRY_REMINDERS_DB, password);
      const response = NextResponse.json({ success: true, message: "密码设置成功！" });
      response.headers.set("Set-Cookie", buildSessionCookie(token));
      return response;
    }

    if (action === "login") {
      if (!password) return NextResponse.json({ error: "请输入管理密码。" }, { status: 400 });
      const result = await verifyAdminPassword(env.EXPIRY_REMINDERS_DB, password);
      if (!result.valid || !result.token) {
        return NextResponse.json({ error: "管理密码错误，请重新输入。" }, { status: 401 });
      }
      const response = NextResponse.json({ success: true, message: "登录成功！" });
      response.headers.set("Set-Cookie", buildSessionCookie(result.token));
      return response;
    }

    if (action === "logout") {
      const response = NextResponse.json({ success: true, message: "已退出登录。" });
      response.headers.set("Set-Cookie", buildClearCookie());
      return response;
    }

    if (action === "change-password") {
      if (!oldPassword || !newPassword) {
        return NextResponse.json({ error: "请输入当前密码和新密码。" }, { status: 400 });
      }
      const token = await changeAdminPassword(env.EXPIRY_REMINDERS_DB, oldPassword, newPassword);
      const response = NextResponse.json({ success: true, message: "密码修改成功！" });
      response.headers.set("Set-Cookie", buildSessionCookie(token));
      return response;
    }

    return NextResponse.json({ error: "未知操作类型。" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "请求处理失败。" },
      { status: 400 },
    );
  }
}

