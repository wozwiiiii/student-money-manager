import { useEffect, useState } from 'react';
import { Button, Card, InputNumber, Radio, Segmented, Space, Switch, Tag, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import CategoryAdminPanel from '@/components/CategoryAdminPanel';
import { useAppStore } from '@/stores/useAppStore';
import { DEFAULT_SETTINGS } from '@/lib/defaults';
import { RISK_LEVEL_LABELS, RISK_LEVEL_ORDER } from '@/lib/riskQuiz';
import { nowIso } from '@/lib/ids';
import type { BannerReappearRule, RiskLevel } from '@/lib/types';

/** 提示条关闭后的重现规则选项文案（05 §5.1） */
const REAPPEAR_RULES: { value: BannerReappearRule; label: string; desc: string }[] = [
  { value: 'A', label: 'A', desc: '关闭后，本周期内该分类预算进度首次升至更高梯度时，提示条重现' },
  { value: 'B', label: 'B（默认）', desc: '关闭后，次日首次查看相关页面时重新评估：若仍需提醒，提示条重现' },
  { value: 'C', label: 'C', desc: '关闭后，本周期内不再重现，下一个预算周期恢复默认提醒行为' },
];

/**
 * 自定义设置页（spec/05）：分类管理、预算规则、风险偏好与目标参数入口。
 * 全部改动即时生效、不篡改历史（05 §7.1/§7.2）；各分区提供恢复默认（05 §7.3）。
 */
export default function SettingsPage() {
  const navigate = useNavigate();
  const { settings, riskProfile, load, saveSettings, saveRiskProfile } = useAppStore();
  const [threshold, setThreshold] = useState<number | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (settings) setThreshold(settings.alertThresholdPct);
  }, [settings]);

  if (!settings) return <Card title="自定义设置" loading />;

  const saveThreshold = (value: number | null) => {
    if (value == null || value < 50 || value > 95) {
      message.warning('预警阈值可调范围为 50%～95%（整数百分点）');
      setThreshold(settings.alertThresholdPct);
      return;
    }
    void saveSettings({ alertThresholdPct: value });
    message.success('已保存，即时生效');
  };

  const myLevel = riskProfile?.riskLevel ?? null;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title="分类管理"
        extra={
          <Typography.Text type="secondary">05 §3：增删改、内置保护、停用与迁移</Typography.Text>
        }
      >
        <CategoryAdminPanel />
      </Card>

      <Card
        title="预算规则"
        extra={
          <Button
            size="small"
            onClick={() => {
              void saveSettings({
                alertThresholdPct: DEFAULT_SETTINGS.alertThresholdPct,
                gradedReminderEnabled: DEFAULT_SETTINGS.gradedReminderEnabled,
                bannerReappearRule: DEFAULT_SETTINGS.bannerReappearRule,
              });
              setThreshold(DEFAULT_SETTINGS.alertThresholdPct);
              message.success('预算规则已恢复默认');
            }}
          >
            恢复默认
          </Button>
        }
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Typography.Text strong>预警阈值（接近超支的百分比）</Typography.Text>
            <div>
              <InputNumber
                value={threshold}
                min={50}
                max={95}
                precision={0}
                addonAfter="%"
                onChange={(v) => setThreshold(v)}
                onBlur={() => saveThreshold(threshold)}
              />
            </div>
            <Typography.Text type="secondary">
              可调范围 50%～95%（整数百分点），默认 80%；保存后之后所有预算周期的「接近超支」判定按新阈值触发（05 §5.1）。
            </Typography.Text>
          </div>

          <div>
            <Space>
              <Typography.Text strong>是否分级提醒</Typography.Text>
              <Switch
                checked={settings.gradedReminderEnabled}
                onChange={(checked) => {
                  void saveSettings({ gradedReminderEnabled: checked });
                  message.success('已保存，即时生效');
                }}
              />
            </Space>
            <div>
              <Typography.Text type="secondary">
                开：按完整梯度提醒；关：提醒缩减为「达到预警阈值」与「超出预算」两档。
                当前版本提醒梯度定稿为两级（接近超支 / 已超支，03 §5.3），本开关暂无行为差异
                [TBD 对齐]，保留设置以对齐后续梯度定义。
              </Typography.Text>
            </div>
          </div>

          <div>
            <Typography.Text strong>提示条关闭后的重现规则</Typography.Text>
            <Radio.Group
              style={{ display: 'block', marginTop: 4 }}
              value={settings.bannerReappearRule}
              onChange={(e) => {
                void saveSettings({ bannerReappearRule: e.target.value as BannerReappearRule });
                message.success('已保存，即时生效');
              }}
            >
              <Space direction="vertical">
                {REAPPEAR_RULES.map((rule) => (
                  <Radio key={rule.value} value={rule.value}>
                    {rule.label}：{rule.desc}
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
            <Typography.Text type="secondary">
              三项均为全局设置，对月度周期与全部自定义周期统一生效（05 §5）。
            </Typography.Text>
          </div>
        </Space>
      </Card>

      <Card title="风险偏好">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space size={8} wrap>
            <Typography.Text strong>当前等级：</Typography.Text>
            {myLevel ? (
              <>
                <Tag color="blue">{RISK_LEVEL_LABELS[myLevel]}</Tag>
                {riskProfile?.manuallyAdjusted && <Tag color="orange">手动调整</Tag>}
              </>
            ) : (
              <Tag>尚未测评</Tag>
            )}
            <Button
              size="small"
              type="primary"
              onClick={() => navigate('/education', { state: { startQuiz: true } })}
            >
              重新测评
            </Button>
          </Space>
          <div>
            <Typography.Text>手动调整等级：</Typography.Text>
            <div style={{ marginTop: 4 }}>
              <Segmented
                value={myLevel ?? undefined}
                options={RISK_LEVEL_ORDER.map((level) => ({
                  label: RISK_LEVEL_LABELS[level],
                  value: level,
                }))}
                onChange={(value) => {
                  void saveRiskProfile({
                    riskLevel: value as RiskLevel,
                    manuallyAdjusted: true,
                    manuallyAdjustedAt: nowIso(),
                  });
                  message.success('已调整，配置教育的示例档位随之切换');
                }}
              />
            </div>
            <Typography.Text type="secondary">
              自评结果仅为建议值，可手动调整（01 §5.7）；重新测评会覆盖手动调整并清除标记（05 §6.1）。
            </Typography.Text>
          </div>
        </Space>
      </Card>

      <Card title="账户与储蓄目标">
        <Space direction="vertical" size={8}>
          <Space>
            <Typography.Text>账户的重命名、排序（上移 / 下移）、删除与恢复默认顺序：</Typography.Text>
            <Button size="small" onClick={() => navigate('/accounts')}>
              前往账户管理
            </Button>
          </Space>
          <Space>
            <Typography.Text>储蓄目标的目标金额、目标日期等参数调整：</Typography.Text>
            <Button size="small" onClick={() => navigate('/goals')}>
              前往储蓄目标
            </Button>
          </Space>
          <Typography.Text type="secondary">
            账户删除保留历史数据、不影响趋势图历史记录点（05 §4.2）；目标参数保存后进度与剩余天数即时重算（05 §6.2）。
          </Typography.Text>
        </Space>
      </Card>

      <Card title="关于恢复默认">
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          恢复默认只还原设置项（预警阈值、分级提醒、重现规则、账户排序、内置分类名称），不影响自定义分类、账户、记录与储蓄目标（05 §7.3）。
          自定义分类与账户没有出厂默认，只能手动删除或停用；风险偏好与储蓄目标参数不可恢复默认，只能重新测评或再次编辑。
          数据清空与备份导出属于数据存储与合规模块，不在本页范围。
        </Typography.Paragraph>
      </Card>
    </Space>
  );
}
