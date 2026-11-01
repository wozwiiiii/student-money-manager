/**
 * 风险测评问卷（spec/04 第 3 章）：4 个维度、7 题、每题 4 个选项（分值 1～4）。
 * 题量与分值区间为推断性设定（04 §3.3/3.4 [Assumption, TBD-4]），上线前需小样本校准。
 * 测评结果仅为建议值（01 §5.7），不构成投资建议。
 */
import type { RiskLevel } from './types';

export type QuestionId = 'A1' | 'A2' | 'B1' | 'C1' | 'C2' | 'D1' | 'D2';

export interface QuizOption {
  label: string;
  score: number;
}

export interface QuizQuestion {
  id: QuestionId;
  /** 维度名称（04 §3.3） */
  dimension: string;
  text: string;
  options: QuizOption[];
}

const opt = (label: string, score: number): QuizOption => ({ label, score });

/** 问卷题目（04 §3.3 题目文案，属产品设计内容，不改写） */
export const RISK_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'A1',
    dimension: '风险态度',
    text: '假设你攒了一学期的钱做了某种安排，一个月后整体跌了 10%，你会？',
    options: [
      opt('立刻全部取出，换更稳的方式', 1),
      opt('先取出一部分，剩下的再看看', 2),
      opt('不动，等它涨回来', 3),
      opt('趁便宜再补一点', 4),
    ],
  },
  {
    id: 'A2',
    dimension: '风险态度',
    text: '下面哪句话更接近你的想法？',
    options: [
      opt('亏一分钱都不行，稳最重要', 1),
      opt('可以接受一点点波动，但别太大', 2),
      opt('有涨有跌很正常，能接受', 3),
      opt('想追求更高回报，跌了也认', 4),
    ],
  },
  {
    id: 'B1',
    dimension: '亏损承受反应',
    text: '为目标攒的这笔钱，短期内（半年内）最多能接受它暂时亏多少？',
    options: [
      opt('一点都不能亏', 1),
      opt('亏 5% 以内', 2),
      opt('亏 5%～20%', 3),
      opt('亏 20% 以上也能接受', 4),
    ],
  },
  {
    id: 'C1',
    dimension: '投资经验',
    text: '你买过哪些类型的理财或基金？（按最高的一档选）',
    options: [
      opt('没买过，只有现金和活期', 1),
      opt('余额宝、零钱通或银行定期', 2),
      opt('银行理财或理财产品', 3),
      opt('基金（含股票型基金）', 4),
    ],
  },
  {
    id: 'C2',
    dimension: '投资经验',
    text: '你持有过最长时间的一笔理财或基金是？',
    options: [
      opt('没持有过', 1),
      opt('3 个月以内', 2),
      opt('3 个月到 1 年', 3),
      opt('1 年以上', 4),
    ],
  },
  {
    id: 'D1',
    dimension: '资金用途期限',
    text: '这次想规划的这笔钱，大概什么时候会用到？',
    options: [
      opt('半年内', 1),
      opt('半年到 1 年', 2),
      opt('1 到 3 年', 3),
      opt('3 年以上', 4),
    ],
  },
  {
    id: 'D2',
    dimension: '资金用途期限',
    text: '如果这笔钱临时被占用，你的生活受影响吗？',
    options: [
      opt('很紧张，这是应急的钱', 1),
      opt('有一点影响，但能应付', 2),
      opt('影响不大，还有其他结余', 3),
      opt('完全没影响', 4),
    ],
  },
];

/** 风险偏好类型名称（04 §3.4 界面展示细化） */
export type RiskTypeName = '保守型' | '稳健型' | '平衡型' | '成长型' | '进取型';

export interface QuizResult {
  /** 总分 7～28 */
  totalScore: number;
  typeName: RiskTypeName;
  /** 五级等级标签（01 §5.7） */
  riskLevel: RiskLevel;
  /** 与常见评级的解释性关联（04 §3.4：「通常相当于」，非官方评级；映射细则 [TBD-2]） */
  rNote: string;
}

/** 每题作答的分值映射：key 为题号，value 为所选选项分值（1～4） */
export type QuizAnswers = Partial<Record<QuestionId, number>>;

/** 总分 = 各题分值之和；缺答按未通过校验处理（逐题模式不允许跳题，04 §3.8） */
export function scoreQuiz(answers: QuizAnswers): number {
  return RISK_QUIZ_QUESTIONS.reduce((sum, q) => sum + (answers[q.id] ?? 0), 0);
}

/** 是否全部作答 */
export function isQuizComplete(answers: QuizAnswers): boolean {
  return RISK_QUIZ_QUESTIONS.every((q) => answers[q.id] !== undefined);
}

/** 总分 → 五级映射（04 §3.4；分值区间边界为推断性设定 [Assumption, TBD-4]） */
export function levelFromScore(totalScore: number): QuizResult {
  if (totalScore <= 10) {
    return { totalScore, typeName: '保守型', riskLevel: 'low', rNote: '通常相当于 R1（风险最低）' };
  }
  if (totalScore <= 15) {
    return { totalScore, typeName: '稳健型', riskLevel: 'mediumLow', rNote: '通常相当于 R2' };
  }
  if (totalScore <= 20) {
    return { totalScore, typeName: '平衡型', riskLevel: 'medium', rNote: '通常相当于 R3' };
  }
  if (totalScore <= 24) {
    return { totalScore, typeName: '成长型', riskLevel: 'mediumHigh', rNote: '通常相当于 R4' };
  }
  return { totalScore, typeName: '进取型', riskLevel: 'high', rNote: '通常相当于 R5（风险最高）' };
}

/** 等级标签中文名（01 §5.7） */
export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: '低',
  mediumLow: '中低',
  medium: '中',
  mediumHigh: '中高',
  high: '高',
};

/** 五级顺序（低 → 高），用于手动调整切换与展示 */
export const RISK_LEVEL_ORDER: RiskLevel[] = ['low', 'mediumLow', 'medium', 'mediumHigh', 'high'];
