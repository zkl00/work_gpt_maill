import { exportSubscriptionsWorkbook } from "@/lib/export-subscriptions";
import { dateInTimezone } from "@/lib/reminder";
import { listSubscriptions } from "@/lib/subscription-store";

export const runtime = "nodejs";

export async function GET() {
  const workbook = exportSubscriptionsWorkbook(await listSubscriptions());
  const filename = encodeURIComponent(`账号到期提醒-${dateInTimezone()}.xlsx`);
  return new Response(new Uint8Array(workbook).buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
