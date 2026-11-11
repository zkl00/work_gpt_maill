import { NextResponse } from "next/server";
import { getAppEnv } from "@/lib/cloudflare";
import { createSharedLink, listSharedLinks } from "@/lib/share-store";
import type { CreateSharedLinkInput } from "@/lib/types";

export async function GET() {
  try {
    const env = await getAppEnv();
    const links = await listSharedLinks(env.EXPIRY_REMINDERS_DB);
    return NextResponse.json(links);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取分享列表失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const env = await getAppEnv();
    const body = (await request.json()) as CreateSharedLinkInput;
    const link = await createSharedLink(env.EXPIRY_REMINDERS_DB, body);
    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建分享链接失败。" },
      { status: 400 },
    );
  }
}

