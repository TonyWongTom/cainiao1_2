
import React from 'react';
import { Period, Player, PlayerType } from '../types';
import { formatMonthDay } from '../utils/dateUtils';
import { useAppContext } from '../context/AppContext';

interface FinanceReportProps {
  initialPeriodId: string | null;
  onPeriodChange: (id: string) => void;
}

const FinanceReport: React.FC<FinanceReportProps> = ({ initialPeriodId, onPeriodChange }) => {
  const { players, periods } = useAppContext();

  const selectedPeriod = initialPeriodId && Array.isArray(periods)
    ? periods.find(p => p.id === initialPeriodId) 
    : (Array.isArray(periods) && periods.length > 0 ? periods[0] : null);

  const calculatePeriodStats = (period: Period) => {
    const grossIncome = Array.isArray(period.sessions) ? period.sessions.reduce((acc, s) => acc + (Array.isArray(s.attendees) ? s.attendees.reduce((sum, a) => sum + (a.fee || 0), 0) : 0), 0) : 0;
    const sessionCosts = Array.isArray(period.sessions) ? period.sessions.reduce((acc, s) => acc + (s.sessionCost || 0), 0) : 0;
    
    // The user wants session-specific income to be net (fees - sessionCost)
    const netTotalIncome = grossIncome - sessionCosts;
    
    // Total expenses = Just the Base court cost, since sessionCosts are already deducted from income
    const baseCourtCost = period.courtCost || 0;
    const totalExpenses = baseCourtCost;
    
    const surplus = netTotalIncome - totalExpenses;
    const funderCount = Array.isArray(period.funderIds) ? period.funderIds.length : 0;
    
    const investmentPerFunder = funderCount > 0 ? totalExpenses / funderCount : 0;
    const refundPerFunder = funderCount > 0 ? netTotalIncome / funderCount : 0;

    // Aggregate stats per player for this period
    const playerBreakdown = Array.isArray(period.sessions) ? period.sessions.reduce((acc, session) => {
      if (Array.isArray(session.attendees)) {
        session.attendees.forEach(att => {
          if (!acc[att.playerId]) {
            acc[att.playerId] = { count: 0, totalPaid: 0 };
          }
          acc[att.playerId].count += 1;
          acc[att.playerId].totalPaid += (att.fee || 0);
        });
      }
      return acc;
    }, {} as Record<string, { count: number; totalPaid: number }>) : {};
    
    return { 
      totalIncome: netTotalIncome, 
      grossIncome,
      totalExpenses, 
      surplus, 
      refundPerFunder, 
      investmentPerFunder, 
      funderCount,
      sessionCosts,
      playerBreakdown
    };
  };

  return (
    <div className="p-4 space-y-6 pb-20">
      <div className="flex justify-between items-center px-1">
        <h2 className="text-xl font-black text-emerald-900">财务统计报表</h2>
      </div>

      {(Array.isArray(periods) && periods.length > 0) && (
        <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 border border-white/30">
          <label className="block text-[10px] font-black text-emerald-800/60 uppercase tracking-widest mb-1.5 ml-1">
            选择结算周期
          </label>
          <div className="relative">
            <select
              value={selectedPeriod?.id || ''}
              onChange={(e) => onPeriodChange(e.target.value)}
              className="w-full bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl p-4 text-xs font-black text-emerald-900 outline-none appearance-none shadow-sm cursor-pointer"
            >
              {Array.isArray(periods) && periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatMonthDay(p.startDate)})
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>
        </div>
      )}

      {(!Array.isArray(periods) || periods.length === 0) ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-5xl mb-4 opacity-10">📊</p>
          <p className="text-sm font-bold">暂无历史结算数据</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 border border-white/30">
            <h3 className="text-xs font-black text-amber-900 mb-2 flex items-center gap-1 uppercase">💡 核心财务逻辑</h3>
            <p className="text-[10px] text-amber-800/80 leading-relaxed font-medium">
              1. <b>总投入</b> = 基础场地费 (不含单场额外支出，因其已从收入中扣除)。<br/>
              2. <b>单场记录收入</b> = 成员实付金额 - 当次额外支出。<br/>
              3. <b>周期总收入</b> = 周期内所有单场记录收入之和。<br/>
              4. <b>投入(预付)</b> = 总投入 / 集资人数。<br/>
              5. <b>返款(所得)</b> = 周期总收入 / 集资人数。<br/>
            </p>
          </div>

          {selectedPeriod && (() => {
            const stats = calculatePeriodStats(selectedPeriod);
            return (
              <div key={selectedPeriod.id} className="bg-white/20 backdrop-blur-md rounded-3xl shadow-sm border border-white/30 overflow-hidden">
                <div className="bg-white/10 backdrop-blur-md px-5 py-4 border-b border-white/20 flex justify-between items-center">
                  <span className="font-black text-emerald-900 text-base">
                    {selectedPeriod.name} <span className="text-emerald-800/60 font-bold ml-1">({formatMonthDay(selectedPeriod.startDate)})</span>
                  </span>
                  <span className="text-[10px] bg-white/20 border border-white/30 text-emerald-800 px-3 py-1 rounded-full font-bold">
                    集资: {stats.funderCount}人
                  </span>
                </div>
                
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                      <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">周期基础总投 (预付)</p>
                      <p className="text-xl font-black text-red-500">¥{stats.totalExpenses.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">周期累计净收 (合计)</p>
                      <p className="text-xl font-black text-emerald-600">¥{stats.totalIncome.toFixed(2)}</p>
                      {stats.sessionCosts > 0 && (
                        <p className="text-[8px] text-gray-400 mt-0.5 italic">已扣除额外费: ¥{stats.sessionCosts.toFixed(2)}</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-black/20 backdrop-blur-md border border-white/20 rounded-2xl p-5 text-white shadow-lg relative mb-6">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">集资人个人账单 (每人)</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[9px] text-red-400 font-bold mb-1 italic">本期预付投入</p>
                        <p className="text-lg font-black opacity-90 text-[#e3e5e4]">¥{stats.investmentPerFunder.toFixed(2)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-emerald-900 font-bold mb-1 italic">本期所得返款</p>
                        <p className="text-lg font-black">¥{stats.refundPerFunder.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-tighter">最终实际打球成本：</span>
                      <span className="text-sm font-black text-red-900">¥{(stats.investmentPerFunder - stats.refundPerFunder).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Participant Detailed Breakdown */}
                  <div>
                    <p className="text-[10px] font-black text-emerald-800/60 uppercase tracking-widest mb-3 px-1 flex justify-between">
                      <span>🏸 参与成员明细</span>
                      <span>{Object.keys(stats.playerBreakdown).length}人出勤</span>
                    </p>
                    <div className="bg-white/20 backdrop-blur-md rounded-2xl overflow-hidden border border-white/30">
                      <div className="grid grid-cols-3 px-4 py-2 border-b border-white/20 text-[8px] font-black text-emerald-800/60 uppercase tracking-wider">
                        <span>姓名</span>
                        <span className="text-center">出勤次数</span>
                        <span className="text-right">总实付</span>
                      </div>
                      <div className="divide-y divide-white/20">
                        {Object.entries(stats.playerBreakdown).map(([pid, data]) => {
                          const playerName = players.find(p => p.id === pid)?.name || '未知';
                          const isFunder = Array.isArray(selectedPeriod.funderIds) && selectedPeriod.funderIds.includes(pid);
                          return (
                            <div key={pid} className="grid grid-cols-3 px-4 py-3 items-center">
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                <span className="text-xs font-bold text-emerald-900 truncate">{playerName}</span>
                                {isFunder && <span className="text-[8px] bg-amber-500/20 text-amber-800 px-1 rounded font-black shrink-0">👑</span>}
                              </div>
                              <div className="text-center">
                                <span className="text-xs font-black text-emerald-800 bg-white/20 px-2 py-0.5 rounded-full">{data.count}次</span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-black text-emerald-900">¥{data.totalPaid.toFixed(2)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <p className="text-[10px] font-black text-emerald-800/60 uppercase tracking-widest mb-3">当期集资背景</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.isArray(selectedPeriod.funderIds) && selectedPeriod.funderIds.map(fid => (
                        <span key={fid} className="text-[10px] bg-white/20 backdrop-blur-md text-emerald-900 border border-white/30 px-2 py-1 rounded-md font-bold">
                          {players.find(p => p.id === fid)?.name || '未知'}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default FinanceReport;
