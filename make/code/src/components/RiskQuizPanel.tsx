import { useEffect, useState } from 'react';
import { Button, Card, Progress, Segmented, Space, Tag, Typography, message } from 'antd';
import {
  RISK_LEVEL_LABELS,
  RISK_LEVEL_ORDER,
  RISK_QUIZ_QUESTIONS,
  levelFromScore,
  scoreQuiz,
  type QuizAnswers,
  type RiskTypeName,
} from '@/lib/riskQuiz';
import { useAppStore } from '@/stores/useAppStore';
import { nowIso } from '@/lib/ids';
import type { RiskLevel, RiskProfile } from '@/lib/types';

/** 类型名称（04 §3.4 映射表） */
const TYPE_NAMES: Record<RiskLevel, RiskTypeName> = {
  low: '保守型',
  mediumLow: '稳健型',
  medium: '平衡型',
  mediumHigh: '成长型',
  high: '进取型',
};

/**
 * 与常见评级的解释性关联（04 §3.4）：「通常相当于」的行业常见说法，
 * 非官方评级，映射细则 [TBD-2]（01 §5.7）。
 */
const R_NOTES: Record<RiskLevel, string> = {
  low: '通常相当于 R1（风险最低）',
  mediumLow: '通常相当于 R2',
  medium: '通常相当于 R3',
  mediumHigh: '通常相当于 R4',
  high: '通常相当于 R5（风险最高）',
};

interface RiskQuizPanelProps {
  profile: RiskProfile | null;
  /** 是否正在答题（由页面控制，便于配置示例区的引导卡片联动） */
  quizActive: boolean;
  onStartQuiz: () => void;
  onCancelQuiz: () => void;
  /** 「查看我的配置示例」：跳转并定位到对应档位（04 §3.2） */
  onViewExample: (level: RiskLevel) => void;
}

/**
 * 风险测评区（04 第 3 章）：逐题作答（每屏一题、选择后自动进入下一题）→ 结果页。
 * 测评结果仅为建议值（01 §5.7），可手动调整；重测覆盖手动调整并清除标记（04 §3.7）。
 * 答题中途退出不保存草稿（04 §3.8）：quizActive 变 false 时重置作答。
 */
export default function RiskQuizPanel({
  profile,
  quizActive,
  onStartQuiz,
  onCancelQuiz,
  onViewExample,
}: RiskQuizPanelProps) {
  const { saveRiskProfile } = useAppStore();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});

  // 中途退出：作答不保存，下次从第 1 题重新开始（04 §3.8）
  useEffect(() => {
    if (!quizActive) {
      setStep(0);
      setAnswers({});
    }
  }, [quizActive]);

  const handleChoose = async (score: number) => {
    const question = RISK_QUIZ_QUESTIONS[step];
    const nextAnswers = { ...answers, [question.id]: score };
    setAnswers(nextAnswers);
    if (step < RISK_QUIZ_QUESTIONS.length - 1) {
      setStep(step + 1);
      return;
    }
    // 最后一题：计算并保存结果；重测覆盖旧结果与手动调整（04 §3.7）
    const result = levelFromScore(scoreQuiz(nextAnswers));
    await saveRiskProfile({
      assessedAt: nowIso(),
      totalScore: result.totalScore,
      riskLevel: result.riskLevel,
      manuallyAdjusted: false,
      manuallyAdjustedAt: null,
    });
    onCancelQuiz();
    message.success('测评完成');
  };

  // —— 未测评且未答题：引导卡片（04 §3.6）——
  if (!quizActive && (!profile || profile.riskLevel == null)) {
    return (
      <Card size="small" title="风险偏好自评">
        <Typography.Paragraph>
          完成约 2 分钟的风险测评，查看适合你的配置示例。
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          测评结果仅为建议值，不是任何机构的官方评级，也不构成投资建议。
        </Typography.Paragraph>
        <Button type="primary" onClick={onStartQuiz}>
          开始测评
        </Button>
      </Card>
    );
  }

  // —— 答题中（04 §3.2：逐题、选择后自动进入下一题）——
  if (quizActive) {
    const question = RISK_QUIZ_QUESTIONS[step];
    return (
      <Card
        size="small"
        title={`风险偏好自评（第 ${step + 1} / ${RISK_QUIZ_QUESTIONS.length} 题）`}
        extra={
          <Button size="small" onClick={onCancelQuiz}>
            退出
          </Button>
        }
      >
        <Progress
          percent={Math.round((step / RISK_QUIZ_QUESTIONS.length) * 100)}
          showInfo={false}
          size="small"
        />
        <Typography.Paragraph strong style={{ marginTop: 12 }}>
          {question.text}
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: '100%' }}>
          {question.options.map((option) => (
            <Button key={option.label} block onClick={() => void handleChoose(option.score)}>
              {option.label}
            </Button>
          ))}
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          选择后自动进入下一题；中途退出本次作答不保存。
        </Typography.Paragraph>
      </Card>
    );
  }

  // —— 结果页（04 §3.5/§3.7）——
  const currentLevel = profile!.riskLevel!;
  const adjusted = profile!.manuallyAdjusted;
  return (
    <Card size="small" title="测评结果">
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space size={8} wrap>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {TYPE_NAMES[currentLevel]}
          </Typography.Title>
          <Tag color="blue">风险等级：{RISK_LEVEL_LABELS[currentLevel]}</Tag>
          {adjusted && <Tag color="orange">手动调整</Tag>}
        </Space>
        <Typography.Text type="secondary">{R_NOTES[currentLevel]}</Typography.Text>
        {profile!.totalScore != null && (
          <Typography.Text type="secondary">总分：{profile!.totalScore}（7～28）</Typography.Text>
        )}
        {profile!.assessedAt && (
          <Typography.Text type="secondary">
            最近测评时间：{profile!.assessedAt.slice(0, 16).replace('T', ' ')}
          </Typography.Text>
        )}
        {adjusted && profile!.manuallyAdjustedAt && (
          <Typography.Text type="secondary">
            手动调整时间：{profile!.manuallyAdjustedAt.slice(0, 16).replace('T', ' ')}
          </Typography.Text>
        )}
        <div>
          <Typography.Text type="secondary">
            测评结果仅为建议值（01 §5.7），可在下方手动调整；重新测评会覆盖手动调整。
          </Typography.Text>
        </div>
        <div>
          <Typography.Text type="secondary">手动调整等级：</Typography.Text>
          <Segmented
            style={{ marginTop: 4 }}
            value={currentLevel}
            options={RISK_LEVEL_ORDER.map((level) => ({
              label: RISK_LEVEL_LABELS[level],
              value: level,
            }))}
            onChange={(value) => {
              void saveRiskProfile({
                riskLevel: value as RiskLevel,
                manuallyAdjusted: true,
                manuallyAdjustedAt: nowIso(),
                // 手动调整不改变「最近测评时间」（04 §3.7）
              });
            }}
          />
        </div>
        <Space>
          <Button onClick={onStartQuiz}>重新测评</Button>
          <Button type="primary" onClick={() => onViewExample(currentLevel)}>
            查看我的配置示例
          </Button>
        </Space>
      </Space>
    </Card>
  );
}
