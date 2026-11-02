import React, { useState, useMemo } from 'react';
import { Period, Player } from '../types';
import { formatMonthDay } from '../utils/dateUtils';

interface PeriodCompareViewProps {
  periods: Period[];
  players: Player[];
  defaultPeriodAId?: string;
  defaultPeriodBId?: string;
}

interface PeriodMetrics {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  sessionsCount: number;
  courtCost: number;
  sessionCosts: number;
  totalExpenses: number;
  grossIncome: number;
  netIncome: number;
  surplus: number;
  uniqueAttendeesCount: number;
  totalAttendeeSessions: number;
  avgAttendeesPerSession: number;
  costPerUniquePlayer: number;
  costPerAttendeeSession: number;
  funderCount: number;
  investmentPerFunder: number;
  refundPerFunder: number;
  surplusPerFunder: number;
}

const calculateMetrics = (period: Period | null | undefined): PeriodMetrics | null => {
  if (!period) return null;
  const sessions = Array.isArray(period.sessions) ? period.sessions : [];
  const baseCourtCost = period.courtCost || 0;

  const grossIncome = sessions.reduce((acc, s) => {
    return acc + (Array.isArray(s.attendees) ? s.attendees.reduce((sum, a) => sum + (a.fee || 0), 0) : 0);
  }, 0);

  const sessionCosts = sessions.reduce((acc, s) => acc + (s.sessionCost || 0), 0);
  const totalExpenses = baseCourtCost + sessionCosts;
  const netIncome = grossIncome - sessionCosts;
  const surplus = netIncome - baseCourtCost;

  const uniqueAttendeeIds = new Set<string>();
  let totalAttendeeSessions = 0;
  sessions.forEach(s => {
    if (Array.isArray(s.attendees)) {
      s.attendees.forEach(a => {
        if (a.playerId) uniqueAttendeeIds.add(a.playerId);
        totalAttendeeSessions += 1;
      });
    }
  });

  const uniqueAttendeesCount = uniqueAttendeeIds.size;
  const sessionsCount = sessions.length;
  const avgAttendeesPerSession = sessionsCount > 0 ? totalAttendeeSessions / sessionsCount : 0;

  // Metric 1: Cost per unique player (总费用 / 实际出勤独立人数)
  const costPerUniquePlayer = uniqueAttendeesCount > 0 ? totalExpenses / uniqueAttendeesCount : 0;

  // Metric 2: Cost per attendee session (场均人次成本 = 总费用 / 总出勤人次)
  const costPerAttendeeSession = totalAttendeeSessions > 0 ? totalExpenses / totalAttendeeSessions : 0;

  const funderCount = Array.isArray(period.funderIds) ? period.funderIds.length : 0;
  const investmentPerFunder = funderCount > 0 ? baseCourtCost / funderCount : 0;
  const refundPerFunder = funderCount > 0 ? netIncome / funderCount : 0;
  const surplusPerFunder = funderCount > 0 ? (refundPerFunder - investmentPerFunder) : 0;

  return {
    id: period.id,
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
    sessionsCount,
    courtCost: baseCourtCost,
    sessionCosts,
    totalExpenses,
    grossIncome,
    netIncome,
    surplus,
    uniqueAttendeesCount,
    totalAttendeeSessions,
    avgAttendeesPerSession,
    costPerUniquePlayer,
    costPerAttendeeSession,
    funderCount,
    investmentPerFunder,
    refundPerFunder,
    surplusPerFunder
  };
};

export const PeriodCompareView: React.FC<PeriodCompareViewProps> = ({
  periods,
  players,
  defaultPeriodAId,
  defaultPeriodBId
}) => {
  const sortedPeriods = useMemo(() => {
    if (!Array.isArray(periods)) return [];
    return [...periods].sort((a, b) => {
      const comp = (b.startDate || '').localeCompare(a.startDate || '');
      if (comp !== 0) return comp;
      const aOngoing = !a.endDate ? 1 : 0;
      const bOngoing = !b.endDate ? 1 : 0;
      return bOngoing - aOngoing;
    });
  }, [periods]);

  const [periodAId, setPeriodAId] = useState<string>(() => {
    if (defaultPeriodAId && periods.some(p => p.id === defaultPeriodAId)) {
      return defaultPeriodAId;
    }
    return sortedPeriods[0]?.id || '';
  });

  const [periodBId, setPeriodBId] = useState<string>(() => {
    if (defaultPeriodBId && periods.some(p => p.id === defaultPeriodBId) && defaultPeriodBId !== defaultPeriodAId) {
      return defaultPeriodBId;
    }
    if (sortedPeriods.length > 1) {
      return sortedPeriods[1].id;
    }
    return sortedPeriods[0]?.id || '';
  });

  const periodA = useMemo(() => periods.find(p => p.id === periodAId) || null, [periods, periodAId]);
  const periodB = useMemo(() => periods.find(p => p.id === periodBId) || null, [periods, periodBId]);

  const metricsA = useMemo(() => calculateMetrics(periodA), [periodA]);
  const metricsB = useMemo(() => calculateMetrics(periodB), [periodB]);

  const handleSwap = () => {
    const temp = periodAId;
    setPeriodAId(periodBId);
    setPeriodBId(temp);
  };

  if (!Array.isArray(periods) || periods.length < 2) {
    return (
      <div className="bg-white/20 backdrop-blur-md rounded-3xl p-8 border border-white/30 text-center text-emerald-900">
        <div className="text-4xl mb-3">⚖️</div>
        <h3 className="text-sm font-black mb-1">需至少 2 个结算周期进行对比</h3>
        <p className="text-xs text-emerald-800/70 font-medium">当前系统中结算周期数量不足，请先在“结算”模块创建多个结算周期。</p>
      </div>
    );
  }

  // Format difference helper
  const renderDelta = (
    valA: number,
    valB: number,
    format: 'currency' | 'number' | 'people' | 'times',
    type: 'lower-is-better' | 'higher-is-better' = 'higher-is-better'
  ) => {
    const delta = valA - valB;
    if (Math.abs(delta) < 0.001) {
      return (
        <span className="text-[10px] bg-gray-100 text-gray-500 font-black px-2 py-0.5 rounded-full border border-gray-200">
          持平
        </span>
      );
    }

    const isPositive = delta > 0;
    const isFavorable = type === 'lower-is-better' ? !isPositive : isPositive;

    let deltaStr = '';
    if (format === 'currency') {
      deltaStr = `${isPositive ? '+' : ''}¥${delta.toFixed(2)}`;
    } else if (format === 'people') {
      deltaStr = `${isPositive ? '+' : ''}${delta}人`;
    } else if (format === 'times') {
      deltaStr = `${isPositive ? '+' : ''}${delta}人次`;
    } else {
      deltaStr = `${isPositive ? '+' : ''}${delta.toFixed(1)}`;
    }

    const percent = valB > 0 ? ((delta / valB) * 100).toFixed(1) : null;

    return (
      <div className="flex flex-col items-end">
        <span
          className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-0.5 border ${
            isFavorable
              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
              : 'bg-rose-100 text-rose-900 border-rose-300'
          }`}
        >
          {isPositive ? '↑' : '↓'} {deltaStr}
        </span>
        {percent && (
          <span className="text-[9px] text-gray-500 font-bold mt-0.5">
            {isPositive ? '+' : ''}{percent}%
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 周期选择与切换卡片 */}
      <div className="bg-white/30 backdrop-blur-md p-4 rounded-3xl border border-white/40 shadow-sm">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
            <span>⚖️</span> 选择对比结算周期
          </span>
          <button
            type="button"
            onClick={handleSwap}
            className="text-[10px] bg-white/50 hover:bg-white text-emerald-900 border border-white/50 px-2.5 py-1 rounded-xl font-black shadow-sm flex items-center gap-1 active:scale-95 transition-all"
            title="对调周期A与周期B"
          >
            <span>⇄</span> 对调比较
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 周期 A 选择 */}
          <div className="bg-emerald-500/10 p-3 rounded-2xl border border-emerald-300/40">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black text-emerald-900 uppercase tracking-widest flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 基准周期 A
              </span>
              <span className="text-[9px] text-emerald-800 font-bold">
                {periodA?.endDate ? `${periodA.startDate} ~ ${periodA.endDate}` : '进行中'}
              </span>
            </div>
            <select
              value={periodAId}
              onChange={(e) => setPeriodAId(e.target.value)}
              className="w-full bg-white border border-emerald-300 text-emerald-950 text-xs font-black rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm cursor-pointer truncate"
            >
              {sortedPeriods.map(p => (
                <option key={p.id} value={p.id} disabled={p.id === periodBId}>
                  {p.name} {p.id === periodBId ? '(已在周期B选中)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 周期 B 选择 */}
          <div className="bg-blue-500/10 p-3 rounded-2xl border border-blue-300/40">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black text-blue-900 uppercase tracking-widest flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span> 对比周期 B
              </span>
              <span className="text-[9px] text-blue-800 font-bold">
                {periodB?.endDate ? `${periodB.startDate} ~ ${periodB.endDate}` : '进行中'}
              </span>
            </div>
            <select
              value={periodBId}
              onChange={(e) => setPeriodBId(e.target.value)}
              className="w-full bg-white border border-blue-300 text-blue-950 text-xs font-black rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer truncate"
            >
              {sortedPeriods.map(p => (
                <option key={p.id} value={p.id} disabled={p.id === periodAId}>
                  {p.name} {p.id === periodAId ? '(已在周期A选中)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {metricsA && metricsB && (
        <>
          {/* 三大关键对比卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 卡片 1: 总费用对比 */}
            <div className="bg-white/20 backdrop-blur-md p-4 rounded-3xl border border-white/30 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">💰 场地总费用</span>
                {renderDelta(metricsA.totalExpenses, metricsB.totalExpenses, 'currency', 'lower-is-better')}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-white/20">
                <div>
                  <p className="text-[9px] text-emerald-800/70 font-bold truncate">A: {metricsA.name}</p>
                  <p className="text-base font-black text-emerald-950">¥{metricsA.totalExpenses.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-blue-800/70 font-bold truncate">B: {metricsB.name}</p>
                  <p className="text-base font-black text-blue-950">¥{metricsB.totalExpenses.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* 卡片 2: 出勤人数对比 */}
            <div className="bg-white/20 backdrop-blur-md p-4 rounded-3xl border border-white/30 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">👥 独立出勤人数</span>
                {renderDelta(metricsA.uniqueAttendeesCount, metricsB.uniqueAttendeesCount, 'people', 'higher-is-better')}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-white/20">
                <div>
                  <p className="text-[9px] text-emerald-800/70 font-bold truncate">A: {metricsA.name}</p>
                  <p className="text-base font-black text-emerald-950">{metricsA.uniqueAttendeesCount} 人</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-blue-800/70 font-bold truncate">B: {metricsB.name}</p>
                  <p className="text-base font-black text-blue-950">{metricsB.uniqueAttendeesCount} 人</p>
                </div>
              </div>
            </div>

            {/* 卡片 3: 人均成本对比 (独立出勤人均) */}
            <div className="bg-white/20 backdrop-blur-md p-4 rounded-3xl border border-white/30 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">🎯 独立出勤人均成本</span>
                {renderDelta(metricsA.costPerUniquePlayer, metricsB.costPerUniquePlayer, 'currency', 'lower-is-better')}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-white/20">
                <div>
                  <p className="text-[9px] text-emerald-800/70 font-bold truncate">A: {metricsA.name}</p>
                  <p className="text-base font-black text-emerald-950">¥{metricsA.costPerUniquePlayer.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-blue-800/70 font-bold truncate">B: {metricsB.name}</p>
                  <p className="text-base font-black text-blue-950">¥{metricsB.costPerUniquePlayer.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* 综合指标并排对比表 */}
          <div className="bg-white/20 backdrop-blur-md rounded-3xl overflow-hidden border border-white/30 shadow-sm">
            <div className="bg-white/10 px-4 py-3 border-b border-white/20 flex items-center justify-between">
              <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                <span>📋</span> 双周期全指标对照表
              </span>
              <span className="text-[10px] text-emerald-800/70 font-bold">
                差额 = A期数值 - B期数值
              </span>
            </div>

            <div className="divide-y divide-white/15 text-xs">
              {/* 表头 */}
              <div className="grid grid-cols-12 px-4 py-2 bg-white/10 text-[9px] font-black text-emerald-900 uppercase tracking-wider">
                <div className="col-span-5 sm:col-span-4">对比维度</div>
                <div className="col-span-2 sm:col-span-3 text-center truncate font-bold text-emerald-800">A: {metricsA.name}</div>
                <div className="col-span-2 sm:col-span-3 text-center truncate font-bold text-blue-800">B: {metricsB.name}</div>
                <div className="col-span-3 sm:col-span-2 text-right">差异 (A - B)</div>
              </div>

              {/* 维度 1: 周期场地总费用 */}
              <div className="grid grid-cols-12 px-4 py-3 items-center hover:bg-white/10 transition-colors">
                <div className="col-span-5 sm:col-span-4 pr-1">
                  <div className="font-black text-emerald-950">周期总费用</div>
                  <div className="text-[9px] text-gray-500 font-medium">基础场地费 + 单场加支</div>
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black text-emerald-900">
                  ¥{metricsA.totalExpenses.toFixed(2)}
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black text-blue-900">
                  ¥{metricsB.totalExpenses.toFixed(2)}
                </div>
                <div className="col-span-3 sm:col-span-2 text-right">
                  {renderDelta(metricsA.totalExpenses, metricsB.totalExpenses, 'currency', 'lower-is-better')}
                </div>
              </div>

              {/* 基础场地费 */}
              <div className="grid grid-cols-12 px-4 py-2.5 items-center hover:bg-white/10 transition-colors bg-white/5 text-[11px]">
                <div className="col-span-5 sm:col-span-4 pl-2 text-gray-600 font-bold">
                  └ 基础场地包场费
                </div>
                <div className="col-span-2 sm:col-span-3 text-center text-gray-700 font-mono font-bold">
                  ¥{metricsA.courtCost.toFixed(2)}
                </div>
                <div className="col-span-2 sm:col-span-3 text-center text-gray-700 font-mono font-bold">
                  ¥{metricsB.courtCost.toFixed(2)}
                </div>
                <div className="col-span-3 sm:col-span-2 text-right">
                  {renderDelta(metricsA.courtCost, metricsB.courtCost, 'currency', 'lower-is-better')}
                </div>
              </div>

              {/* 单场额外加支 */}
              <div className="grid grid-cols-12 px-4 py-2.5 items-center hover:bg-white/10 transition-colors bg-white/5 text-[11px]">
                <div className="col-span-5 sm:col-span-4 pl-2 text-gray-600 font-bold">
                  └ 单场额外加支合计
                </div>
                <div className="col-span-2 sm:col-span-3 text-center text-gray-700 font-mono font-bold">
                  ¥{metricsA.sessionCosts.toFixed(2)}
                </div>
                <div className="col-span-2 sm:col-span-3 text-center text-gray-700 font-mono font-bold">
                  ¥{metricsB.sessionCosts.toFixed(2)}
                </div>
                <div className="col-span-3 sm:col-span-2 text-right">
                  {renderDelta(metricsA.sessionCosts, metricsB.sessionCosts, 'currency', 'lower-is-better')}
                </div>
              </div>

              {/* 维度 2: 实际出勤独立人数 */}
              <div className="grid grid-cols-12 px-4 py-3 items-center hover:bg-white/10 transition-colors">
                <div className="col-span-5 sm:col-span-4 pr-1">
                  <div className="font-black text-emerald-950">实际出勤独立人数</div>
                  <div className="text-[9px] text-gray-500 font-medium">周期内去重打球球友数</div>
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black text-emerald-900">
                  {metricsA.uniqueAttendeesCount} 人
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black text-blue-900">
                  {metricsB.uniqueAttendeesCount} 人
                </div>
                <div className="col-span-3 sm:col-span-2 text-right">
                  {renderDelta(metricsA.uniqueAttendeesCount, metricsB.uniqueAttendeesCount, 'people', 'higher-is-better')}
                </div>
              </div>

              {/* 维度 3: 总出勤人次 */}
              <div className="grid grid-cols-12 px-4 py-3 items-center hover:bg-white/10 transition-colors">
                <div className="col-span-5 sm:col-span-4 pr-1">
                  <div className="font-black text-emerald-950">总出勤人次</div>
                  <div className="text-[9px] text-gray-500 font-medium">所有场次到场签到累计人次</div>
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black text-emerald-900">
                  {metricsA.totalAttendeeSessions} 人次
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black text-blue-900">
                  {metricsB.totalAttendeeSessions} 人次
                </div>
                <div className="col-span-3 sm:col-span-2 text-right">
                  {renderDelta(metricsA.totalAttendeeSessions, metricsB.totalAttendeeSessions, 'times', 'higher-is-better')}
                </div>
              </div>

              {/* 打球场次 */}
              <div className="grid grid-cols-12 px-4 py-2.5 items-center hover:bg-white/10 transition-colors bg-white/5 text-[11px]">
                <div className="col-span-5 sm:col-span-4 pl-2 text-gray-600 font-bold">
                  └ 组织打球总场次
                </div>
                <div className="col-span-2 sm:col-span-3 text-center text-gray-700 font-mono font-bold">
                  {metricsA.sessionsCount} 场
                </div>
                <div className="col-span-2 sm:col-span-3 text-center text-gray-700 font-mono font-bold">
                  {metricsB.sessionsCount} 场
                </div>
                <div className="col-span-3 sm:col-span-2 text-right">
                  {renderDelta(metricsA.sessionsCount, metricsB.sessionsCount, 'number', 'higher-is-better')}
                </div>
              </div>

              {/* 维度 4: 独立出勤人均成本 */}
              <div className="grid grid-cols-12 px-4 py-3 items-center hover:bg-white/10 transition-colors bg-amber-500/5">
                <div className="col-span-5 sm:col-span-4 pr-1">
                  <div className="font-black text-amber-950 flex items-center gap-1">
                    <span>🎯</span> 独立出勤人均成本
                  </div>
                  <div className="text-[9px] text-amber-800/80 font-medium">口径一：总费用 ÷ 独立出勤人数</div>
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black text-amber-900 font-mono">
                  ¥{metricsA.costPerUniquePlayer.toFixed(2)}
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black text-blue-900 font-mono">
                  ¥{metricsB.costPerUniquePlayer.toFixed(2)}
                </div>
                <div className="col-span-3 sm:col-span-2 text-right">
                  {renderDelta(metricsA.costPerUniquePlayer, metricsB.costPerUniquePlayer, 'currency', 'lower-is-better')}
                </div>
              </div>

              {/* 维度 5: 场均人次成本 */}
              <div className="grid grid-cols-12 px-4 py-3 items-center hover:bg-white/10 transition-colors bg-amber-500/5">
                <div className="col-span-5 sm:col-span-4 pr-1">
                  <div className="font-black text-amber-950 flex items-center gap-1">
                    <span>⏱️</span> 场均人次成本
                  </div>
                  <div className="text-[9px] text-amber-800/80 font-medium">口径二：总费用 ÷ 总出勤人次</div>
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black text-amber-900 font-mono">
                  ¥{metricsA.costPerAttendeeSession.toFixed(2)}
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black text-blue-900 font-mono">
                  ¥{metricsB.costPerAttendeeSession.toFixed(2)}
                </div>
                <div className="col-span-3 sm:col-span-2 text-right">
                  {renderDelta(metricsA.costPerAttendeeSession, metricsB.costPerAttendeeSession, 'currency', 'lower-is-better')}
                </div>
              </div>

              {/* 维度 6: 财务总结余 */}
              <div className="grid grid-cols-12 px-4 py-3 items-center hover:bg-white/10 transition-colors">
                <div className="col-span-5 sm:col-span-4 pr-1">
                  <div className="font-black text-emerald-950">财务净余收益/总结余</div>
                  <div className="text-[9px] text-gray-500 font-medium">净总收入 - 基础场地成本</div>
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black font-mono text-emerald-950">
                  ¥{metricsA.surplus.toFixed(2)}
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black font-mono text-blue-950">
                  ¥{metricsB.surplus.toFixed(2)}
                </div>
                <div className="col-span-3 sm:col-span-2 text-right">
                  {renderDelta(metricsA.surplus, metricsB.surplus, 'currency', 'higher-is-better')}
                </div>
              </div>

              {/* 维度 7: 集资人预付投入 (每人) */}
              <div className="grid grid-cols-12 px-4 py-3 items-center hover:bg-white/10 transition-colors">
                <div className="col-span-5 sm:col-span-4 pr-1">
                  <div className="font-black text-emerald-950">集资人预付投入 (每人)</div>
                  <div className="text-[9px] text-gray-500 font-medium">A期 {metricsA.funderCount}人 / B期 {metricsB.funderCount}人</div>
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black font-mono text-emerald-900">
                  ¥{metricsA.investmentPerFunder.toFixed(2)}
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black font-mono text-blue-900">
                  ¥{metricsB.investmentPerFunder.toFixed(2)}
                </div>
                <div className="col-span-3 sm:col-span-2 text-right">
                  {renderDelta(metricsA.investmentPerFunder, metricsB.investmentPerFunder, 'currency', 'lower-is-better')}
                </div>
              </div>

              {/* 维度 8: 集资人期末返款 (每人) */}
              <div className="grid grid-cols-12 px-4 py-3 items-center hover:bg-white/10 transition-colors">
                <div className="col-span-5 sm:col-span-4 pr-1">
                  <div className="font-black text-emerald-950">集资人期末返款 (每人)</div>
                  <div className="text-[9px] text-gray-500 font-medium">净总收入 ÷ 集资人数</div>
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black font-mono text-emerald-900">
                  ¥{metricsA.refundPerFunder.toFixed(2)}
                </div>
                <div className="col-span-2 sm:col-span-3 text-center font-black font-mono text-blue-900">
                  ¥{metricsB.refundPerFunder.toFixed(2)}
                </div>
                <div className="col-span-3 sm:col-span-2 text-right">
                  {renderDelta(metricsA.refundPerFunder, metricsB.refundPerFunder, 'currency', 'higher-is-better')}
                </div>
              </div>
            </div>
          </div>

          {/* 差异总结洞察 */}
          <div className="bg-emerald-500/10 border border-emerald-300/40 rounded-2xl p-4 text-xs text-emerald-950">
            <h4 className="font-black flex items-center gap-1.5 mb-1.5 text-emerald-900">
              <span>💡</span> 对比分析简报
            </h4>
            <div className="space-y-1 text-[11px] text-emerald-900/80 leading-relaxed font-medium">
              <p>
                • <strong>场地支出变动</strong>：【{metricsA.name}】较【{metricsB.name}】总费用
                {metricsA.totalExpenses >= metricsB.totalExpenses ? '增加' : '减少'}{' '}
                <strong className="font-black text-emerald-950">¥{Math.abs(metricsA.totalExpenses - metricsB.totalExpenses).toFixed(2)}</strong>。
              </p>
              <p>
                • <strong>出勤热度变动</strong>：独立出勤人数
                {metricsA.uniqueAttendeesCount >= metricsB.uniqueAttendeesCount ? '增长' : '减少'}{' '}
                <strong className="font-black text-emerald-950">{Math.abs(metricsA.uniqueAttendeesCount - metricsB.uniqueAttendeesCount)}人</strong>，
                出勤总人次{metricsA.totalAttendeeSessions >= metricsB.totalAttendeeSessions ? '增加' : '减少'}{' '}
                <strong className="font-black text-emerald-950">{Math.abs(metricsA.totalAttendeeSessions - metricsB.totalAttendeeSessions)}人次</strong>。
              </p>
              <p>
                • <strong>独立出勤人均摊销</strong>：从【{metricsB.name}】的 ¥{metricsB.costPerUniquePlayer.toFixed(2)}/人 变为【{metricsA.name}】的 ¥{metricsA.costPerUniquePlayer.toFixed(2)}/人
                （{metricsA.costPerUniquePlayer <= metricsB.costPerUniquePlayer ? '人均成本更加集约划算' : '人均摊销有所上升'}）。
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
