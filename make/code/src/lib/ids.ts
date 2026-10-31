/** 生成唯一 id（浏览器与 Node 测试环境均可用） */
export function newId(): string {
  return crypto.randomUUID();
}

/** 当前时刻的 ISO 字符串 */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 今天日期，YYYY-MM-DD（用户本地日历日期；不能用 toISOString，那是 UTC 日期） */
export function today(): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
