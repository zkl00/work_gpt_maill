import { NextResponse } from "next/server";
import { getAppEnv } from "@/lib/cloudflare";
import { runReminderJob } from "@/lib/reminder-job";

export async function GET(request: Request) {
  const env = await getAppEnv();
  const cronSecret = env.CRON_SECRET;
  const suppliedSecret = request.headers.get("authorization");
  if (!cronSecret || suppliedSecret !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "未授权的定时任务请求。" }, { status: 401 });
  }

  return NextResponse.json(await runReminderJob(env));
}
