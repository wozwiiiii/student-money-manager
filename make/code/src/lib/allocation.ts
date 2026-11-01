/**
 * 配置教育内容数据（spec/04 第 4、5 章）。
 * 全部为教育性科普示意，不构成投资建议、不指向任何具体产品（04 §4.1、§4.6）。
 */
import type { RiskLevel } from './types';
import type { RiskTypeName } from './riskQuiz';

/** 资产类别（04 §4.4）：仅三类，口径与 01 §5.1 账户资产类型完全一致，不引入第四类 */
export interface AssetClassInfo {
  key: 'cash' | 'fixed' | 'fund';
  name: string;
  /** 一句浅白解释（04 §4.4 文案，概念首现附解释） */
  explanation: string;
}

export const ASSET_CLASSES: AssetClassInfo[] = [
  {
    key: 'cash',
    name: '现金与活期',
    explanation:
      '随时能用的钱：钱包现金、银行卡活期，以及余额宝、零钱通这类零钱理财（底层是货币基金——主要投资短期存款、债券等低风险品种的基金，收益较低但波动小、可快速取出）。',
  },
  {
    key: 'fixed',
    name: '定期 / 理财产品',
    explanation:
      '要放满约定期限才方便取出的钱：银行定期存款、银行理财、理财通理财等；通常收益高于活期，展示的收益率是参考值而非承诺，提前取出受限制。',
  },
  {
    key: 'fund',
    name: '基金持仓',
    explanation:
      '通过支付宝、微信、银行等渠道申购赎回的场外基金；按净值（每份基金单位的价格）计价，金额随市场涨跌波动，可能亏损。',
  },
];

/**
 * 风险分级配置示例（04 §4.5）。
 * [TBD-3] 各比例数值未与任何持牌机构核对，在解除前一律为 null，界面显示"示例整理中"占位，
 * 不得以编造数字顶替（04 §4.5/4.7）。方向性约束（等级越高现金占比越低、基金占比越高，三类和为 100%）
 * 为教学示意常识性设定 [Assumption, TBD]，待核对后填入。
 */
export interface AllocationExample {
  level: RiskLevel;
  typeName: RiskTypeName;
  cashPct: number | null;
  fixedPct: number | null;
  fundPct: number | null;
}

export const ALLOCATION_EXAMPLES: AllocationExample[] = [
  { level: 'low', typeName: '保守型', cashPct: null, fixedPct: null, fundPct: null },
  { level: 'mediumLow', typeName: '稳健型', cashPct: null, fixedPct: null, fundPct: null },
  { level: 'medium', typeName: '平衡型', cashPct: null, fixedPct: null, fundPct: null },
  { level: 'mediumHigh', typeName: '成长型', cashPct: null, fixedPct: null, fundPct: null },
  { level: 'high', typeName: '进取型', cashPct: null, fixedPct: null, fundPct: null },
];

/** 比例条旁固定标注（04 §4.5） */
export const ALLOCATION_RATIO_NOTE =
  '以上比例仅为教学示意，不代表任何具体产品的实际构成，也不构成投资建议。';

/** 精简版常驻声明（04 §5.2） */
export const DISCLAIMER_SHORT = '教育性信息，不构成投资建议';

/** 完整声明（04 §5.3 建议稿，五条） */
export const DISCLAIMER_FULL: string[] = [
  '本页面全部内容（含风险测评结果与资产配置比例示例）仅为教育性信息，不构成投资建议，亦不构成对任何金融产品的推荐或邀约。',
  '配置示例中的资产类别比例仅为科普示意，不代表任何具体产品的实际构成；示例比例未与任何持牌机构核对，不应作为实际配置依据。',
  '市场有风险，投资需谨慎。任何理财与基金产品均可能产生亏损，过往表现不代表未来收益。',
  '请在充分理解相关产品与自身情况后独立决策，必要时向持牌机构的专业人士咨询。',
  '本应用不提供投资咨询、投资顾问或资产管理业务。',
];

/** 首次进入配置教育页的提示层要点（04 §5.4 浅白一句话版） */
export const FIRST_VISIT_NOTICE =
  '本页内容只是科普示意，不构成投资建议；市场有风险，投资需谨慎。';
