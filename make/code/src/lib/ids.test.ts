import { afterEach, describe, expect, it, vi } from 'vitest';
import { today } from './ids';

/**
 * today() 语义：用户本地日历日期（YYYY-MM-DD）。
 * 快照/记录的日期都是"用户日历日"概念（01 §5.2/5.3），在 UTC+8 的 00:00～07:59
 * 与 UTC 日期不一致，不能用 toISOString().slice(0, 10)（那是 UTC 日期）。
 */
describe('today()（本地日历日期）', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('凌晨时段（UTC 与本地日期不一致）返回本地日期', () => {
    // 本地 2026-01-02 07:00，在 UTC+8 时区对应 UTC 时间 2026-01-01 23:00
    vi.setSystemTime(new Date(2026, 0, 2, 7, 0, 0));
    expect(today()).toBe('2026-01-02');
  });

  it('常规时段返回本地日期', () => {
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
    expect(today()).toBe('2026-06-15');
  });

  it('跨年边界返回本地日期', () => {
    // 本地 2026-12-31 23:30
    vi.setSystemTime(new Date(2026, 11, 31, 23, 30, 0));
    expect(today()).toBe('2026-12-31');
  });
});
