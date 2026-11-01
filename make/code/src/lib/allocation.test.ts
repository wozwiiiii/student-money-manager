import { describe, expect, it } from 'vitest';
import { ALLOCATION_EXAMPLES, ASSET_CLASSES, DISCLAIMER_FULL, DISCLAIMER_SHORT } from './allocation';
import { RISK_LEVEL_ORDER } from './riskQuiz';

describe('资产类别口径（04 §4.4）', () => {
  it('仅三类，与 01 §5.1 账户资产类型一致，每类附一句浅白解释', () => {
    expect(ASSET_CLASSES.map((c) => c.key)).toEqual(['cash', 'fixed', 'fund']);
    for (const c of ASSET_CLASSES) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.explanation.length).toBeGreaterThan(10);
    }
  });
});

describe('配置示例比例（04 §4.5 [TBD-3]）', () => {
  it('五档齐备，与风险等级一一对应', () => {
    expect(ALLOCATION_EXAMPLES.map((e) => e.level)).toEqual(RISK_LEVEL_ORDER);
  });

  it('[TBD-3] 解除前比例一律为 null（"示例整理中"占位，不得编造数字）', () => {
    for (const e of ALLOCATION_EXAMPLES) {
      expect(e.cashPct).toBeNull();
      expect(e.fixedPct).toBeNull();
      expect(e.fundPct).toBeNull();
    }
  });
});

describe('合规声明（04 第 5 章）', () => {
  it('常驻精简声明含「不构成投资建议」要点', () => {
    expect(DISCLAIMER_SHORT).toContain('不构成投资建议');
  });

  it('完整声明为建议稿五条，含风险提示与不提供投资咨询的定位', () => {
    expect(DISCLAIMER_FULL).toHaveLength(5);
    expect(DISCLAIMER_FULL.join('')).toContain('市场有风险，投资需谨慎');
    expect(DISCLAIMER_FULL.join('')).toContain('不提供投资咨询');
    expect(DISCLAIMER_FULL.join('')).toContain('不构成投资建议');
  });
});
