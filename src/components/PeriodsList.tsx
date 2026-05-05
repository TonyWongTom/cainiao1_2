
import React, { useState, useMemo, useEffect } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { zhCN } from 'date-fns/locale';
import { Period, Player, Session, PlayerType } from '../types';
import { Icons, DEFAULT_SESSION_FEE } from '../constants';
import { formatDateChinese } from '../utils/dateUtils';
import { useAppContext } from '../context/AppContext';

registerLocale('zh-CN', zhCN);

interface PeriodsListProps {
}

const PeriodsList: React.FC<PeriodsListProps> = () => {
  const { periods, setPeriods, players, setPlayers } = useAppContext();

  const [isAddingPeriod, setIsAddingPeriod] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [expandedPeriodId, setExpandedPeriodId] = useState<string | null>(null);
  const [activeSessionPeriod, setActiveSessionPeriod] = useState<string | null>(null);
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [periodToDeleteId, setPeriodToDeleteId] = useState<string | null>(null);
  const [sessionConfirmDeleteId, setSessionConfirmDeleteId] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const funderPool = Array.isArray(players) ? players.filter(p => p.isFunder) : [];

  const initialPeriodData: Partial<Period> = {
    name: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    courtCost: 0,
    funderIds: Array.isArray(funderPool) ? funderPool.map(p => p.id) : [],
    sessions: [],
    playerConfigs: Array.isArray(players) ? players.map(p => ({
      playerId: p.id,
      type: PlayerType.PER_SESSION,
      fee: 25
    })) : []
  };

  const [periodFormData, setPeriodFormData] = useState<Partial<Period>>(initialPeriodData);
  const [sessionFormDate, setSessionFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessionFormCost, setSessionFormCost] = useState<number>(0);
  const [selectedAttendees, setSelectedAttendees] = useState<{playerId: string, fee: number}[]>([]);

  // 自动重置场次删除确认状态
  useEffect(() => {
    if (sessionConfirmDeleteId) {
      const timer = setTimeout(() => setSessionConfirmDeleteId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [sessionConfirmDeleteId]);

  const sortedPeriods = useMemo(() => {
    return (Array.isArray(periods) ? [...periods] : []).sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        comparison = (a.startDate || '').localeCompare(b.startDate || '');
      } else {
        comparison = (a.name || '').localeCompare(b.name || '', 'zh-CN');
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [periods, sortBy, sortOrder]);

  const stringToDate = (str: string | undefined) => {
    if (!str) return null;
    const [year, month, day] = str.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const dateToString = (date: Date | null) => {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // --- 导出功能 ---
  const exportPeriodLedger = (period: Period) => {
    const BOM = "\ufeff";
    
    // Calculate stats
    const grossIncome = (period.sessions || []).reduce((acc, s) => acc + (s.attendees || []).reduce((sum, a) => sum + (a.fee || 0), 0), 0);
    const sessionCosts = (period.sessions || []).reduce((acc, s) => acc + (s.sessionCost || 0), 0);
    const netTotalIncome = grossIncome - sessionCosts;
    const totalExpenses = period.courtCost;
    const surplus = netTotalIncome - totalExpenses;
    const funderCount = period.funderIds?.length || 0;
    const investmentPerFunder = funderCount > 0 ? totalExpenses / funderCount : 0;
    const refundPerFunder = funderCount > 0 ? netTotalIncome / funderCount : 0;
    const costPerFunder = investmentPerFunder - refundPerFunder;

    const getWeekday = (dateString: string) => {
      const date = new Date(dateString);
      const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return days[date.getDay()];
    };

    let csv = `${BOM}${period.name} 结算报表\n`;
    csv += `周期,${period.startDate} ~ ${period.endDate || '进行中'}\n\n`;

    // 财务概况
    csv += `财务概况\n`;
    csv += `项目,金额\n`;
    csv += `场地费支出,¥${totalExpenses.toFixed(2)}\n`;
    csv += `场次额外费用,¥${sessionCosts.toFixed(2)}\n`;
    csv += `总投入,¥${(totalExpenses + sessionCosts).toFixed(2)}\n`;
    csv += `打球收入,¥${grossIncome.toFixed(2)}\n`;
    csv += `结余,¥${surplus.toFixed(2)}\n\n`;

    // 集资人账单
    if (funderCount > 0) {
      csv += `集资人账单\n`;
      csv += `集资人数,${funderCount}人\n`;
      csv += `每人预付投入,¥${investmentPerFunder.toFixed(2)}\n`;
      csv += `每人所得返款,¥${refundPerFunder.toFixed(2)}\n`;
      csv += `最终打球成本,¥${costPerFunder.toFixed(2)}\n\n`;
    }

    // 打球流水明细
    csv += `打球流水明细\n`;
    csv += `日期,星期,额外费用,参与人员,实付金额\n`;

    const sortedSessions = [...(period.sessions || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    sortedSessions.forEach(session => {
      const weekday = getWeekday(session.date);
      const sessionExtraCost = session.sessionCost || 0;
      const totalSessionPaid = (session.attendees || []).reduce((acc, a) => acc + (a.fee || 0), 0);

      const participantDetails = (session.attendees || []).map(a => {
        const playerName = players.find(p => p.id === a.playerId)?.name || '未知';
        return `${playerName}(¥${a.fee})`;
      }).join("; ");

      csv += `${session.date},${weekday},¥${sessionExtraCost},"${participantDetails}",¥${totalSessionPaid}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${period.name}_结算流水.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- 周期管理逻辑 ---
  const handleSavePeriod = () => {
    if (!periodFormData.name) {
      alert('请输入周期名称');
      return;
    }
    if (editingPeriodId) {
      setPeriods(prev => prev.map(p => p.id === editingPeriodId ? { ...p, ...periodFormData } as Period : p));
      setEditingPeriodId(null);
    } else {
      const period: Period = {
        id: Date.now().toString(),
        name: periodFormData.name!,
        startDate: periodFormData.startDate!,
        endDate: periodFormData.endDate || '',
        courtCost: periodFormData.courtCost || 0,
        funderIds: periodFormData.funderIds || [],
        sessions: [],
        playerConfigs: periodFormData.playerConfigs || []
      };
      setPeriods(prev => [period, ...prev]);
      setIsAddingPeriod(false);
    }
    setPeriodFormData(initialPeriodData);
  };

  const deletePeriod = (e: React.MouseEvent, periodId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setPeriodToDeleteId(periodId);
  };

  const handleDeletePeriodConfirmed = () => {
    if (!periodToDeleteId) return;
    setPeriods(prev => prev.filter(p => p.id !== periodToDeleteId));
    setPeriodToDeleteId(null);
    if (expandedPeriodId === periodToDeleteId) setExpandedPeriodId(null);
  };

  // --- 打球场次逻辑 ---
  const handleRemoveSession = (e: React.MouseEvent, periodId: string, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (sessionConfirmDeleteId !== sessionId) {
      setSessionConfirmDeleteId(sessionId);
      return;
    }

    setPeriods(prev => prev.map(p => {
      if (p.id === periodId) {
        return {
          ...p,
          sessions: (p.sessions || []).filter(s => s.id !== sessionId)
        };
      }
      return p;
    }));
    setSessionConfirmDeleteId(null);
  };

  const saveSession = (periodId: string) => {
    if (selectedAttendees.length === 0) {
      alert('请至少选择一名出席成员');
      return;
    }
    if (editingSessionId) {
      setPeriods(prev => prev.map(p => p.id === periodId ? {
        ...p,
        sessions: (p.sessions || []).map(s => s.id === editingSessionId ? { ...s, date: sessionFormDate, sessionCost: sessionFormCost, attendees: selectedAttendees } : s)
      } : p));
    } else {
      const session: Session = {
        id: Date.now().toString(),
        date: sessionFormDate,
        sessionCost: sessionFormCost,
        attendees: selectedAttendees
      };
      setPeriods(prev => prev.map(p => {
        if (p.id === periodId) {
          const newSessions = [session, ...(p.sessions || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          return { ...p, sessions: newSessions };
        }
        return p;
      }));
    }
    setActiveSessionPeriod(null);
    setEditingSessionId(null);
  };

  const calculatePotentialFee = (player: Player, periodId: string) => {
    const attendee = selectedAttendees.find(a => a.playerId === player.id);
    if (attendee) return attendee.fee;

    const currentPeriod = periods.find(p => p.id === periodId);
    const isFunder = currentPeriod?.funderIds?.includes(player.id);
    const periodConfig = currentPeriod?.playerConfigs?.find(c => c.playerId === player.id);
    const periodType = periodConfig?.type || PlayerType.PER_SESSION;
    const periodFee = periodConfig?.fee ?? DEFAULT_SESSION_FEE;

    if (isFunder) return 0;
    
    if (periodType === PlayerType.MONTHLY || periodType === PlayerType.HALF_MONTHLY) {
      const alreadyAttended = (currentPeriod?.sessions || []).some(s => 
        s.id !== editingSessionId && (s.attendees || []).some(a => a.playerId === player.id)
      );
      return alreadyAttended ? 0 : periodFee;
    }
    
    return periodFee;
  };

  const toggleAttendee = (player: Player, periodId: string) => {
    const exists = selectedAttendees.find(a => a.playerId === player.id);
    if (exists) {
      setSelectedAttendees(prev => prev.filter(a => a.playerId !== player.id));
    } else {
      const fee = calculatePotentialFee(player, periodId);
      setSelectedAttendees(prev => [...prev, { playerId: player.id, fee }]);
    }
  };

  const updateAttendeeFee = (playerId: string, fee: number) => {
    setSelectedAttendees(prev => prev.map(a => a.playerId === playerId ? { ...a, fee } : a));
  };

  // --- 模态框渲染 ---
  const renderDeleteModal = () => {
    const period = Array.isArray(periods) ? periods.find(p => p.id === periodToDeleteId) : undefined;
    if (!period) return null;

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-fade-in bg-black/60 backdrop-blur-md">
        <div className="w-full max-w-sm bg-white/30 backdrop-blur-[20px] rounded-[2.5rem] border border-white/50 p-8 shadow-2xl animate-fade-in">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-gray-800 mb-2">确认删除周期？</h3>
            <div className="bg-red-50 rounded-2xl p-4 mb-6">
              <p className="text-xs text-red-600 font-bold leading-relaxed">
                警告：删除周期 <span className="underline font-black">"{period.name}"</span> 将会导致其包含的 <span className="font-black underline">{period.sessions?.length || 0} 场打球记录</span> 被永久清除，且无法恢复相关财务数据。
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <button 
              onClick={handleDeletePeriodConfirmed} 
              className="w-full bg-red-600 text-white py-4 rounded-2xl font-black text-base shadow-lg shadow-red-200 active:scale-95 transition-all"
            >
              确认永久删除
            </button>
            <button 
              onClick={() => setPeriodToDeleteId(null)} 
              className="w-full bg-gray-100 text-gray-500 py-4 rounded-2xl font-black text-sm active:bg-gray-200 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPeriodDrawer = (title: string, onCancel: () => void) => (
    <div className="fixed inset-0 z-[100] flex items-end justify-center animate-fade-in bg-black/40 backdrop-blur-[2px]">
      <div 
        className="w-full max-w-md bg-white/30 backdrop-blur-[20px] border-t border-white/50 rounded-t-[2.5rem] shadow-2xl p-6 pb-safe animate-slide-up overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-white/50 rounded-full mx-auto mb-6"></div>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-emerald-900">{title}</h3>
          <button onClick={onCancel} className="text-emerald-900 border border-emerald-900/10 p-2 hover:bg-white/20 active:bg-white/30 rounded-full">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="space-y-5">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">周期名称</label>
            <input type="text" placeholder="例如：2025年3月集资" value={periodFormData.name} onChange={e => setPeriodFormData({...periodFormData, name: e.target.value})} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">开始日期</label>
              <DatePicker locale="zh-CN" selected={stringToDate(periodFormData.startDate)} onChange={(date: any) => setPeriodFormData({...periodFormData, startDate: dateToString(date)})} dateFormat="yyyy年MM月dd日" showMonthDropdown showYearDropdown dropdownMode="select" className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">结束日期 (选填)</label>
              <DatePicker locale="zh-CN" selected={stringToDate(periodFormData.endDate)} onChange={(date: any) => setPeriodFormData({...periodFormData, endDate: dateToString(date)})} dateFormat="yyyy年MM月dd日" showMonthDropdown showYearDropdown dropdownMode="select" placeholderText="进行中..." className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-bold outline-none" isClearable />
            </div>
          </div>
          <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
            <label className="block text-[10px] font-black text-red-800 uppercase tracking-widest mb-1 ml-1">本周期预付场地费</label>
            <div className="relative flex items-center">
              <span className="absolute left-4 text-red-300 font-bold italic">¥</span>
              <input type="number" placeholder="0.00" value={periodFormData.courtCost === '' as any ? '' : periodFormData.courtCost} onChange={e => setPeriodFormData({...periodFormData, courtCost: e.target.value === '' ? '' as any : Number(e.target.value)})} className="w-full bg-transparent border-none p-0 pl-8 text-2xl font-black text-red-600 outline-none focus:ring-0" />
            </div>
          </div>
          <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
            <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-3 flex justify-between items-center">
              <span>👑 本期集资名单 (预支份额)</span>
              <span className="text-[8px] bg-white/50 px-2 py-0.5 rounded italic opacity-70">勾选者将平摊基础费</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
      {Array.isArray(funderPool) && funderPool.map(f => {
                const isSelected = periodFormData.funderIds?.includes(f.id);
                return (
                  <button key={f.id} type="button" onClick={() => {
                    const current = periodFormData.funderIds || [];
                    setPeriodFormData({...periodFormData, funderIds: current.includes(f.id) ? current.filter(id => id !== f.id) : [...current, f.id]});
                  }} className={`text-[10px] py-2.5 rounded-xl border transition-all font-black ${isSelected ? 'bg-amber-400 border-amber-300 ring-1 ring-amber-200 text-white shadow-[0_0_15px_rgba(251,191,36,0.6)]' : 'bg-white border-amber-100 text-amber-200'}`}>
                    {f.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
            <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-3">
              👤 人员性质及单价设置 (本期生效)
            </p>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {Array.isArray(players) && players.map(p => {
                const config = periodFormData.playerConfigs?.find(c => c.playerId === p.id) || {
                  playerId: p.id,
                  type: PlayerType.PER_SESSION,
                  fee: 25
                };
                
                const updateConfig = (updates: Partial<{type: PlayerType, fee: number}>) => {
                  setPeriodFormData(prev => {
                    const currentConfigs = prev.playerConfigs || [];
                    const existingIndex = currentConfigs.findIndex(c => c.playerId === p.id);
                    let newConfigs = [...currentConfigs];
                    
                    if (existingIndex > -1) {
                      newConfigs[existingIndex] = { ...newConfigs[existingIndex], ...updates };
                    } else {
                      newConfigs.push({ playerId: p.id, type: PlayerType.PER_SESSION, fee: 25, ...updates });
                    }
                    return { ...prev, playerConfigs: newConfigs };
                  });
                };

                return (
                  <div key={p.id} className="bg-white p-3 rounded-xl border border-blue-100/50 flex flex-col gap-2 shadow-sm transform-gpu">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-emerald-900">{p.name}</span>
                      <div className="flex gap-1">
                        {[PlayerType.MONTHLY, PlayerType.HALF_MONTHLY, PlayerType.PER_SESSION].map(type => (
                          <button
                            key={type}
                            onClick={() => updateConfig({ type })}
                            className={`text-[9px] px-2 py-1 rounded-lg font-black transition-colors ${config.type === type ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-400'}`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-[9px] text-gray-400 font-bold">设定金额 (¥):</span>
                      <input 
                        type="number" 
                        value={config.fee === '' as any ? '' : config.fee} 
                        onChange={(e) => updateConfig({ fee: e.target.value === '' ? '' as any : Number(e.target.value) })}
                        className="w-16 bg-blue-50/50 border border-blue-100 rounded-lg p-1 text-[10px] font-black text-blue-600 outline-none text-right"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSavePeriod} className="flex-[2] bg-emerald-500 ring-1 ring-white/40 text-white py-4 rounded-2xl font-black text-base shadow-[0_0_20px_rgba(16,185,129,0.5)] active:scale-95 transition-all">保存配置</button>
            <button onClick={onCancel} className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-2xl font-black text-sm active:bg-gray-200">取消</button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSessionForm = (periodId: string) => {
    const currentSubtotal = (selectedAttendees || []).reduce((sum, a) => sum + (a.fee || 0), 0);

    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 animate-fade-in bg-black/60 backdrop-blur-[10px]" onClick={() => { setActiveSessionPeriod(null); setEditingSessionId(null); }}>
        <div className="w-full max-w-sm bg-white/30 backdrop-blur-[20px] rounded-[2.5rem] border border-white/50 p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <h3 className="text-lg font-black text-emerald-900 mb-6">{editingSessionId ? '✏️ 编辑打球记录' : '✨ 录入打球记录'}</h3>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
               <div>
                  <label className="block text-[10px] font-black text-gray-400 mb-1">活动日期</label>
                  <DatePicker locale="zh-CN" selected={stringToDate(sessionFormDate)} onChange={(date: any) => setSessionFormDate(dateToString(date))} dateFormat="yyyy年MM月dd日" className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold outline-none" />
               </div>
               <div>
                  <label className="block text-[10px] font-black text-gray-400 mb-1">额外费用(支)</label>
                  <input type="number" value={sessionFormCost === '' as any ? '' : sessionFormCost} onChange={e => setSessionFormCost(e.target.value === '' ? '' as any : Number(e.target.value))} className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm font-bold outline-none text-red-500" placeholder="0.00" />
               </div>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">第一步：选择出席成员 ({selectedAttendees.length}):</p>
                <input 
                  type="text" 
                  value={sessionSearchQuery} 
                  onChange={(e) => setSessionSearchQuery(e.target.value)} 
                  placeholder="搜索成员..." 
                  className="w-24 text-[10px] bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-400"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 p-3 bg-gray-50 rounded-2xl border border-gray-100 max-h-48 overflow-y-auto">
                {Array.isArray(players) && players
                  .filter(p => !sessionSearchQuery || p.name.toLowerCase().includes(sessionSearchQuery.toLowerCase()))
                  .map(p => {
                  const isSelected = selectedAttendees.find(a => a.playerId === p.id);
                  const displayFee = calculatePotentialFee(p, periodId);
                  return (
                    <button key={p.id} onClick={() => toggleAttendee(p, periodId)} className={`text-[10px] px-3 py-2 rounded-xl font-black transition-all border flex items-center gap-1.5 ${isSelected ? 'bg-emerald-500 border-emerald-400 ring-1 ring-emerald-300 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-white border-gray-100 text-gray-400'}`}>
                      <span>{p.name}</span>
                      <span className={`text-[8px] opacity-70 ${isSelected ? 'text-white' : 'text-gray-400'}`}>{displayFee === 0 ? '0' : `¥${displayFee}`}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedAttendees.length > 0 && (
              <div>
                <p className="text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">第二步：设置实收金额 (¥):</p>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {Array.isArray(selectedAttendees) && selectedAttendees.map(attendee => {
                    const player = players.find(p => p.id === attendee.playerId);
                    return (
                      <div key={attendee.playerId} className="flex justify-between items-center bg-gray-50 p-2 rounded-xl border border-gray-100">
                        <span className="text-xs font-bold text-gray-700 ml-2">{player?.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 italic">实收 ¥</span>
                          <input 
                            type="number" 
                            value={attendee.fee === '' as any ? '' : attendee.fee} 
                            onChange={(e) => updateAttendeeFee(attendee.playerId, e.target.value === '' ? '' as any : Number(e.target.value))}
                            className="w-16 bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-black text-emerald-600 outline-none focus:ring-1 focus:ring-emerald-400"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
               <div className="flex justify-between items-center">
                 <span className="text-[10px] font-black text-emerald-800 uppercase">本场预计实收:</span>
                 <span className="text-xl font-black text-emerald-600">¥{currentSubtotal.toFixed(2)}</span>
               </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => saveSession(periodId)} className="flex-[2] bg-emerald-500 ring-1 ring-white/40 text-white py-4 rounded-2xl font-black text-sm active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.5)]">确认录入</button>
              <button onClick={() => { setActiveSessionPeriod(null); setEditingSessionId(null); }} className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-2xl font-black text-sm">取消</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4 pb-32">
      <div className="px-1 mb-4 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-gray-800">结算管理</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Manage your sessions</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setSortBy(sortBy === 'date' ? 'name' : 'date')} className="text-[10px] font-black px-3 py-1.5 bg-white/20 backdrop-blur-md border border-white/30 rounded-full shadow-sm text-emerald-900 active:bg-white/30">
            {sortBy === 'date' ? '📅 时间' : '🔤 名称'}
          </button>
          <button onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')} className="text-[10px] font-black px-2 py-1.5 bg-white/20 backdrop-blur-md border border-white/30 rounded-full shadow-sm text-emerald-900 active:bg-white/30">
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {Array.isArray(sortedPeriods) && sortedPeriods.map(period => {
          const isExpanded = expandedPeriodId === period.id;
          const totalIncome = (period.sessions || []).reduce((acc, s) => acc + (s.attendees || []).reduce((sum, a) => sum + (a.fee || 0), 0) - (s.sessionCost || 0), 0);
          return (
            <div key={period.id} className={`bg-white/20 backdrop-blur-md rounded-[2.5rem] shadow-sm border border-white/30 overflow-hidden transition-all ${isExpanded ? 'ring-2 ring-emerald-500/10 shadow-lg' : ''}`}>
              <div onClick={() => setExpandedPeriodId(isExpanded ? null : period.id)} className={`p-5 flex justify-between items-center cursor-pointer active:bg-white/30 transition-colors ${isExpanded ? 'bg-white/10' : ''}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-black text-emerald-900 text-base">{period.name}</h3>
                    {(!period.endDate) && (
                      <span className="text-[8px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-black animate-pulse">进行中</span>
                    )}
                  </div>
                  <p className="text-[10px] text-emerald-800/80 font-bold">{formatDateChinese(period.startDate)} ~ {period.endDate ? formatDateChinese(period.endDate) : '至今'}</p>
                </div>
                <div className="flex items-center gap-3">
                   <button 
                     onClick={(e) => { e.stopPropagation(); exportPeriodLedger(period); }}
                     className="px-3 py-2 flex items-center gap-1.5 text-emerald-800 bg-white/30 hover:bg-white/40 active:scale-95 transition-all rounded-xl border border-white/40 shadow-sm"
                   >
                     <Icons.Download />
                     <span className="text-[9px] font-black uppercase tracking-widest">导出</span>
                   </button>
                   <div className="text-right">
                      <p className="text-[9px] text-emerald-800/80 font-black">场次</p>
                      <p className="font-black text-emerald-900">{(period.sessions || []).length}</p>
                   </div>
                   <div className={`transition-transform duration-300 ml-2 ${isExpanded ? 'rotate-180 text-emerald-900' : 'text-emerald-800/60'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="p-5 bg-white/10 border-t border-white/20 space-y-6 animate-fade-in">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/30">
                      <p className="text-[9px] font-black text-emerald-800/80 uppercase mb-1">本期净余 (收入-额外支-基础费)</p>
                      <p className={`text-lg font-black ${totalIncome - period.courtCost >= 0 ? 'text-emerald-900' : 'text-red-800'}`}>
                        ¥{(totalIncome - period.courtCost).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/30">
                      <p className="text-[9px] font-black text-emerald-800/80 uppercase mb-1">本期内额外总支</p>
                      <p className="text-lg font-black text-red-800">¥{(period.sessions || []).reduce((a,s) => a+(s.sessionCost||0), 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/30">
                      <p className="text-[9px] font-black text-emerald-800/80 uppercase mb-1">本期实收总额</p>
                      <p className="text-lg font-black text-emerald-900">¥{totalIncome.toFixed(2)}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2 px-1">
                      <p className="text-[10px] font-black text-emerald-800/80 uppercase tracking-widest">👑 本期集资名单</p>
                      <button onClick={(e) => { e.stopPropagation(); setEditingPeriodId(period.id); setPeriodFormData({ ...period, playerConfigs: players.map(p => period.playerConfigs?.find(c => c.playerId === p.id) || { playerId: p.id, type: PlayerType.PER_SESSION, fee: 25 }) }); }} className="text-[9px] text-emerald-900 font-black px-2 py-1 bg-white/30 backdrop-blur-md rounded-lg">修改配置</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 p-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-sm">
                      {Array.isArray(period.funderIds) && period.funderIds.map(fid => (
                        <span key={fid} className="text-[10px] bg-amber-500/20 text-amber-900 px-2.5 py-1 rounded-full font-black border border-amber-500/30">
                          {players.find(pl => pl.id === fid)?.name || '未知'}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="pt-2">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">🏸 打球流水</h4>
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setActiveSessionPeriod(period.id); 
                          setEditingSessionId(null); 
                          setSessionFormDate(new Date().toISOString().split('T')[0]); 
                          setSessionFormCost(0); 
                          setSelectedAttendees([]); 
                        }} 
                        className="text-[10px] bg-emerald-500 ring-1 ring-white/40 text-white px-4 py-2 rounded-xl font-black active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                      >
                        录入记录
                      </button>
                    </div>
                    <div className="space-y-3">
                      {Array.isArray(period.sessions) && period.sessions.map(session => (
                        <div key={session.id} className="bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/30 shadow-sm">
                          <div className="flex justify-between items-center mb-2">
                             <div className="flex flex-col">
                                <span className="text-xs font-black text-emerald-900">{formatDateChinese(session.date)}</span>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[9px] text-emerald-800/80 font-bold">实收: ¥{(session.attendees || []).reduce((sum, a) => sum + (a.fee || 0), 0)}</span>
                                  <span className="text-[9px] text-red-800 font-bold">支出: {session.sessionCost ? `-¥${session.sessionCost}` : '0'}</span>
                                  <span className="text-[9px] text-emerald-900 font-black">当次入: ¥{((session.attendees || []).reduce((sum, a) => sum + (a.fee || 0), 0) - (session.sessionCost || 0)).toFixed(2)}</span>
                                </div>
                             </div>
                             <div className="flex gap-1 items-center">
                                <button onClick={(e) => { e.stopPropagation(); setActiveSessionPeriod(period.id); setEditingSessionId(session.id); setSessionFormDate(session.date); setSessionFormCost(session.sessionCost || 0); setSelectedAttendees(session.attendees || []); }} className="text-emerald-800/80 p-1.5 active:text-emerald-900 transition-colors"><Icons.Pencil /></button>
                                
                                <button 
                                  onClick={(e) => handleRemoveSession(e, period.id, session.id)} 
                                  className={`transition-all duration-200 rounded-lg flex items-center justify-center p-1.5 ${
                                    sessionConfirmDeleteId === session.id 
                                      ? 'bg-red-500 text-white px-3' 
                                      : 'text-emerald-800/80 hover:text-red-500'
                                  }`}
                                >
                                  {sessionConfirmDeleteId === session.id ? (
                                    <span className="text-[9px] font-black whitespace-nowrap">确认删除？</span>
                                  ) : (
                                    <Icons.Trash />
                                  )}
                                </button>
                             </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(session.attendees) && session.attendees.map(a => (
                              <span key={a.playerId} className="text-[9px] bg-white/20 backdrop-blur-md text-emerald-900 px-2 py-0.5 rounded border border-white/30">
                                {players.find(pl => pl.id === a.playerId)?.name} {(!a.fee || Number(a.fee) === 0) ? '(0)' : `(¥${a.fee})`}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pt-4 border-t border-gray-100 flex justify-center">
                    <button 
                      onClick={(e) => deletePeriod(e, period.id)}
                      className="text-[10px] text-red-300 font-bold flex items-center gap-1 active:scale-95 transition-transform"
                    >
                      <Icons.Trash /> 永久移除此周期及记录
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={() => { setIsAddingPeriod(true); setEditingPeriodId(null); setPeriodFormData(initialPeriodData); }} className="fixed bottom-24 right-6 w-14 h-14 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.6)] ring-2 ring-emerald-300 z-50 active:scale-90 transition-transform">
        <Icons.Plus />
      </button>

      {isAddingPeriod && renderPeriodDrawer("创建结算周期", () => setIsAddingPeriod(false))}
      {editingPeriodId && renderPeriodDrawer("编辑周期配置", () => setEditingPeriodId(null))}
      {activeSessionPeriod && renderSessionForm(activeSessionPeriod)}
      {periodToDeleteId && renderDeleteModal()}

      {(!Array.isArray(periods) || periods.length === 0) && (
        <div className="text-center py-24 text-emerald-800/60 bg-white/20 backdrop-blur-md rounded-[2.5rem] border border-white/30 m-4">
          <p className="text-5xl mb-4 opacity-30">🏸</p>
          <p className="text-sm font-black uppercase tracking-widest text-emerald-900">尚未创建结算周期</p>
        </div>
      )}
    </div>
  );
};

export default PeriodsList;
