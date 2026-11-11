import { exportSubscriptionsWorkbook } from "@/lib/export-subscriptions";
import { assertAdmin } from "@/lib/auth";
import { getAppEnv } from "@/lib/cloudflare";
import { dateInTimezone } from "@/lib/reminder";
import { listSubscriptions } from "@/lib/subscription-store";

export async function GET(request: Request) {
  const env = await getAppEnv();
  await assertAdmin(request, env.EXPIRY_REMINDERS_DB);
  const workbook = exportSubscriptionsWorkbook(await listSubscriptions(env.EXPIRY_REMINDERS_DB));
  const filename = encodeURIComponent(`账号到期提醒-${dateInTimezone(env.APP_TIME_ZONE)}.xlsx`);
  return new Response(new Uint8Array(workbook).buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
