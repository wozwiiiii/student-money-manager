import { describe, expect, it } from 'vitest';
import {
  DISCLAIMER_ANCHOR,
  FIRST_NOTICE_ITEMS,
  GLOBAL_DISCLAIMER_FULL,
} from './compliance';

/**
 * 合规文案一致性（08 §6.2 全局一致性规则）：
 * 锚点句"教育性信息，不构成投资建议"为全套件统一措辞，不得被改写或缺失。
 */

describe('合规文案常量（08 §6、§7）', () => {
  it('全局免责声明为五条建议稿，且覆盖四个必备语义要点', () => {
    expect(GLOBAL_DISCLAIMER_FULL).toHaveLength(5);
    const joined = GLOBAL_DISCLAIMER_FULL.join('\n');
    expect(joined).toContain('不构成投资建议');
    expect(joined).toContain('不接触真实资金');
    expect(joined).toContain('保存于你的浏览器本地');
    expect(joined).toContain('市场有风险，投资需谨慎');
    expect(joined).toContain('不提供投资咨询、投资顾问或资产管理业务');
  });

  it('首次告知事项含 08 §7 清单的五个语义方向', () => {
    expect(FIRST_NOTICE_ITEMS).toHaveLength(5);
    const joined = FIRST_NOTICE_ITEMS.join('\n');
    expect(joined).toContain('本地'); // 数据存储方式
    expect(joined).toContain('云同步'); // 无云同步与丢失风险
    expect(joined).toContain('备份'); // 备份建议
    expect(joined).toContain(DISCLAIMER_ANCHOR); // 教育性定位（锚点句原文）
    expect(joined).toContain('不接触真实资金'); // 不接触资金
  });

  it('锚点句为不可改写的统一措辞', () => {
    expect(DISCLAIMER_ANCHOR).toBe('教育性信息，不构成投资建议');
  });
});
