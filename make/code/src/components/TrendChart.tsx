import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import dayjs from 'dayjs';
import { formatCents } from '@/lib/money';
import type { TrendRange } from '@/lib/assets';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

/**
 * 资产趋势图（02 §5.4.3）：折线图，横轴快照时间、纵轴该次快照保存时固定的总资产。
 * 仅展示，不支持图上交互修改数据。
 */
interface TrendChartProps {
  points: Array<{ takenAt: string; totalCents: number }>;
  height?: number;
}

export default function TrendChart({ points, height = 280 }: TrendChartProps) {
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
        trigger: 'axis',
        valueFormatter: (v: number) => `¥${formatCents(v)}`,
      },
      grid: { left: 64, right: 24, top: 24, bottom: 40 },
      xAxis: {
        type: 'category',
        data: points.map((p) => dayjs(p.takenAt).format('MM-DD HH:mm')),
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (v: number) => `¥${formatCents(v)}` },
      },
      series: [
        {
          type: 'line',
          smooth: true,
          showSymbol: true,
          symbolSize: 6,
          data: points.map((p) => p.totalCents),
          areaStyle: { opacity: 0.08 },
          lineStyle: { width: 2 },
        },
      ],
    });
  }, [points]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}

export type { TrendRange };
