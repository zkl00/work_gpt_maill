import { exportSubscriptionsWorkbook } from "@/lib/export-subscriptions";
import { getAppEnv } from "@/lib/cloudflare";
import { dateInTimezone } from "@/lib/reminder";
import { listSubscriptions } from "@/lib/subscription-store";

export async function GET() {
  const env = await getAppEnv();
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
