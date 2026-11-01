import { useEffect, useState } from 'react';
import { Alert, Button, Card, Space, Switch, Tag, Typography, message } from 'antd';
import { useLocation } from 'react-router-dom';
import RiskQuizPanel from '@/components/RiskQuizPanel';
import { useAppStore } from '@/stores/useAppStore';
import {
  ALLOCATION_EXAMPLES,
  ALLOCATION_RATIO_NOTE,
  ASSET_CLASSES,
  DISCLAIMER_FULL,
  DISCLAIMER_SHORT,
  FIRST_VISIT_NOTICE,
  type AllocationExample,
} from '@/lib/allocation';
import { RISK_LEVEL_LABELS, RISK_LEVEL_ORDER } from '@/lib/riskQuiz';
import type { RiskLevel } from '@/lib/types';

/** 完整声明展开区（04 §5.3 五条） */
function FullDisclaimer() {
  return (
    <div style={{ marginTop: 8 }}>
      <Typography.Text strong>教育性信息声明</Typography.Text>
      <ol style={{ paddingLeft: 20, marginTop: 4, marginBottom: 0 }}>
        {DISCLAIMER_FULL.map((line) => (
          <li key={line}>
            <Typography.Text type="secondary">{line}</Typography.Text>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 单档比例示意（04 §4.5/§4.7）：[TBD-3] 未解除时显示"示例整理中"占位，不得编造数字 */
function RatioPlaceholder({ example }: { example: AllocationExample }) {
  const pending = example.cashPct == null || example.fixedPct == null || example.fundPct == null;
  return (
    <div>
      {pending ? (
        <Typography.Text type="secondary">示例整理中（比例数值待核对后补充）</Typography.Text>
      ) : (
        <Space size={8} wrap>
          <Tag color="cyan">现金与活期 {example.cashPct}%</Tag>
          <Tag color="geekblue">定期 / 理财产品 {example.fixedPct}%</Tag>
          <Tag color="purple">基金持仓 {example.fundPct}%</Tag>
        </Space>
      )}
    </div>
  );
}

/**
 * 配置教育页（04 第 3、4、5 章）：自上而下为合规声明常驻条、风险测评区、配置示例区。
 * 全部内容为教育性科普示意，不构成投资建议、不指向任何具体产品（04 §4.1/§4.6）。
 */
export default function EducationPage() {
  const location = useLocation();
  const { appMeta, riskProfile, load, ackEducationDisclaimer } = useAppStore();
  const [quizActive, setQuizActive] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<RiskLevel | null>(null);
  const [compareView, setCompareView] = useState(false);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 设置页「重新测评」入口直达问卷（05 §6.1）
  useEffect(() => {
    if ((location.state as { startQuiz?: boolean } | null)?.startQuiz) setQuizActive(true);
  }, [location.state]);

  const myLevel = riskProfile?.riskLevel ?? null;
  // 当前查看档位：优先手动点击，其次用户测评/调整档位（04 §3.6/§4.2），未测评时默认低档仅作展示
  const currentLevel = selectedLevel ?? myLevel ?? 'low';
  const currentExample = ALLOCATION_EXAMPLES.find((e) => e.level === currentLevel)!;
  const acked = appMeta?.educationDisclaimerAckAt != null;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* 首次进入提示层（04 §5.4）：非阻断式，未点确认时持续显示；展开完整声明不等于确认 */}
      {!acked && (
        <Alert
          type="warning"
          showIcon
          message={FIRST_VISIT_NOTICE}
          description={
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Space>
                <Button
                  size="small"
                  type="primary"
                  onClick={() => {
                    void ackEducationDisclaimer();
                    message.success('已记录您的确认');
                  }}
                >
                  我已知晓，继续查看
                </Button>
                <Button size="small" type="link" onClick={() => setShowFull((v) => !v)}>
                  查看完整声明
                </Button>
              </Space>
              {showFull && <FullDisclaimer />}
            </Space>
          }
        />
      )}

      {/* 合规声明常驻条（04 §5.2）：精简版一行常驻，可展开全文 */}
      <Alert
        type="info"
        message={
          <Space wrap>
            <span>{DISCLAIMER_SHORT}</span>
            <a onClick={() => setShowFull((v) => !v)}>{showFull ? '收起完整声明' : '查看完整声明'}</a>
          </Space>
        }
        description={showFull ? <FullDisclaimer /> : undefined}
      />

      {/* 风险测评区（04 第 3 章） */}
      <div id="risk-quiz">
        <RiskQuizPanel
          profile={riskProfile}
          quizActive={quizActive}
          onStartQuiz={() => setQuizActive(true)}
          onCancelQuiz={() => setQuizActive(false)}
          onViewExample={(level) => setSelectedLevel(level)}
        />
      </div>

      {/* 配置示例区（04 第 4 章）：只消费风险等级这一个输入，不依赖任何账本数据 */}
      <Card
        title="风险分级配置示例"
        extra={
          <Space>
            <Typography.Text type="secondary">五档对比</Typography.Text>
            <Switch checked={compareView} onChange={setCompareView} />
          </Space>
        }
      >
        {/* 未测评引导卡片（04 §3.6）：不设门槛，教育内容可先看 */}
        {myLevel == null && !quizActive && (
          <Alert
            style={{ marginBottom: 12 }}
            type="info"
            message="完成约 2 分钟的风险测评，查看适合你的配置示例"
            action={
              <Button size="small" type="primary" onClick={() => setQuizActive(true)}>
                开始测评
              </Button>
            }
          />
        )}

        {/* 等级标签行（04 §4.2）：五档可点击切换，测评档位带「我的」角标 */}
        <Space size={8} wrap style={{ marginBottom: 12 }}>
          {RISK_LEVEL_ORDER.map((level) => (
            <Tag.CheckableTag
              key={level}
              checked={currentLevel === level}
              onChange={() => setSelectedLevel(level)}
              style={{ border: '1px solid #d9d9d9', padding: '4px 12px' }}
            >
              {ALLOCATION_EXAMPLES.find((e) => e.level === level)!.typeName}（{RISK_LEVEL_LABELS[level]}）
              {myLevel === level && <Tag color="blue" style={{ marginLeft: 6 }}>我的</Tag>}
            </Tag.CheckableTag>
          ))}
        </Space>

        {!compareView ? (
          <div style={{ marginBottom: 12 }}>
            <Typography.Text strong>
              {currentExample.typeName}（{RISK_LEVEL_LABELS[currentLevel]}）示意
            </Typography.Text>
            <RatioPlaceholder example={currentExample} />
            <Typography.Text type="secondary">{ALLOCATION_RATIO_NOTE}</Typography.Text>
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            {ALLOCATION_EXAMPLES.map((example) => (
              <div key={example.level} style={{ marginBottom: 8 }}>
                <Typography.Text strong>
                  {example.typeName}（{RISK_LEVEL_LABELS[example.level]}）
                </Typography.Text>
                <RatioPlaceholder example={example} />
              </div>
            ))}
            <Typography.Text type="secondary">{ALLOCATION_RATIO_NOTE}</Typography.Text>
          </div>
        )}

        {/* 资产类别图例与浅白解释（04 §4.4）：仅三类，与账户资产类型口径一致 */}
        {ASSET_CLASSES.map((asset) => (
          <div key={asset.key} style={{ marginBottom: 8 }}>
            <Typography.Text strong>{asset.name}</Typography.Text>
            <div>
              <Typography.Text type="secondary">{asset.explanation}</Typography.Text>
            </div>
          </div>
        ))}

        {/* 合规声明固定展示（04 §5.2）：不随等级切换消失，与比例示意同屏可见 */}
        <Alert
          style={{ marginTop: 12 }}
          type="warning"
          message={
            <Space wrap>
              <span>{DISCLAIMER_SHORT}</span>
              <a onClick={() => setShowFull((v) => !v)}>查看完整声明</a>
            </Space>
          }
        />
      </Card>
    </Space>
  );
}
