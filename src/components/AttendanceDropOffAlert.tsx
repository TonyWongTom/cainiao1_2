import React, { useState, useMemo } from 'react';
import { Period, Player, PlayerType } from '../types';
import { AlertTriangle, Copy, Check, Users, UserX, ArrowRight, TrendingDown, Info, HeartHandshake, ChevronDown, ChevronUp } from 'lucide-react';

interface AttendanceDropOffAlertProps {
  currentPeriod: Period;
  previousPeriod: Period | null;
  players: Player[];
}

interface DropOffPlayerInfo {
  id: string;
  name: string;
  prevCount: number;
  currCount: number;
  dropCount: number;
  type: PlayerType;
  isFunder: boolean;
}

export const AttendanceDropOffAlert: React.FC<AttendanceDropOffAlertProps> = ({
  currentPeriod,
  previousPeriod,
  players
}) => {
  const [copied, setCopied] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'zero' | 'one'>('all');
  const [userExpandedState, setUserExpandedState] = useState<Record<string, boolean>>({});

  // Compute attendance drop-off list
  const { alertList, zeroCount, oneCount, prevTotalSessions, currTotalSessions } = useMemo(() => {
    if (!previousPeriod) {
      return { alertList: [], zeroCount: 0, oneCount: 0, prevTotalSessions: 0, currTotalSessions: 0 };
    }

    const prevSessions = Array.isArray(previousPeriod.sessions) ? previousPeriod.sessions : [];
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

    // Gather all candidate player IDs (from previous period attendances or player list)
    const candidateIds = new Set<string>();
    prevMap.forEach((_, pid) => candidateIds.add(pid));

    const list: DropOffPlayerInfo[] = [];

    candidateIds.forEach(pid => {
      const prevCount = prevMap.get(pid) || 0;
      const currCount = currMap.get(pid) || 0;

      // Condition confirmed by user: 上周期出勤3次以上 (prevCount >= 3) 且本周期出勤不足2次 (currCount < 2)
      if (prevCount >= 3 && currCount < 2) {
        const playerObj = players.find(p => p.id === pid);
        const name = playerObj?.name || '未知球友';

        // Check player type: period-specific config or default player type
        const typeConfig = currentPeriod.playerConfigs?.find(c => c.playerId === pid)?.type 
          || previousPeriod.playerConfigs?.find(c => c.playerId === pid)?.type 
          || playerObj?.type 
          || PlayerType.PER_SESSION;

        const isFunder = Boolean(
          (Array.isArray(currentPeriod.funderIds) && currentPeriod.funderIds.includes(pid)) ||
          (Array.isArray(previousPeriod.funderIds) && previousPeriod.funderIds.includes(pid)) ||
          playerObj?.isFunder
        );

        list.push({
          id: pid,
          name,
          prevCount,
          currCount,
          dropCount: prevCount - currCount,
          type: typeConfig,
          isFunder
        });
      }
    });

    // Sort: completely absent (currCount === 0) first, then by prevCount descending
    list.sort((a, b) => {
      if (a.currCount !== b.currCount) {
        return a.currCount - b.currCount; // 0 comes before 1
      }
      return b.prevCount - a.prevCount; // higher previous attendance first
    });

    const zeros = list.filter(p => p.currCount === 0).length;
    const ones = list.filter(p => p.currCount === 1).length;

    return {
      alertList: list,
      zeroCount: zeros,
      oneCount: ones,
      prevTotalSessions: prevSessions.length,
      currTotalSessions: currSessions.length
    };
  }, [currentPeriod, previousPeriod, players]);

  // Filtered list based on tab
  const displayedList = useMemo(() => {
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
    if (!previousPeriod || alertList.length === 0) return;

    const lines = [
      `🏸【羽毛球俱乐部 · 常客出勤关怀提醒】`,
      `📅 对比周期：${previousPeriod.name} ➔ ${currentPeriod.name}`,
      `📌 预警标准：上周期出勤≥3次，本周期出勤不足2次`,
      `👥 缺勤关怀名单（共 ${alertList.length} 人）：`,
      ...alertList.map((p, idx) => {
        const typeStr = `[${p.type}${p.isFunder ? '·👑集资人' : ''}]`;
        const currDesc = p.currCount === 0 ? '本期未到场' : '仅到场1次';
        return `${idx + 1}. ${p.name} ${typeStr}：上期 ${p.prevCount}次 ➔ 本期 ${p.currCount}次 (${currDesc}，出勤减少 ${p.dropCount} 次)`;
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
          // Fallback for iframe environments
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

  // If there's no previous period available
  if (!previousPeriod) {
    return (
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 backdrop-blur-md">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-bold">常客缺勤预警提示：</span>
            <span>当前为最早或唯一的结算周期，暂无上一周期出勤数据作为对比基准。当俱乐部存在2个及以上周期记录时，系统将自动比对“上周期常来（≥3次）但本周期未怎么来（&lt;2次）”的球友并在此提醒。</span>
          </div>
        </div>
      </div>
    );
  }

  // If there are no drop-off members detected
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
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                  对比上期: {previousPeriod.name}
                </span>
              </h4>
              <p className="text-[11px] text-emerald-800/80 mt-0.5 font-medium">
                上一周期出勤 ≥3 次的球友在当前周期均正常打球（出勤均达到 2 次及以上）。
              </p>
            </div>
          </div>
          <span className="text-xl select-none">🏸✨</span>
        </div>
      </div>
    );
  }

  // Member type styling helper
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

  // User toggleable expansion state (defaults to collapsed if list > 3 to keep page neat)
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
                {alertList.length} 人出勤显著骤降
              </span>
            </div>
            <p className="text-[11px] text-amber-900/80 mt-0.5">
              对比上周期 <span className="font-bold text-amber-950">{previousPeriod.name}</span> (出勤≥3次) ➔ 本周期 <span className="font-bold text-amber-950">{currentPeriod.name}</span> (出勤不足2次)
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
              (共 {alertList.length} 人：{zeroCount} 人本期未到场，{oneCount} 人仅出勤1次)
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {alertList.slice(0, 5).map(p => (
                <span
                  key={p.id}
                  className="text-[10px] bg-white/70 border border-amber-200/80 text-amber-900 px-1.5 py-0.5 rounded-md font-semibold"
                >
                  {p.name}
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
          <div className="grid grid-cols-3 gap-2.5 pt-1">
            <button
              onClick={() => setFilterType('all')}
              className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-amber-500/25 border-amber-500/40 shadow-sm'
                  : 'bg-white/30 border-white/40 hover:bg-white/40'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-bold text-amber-900">
                <span>预警总数</span>
                <Users className="w-3.5 h-3.5 opacity-60" />
              </div>
              <p className="text-lg font-black text-amber-950 mt-0.5">{alertList.length} <span className="text-[10px] font-bold">人</span></p>
            </button>

            <button
              onClick={() => setFilterType('zero')}
              className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                filterType === 'zero'
                  ? 'bg-red-500/25 border-red-500/40 shadow-sm'
                  : 'bg-white/30 border-white/40 hover:bg-white/40'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-bold text-red-900">
                <span>本期未到场 (0次)</span>
                <UserX className="w-3.5 h-3.5 opacity-60 text-red-600" />
              </div>
              <p className="text-lg font-black text-red-700 mt-0.5">{zeroCount} <span className="text-[10px] font-bold text-red-900">人</span></p>
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
                <HeartHandshake className="w-3 h-3 text-amber-700" />
                需关注球友 ({displayedList.length} 人)
              </span>
              <span className="text-amber-800/80 font-medium">
                点击上方分类卡片可快速筛选
              </span>
            </div>

            <div className="divide-y divide-amber-500/15 max-h-72 overflow-y-auto">
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

                    {player.currCount === 0 ? (
                      <span className="text-[9px] font-black bg-red-500/15 text-red-700 border border-red-500/20 px-2 py-0.5 rounded-full">
                        本期完全缺勤
                      </span>
                    ) : (
                      <span className="text-[9px] font-black bg-orange-500/15 text-orange-800 border border-orange-500/20 px-2 py-0.5 rounded-full">
                        本期仅出勤1次
                      </span>
                    )}
                  </div>

                  {/* Right: Attendance Comparison */}
                  <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
                    <div className="flex items-center gap-1.5 text-xs font-black">
                      <span className="text-emerald-800 bg-emerald-100/80 border border-emerald-200 px-2 py-0.5 rounded-md text-[11px]" title="上一周期打球出勤">
                        上期 {player.prevCount}次
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-amber-700/60" />
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] border ${
                          player.currCount === 0
                            ? 'bg-red-100 text-red-700 border-red-200'
                            : 'bg-orange-100 text-orange-800 border-orange-200'
                        }`}
                        title="当前周期打球出勤"
                      >
                        本期 {player.currCount}次
                      </span>
                    </div>

                    <div className="flex items-center gap-0.5 text-[10px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                      <TrendingDown className="w-3 h-3" />
                      <span>-{player.dropCount}</span>
                    </div>
                  </div>
                </div>
              ))}

              {displayedList.length === 0 && (
                <div className="py-6 text-center text-xs text-amber-900/60">
                  当前分类下暂无对应球友
                </div>
              )}
            </div>
          </div>

          {/* Bottom footer with tip & collapse button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] text-amber-900/75 px-1 font-medium">
            <span>💡 建议：可使用上方「一键复制关怀名单」在微信私信球友，及时了解意向以提升俱乐部活跃度。</span>
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
