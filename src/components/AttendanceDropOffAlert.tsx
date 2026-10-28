import React, { useState, useMemo } from 'react';
import { Period, Player, PlayerType } from '../types';
import { 
  AlertTriangle, 
  Copy, 
  Check, 
  Users, 
  UserX, 
  ArrowRight, 
  TrendingDown, 
  Info, 
  HeartHandshake, 
  ChevronDown, 
  ChevronUp, 
  Clock 
} from 'lucide-react';

interface AttendanceDropOffAlertProps {
  currentPeriod: Period;
  previousPeriod: Period | null;
  players: Player[];
  allPeriods?: Period[];
}

export interface DropOffPlayerInfo {
  id: string;
  name: string;
  type: PlayerType;
  isFunder: boolean;
  
  // Rule 1: Period drop-off (上期>=3次, 本期<2次)
  isPeriodDrop: boolean;
  prevCount: number;
  currCount: number;
  dropCount: number;
  
  // Rule 2: Consecutive missed sessions (连续4~12次未打球)
  isConsecutiveAbsence: boolean;
  consecutiveMissedCount: number;
}

export const AttendanceDropOffAlert: React.FC<AttendanceDropOffAlertProps> = ({
  currentPeriod,
  previousPeriod,
  players,
  allPeriods
}) => {
  const [copied, setCopied] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'consecutive' | 'zero' | 'one'>('all');
  const [userExpandedState, setUserExpandedState] = useState<Record<string, boolean>>({});

  // Compute attendance drop-off and consecutive absences
  const { alertList, consecutiveCount, zeroCount, oneCount, totalTimelineSessions } = useMemo(() => {
    const prevSessions = Array.isArray(previousPeriod?.sessions) ? previousPeriod!.sessions : [];
    const currSessions = Array.isArray(currentPeriod.sessions) ? currentPeriod.sessions : [];

    // Count previous attendances per player
    const prevMap = new Map<string, number>();
    prevSessions.forEach(session => {
      if (Array.isArray(session.attendees)) {
        session.attendees.forEach(att => {
          prevMap.set(att.playerId, (prevMap.get(att.playerId) || 0) + 1);
        });
      }
    });

    // Count current attendances per player
    const currMap = new Map<string, number>();
    currSessions.forEach(session => {
      if (Array.isArray(session.attendees)) {
        session.attendees.forEach(att => {
          currMap.set(att.playerId, (currMap.get(att.playerId) || 0) + 1);
        });
      }
    });

    // Extract all sessions across club history to build chronological timeline
    const sourcePeriods = Array.isArray(allPeriods) && allPeriods.length > 0
      ? allPeriods
      : [previousPeriod, currentPeriod].filter((p): p is Period => Boolean(p));

    interface FlattenedSession {
      id: string;
      date: string;
      attendeeIds: Set<string>;
    }

    const allSessionsList: FlattenedSession[] = [];
    sourcePeriods.forEach(p => {
      if (Array.isArray(p.sessions)) {
        p.sessions.forEach(s => {
          const attendeeIds = new Set<string>();
          if (Array.isArray(s.attendees)) {
            s.attendees.forEach(a => attendeeIds.add(a.playerId));
          }
          allSessionsList.push({
            id: s.id,
            date: s.date || '',
            attendeeIds
          });
        });
      }
    });

    // Sort chronologically ascending
    allSessionsList.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Timeline up to current period's latest session date
    let cutoffDate = '';
    if (currSessions.length > 0) {
      cutoffDate = currSessions.reduce((max, s) => (s.date > max ? s.date : max), '');
    } else if (currentPeriod.endDate) {
      cutoffDate = currentPeriod.endDate;
    }

    const timelineSessions = cutoffDate
      ? allSessionsList.filter(s => s.date <= cutoffDate)
      : allSessionsList;

    const K = timelineSessions.length;

    // Check both rules for candidate players
    const list: DropOffPlayerInfo[] = [];

    players.forEach(playerObj => {
      const pid = playerObj.id;
      const prevCount = prevMap.get(pid) || 0;
      const currCount = currMap.get(pid) || 0;

      // Rule 1: 上周期出勤3次以上且本周期出勤不足2次
      const isPeriodDrop = Boolean(previousPeriod && prevCount >= 3 && currCount < 2);

      // Rule 2: 连续四次没有打球的也需要预警，超过12次的不再预警 (4 <= consecutiveMissed <= 12)
      let consecutiveMissed = 0;
      let hasAttendedInTimeline = false;
      if (K > 0) {
        for (let i = K - 1; i >= 0; i--) {
          if (timelineSessions[i].attendeeIds.has(pid)) {
            hasAttendedInTimeline = true;
            break;
          } else {
            consecutiveMissed++;
          }
        }
      }

      // Check if player is an active member or has past attendance record
      const isConfiguredMember = Boolean(
        currentPeriod.playerConfigs?.some(c => c.playerId === pid) ||
        previousPeriod?.playerConfigs?.some(c => c.playerId === pid) ||
        playerObj.isFunder ||
        playerObj.type !== PlayerType.PER_SESSION
      );

      // Rule 2 triggers when 4 <= consecutiveMissed <= 12 (exceeding 12 is ignored per user rule)
      const isConsecutiveAbsence = Boolean(
        consecutiveMissed >= 4 &&
        consecutiveMissed <= 12 &&
        (hasAttendedInTimeline || isConfiguredMember)
      );

      // If either Rule 1 or Rule 2 is met, add to alert list
      if (isPeriodDrop || isConsecutiveAbsence) {
        const typeConfig = currentPeriod.playerConfigs?.find(c => c.playerId === pid)?.type 
          || previousPeriod?.playerConfigs?.find(c => c.playerId === pid)?.type 
          || playerObj.type 
          || PlayerType.PER_SESSION;

        const isFunder = Boolean(
          (Array.isArray(currentPeriod.funderIds) && currentPeriod.funderIds.includes(pid)) ||
          (Array.isArray(previousPeriod?.funderIds) && previousPeriod!.funderIds.includes(pid)) ||
          playerObj.isFunder
        );

        list.push({
          id: pid,
          name: playerObj.name || '未知球友',
          type: typeConfig,
          isFunder,
          isPeriodDrop,
          prevCount,
          currCount,
          dropCount: prevCount > currCount ? prevCount - currCount : 0,
          isConsecutiveAbsence,
          consecutiveMissedCount: consecutiveMissed
        });
      }
    });

    // Priority Sort:
    // 1. Players meeting both rules first
    // 2. Completely absent this period (currCount === 0)
    // 3. Higher consecutive absences descending
    // 4. Higher previous attendance descending
    list.sort((a, b) => {
      const aBoth = a.isPeriodDrop && a.isConsecutiveAbsence ? 1 : 0;
      const bBoth = b.isPeriodDrop && b.isConsecutiveAbsence ? 1 : 0;
      if (aBoth !== bBoth) return bBoth - aBoth;

      if (a.currCount === 0 && b.currCount !== 0) return -1;
      if (b.currCount === 0 && a.currCount !== 0) return 1;

      if (b.consecutiveMissedCount !== a.consecutiveMissedCount) {
        return b.consecutiveMissedCount - a.consecutiveMissedCount;
      }
      return b.prevCount - a.prevCount;
    });

    const consecutives = list.filter(p => p.isConsecutiveAbsence).length;
    const zeros = list.filter(p => p.currCount === 0).length;
    const ones = list.filter(p => p.currCount === 1).length;

    return {
      alertList: list,
      consecutiveCount: consecutives,
      zeroCount: zeros,
      oneCount: ones,
      totalTimelineSessions: K
    };
  }, [currentPeriod, previousPeriod, players, allPeriods]);

  // Filtered list based on active tab
  const displayedList = useMemo(() => {
    if (filterType === 'consecutive') {
      return alertList.filter(p => p.isConsecutiveAbsence);
    }
    if (filterType === 'zero') {
      return alertList.filter(p => p.currCount === 0);
    }
    if (filterType === 'one') {
      return alertList.filter(p => p.currCount === 1);
    }
    return alertList;
  }, [alertList, filterType]);

  // Copy care list to clipboard
  const handleCopyCareList = () => {
    if (alertList.length === 0) return;

    const lines = [
      `🏸【羽毛球俱乐部 · 常客出勤关怀提醒】`,
      `📅 统计周期：${currentPeriod.name}${previousPeriod ? ` (对比上期: ${previousPeriod.name})` : ''}`,
      `📌 预警触发规则：`,
      `  1. 周期锐减：上期出勤≥3次 ➔ 本期不足2次`,
      `  2. 连续缺勤：已连续4~12次未打球 (超过12次已自动过滤)`,
      `👥 缺勤关怀名单（共 ${alertList.length} 人）：`,
      ...alertList.map((p, idx) => {
        const typeStr = `[${p.type}${p.isFunder ? '·👑集资人' : ''}]`;
        const reasons: string[] = [];
        if (p.isConsecutiveAbsence) {
          reasons.push(`连续缺席 ${p.consecutiveMissedCount} 次未打球`);
        }
        if (p.isPeriodDrop) {
          reasons.push(`上期 ${p.prevCount}次 ➔ 本期 ${p.currCount}次 (出勤减少 ${p.dropCount} 次)`);
        } else if (p.currCount === 0) {
          reasons.push(`本期未到场`);
        } else {
          reasons.push(`本期仅到场 ${p.currCount} 次`);
        }
        return `${idx + 1}. ${p.name} ${typeStr}：${reasons.join('；')}`;
      }),
      '',
      `💡 建议组织者抽空微信私聊关怀，询问是否出差/受伤/时间冲突，促进常客球友回归！`
    ].join('\n');

    const copyToClipboard = async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(lines);
          setCopied(true);
        } else {
          const textArea = document.createElement('textarea');
          textArea.value = lines;
          textArea.style.position = 'fixed';
          textArea.style.left = '-9999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          setCopied(true);
        }
        setTimeout(() => setCopied(false), 2500);
      } catch (err) {
        console.error('Copy failed', err);
      }
    };

    copyToClipboard();
  };

  // If there's no data to compare and no sessions recorded
  if (!previousPeriod && totalTimelineSessions < 4) {
    return (
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 backdrop-blur-md">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-bold">常客缺勤预警提示：</span>
            <span>当前为首个周期且活动记录不足4场，暂无对比基准。当存在前一周期出勤数据或球友累计连续缺勤4场以上时，系统将自动汇总预警。</span>
          </div>
        </div>
      </div>
    );
  }

  // If there are no drop-off or consecutive absent members detected
  if (alertList.length === 0) {
    return (
      <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 backdrop-blur-md shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                <span>球友粘性良好 · 无常客缺勤预警</span>
                {previousPeriod && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    对比上期: {previousPeriod.name}
                  </span>
                )}
              </h4>
              <p className="text-[11px] text-emerald-800/80 mt-0.5 font-medium">
                俱乐部常客均正常出勤，且无连续缺勤4~12场的球友。
              </p>
            </div>
          </div>
          <span className="text-xl select-none">🏸✨</span>
        </div>
      </div>
    );
  }

  // Member type badge styling
  const getTypeBadgeClass = (type: PlayerType) => {
    switch (type) {
      case PlayerType.MONTHLY:
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case PlayerType.HALF_MONTHLY:
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case PlayerType.PER_SESSION:
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  // Collapse / expand toggle state
  const isExpanded = userExpandedState[currentPeriod.id] !== undefined
    ? userExpandedState[currentPeriod.id]
    : alertList.length <= 3;

  const toggleExpand = () => {
    setUserExpandedState(prev => ({
      ...prev,
      [currentPeriod.id]: !isExpanded
    }));
  };

  return (
    <div className="bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-red-500/10 border-2 border-amber-400/50 rounded-3xl p-5 backdrop-blur-md shadow-sm space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-amber-950">
                常客出勤异动预警
              </h3>
              <span className="text-[10px] bg-amber-500/20 text-amber-900 border border-amber-500/30 px-2 py-0.5 rounded-full font-black">
                {alertList.length} 人需关怀
              </span>
              {consecutiveCount > 0 && (
                <span className="text-[10px] bg-red-500/20 text-red-900 border border-red-400/40 px-2 py-0.5 rounded-full font-black">
                  {consecutiveCount} 人连续缺席≥4次
                </span>
              )}
            </div>
            <p className="text-[11px] text-amber-900/80 mt-0.5">
              包含：<b>周期出勤骤降</b> (上期≥3次➔本期不足2次) 与 <b>连续4~12次未打球</b> (超12次不提醒)
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto flex-wrap">
          <button
            onClick={handleCopyCareList}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black shadow-sm transition-all active:scale-95 cursor-pointer ${
              copied
                ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                : 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20'
            }`}
            title="一键复制名单与关怀文案，可直接粘贴发送至微信沟通"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>已复制关怀名单</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>一键复制关怀名单</span>
              </>
            )}
          </button>

          <button
            onClick={toggleExpand}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-950 bg-white/50 hover:bg-white/80 border border-amber-400/50 shadow-xs transition-all active:scale-95 cursor-pointer"
            title={isExpanded ? '点击折叠详细名单以保持页面整洁' : '点击展开查看完整出勤对比名单'}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-amber-800" />
                <span>折叠明细</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-amber-800" />
                <span>展开明细 ({alertList.length})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsed state preview banner */}
      {!isExpanded && (
        <div
          onClick={toggleExpand}
          className="bg-white/40 hover:bg-white/60 border border-amber-300/50 hover:border-amber-400/80 rounded-2xl p-3.5 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group shadow-xs"
        >
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              名单已折叠
            </span>
            <span className="text-[11px] text-amber-900/80 font-medium">
              (共 {alertList.length} 人：{consecutiveCount} 人连续缺席≥4次，{zeroCount} 人本期未到场)
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {alertList.slice(0, 5).map(p => (
                <span
                  key={p.id}
                  className="text-[10px] bg-white/70 border border-amber-200/80 text-amber-900 px-1.5 py-0.5 rounded-md font-semibold"
                >
                  {p.name} {p.isConsecutiveAbsence ? `(缺席${p.consecutiveMissedCount}次)` : ''}
                </span>
              ))}
              {alertList.length > 5 && (
                <span className="text-[10px] text-amber-800/80 font-bold">
                  等 {alertList.length} 人...
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs font-black text-amber-800 group-hover:text-amber-950 shrink-0 self-end sm:self-auto">
            <span>点击展开完整对比明细</span>
            <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5" />
          </div>
        </div>
      )}

      {/* Expanded detailed breakdown */}
      {isExpanded && (
        <>
          {/* Metrics Row & Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            <button
              onClick={() => setFilterType('all')}
              className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-amber-500/25 border-amber-500/40 shadow-sm'
                  : 'bg-white/30 border-white/40 hover:bg-white/40'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-bold text-amber-900">
                <span>全部预警</span>
                <Users className="w-3.5 h-3.5 opacity-60" />
              </div>
              <p className="text-lg font-black text-amber-950 mt-0.5">{alertList.length} <span className="text-[10px] font-bold">人</span></p>
            </button>

            <button
              onClick={() => setFilterType('consecutive')}
              className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterType === 'consecutive'
                  ? 'bg-red-500/25 border-red-500/40 shadow-sm ring-1 ring-red-400/50'
                  : 'bg-white/30 border-white/40 hover:bg-white/40'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-bold text-red-900">
                <span>连续缺席 (4~12次)</span>
                <Clock className="w-3.5 h-3.5 text-red-600" />
              </div>
              <p className="text-lg font-black text-red-700 mt-0.5">{consecutiveCount} <span className="text-[10px] font-bold text-red-900">人</span></p>
            </button>

            <button
              onClick={() => setFilterType('zero')}
              className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterType === 'zero'
                  ? 'bg-rose-500/25 border-rose-500/40 shadow-sm'
                  : 'bg-white/30 border-white/40 hover:bg-white/40'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-bold text-rose-900">
                <span>本期完全缺勤 (0次)</span>
                <UserX className="w-3.5 h-3.5 opacity-60 text-rose-600" />
              </div>
              <p className="text-lg font-black text-rose-700 mt-0.5">{zeroCount} <span className="text-[10px] font-bold text-rose-900">人</span></p>
            </button>

            <button
              onClick={() => setFilterType('one')}
              className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterType === 'one'
                  ? 'bg-orange-500/25 border-orange-500/40 shadow-sm'
                  : 'bg-white/30 border-white/40 hover:bg-white/40'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-bold text-orange-950">
                <span>出勤锐减 (仅1次)</span>
                <TrendingDown className="w-3.5 h-3.5 opacity-60 text-orange-600" />
              </div>
              <p className="text-lg font-black text-orange-800 mt-0.5">{oneCount} <span className="text-[10px] font-bold text-orange-950">人</span></p>
            </button>
          </div>

          {/* Warning List */}
          <div className="bg-white/40 border border-white/60 rounded-2xl overflow-hidden backdrop-blur-md">
            <div className="px-3.5 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between text-[10px] font-black text-amber-950">
              <span className="flex items-center gap-1">
                <HeartHandshake className="w-3.5 h-3.5 text-amber-700" />
                需关注球友 ({displayedList.length} 人)
              </span>
              <span className="text-amber-800/80 font-medium">
                点击上方分类卡片可快速筛选 · 超过12次未打球已自动过滤
              </span>
            </div>

            <div className="divide-y divide-amber-500/15 max-h-80 overflow-y-auto">
              {displayedList.map(player => (
                <div
                  key={player.id}
                  className="p-3.5 hover:bg-white/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  {/* Left: Player Identity & Tags */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-xs text-amber-950 tracking-wide">
                      {player.name}
                    </span>

                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${getTypeBadgeClass(player.type)}`}>
                      {player.type}
                    </span>

                    {player.isFunder && (
                      <span className="text-[9px] font-black bg-amber-500/20 text-amber-900 border border-amber-500/30 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                        👑 集资人
                      </span>
                    )}

                    {/* Consecutive absences badge */}
                    {player.isConsecutiveAbsence && (
                      <span className="text-[9px] font-black bg-red-100 text-red-800 border border-red-300 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                        <Clock className="w-3 h-3 text-red-600 shrink-0" />
                        <span>已连续缺席 {player.consecutiveMissedCount} 次</span>
                      </span>
                    )}

                    {/* Period comparison status */}
                    {player.currCount === 0 ? (
                      <span className="text-[9px] font-black bg-rose-500/15 text-rose-700 border border-rose-500/20 px-2 py-0.5 rounded-full">
                        本期完全缺勤
                      </span>
                    ) : (
                      <span className="text-[9px] font-black bg-orange-500/15 text-orange-800 border border-orange-500/20 px-2 py-0.5 rounded-full">
                        本期仅出勤1次
                      </span>
                    )}
                  </div>

                  {/* Right: Attendance Comparison */}
                  <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0 flex-wrap">
                    {player.isPeriodDrop && previousPeriod && (
                      <div className="flex items-center gap-1.5 text-xs font-black">
                        <span className="text-emerald-800 bg-emerald-100/80 border border-emerald-200 px-2 py-0.5 rounded-md text-[11px]" title="上一周期打球出勤">
                          上期 {player.prevCount}次
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-amber-700/60" />
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] border ${
                            player.currCount === 0
                              ? 'bg-rose-100 text-rose-700 border-rose-200'
                              : 'bg-orange-100 text-orange-800 border-orange-200'
                          }`}
                          title="当前周期打球出勤"
                        >
                          本期 {player.currCount}次
                        </span>
                        {player.dropCount > 0 && (
                          <div className="flex items-center gap-0.5 text-[10px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                            <TrendingDown className="w-3 h-3" />
                            <span>-{player.dropCount}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {!player.isPeriodDrop && (
                      <div className="text-[11px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-0.5 rounded-md">
                        本期出勤 {player.currCount} 次
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {displayedList.length === 0 && (
                <div className="py-6 text-center text-xs text-amber-900/60">
                  当前筛选条件下暂无对应球友
                </div>
              )}
            </div>
          </div>

          {/* Bottom footer with tip & collapse button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] text-amber-900/75 px-1 font-medium">
            <span>💡 预警规则说明：连续4~12次未打球自动累计预警，超过12次视为长期离队自动停止提醒。使用「一键复制关怀名单」可便捷微信关怀。</span>
            <button
              onClick={toggleExpand}
              className="flex items-center gap-1 text-xs font-bold text-amber-900/80 hover:text-amber-950 px-2.5 py-1 rounded-lg hover:bg-amber-500/15 transition-colors cursor-pointer shrink-0 self-end sm:self-auto"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>收起明细</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
