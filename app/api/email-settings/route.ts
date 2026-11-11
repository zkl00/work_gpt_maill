import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { getAppEnv } from "@/lib/cloudflare";
import { getEmailConfigStatus, saveEmailConfig } from "@/lib/email-config";

export async function GET(request: Request) {
  try {
    const env = await getAppEnv();
    await assertAdmin(request, env.EXPIRY_REMINDERS_DB);
    return NextResponse.json(await getEmailConfigStatus(env));
  } catch (error) {
    const status = (error as { status?: number })?.status || 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "加载邮件配置失败。" },
      { status },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const env = await getAppEnv();
    await assertAdmin(request, env.EXPIRY_REMINDERS_DB);
    const input = (await request.json()) as Record<string, unknown>;
    const status = await saveEmailConfig(env, input);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "邮件配置保存失败。" },
      { status: 400 },
    );
  }
}
