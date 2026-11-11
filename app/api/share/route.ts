import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { getAppEnv } from "@/lib/cloudflare";
import { createSharedLink, listSharedLinks } from "@/lib/share-store";
import type { CreateSharedLinkInput } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const env = await getAppEnv();
    await assertAdmin(request, env.EXPIRY_REMINDERS_DB);
    const links = await listSharedLinks(env.EXPIRY_REMINDERS_DB);
    return NextResponse.json(links);
  } catch (error) {
    const status = (error as { status?: number })?.status || 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取分享列表失败。" },
      { status },
    );
  }
}

export async function POST(request: Request) {
  try {
    const env = await getAppEnv();
    await assertAdmin(request, env.EXPIRY_REMINDERS_DB);
    const body = (await request.json()) as CreateSharedLinkInput;
    const link = await createSharedLink(env.EXPIRY_REMINDERS_DB, body);
    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    const status = (error as { status?: number })?.status || 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建分享链接失败。" },
      { status },
    );
  }
}

