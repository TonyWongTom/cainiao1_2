import React, { useState, useMemo } from 'react';
import { Period, Player } from '../types';
import { formatMonthDay } from '../utils/dateUtils';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

interface FinanceTrendChartProps {
  period: Period;
  players: Player[];
}

export const FinanceTrendChart: React.FC<FinanceTrendChartProps> = ({ period, players }) => {
  // 费用统计模式: 'total' (综合支出: 均摊底仓场地费 + 额外支出) | 'extra' (仅单场记录额外支出) | 'cumulative' (累计走势)
  const [costMode, setCostMode] = useState<'total' | 'extra' | 'cumulative'>('total');

  // 按日期时间正序排列打球场次
  const sortedSessions = useMemo(() => {
    if (!Array.isArray(period.sessions)) return [];
    return [...period.sessions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [period.sessions]);

  // 计算每场数据与财务指标
  const chartData = useMemo(() => {
    const totalSessionsCount = sortedSessions.length;
    const amortizedBaseCost = totalSessionsCount > 0 ? (period.courtCost || 0) / totalSessionsCount : 0;

    let cumAttendees = 0;
    let cumCost = 0;
    let cumIncome = 0;

    return sortedSessions.map((session, index) => {
      const attendeesCount = Array.isArray(session.attendees) ? session.attendees.length : 0;
      const extraCost = session.sessionCost || 0;
      const sessionTotalCost = amortizedBaseCost + extraCost;
      const sessionGrossIncome = Array.isArray(session.attendees)
        ? session.attendees.reduce((sum, a) => sum + (a.fee || 0), 0)
        : 0;
      const sessionNetIncome = sessionGrossIncome - extraCost;

      cumAttendees += attendeesCount;
      cumCost += sessionTotalCost;
      cumIncome += sessionGrossIncome;

      const displayDate = formatMonthDay(session.date) || `第${index + 1}场`;

      return {
        id: session.id,
        index: index + 1,
        date: session.date,
        name: `${displayDate}`,
        shortLabel: `${displayDate}`,
        fullTitle: `${displayDate} (第${index + 1}场)`,
        attendeesCount,
        extraCost,
        totalCost: Number(sessionTotalCost.toFixed(1)),
        grossIncome: sessionGrossIncome,
        netIncome: sessionNetIncome,
        cumAttendees,
        cumCost: Number(cumCost.toFixed(1)),
        cumIncome: Number(cumIncome.toFixed(1)),
        amortizedBaseCost: Number(amortizedBaseCost.toFixed(1)),
        attendees: session.attendees || []
      };
    });
  }, [sortedSessions, period.courtCost]);

  // 综合健康度指标统计
  const healthStats = useMemo(() => {
    if (chartData.length === 0) {
      return {
        totalSessions: 0,
        avgAttendees: 0,
        maxAttendeesSession: null as any,
        minAttendeesSession: null as any,
        totalExtraCost: 0,
        totalPeriodCost: period.courtCost || 0,
        totalNetIncome: 0,
        costPerPersonSession: 0,
        healthRating: '暂无数据',
        healthColor: 'text-gray-500',
        healthBg: 'bg-gray-100',
        healthDesc: '当前周期暂未录入打球记录'
      };
    }

    const totalSessions = chartData.length;
    const totalAttendees = chartData.reduce((sum, d) => sum + d.attendeesCount, 0);
    const avgAttendees = (totalAttendees / totalSessions).toFixed(1);
    const totalExtraCost = chartData.reduce((sum, d) => sum + d.extraCost, 0);
    const totalGross = chartData.reduce((sum, d) => sum + d.grossIncome, 0);
    const totalNetIncome = totalGross - totalExtraCost;
    const totalExpenses = period.courtCost || 0;
    const surplus = totalNetIncome - totalExpenses;

    const maxAttendeesSession = [...chartData].sort((a, b) => b.attendeesCount - a.attendeesCount)[0];
    const minAttendeesSession = [...chartData].sort((a, b) => a.attendeesCount - b.attendeesCount)[0];

    const costPerPersonSession = totalAttendees > 0
      ? ((totalExpenses + totalExtraCost) / totalAttendees).toFixed(1)
      : '0.0';

    // 财务健康度评价
    let healthRating = '稳健良好';
    let healthColor = 'text-emerald-700';
    let healthBg = 'bg-emerald-50 border-emerald-200';
    let healthDesc = '净余收入能够有效平衡场地投入，财务运行健康。';

    if (surplus >= 100) {
      healthRating = '极佳充盈 🌟';
      healthColor = 'text-emerald-800';
      healthBg = 'bg-emerald-100/80 border-emerald-300';
      healthDesc = `累计净余 ¥${surplus.toFixed(2)}，公费储备充足，集资人有可观返款。`;
    } else if (surplus >= 0) {
      healthRating = '收支平衡 🟢';
      healthColor = 'text-teal-800';
      healthBg = 'bg-teal-50 border-teal-200';
      healthDesc = `累计略盈 ¥${surplus.toFixed(2)}，出勤人数与成本支出基本持平。`;
    } else if (surplus >= -200) {
      healthRating = '轻微超支 🟡';
      healthColor = 'text-amber-800';
      healthBg = 'bg-amber-50 border-amber-200';
      healthDesc = `当前尚有 ¥${Math.abs(surplus).toFixed(2)} 缺口，可通过增加场次出勤或吸纳次卡分摊。`;
    } else {
      healthRating = '成本承压 🔴';
      healthColor = 'text-rose-800';
      healthBg = 'bg-rose-50 border-rose-200';
      healthDesc = `当前超支 ¥${Math.abs(surplus).toFixed(2)}，建议关注出勤人数下滑或控制单场额外加费。`;
    }

    return {
      totalSessions,
      totalAttendees,
      avgAttendees,
      maxAttendeesSession,
      minAttendeesSession,
      totalExtraCost,
      totalPeriodCost: totalExpenses,
      totalNetIncome,
      surplus,
      costPerPersonSession,
      healthRating,
      healthColor,
      healthBg,
      healthDesc
    };
  }, [chartData, period.courtCost]);

  // 自定义 Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/90 backdrop-blur-md text-white p-3 rounded-xl shadow-2xl border border-white/20 text-xs max-w-[220px]">
          <div className="font-black text-emerald-400 pb-1 mb-1 border-b border-white/10 flex justify-between items-center">
            <span>{data.fullTitle}</span>
            <span className="text-[10px] text-gray-300">#{data.index}</span>
          </div>

          <div className="space-y-1 my-1.5">
            <div className="flex justify-between items-center text-emerald-300 font-bold">
              <span>👥 参与人数:</span>
              <span className="text-sm font-black">{data.attendeesCount} 人</span>
            </div>

            {costMode === 'cumulative' ? (
              <>
                <div className="flex justify-between items-center text-rose-300">
                  <span>📉 累计总支出:</span>
                  <span className="font-bold">¥{data.cumCost}</span>
                </div>
                <div className="flex justify-between items-center text-teal-300">
                  <span>📈 累计实收款:</span>
                  <span className="font-bold">¥{data.cumIncome}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center text-rose-300">
                  <span>💰 {costMode === 'total' ? '单场全含支出:' : '当场额外支出:'}</span>
                  <span className="font-bold">
                    ¥{costMode === 'total' ? data.totalCost : data.extraCost}
                  </span>
                </div>
                {costMode === 'total' && (
                  <div className="text-[9px] text-gray-400 pl-2">
                    (含底仓均摊 ¥{data.amortizedBaseCost} + 额外 ¥{data.extraCost})
                  </div>
                )}
                <div className="flex justify-between items-center text-gray-300 pt-1 border-t border-white/10 text-[10px]">
                  <span>当场收取费用:</span>
                  <span className="text-emerald-400 font-bold">¥{data.grossIncome}</span>
                </div>
              </>
            )}
          </div>

          {data.attendees && data.attendees.length > 0 && (
            <div className="mt-2 pt-1 border-t border-white/10 text-[9px] text-gray-300">
              <span className="text-gray-400">出勤成员: </span>
              {data.attendees.slice(0, 5).map((a: any) => {
                const p = players.find(x => x.id === a.playerId);
                return p ? p.name : '';
              }).filter(Boolean).join('、')}
              {data.attendees.length > 5 && ` 等${data.attendees.length}人`}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <div className="bg-white/30 backdrop-blur-md rounded-3xl p-5 border border-white/40 shadow-sm text-center py-8">
        <div className="text-3xl mb-2">📉</div>
        <p className="text-xs font-black text-emerald-900 mb-1">暂无场次走势数据</p>
        <p className="text-[10px] text-emerald-800/70">
          当期尚未录入打球记录，在「结算」页面录入场次后即可自动生成出勤与费用趋势对比图
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/30 backdrop-blur-md rounded-3xl p-4 sm:p-5 border border-white/40 shadow-sm space-y-4">
      {/* 头部标题与控制切换 */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-4 bg-emerald-600 rounded-full"></span>
            <h3 className="text-sm font-black text-emerald-950 tracking-tight">
              参与人数与费用支出趋势对比
            </h3>
          </div>
          <p className="text-[10px] text-emerald-800/70 mt-0.5 ml-3 font-medium">
            监测各场次出勤走势与成本消耗，直观研判俱乐部运营与财务健康度
          </p>
        </div>

        {/* 模式选择标签 */}
        <div className="flex bg-black/10 backdrop-blur-md p-0.5 rounded-xl border border-white/30 self-start sm:self-auto text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setCostMode('total')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              costMode === 'total'
                ? 'bg-white text-emerald-950 shadow-sm'
                : 'text-emerald-900/70 hover:text-emerald-950'
            }`}
          >
            单场全含支出
          </button>
          <button
            type="button"
            onClick={() => setCostMode('extra')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              costMode === 'extra'
                ? 'bg-white text-emerald-950 shadow-sm'
                : 'text-emerald-900/70 hover:text-emerald-950'
            }`}
          >
            单场额外支出
          </button>
          <button
            type="button"
            onClick={() => setCostMode('cumulative')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              costMode === 'cumulative'
                ? 'bg-white text-emerald-950 shadow-sm'
                : 'text-emerald-900/70 hover:text-emerald-950'
            }`}
          >
            累计趋势
          </button>
        </div>
      </div>

      {/* 图例提示 bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] font-bold">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-emerald-700">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block ring-2 ring-emerald-200"></span>
            <span>{costMode === 'cumulative' ? '累计出勤 (人次)' : '参与人数 (人)'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-600">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block ring-2 ring-rose-200"></span>
            <span>
              {costMode === 'cumulative'
                ? '累计支出 (元)'
                : costMode === 'total'
                ? '单场总支出 (元)'
                : '额外加场费 (元)'}
            </span>
          </div>
        </div>

        <span className="text-[10px] text-gray-500">
          共 {chartData.length} 场记录
        </span>
      </div>

      {/* 折线图本体容器 */}
      <div className="w-full h-64 sm:h-72 bg-white/40 backdrop-blur-md rounded-2xl p-2 sm:p-3 border border-white/50 shadow-inner">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 12, right: 12, left: -16, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.6} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: '#064e3b', fontWeight: 'bold' }}
              axisLine={{ stroke: '#94a3b8' }}
              tickLine={{ stroke: '#94a3b8' }}
            />
            {/* 左轴: 参与人数 */}
            <YAxis
              yAxisId="left"
              dataKey={costMode === 'cumulative' ? 'cumAttendees' : 'attendeesCount'}
              orientation="left"
              allowDecimals={false}
              tick={{ fontSize: 10, fill: '#059669', fontWeight: 'bold' }}
              axisLine={{ stroke: '#10b981' }}
              tickLine={{ stroke: '#10b981' }}
              unit="人"
            />
            {/* 右轴: 费用支出 */}
            <YAxis
              yAxisId="right"
              dataKey={
                costMode === 'cumulative'
                  ? 'cumCost'
                  : costMode === 'total'
                  ? 'totalCost'
                  : 'extraCost'
              }
              orientation="right"
              allowDecimals={false}
              tick={{ fontSize: 10, fill: '#e11d48', fontWeight: 'bold' }}
              axisLine={{ stroke: '#f43f5e' }}
              tickLine={{ stroke: '#f43f5e' }}
              unit="¥"
            />
            <Tooltip content={<CustomTooltip />} />

            {/* 折线 1: 参与人数 (绿轴) */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey={costMode === 'cumulative' ? 'cumAttendees' : 'attendeesCount'}
              name={costMode === 'cumulative' ? '累计出勤人次' : '参与人数'}
              stroke="#059669"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: '#047857', stroke: '#a7f3d0', strokeWidth: 3 }}
            />

            {/* 折线 2: 费用支出 (红/玫轴) */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey={
                costMode === 'cumulative'
                  ? 'cumCost'
                  : costMode === 'total'
                  ? 'totalCost'
                  : 'extraCost'
              }
              name={
                costMode === 'cumulative'
                  ? '累计支出'
                  : costMode === 'total'
                  ? '单场总支出'
                  : '额外支出'
              }
              stroke="#e11d48"
              strokeWidth={2.5}
              strokeDasharray={costMode === 'extra' ? '4 2' : undefined}
              dot={{ r: 4, fill: '#e11d48', stroke: '#ffffff', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: '#be123c', stroke: '#fecdd3', strokeWidth: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 财务健康度深度研判卡片 */}
      <div className={`p-3.5 rounded-2xl border ${healthStats.healthBg} transition-all`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🩺</span>
            <span className="text-xs font-black text-gray-900">俱乐部财务健康度诊断</span>
          </div>
          <span className={`text-[11px] font-black px-2 py-0.5 rounded-full bg-white/80 shadow-xs border border-white/60 ${healthStats.healthColor}`}>
            {healthStats.healthRating}
          </span>
        </div>

        <p className="text-[11px] text-gray-700 leading-relaxed font-medium mb-3">
          {healthStats.healthDesc}
        </p>

        {/* 关键指标矩阵 */}
        <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-black/5">
          <div className="bg-white/70 rounded-xl p-2 border border-white/60">
            <p className="text-[9px] text-gray-500 font-bold uppercase">场均参与</p>
            <p className="text-xs font-black text-emerald-800 mt-0.5">
              {healthStats.avgAttendees} <span className="text-[8px] font-normal">人/场</span>
            </p>
          </div>
          <div className="bg-white/70 rounded-xl p-2 border border-white/60">
            <p className="text-[9px] text-gray-500 font-bold uppercase">均摊人次成本</p>
            <p className="text-xs font-black text-rose-800 mt-0.5">
              ¥{healthStats.costPerPersonSession} <span className="text-[8px] font-normal">/人·次</span>
            </p>
          </div>
          <div className="bg-white/70 rounded-xl p-2 border border-white/60">
            <p className="text-[9px] text-gray-500 font-bold uppercase">最高出勤场</p>
            <p className="text-xs font-black text-teal-800 mt-0.5 truncate">
              {healthStats.maxAttendeesSession ? `${healthStats.maxAttendeesSession.attendeesCount}人` : '-'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinanceTrendChart;
