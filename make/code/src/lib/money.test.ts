import { describe, expect, it } from 'vitest';
import { formatCents, formatYuan, parseAmountToCents, progressPercent, sumCents } from './money';

describe('parseAmountToCents', () => {
  it('解析整数元', () => {
    expect(parseAmountToCents('12')).toBe(1200);
  });

  it('解析两位小数', () => {
    expect(parseAmountToCents('12.34')).toBe(1234);
  });

  it('解析一位小数补零', () => {
    expect(parseAmountToCents('12.3')).toBe(1230);
  });

  it('解析带千分位逗号', () => {
    expect(parseAmountToCents('1,234.56')).toBe(123456);
  });

  it('解析 0', () => {
    expect(parseAmountToCents('0')).toBe(0);
    expect(parseAmountToCents('0.00')).toBe(0);
  });

  it('拒绝空串与非法字符', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('12.345')).toBeNull();
    expect(parseAmountToCents('12.')).toBeNull();
    expect(parseAmountToCents('-')).toBeNull();
  });

  it('浮点陷阱输入不产生误差（0.1 + 0.2 类问题）', () => {
    const a = parseAmountToCents('0.1');
    const b = parseAmountToCents('0.2');
    expect(a! + b!).toBe(30);
    expect(formatCents(a! + b!)).toBe('0.30');
  });
});

describe('formatCents / formatYuan', () => {
  it('格式化为两位小数', () => {
    expect(formatCents(123456)).toBe('1,234.56');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(0)).toBe('0.00');
    expect(formatCents(100)).toBe('1.00');
  });

  it('负数', () => {
    expect(formatCents(-1234)).toBe('-12.34');
    expect(formatYuan(-1234)).toBe('¥-12.34');
  });

  it('带货币符号', () => {
    expect(formatYuan(123456)).toBe('¥1,234.56');
  });
});

describe('sumCents', () => {
  it('整数求和无误差', () => {
    expect(sumCents([1, 2, 3])).toBe(6);
    expect(sumCents([])).toBe(0);
    expect(sumCents([10, -4])).toBe(6);
  });
});

describe('progressPercent', () => {
  it('四舍五入取整（03 §4.1）', () => {
    expect(progressPercent(50, 100)).toBe(50);
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(2, 3)).toBe(67);
  });

  it('预算为 0 时返回 0', () => {
    expect(progressPercent(100, 0)).toBe(0);
  });
});
