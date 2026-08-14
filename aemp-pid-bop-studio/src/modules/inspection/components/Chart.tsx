// ============================================================================
//  Chart.js wrapper for the dashboard. The reference renders real charts with
//  axes and gridlines (its cards carry data-chart attributes), so the module
//  uses canvas charts rather than CSS bar approximations.
//  Palette is read from the module's CSS custom properties at mount so light
//  and dark themes both resolve correctly.
// ============================================================================
import { useEffect, useMemo, useRef } from 'react';
import {
  ArcElement, BarController, BarElement, CategoryScale, Chart as ChartJS,
  DoughnutController, Legend, LineController, LineElement, LinearScale,
  PointElement, Tooltip,
} from 'chart.js';

ChartJS.register(
  ArcElement, BarController, BarElement, CategoryScale, DoughnutController,
  Legend, LineController, LineElement, LinearScale, PointElement, Tooltip,
);

export interface Series {
  label: string;
  data: number[];
  color: string;
  /** Doughnut/pie: one colour per slice, overriding `color`. */
  sliceColors?: string[];
}

interface Props {
  type: 'bar' | 'line' | 'doughnut';
  labels: string[];
  series: Series[];
  /** Horizontal bars, as the reference uses for per-rig and OEM breakdowns. */
  horizontal?: boolean;
  stacked?: boolean;
  height?: number;
  showLegend?: boolean;
  /** Doughnut only: text drawn in the centre. */
  centerText?: { value: string; caption: string };
}

/** Resolves a `--i-*` token (or any CSS colour) against the live theme. */
function resolve(el: HTMLElement, token: string): string {
  if (!token.startsWith('--')) return token;
  const v = getComputedStyle(el).getPropertyValue(token).trim();
  return v || '#888';
}

export default function Chart({
  type, labels, series, horizontal, stacked, height = 220, showLegend, centerText,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Callers build `labels`/`series` inline, so identity changes on every render.
  // Rebuilding the chart that often thrashes Chart.js's resize observer, so key
  // the effect on the data itself instead.
  const dataKey = useMemo(
    () => JSON.stringify([type, horizontal, stacked, showLegend, labels,
      series.map((s) => [s.label, s.color, s.sliceColors, s.data])]),
    [type, horizontal, stacked, showLegend, labels, series],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    const grid = resolve(wrap, '--i-border');
    const tick = resolve(wrap, '--i-muted');
    const datasets = series.map((s) => ({
      label: s.label,
      data: s.data,
      backgroundColor: s.sliceColors
        ? s.sliceColors.map((c) => resolve(wrap, c))
        : resolve(wrap, s.color),
      borderColor: resolve(wrap, s.color),
      borderWidth: type === 'line' ? 2 : 0,
      borderRadius: type === 'bar' ? 4 : 0,
      tension: 0.35,
      pointRadius: 0,
      fill: false,
    }));

    const chart = new ChartJS(canvas, {
      type,
      data: { labels, datasets },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        resizeDelay: 120,
        cutout: type === 'doughnut' ? '72%' : undefined,
        plugins: {
          legend: showLegend
            ? {
              display: true,
              position: 'bottom',
              labels: {
                boxWidth: 9, boxHeight: 9, font: { size: 11 }, color: tick,
              },
            }
            : { display: false },
          tooltip: { enabled: true },
        },
        scales: type === 'doughnut' ? undefined : {
          x: {
            stacked,
            grid: { display: !!horizontal, color: grid },
            border: { display: false },
            ticks: { color: tick, font: { size: 11 }, autoSkip: true, maxRotation: 0 },
          },
          y: {
            stacked,
            beginAtZero: true,
            grid: { display: !horizontal, color: grid },
            border: { display: false },
            ticks: { color: tick, font: { size: 11 }, precision: 0 },
          },
        },
      },
    });

    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataKey encodes every input
  }, [dataKey]);

  return (
    <div ref={wrapRef} className="insp-chart" style={{ height, position: 'relative' }}>
      <canvas ref={canvasRef} />
      {centerText && (
        <div className="insp-chart-center">
          <strong>{centerText.value}</strong>
          <span>{centerText.caption}</span>
        </div>
      )}
    </div>
  );
}
