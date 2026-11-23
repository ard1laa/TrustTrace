import React, { useMemo } from 'react';
import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';
import { Radar } from 'react-chartjs-2';
import { computeAxisScores, resolveField } from '../../shared/skillTaxonomy.js';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

// Axes come from the holder's field of study (Computer Science, Biology, …).
export default function CompetencyRadarChart({ credentials = [], field, respectPrivacy = true, isDark = false, compact = false }) {
  const fieldDef = resolveField(field);
  const axes = useMemo(() => computeAxisScores(credentials, fieldDef.id, { respectPrivacy }), [credentials, fieldDef.id, respectPrivacy]);
  const hasData = axes.some((a) => a.count > 0);

  const data = {
    labels: axes.map((a) => a.axis),
    datasets: [
      {
        label: 'Verified skills',
        data: axes.map((a) => a.score),
        backgroundColor: 'rgba(10, 102, 194, 0.2)',
        borderColor: '#0A66C2',
        pointBackgroundColor: '#0A66C2',
        pointBorderColor: isDark ? '#1B1F23' : '#FFFFFF',
        borderWidth: 2,
        pointRadius: 3.5,
        pointHoverRadius: 5
      },
      {
        label: `${fieldDef.label} graduate benchmark`,
        data: axes.map((a) => a.benchmark),
        backgroundColor: 'transparent',
        borderColor: isDark ? '#6E7681' : '#A0A9B4',
        pointRadius: 0,
        borderDash: [4, 4],
        borderWidth: 1.5
      }
    ]
  };

  const textColor = isDark ? '#E6EDF3' : '#191919';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 450 },
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: { stepSize: 25, display: !compact, backdropColor: 'transparent', color: isDark ? '#8B949E' : '#8A8A8A', font: { size: 9 } },
        grid: { color: gridColor },
        angleLines: { color: gridColor },
        pointLabels: {
          color: textColor,
          font: { size: compact ? 10 : 11, weight: '600', family: 'Inter' },
          callback: (label) => {
            if (label.length <= 14) return label;
            const words = label.split(' ');
            const mid = Math.ceil(words.length / 2);
            return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
          }
        }
      }
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: isDark ? '#C9D1D9' : '#404040', font: { size: 11, family: 'Inter' }, boxWidth: 10, boxHeight: 10, padding: 12, usePointStyle: true }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => (ctx.datasetIndex === 0 ? ` ${ctx.raw}% · ${axes[ctx.dataIndex].count} credential(s)` : ` Benchmark ${ctx.raw}%`)
        }
      }
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="chip bg-[#EBF3FB] text-[#0A66C2] dark:bg-[#0A66C2]/20 dark:text-[#58A6FF]">{fieldDef.label}</span>
        {!hasData && <span className="text-[11px] text-[#666666] dark:text-[#8B949E]">No verified credentials yet</span>}
      </div>
      <div className={`${compact ? 'h-[240px]' : 'h-[300px]'} w-full`}>
        <Radar data={data} options={options} />
      </div>

      {!compact && (
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[#E0DFDC] dark:border-[#30363D]">
          {axes.map((a) => (
            <div key={a.axis} className="px-2.5 py-2 rounded-xl bg-[#F4F2EE]/70 dark:bg-[#0D1117] flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold truncate">{a.axis}</div>
                <div className="text-[10px] text-[#666666] dark:text-[#8B949E]">{a.count} credential{a.count === 1 ? '' : 's'}</div>
              </div>
              <span className={`text-xs font-bold tabular-nums ${a.score >= a.benchmark ? 'text-emerald-600 dark:text-emerald-400' : a.score > 0 ? 'text-[#0A66C2] dark:text-[#58A6FF]' : 'text-[#999]'}`}>
                {a.score}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
