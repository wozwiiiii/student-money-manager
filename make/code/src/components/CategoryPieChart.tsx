import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { Empty, List, Typography } from 'antd';
import { formatYuan } from '@/lib/money';
import type { CategorySlice } from '@/lib/stats';

echarts.use([PieChart, LegendComponent, TooltipComponent, CanvasRenderer]);

/**
 * 收支分类占比图（03 §6.1）：环形图 + 分类金额排行（前三名突出）。
 * 聚合到一级分类；金额为零的分类不出现。
 */
interface CategoryPieChartProps {
  slices: CategorySlice[];
  height?: number;
}

export default function CategoryPieChart({ slices, height = 280 }: CategoryPieChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = echarts.init(container);
    chartRef.current = chart;
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption({
      tooltip: {
        trigger: 'item',
        valueFormatter: (v: number) => `¥${(v / 100).toFixed(2)}`,
      },
      legend: { bottom: 0, type: 'scroll' },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '44%'],
          data: slices.map((s) => ({ name: s.name, value: s.amountCents })),
          label: { formatter: '{b} {d}%' },
        },
      ],
    });
  }, [slices]);

  return (
    <div>
      <div ref={containerRef} style={{ width: '100%', height }} />
      <List
        size="small"
        header={<Typography.Text strong>分类金额排行</Typography.Text>}
        dataSource={slices.slice(0, 10)}
        renderItem={(s, index) => (
          <List.Item>
            <Typography.Text strong={index < 3} style={index < 3 ? { fontSize: 15 } : undefined}>
              {index + 1}. {s.name}
            </Typography.Text>
            <Typography.Text strong={index < 3}>
              {formatYuan(s.amountCents)}（{s.percent}%）
            </Typography.Text>
          </List.Item>
        )}
      />
    </div>
  );
}

/** 空数据占位（03 §6.1 空数据处理） */
export function PieEmpty({ directionLabel, onAdd, onImport }: { directionLabel: string; onAdd: () => void; onImport: () => void }) {
  return (
    <Empty description={`本周期还没有${directionLabel}记录`}>
      <a onClick={onAdd}>去记一笔</a>
      <a style={{ marginLeft: 16 }} onClick={onImport}>
        导入账单
      </a>
    </Empty>
  );
}
