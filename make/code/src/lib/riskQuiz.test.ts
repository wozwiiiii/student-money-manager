import { describe, expect, it } from 'vitest';
import {
  RISK_QUIZ_QUESTIONS,
  isQuizComplete,
  levelFromScore,
  scoreQuiz,
  type QuizAnswers,
} from './riskQuiz';

describe('问卷结构（04 §3.3）', () => {
  it('4 个维度、7 题、每题 4 个选项且分值 1～4', () => {
    expect(RISK_QUIZ_QUESTIONS).toHaveLength(7);
    const dimensions = new Set(RISK_QUIZ_QUESTIONS.map((q) => q.dimension));
    expect(dimensions.size).toBe(4);
    for (const q of RISK_QUIZ_QUESTIONS) {
      expect(q.options).toHaveLength(4);
      expect(q.options.map((o) => o.score)).toEqual([1, 2, 3, 4]);
    }
  });

  it('逐题模式不允许跳题：缺答即未完成', () => {
    expect(isQuizComplete({})).toBe(false);
    const full: QuizAnswers = { A1: 1, A2: 1, B1: 1, C1: 1, C2: 1, D1: 1, D2: 1 };
    expect(isQuizComplete(full)).toBe(true);
    const missing = { ...full };
    delete missing.D2;
    expect(isQuizComplete(missing)).toBe(false);
  });
});

describe('计分与等级映射（04 §3.4）', () => {
  it('总分 = 各题分值之和，范围 7～28', () => {
    const min: QuizAnswers = { A1: 1, A2: 1, B1: 1, C1: 1, C2: 1, D1: 1, D2: 1 };
    const max: QuizAnswers = { A1: 4, A2: 4, B1: 4, C1: 4, C2: 4, D1: 4, D2: 4 };
    expect(scoreQuiz(min)).toBe(7);
    expect(scoreQuiz(max)).toBe(28);
  });

  it('分值区间边界映射五级（含区间端点）', () => {
    expect(levelFromScore(7)).toMatchObject({ typeName: '保守型', riskLevel: 'low' });
    expect(levelFromScore(10)).toMatchObject({ typeName: '保守型', riskLevel: 'low' });
    expect(levelFromScore(11)).toMatchObject({ typeName: '稳健型', riskLevel: 'mediumLow' });
    expect(levelFromScore(15)).toMatchObject({ typeName: '稳健型', riskLevel: 'mediumLow' });
    expect(levelFromScore(16)).toMatchObject({ typeName: '平衡型', riskLevel: 'medium' });
    expect(levelFromScore(20)).toMatchObject({ typeName: '平衡型', riskLevel: 'medium' });
    expect(levelFromScore(21)).toMatchObject({ typeName: '成长型', riskLevel: 'mediumHigh' });
    expect(levelFromScore(24)).toMatchObject({ typeName: '成长型', riskLevel: 'mediumHigh' });
    expect(levelFromScore(25)).toMatchObject({ typeName: '进取型', riskLevel: 'high' });
    expect(levelFromScore(28)).toMatchObject({ typeName: '进取型', riskLevel: 'high' });
  });

  it('R 级对应为解释性关联（「通常相当于」），非官方评级', () => {
    expect(levelFromScore(7).rNote).toContain('R1');
    expect(levelFromScore(28).rNote).toContain('R5');
    expect(levelFromScore(18).rNote).toContain('通常相当于');
  });
});
