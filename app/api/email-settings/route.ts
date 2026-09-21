import { NextResponse } from "next/server";
import { getEmailConfigStatus, saveEmailConfig } from "@/lib/email-config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getEmailConfigStatus());
}

export async function PUT(request: Request) {
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const status = await saveEmailConfig(input);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "邮件配置保存失败。" },
      { status: 400 },
    );
  }
}
