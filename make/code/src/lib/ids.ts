/** 生成唯一 id（浏览器与 Node 测试环境均可用） */
export function newId(): string {
  return crypto.randomUUID();
}

/** 当前时刻的 ISO 字符串 */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 今天日期，YYYY-MM-DD */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
