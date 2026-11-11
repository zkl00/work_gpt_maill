export type AccountStatus = "active" | "expired" | "paused";
export type ChatGptPlan = "plus" | "pro10" | "pro20" | "pro200" | "pro500";

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

export type ExpiryState = "imminent" | "normal";

export type SubscriptionView = Subscription & {
  reminderState: ReminderState;
  expiryState: ExpiryState;
  nextSendOn: string | null;
};

export const SHAREABLE_COLUMNS = [
  { key: "ownerEmail", label: "美区账号" },
  { key: "accountEmail", label: "账号" },
  { key: "serviceType", label: "类型" },
  { key: "chatGptPlan", label: "套餐" },
  { key: "activatedOn", label: "开通时间" },
  { key: "expiresOn", label: "到期时间" },
  { key: "expiryState", label: "到期状态" },
  { key: "notificationEmail", label: "接收邮箱" },
  { key: "reminderRule", label: "提醒规则" },
  { key: "status", label: "状态" },
] as const;

export type ShareableColumnKey = (typeof SHAREABLE_COLUMNS)[number]["key"];

export type SharedLink = {
  id: string;
  subscriptionIds: string[];
  allowEdit: boolean;
  allowDelete: boolean;
  visibleColumns: string[];
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateSharedLinkInput = {
  subscriptionIds: string[];
  allowEdit?: boolean;
  allowDelete?: boolean;
  visibleColumns?: string[];
  title?: string;
};

export type SharedViewData = {
  link: SharedLink;
  subscriptions: SubscriptionView[];
};
