import { NextResponse } from "next/server";
import { getAppEnv } from "@/lib/cloudflare";
import { parseSubscriptionWorkbook } from "@/lib/import-subscriptions";
import { resolveFallbackReminderRule } from "@/lib/reminder-rule";
import { createSubscriptions, listSubscriptions, validateSubscriptionInput } from "@/lib/subscription-store";
import type { SubscriptionInput } from "@/lib/types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;

function duplicateKey(input: SubscriptionInput): string {
  return `${input.accountEmail.toLowerCase()}:${input.expiresOn}`;
}

export async function POST(request: Request) {
  try {
    const env = await getAppEnv();
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = (await request.json()) as { rows?: SubscriptionInput[] };
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) throw new Error("没有可导入的记录。 ");
      if (rows.length > MAX_ROWS) throw new Error(`单次最多导入 ${MAX_ROWS} 条记录。`);
      const created = await createSubscriptions(env.EXPIRY_REMINDERS_DB, rows.map((input) => ({
        input: validateSubscriptionInput(input),
        reminderRule: resolveFallbackReminderRule(input.notes || "", input.reminderDays ?? 3),
      })));
      return NextResponse.json({ imported: created.length });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("请选择 Excel 或 CSV 文件。 ");
    if (file.size > MAX_FILE_BYTES) throw new Error("文件不能超过 5 MB。 ");
    const preview = parseSubscriptionWorkbook(await file.arrayBuffer());
    if (preview.candidates.length > MAX_ROWS) throw new Error(`单次最多导入 ${MAX_ROWS} 条记录。`);

    const existing = new Set((await listSubscriptions(env.EXPIRY_REMINDERS_DB)).map(duplicateKey));
    const batch = new Set<string>();
    const candidates = preview.candidates.filter((candidate) => {
      const key = duplicateKey(candidate.input);
      if (existing.has(key) || batch.has(key)) {
        preview.errors.push({ line: candidate.line, message: "该账号与到期日已存在，已跳过。" });
        return false;
      }
      batch.add(key);
      return true;
    });
    return NextResponse.json({
      rows: candidates.map((candidate) => candidate.input),
      errors: preview.errors.slice(0, 50),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导入失败。" },
      { status: 400 },
    );
  }
}
