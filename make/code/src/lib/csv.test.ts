import { describe, expect, it } from 'vitest';
import { parseBillCsv, parseCsvLine } from './csv';
import { fallbackCategoryId, matchCategory } from './mapping';
import type { Category, MappingRule } from './types';

describe('parseCsvLine', () => {
  it('普通行', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('引号包裹与转义', () => {
    expect(parseCsvLine('"含,逗号",b')).toEqual(['含,逗号', 'b']);
    expect(parseCsvLine('"说""你好""",b')).toEqual(['说"你好"', 'b']);
  });
});

describe('parseBillCsv（02 §4.4）', () => {
  const alipayFixture = [
    '支付宝交易记录明细测试',
    '账号:[test@example.com]',
    '交易时间,交易分类,交易对方,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注',
    '2026-10-01 12:30:00,餐饮美食,学校食堂,食堂午饭,支出,¥12.50,余额宝,交易成功,202610010001,,',
    '2026-10-02 09:00:00,转账,妈妈,生活费,收入,¥1500.00,银行卡,交易成功,202610020002,,',
    '2026-10-03 18:00:00,日用百货,淘宝,洗衣液,支出,¥25.00,余额宝,交易关闭,202610030003,,',
    '2026-10-04 08:00:00,其他,余额宝,余额宝转入,不计收支,¥100.00,余额宝,交易成功,202610040004,,',
  ].join('\n');

  it('解析支付宝格式：字段映射与方向转换', () => {
    const result = parseBillCsv(alipayFixture);
    expect(result.error).toBeUndefined();
    expect(result.rows).toHaveLength(3);
    expect(result.filteredLines).toBe(1); // 交易关闭被过滤

    const [meal, living, transfer] = result.rows;
    expect(meal).toMatchObject({
      date: '2026-10-01',
      direction: 'expense',
      amountCents: 1250,
    });
    expect(meal.description).toContain('学校食堂');
    expect(meal.description).toContain('食堂午饭');
    expect(living.direction).toBe('income');
    expect(living.amountCents).toBe(150000);
    // 「不计收支」记为转账（02 §4.4.4）
    expect(transfer.direction).toBe('transfer');
  });

  it('微信格式：状态过滤与方向', () => {
    const wechatFixture = [
      '微信支付账单明细',
      '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注',
      '2026-10-05 12:00:00,商户消费,美团外卖,外卖,支出,¥30.00,零钱,支付成功,4200001,,',
      '2026-10-06 12:00:00,转账,同学,AA,/,¥20.00,零钱,转账成功,4200002,,',
      '2026-10-07 12:00:00,商户消费,京东,书,支出,¥50.00,零钱,已退款,4200003,,',
    ].join('\n');
    const result = parseBillCsv(wechatFixture);
    expect(result.rows).toHaveLength(2);
    expect(result.filteredLines).toBe(1);
    expect(result.rows[0].direction).toBe('expense');
    expect(result.rows[1].direction).toBe('transfer');
  });

  it('无法识别的文件给出规范文案（02 §4.4.7）', () => {
    const result = parseBillCsv('这不是账单文件\n只是普通文本');
    expect(result.error).toBe('无法识别该文件，请使用支付宝/微信导出的原始 CSV 文件');
  });

  it('空文件提示（02 §4.4.7）', () => {
    const result = parseBillCsv(
      '交易时间,金额,收/支\n'.trim(),
    );
    expect(result.error).toBe('文件中没有账单数据，请确认导出时选择的时间范围');
  });

  it('乱码检测（02 §4.4.7）', () => {
    const result = parseBillCsv('交易时间,���额\n�,�');
    expect(result.error).toBe('文件内容显示异常，请重新导出原文件，不要经其他软件转存');
  });

  it('部分行解析失败不影响其余行（02 §4.4.7）', () => {
    const fixture = [
      '交易时间,金额,收/支,交易状态',
      '2026-10-01 10:00:00,¥10.00,支出,交易成功',
      '坏行,不是金额,支出,交易成功',
    ].join('\n');
    const result = parseBillCsv(fixture);
    expect(result.rows).toHaveLength(1);
    expect(result.failedLines).toBe(1);
  });
});

describe('matchCategory（02 §4.4.5）', () => {
  const cat = (id: string, name: string, direction: 'income' | 'expense', parentId: string | null = null, level: 1 | 2 = 1): Category => ({
    id,
    name,
    direction,
    parentId,
    level,
    builtin: true,
    disabled: false,
    sortOrder: 0,
  });
  const categories = [
    cat('c-food', '餐饮', 'expense'),
    cat('c-traffic', '交通', 'expense'),
    cat('i-living', '生活费', 'income'),
  ];
  const rule = (id: string, keyword: string, categoryId: string, builtin: boolean): MappingRule => ({
    id,
    keyword,
    categoryId,
    builtin,
    enabled: true,
  });

  it('关键词包含匹配命中分类', () => {
    const rules = [rule('r1', '食堂', 'c-food', true), rule('r2', '地铁', 'c-traffic', true)];
    expect(matchCategory('学校食堂午饭', 'expense', rules, categories)).toBe('c-food');
    expect(matchCategory('地铁通勤', 'expense', rules, categories)).toBe('c-traffic');
    expect(matchCategory('随便什么', 'expense', rules, categories)).toBeNull();
  });

  it('自定义规则优先于内置规则', () => {
    const rules = [
      rule('r1', '奶茶', 'c-food', true),
      rule('r2', '奶茶', 'c-traffic', false), // 自定义：奶茶归交通（示例用）
    ];
    expect(matchCategory('奶茶店', 'expense', rules, categories)).toBe('c-traffic');
  });

  it('分类方向不匹配时不命中', () => {
    const rules = [rule('r1', '生活费', 'c-food', true)];
    expect(matchCategory('生活费到账', 'income', rules, categories)).toBeNull();
  });

  it('二级分类并入一级（03 §3.3）', () => {
    const withChild = [...categories, cat('c-food-child', '食堂', 'expense', 'c-food', 2)];
    const rules = [rule('r1', '食堂', 'c-food-child', true)];
    expect(matchCategory('食堂晚饭', 'expense', rules, withChild)).toBe('c-food');
  });

  it('兜底分类（02 §4.4.5 未匹配归入其他）', () => {
    const withFallback = [...categories, cat('c-other', '其他支出', 'expense')];
    expect(fallbackCategoryId('expense', withFallback)).toBe('c-other');
    expect(fallbackCategoryId('income', withFallback)).toBeNull();
  });
});
