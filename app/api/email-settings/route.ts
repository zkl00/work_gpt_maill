import { NextResponse } from "next/server";
import { getAppEnv } from "@/lib/cloudflare";
import { getEmailConfigStatus, saveEmailConfig } from "@/lib/email-config";

export async function GET() {
  try {
    return NextResponse.json(await getEmailConfigStatus(await getAppEnv()));
  } catch (error) {
    console.error("Unable to load email settings.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "加载邮件配置失败。" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const env = await getAppEnv();
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
