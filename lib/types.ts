export type AccountStatus = "active" | "expired" | "paused";
export type ChatGptPlan = "plus" | "pro10" | "pro20";

export type ReminderSource = "manual" | "typesafe" | "fallback";

export type ReminderRule = {
  enabled: boolean;
  daysBefore: number;
  source: ReminderSource;
  confidence?: number;
};

export type SentReminder = {
  expiresOn: string;
  sentAt: string;
  kind: "automatic" | "manual";
};

export type Subscription = {
  id: string;
  ownerEmail: string;
  accountEmail: string;
  serviceType: string;
  chatGptPlan?: ChatGptPlan;
  activatedOn: string;
  expiresOn: string;
  status: AccountStatus;
  cancelled: boolean;
  notes: string;
  notificationEmail: string;
  reminderRule: ReminderRule;
  sentReminders: SentReminder[];
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionInput = Omit<
  Subscription,
  "id" | "reminderRule" | "sentReminders" | "createdAt" | "updatedAt"
> & {
  reminderDays?: number;
};

export type ReminderState =
  | "cancelled"
  | "disabled"
  | "scheduled"
  | "due"
  | "sent"
  | "expired";

export type SubscriptionView = Subscription & {
  reminderState: ReminderState;
  nextSendOn: string | null;
};
