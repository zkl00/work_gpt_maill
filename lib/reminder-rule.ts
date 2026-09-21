import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import type { ReminderRule } from "@/lib/types";

const SUPPORTED_DAYS = [0, 1, 3, 7, 14, 30] as const;
const MIN_CONFIDENCE_TO_OVERRIDE = 0.86;

function numericRuleFromNotes(notes: string): number | undefined {
  const match = notes.match(/(?:提前|之前|前)\s*(\d{1,2})\s*(?:天|日)/u);
  if (!match) return undefined;
  const days = Number(match[1]);
  return Number.isInteger(days) && days >= 0 && days <= 60 ? days : undefined;
}

export function resolveFallbackReminderRule(notes: string, fallbackDays: number): ReminderRule {
  if (/不(?:要|需|用)发(?:送)?(?:邮件|提醒)?|无需(?:邮件|提醒)/u.test(notes)) {
    return { enabled: false, daysBefore: fallbackDays, source: "fallback" };
  }

  const explicitDays = numericRuleFromNotes(notes);
  return {
    enabled: true,
    daysBefore: explicitDays ?? fallbackDays,
    source: explicitDays === undefined ? "manual" : "fallback",
  };
}

/**
 * Dates and delivery permissions remain deterministic. TypeSafe is intentionally
 * limited to interpreting optional natural-language timing notes into a closed set.
 */
export async function resolveReminderRule(
  notes: string,
  fallbackDays: number,
  typeSafeApiKey?: string,
): Promise<ReminderRule> {
  const baseline = resolveFallbackReminderRule(notes, fallbackDays);
  if (!notes.trim() || !typeSafeApiKey) return baseline;

  try {
    const client = new TypeSafeClient({ apiKey: typeSafeApiKey });
    const response = await client.systemOne({
      state: {
        notes,
        selectedReminderDays: fallbackDays,
      },
      questions: {
        timing: choice(
          "Interpret only an explicit expiration-email timing instruction in `notes`. " +
            "Do not infer timing from account status, payment, unbinding, or cancellation-card remarks. " +
            "If there is no unambiguous timing instruction, choose use-selected. " +
            "If the note explicitly says no email/reminder should be sent, choose disable.",
          {
            "0": "Send on the expiration date.",
            "1": "Send one day before the expiration date.",
            "3": "Send three days before the expiration date.",
            "7": "Send one week before the expiration date.",
            "14": "Send two weeks before the expiration date.",
            "30": "Send 30 days before the expiration date.",
            "use-selected": "No clear timing instruction; use selectedReminderDays.",
            disable: "A clear instruction says not to send an email reminder.",
          },
        ),
      },
    });

    const answer = response.answers.timing;
    if (answer.confidence < MIN_CONFIDENCE_TO_OVERRIDE) return baseline;
    if (answer.choice === "disable") {
      return { enabled: false, daysBefore: fallbackDays, source: "typesafe", confidence: answer.confidence };
    }
    if (answer.choice === "use-selected") return baseline;

    const selected = Number(answer.choice);
    if (SUPPORTED_DAYS.includes(selected as (typeof SUPPORTED_DAYS)[number])) {
      return { enabled: true, daysBefore: selected, source: "typesafe", confidence: answer.confidence };
    }
  } catch (error) {
    // A failed semantic enhancement must never prevent a deterministic reminder.
    console.warn("TypeSafe reminder-rule interpretation failed; using fallback.", error);
  }

  return baseline;
}
