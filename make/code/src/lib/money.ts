/**
 * 金额工具 —— 全部金额以整数（分）存储与计算，杜绝浮点误差（AGENT.md §4.3）。
 * 展示时才格式化为元。
 */

const AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/**
 * 把用户输入的元金额字符串解析为分（整数）。
 * 接受 "12"、"12.3"、"12.34"、"1,234.56"；拒绝空串、负号以外的非法字符、超过两位小数。
 * 无法解析返回 null，由调用方做输入校验提示。
 */
export function parseAmountToCents(input: string): number | null {
  const normalized = input.trim().replace(/,/g, '').replace(/\s/g, '');
  const match = AMOUNT_PATTERN.exec(normalized);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const yuan = Number(match[2]);
  const frac = match[3] ?? '';
  const cents = yuan * 100 + Number(frac.padEnd(2, '0'));
  return sign * cents;
}

/** 把分格式化为两位小数的元字符串，不带货币符号，如 "1,234.56" */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const yuan = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${yuan.toLocaleString('zh-CN')}.${frac}`;
}

/** 把分格式化为带 ¥ 的元字符串，如 "¥1,234.56" */
export function formatYuan(cents: number): string {
  return `¥${formatCents(cents)}`;
}

/** 求和（分），保持整数 */
export function sumCents(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/** 百分比展示四舍五入取整（03 §4.1 计算规则） */
export function progressPercent(spentCents: number, budgetCents: number): number {
  if (budgetCents <= 0) return 0;
  return Math.round((spentCents / budgetCents) * 100);
}
