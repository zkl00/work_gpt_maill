/**
 * 日期辅助工具函数
 * 提供本地日期获取、月份与天数顺延计算、月末对齐、剩余天数计算等功能
 */

/**
 * 获取本地今天的 YYYY-MM-DD 字符串
 * 避免 toISOString() 在东八区清晨（UTC仍在前一天）时取得昨天日期的时差 bug
 */
export function getLocalToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 校验 YYYY-MM-DD 格式
 */
export function isValidDateStr(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

/**
 * 按天数加减日期
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 按月份加减日期，并自动做月末对齐
 * 例如：
 * 2026-01-31 + 1 个月 => 2026-02-28
 * 2024-01-31 + 1 个月 (闰年) => 2024-02-29
 * 2026-03-31 + 1 个月 => 2026-04-30
 * 2026-11-11 + 1 个月 => 2026-12-11
 */
export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // 计算目标年和目标月
  const targetDate = new Date(y, m - 1 + months, 1);
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth(); // 0-indexed
  
  // 目标月的最大天数（通过获取下个月的第 0 天）
  const maxDaysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(d, maxDaysInTargetMonth);

  const yearStr = String(targetYear);
  const monthStr = String(targetMonth + 1).padStart(2, "0");
  const dayStr = String(targetDay).padStart(2, "0");
  return `${yearStr}-${monthStr}-${dayStr}`;
}

/**
 * 计算剩余天数（目标到期日 - 基准日期）
 * 正数：还剩 X 天
 * 0：今天到期
 * 负数：已过期 X 天
 */
export function getRemainingDays(expiresOn: string, baseDateStr?: string): number {
  const todayStr = baseDateStr || getLocalToday();
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const [ey, em, ed] = expiresOn.split("-").map(Number);

  const todayUtc = Date.UTC(ty, tm - 1, td);
  const expiryUtc = Date.UTC(ey, em - 1, ed);

  return Math.round((expiryUtc - todayUtc) / 86_400_000);
}

export type ExpiryBadgeInfo = {
  text: string;
  level: "expired" | "today" | "imminent" | "warning" | "normal";
  days: number;
};

/**
 * 获取友好的到期状态标签与级别
 */
export function getExpiryBadge(expiresOn: string, baseDateStr?: string): ExpiryBadgeInfo {
  const days = getRemainingDays(expiresOn, baseDateStr);

  if (days < 0) {
    return {
      text: `已过期 ${Math.abs(days)} 天`,
      level: "expired",
      days,
    };
  }
  if (days === 0) {
    return {
      text: "今天到期",
      level: "today",
      days: 0,
    };
  }
  if (days <= 3) {
    return {
      text: `还剩 ${days} 天`,
      level: "imminent",
      days,
    };
  }
  if (days <= 7) {
    return {
      text: `还剩 ${days} 天`,
      level: "warning",
      days,
    };
  }
  return {
    text: `还剩 ${days} 天`,
    level: "normal",
    days,
  };
}

