import React, { useState, useMemo } from 'react';
import { Period, Player } from '../types';

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
      <div className="bg-white/20 backdrop-blur-md rounded-3xl p-8 border border-white/30 text-center text-emerald-900 animate-view-fade-in">
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

  // Structured metrics items for responsive rendering
  const comparisonItems = metricsA && metricsB ? [
    {
      id: 'total-expense',
      title: '周期总费用',
      subtitle: '基础场地费 + 单场加支',
      icon: '💰',
      valA: `¥${metricsA.totalExpenses.toFixed(2)}`,
      valB: `¥${metricsB.totalExpenses.toFixed(2)}`,
      deltaNode: renderDelta(metricsA.totalExpenses, metricsB.totalExpenses, 'currency', 'lower-is-better')
    },
    {
      id: 'court-cost',
      title: '基础场地包场费',
      subtitle: '固定底仓包场支出',
      icon: '🏟️',
      valA: `¥${metricsA.courtCost.toFixed(2)}`,
      valB: `¥${metricsB.courtCost.toFixed(2)}`,
      deltaNode: renderDelta(metricsA.courtCost, metricsB.courtCost, 'currency', 'lower-is-better')
    },
    {
      id: 'session-costs',
      title: '单场额外加支合计',
      subtitle: '用球、加时、加场等灵活支出',
      icon: '🏸',
      valA: `¥${metricsA.sessionCosts.toFixed(2)}`,
      valB: `¥${metricsB.sessionCosts.toFixed(2)}`,
      deltaNode: renderDelta(metricsA.sessionCosts, metricsB.sessionCosts, 'currency', 'lower-is-better')
    },
    {
      id: 'unique-attendees',
      title: '实际出勤独立人数',
      subtitle: '周期内去重打球球友数',
      icon: '👥',
      valA: `${metricsA.uniqueAttendeesCount} 人`,
      valB: `${metricsB.uniqueAttendeesCount} 人`,
      deltaNode: renderDelta(metricsA.uniqueAttendeesCount, metricsB.uniqueAttendeesCount, 'people', 'higher-is-better')
    },
    {
      id: 'total-sessions-attendees',
      title: '总出勤人次',
      subtitle: '所有场次到场签到累计人次',
      icon: '👟',
      valA: `${metricsA.totalAttendeeSessions} 人次`,
      valB: `${metricsB.totalAttendeeSessions} 人次`,
      deltaNode: renderDelta(metricsA.totalAttendeeSessions, metricsB.totalAttendeeSessions, 'times', 'higher-is-better')
    },
    {
      id: 'sessions-count',
      title: '组织打球总场次',
      subtitle: '周期内开展羽毛球活动的次数',
      icon: '📅',
      valA: `${metricsA.sessionsCount} 场`,
      valB: `${metricsB.sessionsCount} 场`,
      deltaNode: renderDelta(metricsA.sessionsCount, metricsB.sessionsCount, 'number', 'higher-is-better')
    },
    {
      id: 'avg-per-session',
      title: '场均出勤人数',
      subtitle: '每场羽毛球活动平均到场人数',
      icon: '📊',
      valA: `${metricsA.avgAttendeesPerSession.toFixed(1)} 人/场`,
      valB: `${metricsB.avgAttendeesPerSession.toFixed(1)} 人/场`,
      deltaNode: renderDelta(metricsA.avgAttendeesPerSession, metricsB.avgAttendeesPerSession, 'number', 'higher-is-better')
    },
    {
      id: 'cost-per-unique',
      title: '独立出勤人均成本',
      subtitle: '口径一：总费用 ÷ 独立出勤人数',
      icon: '🎯',
      valA: `¥${metricsA.costPerUniquePlayer.toFixed(2)}`,
      valB: `¥${metricsB.costPerUniquePlayer.toFixed(2)}`,
      deltaNode: renderDelta(metricsA.costPerUniquePlayer, metricsB.costPerUniquePlayer, 'currency', 'lower-is-better'),
      highlight: true
    },
    {
      id: 'cost-per-session-attendee',
      title: '场均人次成本',
      subtitle: '口径二：总费用 ÷ 总出勤人次',
      icon: '⏱️',
      valA: `¥${metricsA.costPerAttendeeSession.toFixed(2)}`,
      valB: `¥${metricsB.costPerAttendeeSession.toFixed(2)}`,
      deltaNode: renderDelta(metricsA.costPerAttendeeSession, metricsB.costPerAttendeeSession, 'currency', 'lower-is-better'),
      highlight: true
    },
    {
      id: 'surplus',
      title: '财务净余收益/总结余',
      subtitle: '净总收入 - 基础场地成本',
      icon: '📈',
      valA: `¥${metricsA.surplus.toFixed(2)}`,
      valB: `¥${metricsB.surplus.toFixed(2)}`,
      deltaNode: renderDelta(metricsA.surplus, metricsB.surplus, 'currency', 'higher-is-better')
    },
    {
      id: 'funder-investment',
      title: '集资人预付投入 (每人)',
      subtitle: `A期 ${metricsA.funderCount}人 / B期 ${metricsB.funderCount}人`,
      icon: '👑',
      valA: `¥${metricsA.investmentPerFunder.toFixed(2)}`,
      valB: `¥${metricsB.investmentPerFunder.toFixed(2)}`,
      deltaNode: renderDelta(metricsA.investmentPerFunder, metricsB.investmentPerFunder, 'currency', 'lower-is-better')
    },
    {
      id: 'funder-refund',
      title: '集资人期末返款 (每人)',
      subtitle: '净总收入 ÷ 集资人数',
      icon: '🎁',
      valA: `¥${metricsA.refundPerFunder.toFixed(2)}`,
      valB: `¥${metricsB.refundPerFunder.toFixed(2)}`,
      deltaNode: renderDelta(metricsA.refundPerFunder, metricsB.refundPerFunder, 'currency', 'higher-is-better')
    }
  ] : [];

  return (
    <div className="space-y-4 animate-tab-content">
      {/* 周期选择与切换卡片 */}
      <div className="bg-white/30 backdrop-blur-md p-3.5 sm:p-4 rounded-3xl border border-white/40 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
            <span>⚖️</span> 选择对比结算周期
          </span>
          <button
            type="button"
            onClick={handleSwap}
            className="text-[10px] bg-white/60 hover:bg-white text-emerald-900 border border-white/50 px-2.5 py-1 rounded-xl font-black shadow-sm flex items-center gap-1 active:scale-95 transition-all"
            title="对调周期A与周期B"
          >
            <span>⇄</span> 对调比较
          </button>
        </div>

        {/* 周期选择卡片：在手机端自适应分列与换行 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          {/* 周期 A 选择 */}
          <div className="bg-emerald-500/10 p-3 rounded-2xl border border-emerald-300/40">
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className="text-[10px] font-black text-emerald-900 uppercase tracking-widest flex items-center gap-1 shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 基准周期 A
              </span>
              <span className="text-[9px] text-emerald-800 font-bold truncate">
                {periodA?.endDate ? `${periodA.startDate} ~ ${periodA.endDate}` : '进行中'}
              </span>
            </div>
            <select
              value={periodAId}
              onChange={(e) => setPeriodAId(e.target.value)}
              className="w-full bg-white border border-emerald-300 text-emerald-950 text-xs font-black rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm cursor-pointer truncate box-border"
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
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className="text-[10px] font-black text-blue-900 uppercase tracking-widest flex items-center gap-1 shrink-0">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span> 对比周期 B
              </span>
              <span className="text-[9px] text-blue-800 font-bold truncate">
                {periodB?.endDate ? `${periodB.startDate} ~ ${periodB.endDate}` : '进行中'}
              </span>
            </div>
            <select
              value={periodBId}
              onChange={(e) => setPeriodBId(e.target.value)}
              className="w-full bg-white border border-blue-300 text-blue-950 text-xs font-black rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer truncate box-border"
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
          {/* 三大关键对比卡片：支持在手机端优雅排列与自适应 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
            {/* 卡片 1: 总费用对比 */}
            <div className="bg-white/25 backdrop-blur-md p-3.5 sm:p-4 rounded-3xl border border-white/30 shadow-sm transition-all hover:bg-white/30">
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-[10px] font-black text-emerald-900 uppercase tracking-widest flex items-center gap-1">
                  <span>💰</span> 场地总费用
                </span>
                {renderDelta(metricsA.totalExpenses, metricsB.totalExpenses, 'currency', 'lower-is-better')}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-white/20">
                <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-300/30">
                  <p className="text-[9px] text-emerald-800 font-bold truncate">A: {metricsA.name}</p>
                  <p className="text-sm sm:text-base font-black text-emerald-950 font-mono mt-0.5">¥{metricsA.totalExpenses.toFixed(2)}</p>
                </div>
                <div className="bg-blue-500/10 p-2 rounded-xl border border-blue-300/30 text-right">
                  <p className="text-[9px] text-blue-800 font-bold truncate">B: {metricsB.name}</p>
                  <p className="text-sm sm:text-base font-black text-blue-950 font-mono mt-0.5">¥{metricsB.totalExpenses.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* 卡片 2: 出勤人数对比 */}
            <div className="bg-white/25 backdrop-blur-md p-3.5 sm:p-4 rounded-3xl border border-white/30 shadow-sm transition-all hover:bg-white/30">
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-[10px] font-black text-emerald-900 uppercase tracking-widest flex items-center gap-1">
                  <span>👥</span> 独立出勤人数
                </span>
                {renderDelta(metricsA.uniqueAttendeesCount, metricsB.uniqueAttendeesCount, 'people', 'higher-is-better')}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-white/20">
                <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-300/30">
                  <p className="text-[9px] text-emerald-800 font-bold truncate">A: {metricsA.name}</p>
                  <p className="text-sm sm:text-base font-black text-emerald-950 font-mono mt-0.5">{metricsA.uniqueAttendeesCount} 人</p>
                </div>
                <div className="bg-blue-500/10 p-2 rounded-xl border border-blue-300/30 text-right">
                  <p className="text-[9px] text-blue-800 font-bold truncate">B: {metricsB.name}</p>
                  <p className="text-sm sm:text-base font-black text-blue-950 font-mono mt-0.5">{metricsB.uniqueAttendeesCount} 人</p>
                </div>
              </div>
            </div>

            {/* 卡片 3: 人均成本对比 (独立出勤人均) */}
            <div className="bg-white/25 backdrop-blur-md p-3.5 sm:p-4 rounded-3xl border border-white/30 shadow-sm transition-all hover:bg-white/30">
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-[10px] font-black text-emerald-900 uppercase tracking-widest flex items-center gap-1">
                  <span>🎯</span> 独立人均成本
                </span>
                {renderDelta(metricsA.costPerUniquePlayer, metricsB.costPerUniquePlayer, 'currency', 'lower-is-better')}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-white/20">
                <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-300/30">
                  <p className="text-[9px] text-emerald-800 font-bold truncate">A: {metricsA.name}</p>
                  <p className="text-sm sm:text-base font-black text-emerald-950 font-mono mt-0.5">¥{metricsA.costPerUniquePlayer.toFixed(2)}</p>
                </div>
                <div className="bg-blue-500/10 p-2 rounded-xl border border-blue-300/30 text-right">
                  <p className="text-[9px] text-blue-800 font-bold truncate">B: {metricsB.name}</p>
                  <p className="text-sm sm:text-base font-black text-blue-950 font-mono mt-0.5">¥{metricsB.costPerUniquePlayer.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* 手机端专属卡片式对比列表（防挤压，优雅换行） */}
          <div className="space-y-2.5 block sm:hidden">
            <div className="px-1 flex items-center justify-between text-xs font-black text-emerald-950">
              <span className="flex items-center gap-1">
                <span>📋</span> 双周期全指标对照 (卡片式)
              </span>
              <span className="text-[9px] text-emerald-800/60 font-bold">差额 = A期 - B期</span>
            </div>

            {comparisonItems.map(item => (
              <div
                key={item.id}
                className={`p-3.5 rounded-2xl border transition-all ${
                  item.highlight
                    ? 'bg-amber-500/10 border-amber-300/50 shadow-sm'
                    : 'bg-white/20 backdrop-blur-md border-white/30 shadow-sm'
                }`}
              >
                {/* 卡片头部：指标标题 + 差额徽章 */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="min-w-0 pr-1">
                    <div className="text-xs font-black text-emerald-950 flex items-center gap-1.5 truncate">
                      <span>{item.icon}</span>
                      <span>{item.title}</span>
                    </div>
                    {item.subtitle && (
                      <div className="text-[9px] text-gray-500 font-medium truncate mt-0.5">{item.subtitle}</div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {item.deltaNode}
                  </div>
                </div>

                {/* 两个周期的数据：手机端优雅分栏，绝不挤压 */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/20">
                  <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-300/30">
                    <p className="text-[9px] text-emerald-800 font-bold truncate">A: {metricsA.name}</p>
                    <p className="text-sm font-black text-emerald-950 font-mono mt-0.5">{item.valA}</p>
                  </div>
                  <div className="bg-blue-500/10 p-2 rounded-xl border border-blue-300/30 text-right">
                    <p className="text-[9px] text-blue-800 font-bold truncate">B: {metricsB.name}</p>
                    <p className="text-sm font-black text-blue-950 font-mono mt-0.5">{item.valB}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 桌面端全指标表格（平板与桌面端完整展示） */}
          <div className="hidden sm:block bg-white/20 backdrop-blur-md rounded-3xl overflow-hidden border border-white/30 shadow-sm">
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
                <div className="col-span-4">对比维度</div>
                <div className="col-span-3 text-center truncate font-bold text-emerald-800">A: {metricsA.name}</div>
                <div className="col-span-3 text-center truncate font-bold text-blue-800">B: {metricsB.name}</div>
                <div className="col-span-2 text-right">差异 (A - B)</div>
              </div>

              {comparisonItems.map(item => (
                <div
                  key={item.id}
                  className={`grid grid-cols-12 px-4 py-3 items-center hover:bg-white/10 transition-colors ${
                    item.highlight ? 'bg-amber-500/5' : ''
                  }`}
                >
                  <div className="col-span-4 pr-1">
                    <div className="font-black text-emerald-950 flex items-center gap-1">
                      <span>{item.icon}</span>
                      <span>{item.title}</span>
                    </div>
                    {item.subtitle && (
                      <div className="text-[9px] text-gray-500 font-medium truncate">{item.subtitle}</div>
                    )}
                  </div>
                  <div className="col-span-3 text-center font-black text-emerald-900 font-mono">
                    {item.valA}
                  </div>
                  <div className="col-span-3 text-center font-black text-blue-900 font-mono">
                    {item.valB}
                  </div>
                  <div className="col-span-2 text-right">
                    {item.deltaNode}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 财务健康度对比与诊断卡片（独立安全容器，不挤压诊断） */}
          <div className="bg-emerald-500/10 border border-emerald-300/40 rounded-3xl p-4 text-xs text-emerald-950 shadow-sm">
            <h4 className="font-black flex items-center gap-1.5 mb-2 text-emerald-900">
              <span>🩺</span> 双周期财务健康与运营诊断
            </h4>
            <div className="space-y-1.5 text-[11px] text-emerald-900/85 leading-relaxed font-medium">
              <p className="flex items-start gap-1">
                <span className="shrink-0">•</span>
                <span>
                  <strong>场地费用效益</strong>：【{metricsA.name}】总费用为 ¥{metricsA.totalExpenses.toFixed(2)}，较【{metricsB.name}】
                  {metricsA.totalExpenses >= metricsB.totalExpenses ? '增加' : '降低'}{' '}
                  <strong className="font-black text-emerald-950">¥{Math.abs(metricsA.totalExpenses - metricsB.totalExpenses).toFixed(2)}</strong>。
                  {metricsA.sessionCosts > metricsB.sessionCosts ? ' 单场加支有所增加，建议核实额外用球或加场支出。' : ' 额外开销控制平稳。'}
                </span>
              </p>
              <p className="flex items-start gap-1">
                <span className="shrink-0">•</span>
                <span>
                  <strong>出勤活跃热度</strong>：独立出勤人数
                  {metricsA.uniqueAttendeesCount >= metricsB.uniqueAttendeesCount ? '增长' : '减少'}{' '}
                  <strong className="font-black text-emerald-950">{Math.abs(metricsA.uniqueAttendeesCount - metricsB.uniqueAttendeesCount)}人</strong>，
                  场均出勤从 {metricsB.avgAttendeesPerSession.toFixed(1)} 人/场 变为 {metricsA.avgAttendeesPerSession.toFixed(1)} 人/场
                  （{metricsA.avgAttendeesPerSession >= metricsB.avgAttendeesPerSession ? '到场率稳步上升' : '单场参与度略有回落'}）。
                </span>
              </p>
              <p className="flex items-start gap-1">
                <span className="shrink-0">•</span>
                <span>
                  <strong>人均摊销集约度</strong>：独立人均净成本由 ¥{metricsB.costPerUniquePlayer.toFixed(2)} 变为 ¥{metricsA.costPerUniquePlayer.toFixed(2)}
                  （{metricsA.costPerUniquePlayer <= metricsB.costPerUniquePlayer ? '人均分摊更优惠，集约度高' : '人均分摊成本略有增加'}），
                  场均人次成本为 ¥{metricsA.costPerAttendeeSession.toFixed(2)}。
                </span>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
