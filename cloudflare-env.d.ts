/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  EXPIRY_REMINDERS_DB: D1Database;
  APP_TIME_ZONE?: string;
  CRON_SECRET?: string;
  EMAIL_CONFIG_ENCRYPTION_KEY?: string;
  EMAIL_DELIVERY_MODE?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  TYPESAFE_API_KEY?: string;
}
