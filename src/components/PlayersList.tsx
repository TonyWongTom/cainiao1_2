
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Player, PlayerType, Period, PeriodPlayerConfig } from '../types';
import { Icons, DEFAULT_SESSION_FEE, DEFAULT_MONTHLY_FEE, DEFAULT_HALF_MONTHLY_FEE } from '../constants';
import { useAppContext } from '../context/AppContext';

const getTypeOrder = (type?: PlayerType) => {
  if (type === PlayerType.MONTHLY) return 1;
  if (type === PlayerType.HALF_MONTHLY) return 2;
  if (type === PlayerType.PER_SESSION) return 3;
  return 4;
};

interface PlayersListProps {
}

const PlayersList: React.FC<PlayersListProps> = () => {
  const { players, setPlayers, periods, setPeriods, setNotification } = useAppContext();

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 批量修改成员性质相关状态
  const [isBatchEditing, setIsBatchEditing] = useState(false);
  const [batchTargetType, setBatchTargetType] = useState<PlayerType>(PlayerType.MONTHLY);
  const [batchFee, setBatchFee] = useState<number | ''>(DEFAULT_MONTHLY_FEE);
  const [batchInputText, setBatchInputText] = useState('');
  const [batchSelectedPlayerIds, setBatchSelectedPlayerIds] = useState<string[]>([]);
  const [batchMemberSearch, setBatchMemberSearch] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<Partial<Player>>({
    name: '',
    type: PlayerType.PER_SESSION,
    defaultFee: DEFAULT_SESSION_FEE,
    isFunder: false
  });

  const sortedPeriodsDesc = useMemo(() => {
    if (!Array.isArray(periods) || periods.length === 0) return [];
    return [...periods].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  }, [periods]);

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');

  useEffect(() => {
    if (sortedPeriodsDesc.length > 0) {
      if (!selectedPeriodId || !sortedPeriodsDesc.some(p => p.id === selectedPeriodId)) {
        setSelectedPeriodId(sortedPeriodsDesc[0].id);
      }
    } else {
      setSelectedPeriodId('');
    }
  }, [sortedPeriodsDesc, selectedPeriodId]);

  const activePeriod = useMemo(() => {
    return periods.find(p => p.id === selectedPeriodId) || sortedPeriodsDesc[0] || null;
  }, [periods, selectedPeriodId, sortedPeriodsDesc]);

  const latestPeriod = useMemo(() => {
    return sortedPeriodsDesc.length > 0 ? sortedPeriodsDesc[0] : null;
  }, [sortedPeriodsDesc]);

  const getPlayerPeriodConfig = (player: Player) => {
    if (activePeriod && activePeriod.playerConfigs) {
      const cfg = activePeriod.playerConfigs.find(c => c.playerId === player.id);
      if (cfg) {
        return { type: cfg.type, fee: cfg.fee };
      }
    }
    return {
      type: player.type || PlayerType.PER_SESSION,
      fee: player.defaultFee ?? DEFAULT_SESSION_FEE
    };
  };

  const activePeriodStats = useMemo(() => {
    if (!players || players.length === 0) return { monthly: 0, half: 0, perSession: 0 };
    let monthly = 0;
    let half = 0;
    let perSession = 0;
    players.forEach(p => {
      const cfg = getPlayerPeriodConfig(p);
      if (cfg.type === PlayerType.MONTHLY) monthly++;
      else if (cfg.type === PlayerType.HALF_MONTHLY) half++;
      else perSession++;
    });
    return { monthly, half, perSession };
  }, [players, activePeriod]);

  useEffect(() => {
    if (confirmDeleteId) {
      const timer = setTimeout(() => setConfirmDeleteId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [confirmDeleteId]);

  // 批量输入的文本实时解析与匹配
  const parsedNamesInfo = useMemo(() => {
    if (!batchInputText.trim()) {
      return { matched: [] as Player[], unmatched: [] as string[] };
    }
    const tokens = batchInputText.split(/[\r\n,，;；、\s/]+/);
    const uniqueRawNames: string[] = [];
    tokens.forEach(tok => {
      const cleaned = tok.replace(/^[\(\[\{（【]?\d+[\)\]\}）】\.\、\:\：\s]+/, '').trim();
      if (cleaned && !uniqueRawNames.includes(cleaned)) {
        uniqueRawNames.push(cleaned);
      }
    });

    const matched: Player[] = [];
    const unmatched: string[] = [];

    uniqueRawNames.forEach(raw => {
      const normalized = raw.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').toLowerCase();
      if (!normalized) return;

      let p = players.find(pl => pl.name.trim().toLowerCase() === raw.toLowerCase());
      if (!p) {
        p = players.find(pl => {
          const normP = pl.name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').toLowerCase();
          return normP === normalized;
        });
      }
      if (!p && normalized.length >= 2) {
        p = players.find(pl => {
          const normP = pl.name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').toLowerCase();
          return normP && (normP.includes(normalized) || normalized.includes(normP));
        });
      }

      if (p) {
        if (!matched.some(m => m.id === p!.id)) {
          matched.push(p);
        }
      } else {
        if (!unmatched.includes(raw)) {
          unmatched.push(raw);
        }
      }
    });

    return { matched, unmatched };
  }, [batchInputText, players]);

  // 当识别到匹配人员时，自动合并到选中人员列表中
  useEffect(() => {
    if (parsedNamesInfo.matched.length > 0) {
      setBatchSelectedPlayerIds(prev => {
        const set = new Set(prev);
        parsedNamesInfo.matched.forEach(p => set.add(p.id));
        return Array.from(set);
      });
    }
  }, [parsedNamesInfo.matched]);

  const handleSelectBatchType = (type: PlayerType) => {
    setBatchTargetType(type);
    if (type === PlayerType.MONTHLY) setBatchFee(DEFAULT_MONTHLY_FEE);
    else if (type === PlayerType.HALF_MONTHLY) setBatchFee(DEFAULT_HALF_MONTHLY_FEE);
    else if (type === PlayerType.PER_SESSION) setBatchFee(DEFAULT_SESSION_FEE);
  };

  const handleBatchSave = () => {
    if (batchSelectedPlayerIds.length === 0) {
      if (setNotification) {
        setNotification({ message: '请先输入或选择要统一修改性质的成员', type: 'error' });
      } else {
        alert('请先输入或选择要统一修改性质的成员');
      }
      return;
    }
    const finalFee = batchFee === '' ? (
      batchTargetType === PlayerType.MONTHLY ? DEFAULT_MONTHLY_FEE :
      batchTargetType === PlayerType.HALF_MONTHLY ? DEFAULT_HALF_MONTHLY_FEE : DEFAULT_SESSION_FEE
    ) : Number(batchFee);

    let resetCount = 0;

    // 1. 同步更新当前选中的周期 playerConfigs
    if (activePeriod) {
      setPeriods(prev => prev.map(p => {
        if (p.id === activePeriod.id) {
          const newConfigs: PeriodPlayerConfig[] = players.map(pl => {
            if (batchSelectedPlayerIds.includes(pl.id)) {
              return {
                playerId: pl.id,
                type: batchTargetType,
                fee: finalFee
              };
            }
            // 未选中的人员重置为“按次”
            const prevCfg = p.playerConfigs?.find(c => c.playerId === pl.id);
            const wasMonthlyOrHalf = prevCfg ? (prevCfg.type === PlayerType.MONTHLY || prevCfg.type === PlayerType.HALF_MONTHLY) : (pl.type === PlayerType.MONTHLY || pl.type === PlayerType.HALF_MONTHLY);
            if (wasMonthlyOrHalf) {
              resetCount++;
            }
            return {
              playerId: pl.id,
              type: PlayerType.PER_SESSION,
              fee: DEFAULT_SESSION_FEE
            };
          });
          // 遇到集资人员没有包月的情况，也同步到“本期集资名单”里，没有包月的集资人员，当期不计入集资名单
          // 只有既是集资人(pl.isFunder)且当期配置为“包月”的人员，才计入当期集资名单
          const updatedFunderIds = players
            .filter(pl => pl.isFunder)
            .filter(pl => {
              const cfg = newConfigs.find(c => c.playerId === pl.id);
              return cfg?.type === PlayerType.MONTHLY;
            })
            .map(pl => pl.id);

          return { ...p, playerConfigs: newConfigs, funderIds: updatedFunderIds };
        }
        return p;
      }));
    }

    // 2. 同时更新基础人员列表
    setPlayers(prev => prev.map(p => {
      if (batchSelectedPlayerIds.includes(p.id)) {
        return {
          ...p,
          type: batchTargetType,
          defaultFee: finalFee
        };
      }
      return {
        ...p,
        type: PlayerType.PER_SESSION,
        defaultFee: DEFAULT_SESSION_FEE
      };
    }));

    const modifiedCount = batchSelectedPlayerIds.length;
    const periodName = activePeriod ? `【${activePeriod.name}】` : '';
    const msg = `已更新${periodName} ${modifiedCount} 人为【${batchTargetType}】，未在名单中的 ${resetCount} 位原包月成员已自动转为【按次】（集资名单已实时同步）`;
    if (setNotification) {
      setNotification({ message: msg, type: 'success' });
    }
    setIsBatchEditing(false);
    setBatchInputText('');
    setBatchSelectedPlayerIds([]);
  };

  const handleQuickChangeNature = (playerId: string, targetType: PlayerType) => {
    let defaultFeeForType = DEFAULT_SESSION_FEE;
    if (targetType === PlayerType.MONTHLY) defaultFeeForType = DEFAULT_MONTHLY_FEE;
    else if (targetType === PlayerType.HALF_MONTHLY) defaultFeeForType = DEFAULT_HALF_MONTHLY_FEE;

    const targetPlayer = players.find(p => p.id === playerId);
    const isFunder = targetPlayer?.isFunder;

    if (activePeriod) {
      setPeriods(prev => prev.map(p => {
        if (p.id === activePeriod.id) {
          const currentConfigs = p.playerConfigs || [];
          const idx = currentConfigs.findIndex(c => c.playerId === playerId);
          const newCfg: PeriodPlayerConfig = {
            playerId,
            type: targetType,
            fee: defaultFeeForType
          };
          const updated = idx > -1
            ? currentConfigs.map(c => c.playerId === playerId ? newCfg : c)
            : [...currentConfigs, newCfg];

          let updatedFunderIds = p.funderIds || [];
          if (isFunder) {
            if (targetType === PlayerType.MONTHLY) {
              if (!updatedFunderIds.includes(playerId)) {
                updatedFunderIds = [...updatedFunderIds, playerId];
              }
            } else {
              // 没有包月的集资人员，当期不计入集资名单
              updatedFunderIds = updatedFunderIds.filter(id => id !== playerId);
            }
          }
          return { ...p, playerConfigs: updated, funderIds: updatedFunderIds };
        }
        return p;
      }));
    }
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, type: targetType, defaultFee: defaultFeeForType } : p));
    if (setNotification) {
      const periodName = activePeriod ? `在本期【${activePeriod.name}】` : '';
      setNotification({ message: `已将该成员${periodName}设为【${targetType}】`, type: 'success' });
    }
  };

  const filteredPlayers = useMemo(() => {
    if (!Array.isArray(players)) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return players;
    return players.filter(p => {
      const pCfg = getPlayerPeriodConfig(p);
      return p.name.toLowerCase().includes(q) ||
        (pCfg.type && pCfg.type.toLowerCase().includes(q)) ||
        (p.type && p.type.toLowerCase().includes(q));
    });
  }, [players, searchQuery, activePeriod]);

  const handleSave = () => {
    if (!formData.name) return;
    
    // Check for duplicates
    const isDuplicate = players.some(p => 
      p.name.trim() === formData.name?.trim() && p.id !== editingId
    );
    
    if (isDuplicate) {
      alert(`已存在姓名为 "${formData.name.trim()}" 的成员，不能重复添加，将保留原记录。`);
      return;
    }

    const feeVal = formData.defaultFee !== undefined && formData.defaultFee !== ('' as any)
      ? Number(formData.defaultFee)
      : (formData.type === PlayerType.MONTHLY ? DEFAULT_MONTHLY_FEE : formData.type === PlayerType.HALF_MONTHLY ? DEFAULT_HALF_MONTHLY_FEE : DEFAULT_SESSION_FEE);

    if (editingId) {
      const targetId = editingId;
      setPlayers(prev => prev.map(p => p.id === targetId ? { ...p, ...formData, defaultFee: feeVal, name: formData.name!.trim() } as Player : p));
      
      if (activePeriod) {
        setPeriods(prev => prev.map(p => {
          if (p.id === activePeriod.id) {
            const currentConfigs = p.playerConfigs || [];
            const idx = currentConfigs.findIndex(c => c.playerId === targetId);
            const targetType = formData.type || PlayerType.PER_SESSION;
            const newCfg: PeriodPlayerConfig = {
              playerId: targetId,
              type: targetType,
              fee: feeVal
            };
            const updatedConfigs = idx > -1
              ? currentConfigs.map(c => c.playerId === targetId ? newCfg : c)
              : [...currentConfigs, newCfg];
            let updatedFunderIds = p.funderIds || [];
            const effectiveIsFunder = formData.isFunder !== undefined ? Boolean(formData.isFunder) : Boolean(players.find(pl => pl.id === targetId)?.isFunder);
            if (effectiveIsFunder) {
              if (targetType === PlayerType.MONTHLY) {
                if (!updatedFunderIds.includes(targetId)) updatedFunderIds = [...updatedFunderIds, targetId];
              } else {
                updatedFunderIds = updatedFunderIds.filter(id => id !== targetId);
              }
            } else {
              updatedFunderIds = updatedFunderIds.filter(id => id !== targetId);
            }

            return { ...p, playerConfigs: updatedConfigs, funderIds: updatedFunderIds };
          }
          return p;
        }));
      }
      setEditingId(null);
    } else {
      const newPlayerId = Date.now().toString();
      const newPlayer: Player = {
        id: newPlayerId,
        name: formData.name.trim(),
        type: formData.type as PlayerType || PlayerType.PER_SESSION,
        defaultFee: feeVal,
        isFunder: !!formData.isFunder
      };
      setPlayers(prev => [...prev, newPlayer]);

      if (activePeriod) {
        setPeriods(prev => prev.map(p => {
          if (p.id === activePeriod.id) {
            const currentConfigs = p.playerConfigs || [];
            const shouldBeFunder = newPlayer.isFunder && newPlayer.type === PlayerType.MONTHLY;
            const updatedFunderIds = shouldBeFunder ? [...(p.funderIds || []), newPlayerId] : (p.funderIds || []);
            return {
              ...p,
              funderIds: updatedFunderIds,
              playerConfigs: [...currentConfigs, {
                playerId: newPlayerId,
                type: newPlayer.type,
                fee: newPlayer.defaultFee
              }]
            };
          }
          return p;
        }));
      }
      setIsAdding(false);
    }
    setFormData({ name: '', type: PlayerType.PER_SESSION, defaultFee: DEFAULT_SESSION_FEE, isFunder: false });
  };

  const startEdit = (player: Player) => {
    setEditingId(player.id);
    const cfg = getPlayerPeriodConfig(player);
    setFormData({
      ...player,
      type: cfg.type,
      defaultFee: cfg.fee
    });
    setIsAdding(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (confirmDeleteId === id) {
      setPlayers(prev => prev.filter(p => p.id !== id));
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
    }
  };

  const isCurrentlyFunder = (playerId: string) => {
    if (activePeriod) {
      return activePeriod.funderIds?.includes(playerId) || false;
    }
    return latestPeriod?.funderIds?.includes(playerId) || false;
  };

  // --- CSV 功能模块 ---

  const downloadCSV = (content: string, fileName: string) => {
    const blob = new Blob(["\ufeff" + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToCSV = () => {
    const headers = ['姓名', '类型(包月/包半月/按次)', '单次收费金额', '是否核心集资备选(是/否)'];
    const rows = players.map(p => [p.name, p.type, p.defaultFee, p.isFunder ? '是' : '否']);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    downloadCSV(csvContent, `羽球成员名单_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const downloadTemplate = () => {
    const headers = ['姓名', '类型(包月/包半月/按次)', '单次收费金额', '是否核心集资备选(是/否)'];
    const example = ['张三', '按次', '25', '否'];
    const csvContent = [headers, example].map(e => e.join(",")).join("\n");
    downloadCSV(csvContent, "成员导入模板.csv");
  };

  const importFromCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/);
      const newPlayers: Player[] = [];
      
      // 跳过表头
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // 处理 CSV 分隔（简单处理，不处理包含逗号的引号内容）
        const parts = line.split(',').map(s => s.trim());
        const [name, typeStr, feeStr, isFunderStr] = parts;
        
        if (!name) continue;

        // 检查数据库中是否已存在该姓名
        if (players.some(p => p.name === name)) {
          continue; // 保留数据库中的，跳过此条
        }
        
        // 检查当前导入列表中是否已存在该姓名
        if (newPlayers.some(p => p.name === name)) {
          continue; // 遇到 CSV 中重复的人，只保留第一条
        }
        
        let type = PlayerType.PER_SESSION;
        if (typeStr?.includes('包月')) type = PlayerType.MONTHLY;
        else if (typeStr?.includes('包半月')) type = PlayerType.HALF_MONTHLY;
        
        const isFunder = ['是', 'yes', 'true', '1'].includes(isFunderStr?.toLowerCase());
        
        newPlayers.push({
          id: `imp-${Date.now()}-${i}`,
          name: name,
          type: type,
          defaultFee: Number(feeStr) || (type === PlayerType.MONTHLY ? DEFAULT_MONTHLY_FEE : type === PlayerType.HALF_MONTHLY ? DEFAULT_HALF_MONTHLY_FEE : DEFAULT_SESSION_FEE),
          isFunder: isFunder
        });
      }
      
      if (newPlayers.length > 0) {
        if (confirm(`识别到 ${newPlayers.length} 个不重复的新成员，是否确认导入？\n（已自动过滤与现有成员重复的姓名）\n提示：建议先导出当前名单备份。`)) {
          setPlayers(prev => [...prev, ...newPlayers]);
        }
      } else {
        alert('未能识别到新的成员数据，可能所有名单中的人员在系统中已存在，或数据格式有误。');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const renderPlayerForm = (title: string) => (
    <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl shadow-lg border-2 border-emerald-500/50 animate-in zoom-in-95 duration-200">
      <h3 className="font-bold mb-4 text-emerald-800 text-sm">{title}</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] text-gray-400 mb-1 font-black uppercase tracking-widest">姓名</label>
          <input 
            type="text" 
            value={formData.name} 
            onChange={e => setFormData({ ...formData, name: e.target.value })} 
            className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold" 
            placeholder="请输入姓名" 
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-gray-400 mb-1 font-black uppercase tracking-widest">性质</label>
            <select 
              value={formData.type} 
              onChange={e => {
                const type = e.target.value as PlayerType;
                let fee = formData.defaultFee;
                if (type === PlayerType.MONTHLY) fee = DEFAULT_MONTHLY_FEE;
                else if (type === PlayerType.HALF_MONTHLY) fee = DEFAULT_HALF_MONTHLY_FEE;
                else if (type === PlayerType.PER_SESSION) fee = DEFAULT_SESSION_FEE;
                setFormData({ ...formData, type, defaultFee: fee });
              }} 
              className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-gray-50 outline-none font-bold"
            >
              <option value={PlayerType.MONTHLY}>包月</option>
              <option value={PlayerType.HALF_MONTHLY}>包半月</option>
              <option value={PlayerType.PER_SESSION}>按次</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 mb-1 font-black uppercase tracking-widest">单次(元)</label>
            <input 
              type="number" 
              value={formData.defaultFee === '' as any ? '' : formData.defaultFee} 
              onChange={e => setFormData({ ...formData, defaultFee: e.target.value === '' ? '' as any : Number(e.target.value) })} 
              className="w-full border border-gray-200 rounded-lg p-2 text-sm outline-none font-mono font-bold" 
            />
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100">
          <input 
            type="checkbox" 
            checked={formData.isFunder} 
            onChange={e => setFormData({ ...formData, isFunder: e.target.checked })} 
            id="isFunder" 
            className="w-5 h-5 text-amber-600 rounded-md border-amber-300 focus:ring-amber-500" 
          />
          <label htmlFor="isFunder" className="text-[10px] font-bold text-amber-800 cursor-pointer select-none leading-tight">
            核心集资备选人<br/>
            <span className="font-normal opacity-70">开启后，可勾选为此周期的预付包月人</span>
          </label>
        </div>
        <div className="bg-emerald-50 border border-emerald-200/60 rounded-xl p-2.5 flex items-center justify-between">
          <span className="text-[11px] font-bold text-emerald-800">⚡ 需要一次性修改多位人员的性质？</span>
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setIsAdding(false);
              setIsBatchEditing(true);
              if (formData.name) {
                setBatchInputText(formData.name);
              }
            }}
            className="text-[10px] bg-emerald-600 text-white px-2.5 py-1 rounded-lg font-black shadow-sm active:scale-95"
          >
            批量修改性质
          </button>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={handleSave} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-lg font-black text-sm shadow-[0_0_15px_rgba(16,185,129,0.5)] ring-1 ring-emerald-300 active:scale-95 transition-all">保存</button>
          <button type="button" onClick={() => { setIsAdding(false); setEditingId(null); }} className="flex-1 bg-gray-100 text-gray-500 py-2.5 rounded-lg font-bold text-sm">取消</button>
        </div>
      </div>
    </div>
  );

  const renderBatchEditModal = () => {
    const availablePlayers = Array.isArray(players) ? players : [];
    const filteredAvailable = batchMemberSearch.trim()
      ? availablePlayers.filter(p => p.name.toLowerCase().includes(batchMemberSearch.trim().toLowerCase()))
      : availablePlayers;

    const togglePlayerInBatch = (id: string) => {
      setBatchSelectedPlayerIds(prev => 
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
    };

    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 animate-fade-in bg-black/60 backdrop-blur-[10px]" onClick={() => setIsBatchEditing(false)}>
        <div className="w-full max-w-md bg-white/95 backdrop-blur-[20px] rounded-[2.5rem] border border-white/50 p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-black text-emerald-900">
                ⚡ 批量修改成员性质 {activePeriod ? <span className="text-xs text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-lg ml-1 font-bold">关联: {activePeriod.name}</span> : null}
              </h3>
              <p className="text-[10px] text-gray-500 font-bold">选定成员更新为本期性质，未列入者默认转为【按次】（可随时单独修改个人）</p>
            </div>
            <button 
              onClick={() => setIsBatchEditing(false)}
              className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center font-bold text-sm hover:bg-gray-200"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* 步骤 1: 目标性质与收费 */}
            <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-100">
              <label className="block text-[10px] text-emerald-800 mb-2 font-black uppercase tracking-widest">
                第一步：选择统一目标性质及金额
              </label>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[PlayerType.MONTHLY, PlayerType.HALF_MONTHLY, PlayerType.PER_SESSION].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleSelectBatchType(type)}
                    className={`py-2 px-3 rounded-xl font-black text-xs transition-all border ${
                      batchTargetType === type
                        ? 'bg-emerald-500 text-white border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)] ring-1 ring-emerald-300'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-gray-200">
                <span className="text-xs font-bold text-gray-700">统一单次/月收费 (元):</span>
                <input
                  type="number"
                  value={batchFee === '' ? '' : batchFee}
                  onChange={e => setBatchFee(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-20 bg-gray-50 border border-gray-200 rounded-lg p-1.5 text-xs font-mono font-bold text-emerald-700 text-right outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* 步骤 2: 多人输入/粘贴 */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[10px] text-gray-400 font-black uppercase tracking-widest">
                  第二步：输入或粘贴多人名单
                </label>
                {batchSelectedPlayerIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBatchSelectedPlayerIds([])}
                    className="text-[10px] text-red-500 font-bold hover:underline"
                  >
                    清空选择 ({batchSelectedPlayerIds.length})
                  </button>
                )}
              </div>
              <textarea
                value={batchInputText}
                onChange={e => setBatchInputText(e.target.value)}
                placeholder="直接粘贴或输入名单，支持换行、空格、逗号或序号：&#10;1. 张三&#10;2. 李四&#10;3. 王五"
                className="w-full h-24 bg-gray-50 border border-gray-200 rounded-2xl p-3 text-xs font-bold text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-emerald-500 transition-all resize-none"
              />
              <p className="text-[9px] text-gray-400 font-bold mt-1">
                💡 支持任意分隔符（换行、空格、顿号、逗号、微信接龙序号等）
              </p>
            </div>

            {/* 匹配提示与未识别人员 */}
            {parsedNamesInfo.unmatched.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900">
                <p className="text-[10px] font-black mb-1">⚠️ 以下名单未在成员库中找到（将忽略）：</p>
                <div className="flex flex-wrap gap-1">
                  {parsedNamesInfo.unmatched.map(name => (
                    <span key={name} className="text-[9px] bg-amber-200/60 px-1.5 py-0.5 rounded font-bold">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 选中的人员列表 */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black text-gray-500">
                  已选定统一修改为【{batchTargetType}】的人员 ({batchSelectedPlayerIds.length}人):
                </span>
                {batchSelectedPlayerIds.length < availablePlayers.length ? (
                  <button
                    type="button"
                    onClick={() => setBatchSelectedPlayerIds(availablePlayers.map(p => p.id))}
                    className="text-[10px] text-emerald-700 font-black hover:underline"
                  >
                    全选全部成员
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2.5 bg-gray-50 rounded-2xl border border-gray-100">
                {batchSelectedPlayerIds.length === 0 ? (
                  <span className="text-[11px] text-gray-400 font-bold py-2 px-1">尚未选定任何人员，可在上方粘贴名单或在下方点选</span>
                ) : (
                  batchSelectedPlayerIds.map(id => {
                    const p = players.find(x => x.id === id);
                    if (!p) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-1 rounded-xl font-black"
                      >
                        {p.name}
                        <button
                          type="button"
                          onClick={() => togglePlayerInBatch(id)}
                          className="text-emerald-700 hover:text-red-500 font-black ml-0.5"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })
                )}
              </div>
            </div>

            {/* 快捷点选成员 */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                  也可从成员列表快速点选：
                </label>
                <input
                  type="text"
                  value={batchMemberSearch}
                  onChange={e => setBatchMemberSearch(e.target.value)}
                  placeholder="过滤成员..."
                  className="w-24 text-[9px] bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto p-2 bg-gray-50 rounded-xl border border-gray-100">
                {filteredAvailable.map(p => {
                  const isSelected = batchSelectedPlayerIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePlayerInBatch(p.id)}
                      className={`text-[9px] px-2 py-1 rounded-lg font-bold transition-all border ${
                        isSelected
                          ? 'bg-emerald-500 text-white border-emerald-400'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {p.name} ({p.type})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 规则说明提示卡片 */}
            <div className="p-3 bg-emerald-50/80 rounded-2xl border border-emerald-200/70 text-emerald-900 text-xs leading-relaxed">
              <div className="font-black flex items-center gap-1.5 text-emerald-950 mb-1">
                <span className="text-sm">📌</span> 批量修改与自动重置规则
              </div>
              <ul className="text-[11px] text-emerald-800/90 font-medium space-y-1 list-disc list-inside">
                <li>选中的 <strong className="font-black text-emerald-950">{batchSelectedPlayerIds.length}</strong> 位成员将更新为【<strong className="font-black text-emerald-950">{batchTargetType}</strong>】</li>
                <li><strong>未在本次名单中的人员默认成为【按次】</strong>（原为包月/包半月人员若本次未列入，将自动降级为按次）</li>
                <li className="text-[10px] text-emerald-700/80 font-bold list-none">💡 个性化支持：批量修改后，仍可在成员列表中随时点击单个人员的“编辑”单独修改个人性质。</li>
              </ul>
            </div>

            {/* 底部确认操作 */}
            <div className="flex gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={handleBatchSave}
                disabled={batchSelectedPlayerIds.length === 0}
                className={`flex-[2] py-3.5 rounded-2xl font-black text-sm active:scale-95 transition-all ${
                  batchSelectedPlayerIds.length > 0
                    ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] ring-1 ring-emerald-300'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                确认统一修改为【{batchTargetType}】({batchSelectedPlayerIds.length}人)
              </button>
              <button
                type="button"
                onClick={() => setIsBatchEditing(false)}
                className="flex-1 bg-gray-100 text-gray-500 py-3.5 rounded-2xl font-black text-sm active:bg-gray-200"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-black text-gray-800">成员档案</h2>
          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">MEMBER DIRECTORY</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={() => {
              setIsBatchEditing(true);
              setIsAdding(false);
              setEditingId(null);
            }}
            className="bg-emerald-600/90 hover:bg-emerald-600 backdrop-blur-md text-white border border-white/20 px-3 py-2 rounded-xl text-xs flex items-center gap-1 font-black shadow-lg shadow-black/5 active:scale-95 transition-all"
            title="批量修改多位成员性质"
          >
            <span>⚡</span> 批量改性质
          </button>
          <button 
            type="button"
            onClick={() => {
              setIsAdding(true);
              setEditingId(null);
              setIsBatchEditing(false);
              setFormData({ name: '', type: PlayerType.PER_SESSION, defaultFee: DEFAULT_SESSION_FEE, isFunder: false });
            }}
            className="bg-black/20 backdrop-blur-md text-white border border-white/20 px-3.5 py-2 rounded-xl text-xs flex items-center gap-1 font-black shadow-lg shadow-black/5 active:scale-95 transition-all"
          >
            <Icons.Plus /> 新增成员
          </button>
        </div>
      </div>

      {/* 顶部关联结算周期切换卡片 */}
      <div className="bg-white/30 backdrop-blur-md p-3.5 rounded-2xl border border-white/40 shadow-sm mb-4 space-y-2.5 overflow-hidden">
        {/* 第一行：当前关联周期及完整下拉选择框 */}
        <div className="flex items-center gap-2 w-full min-w-0">
          <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5 shrink-0">
            <span className="text-sm">📅</span> 当前关联周期:
          </span>
          {sortedPeriodsDesc.length > 0 ? (
            <div className="flex-1 min-w-0">
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                className="w-full max-w-full bg-white border border-emerald-300 text-emerald-950 text-xs font-black rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm cursor-pointer truncate box-border"
              >
                {sortedPeriodsDesc.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.endDate ? `(${p.startDate} ~ ${p.endDate})` : '(进行中)'}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="text-xs text-gray-500 font-bold bg-white/50 px-2 py-1 rounded-lg">
              暂无结算周期，人员性质按默认展示
            </span>
          )}
        </div>

        {/* 第二行：本期性质分布 */}
        {activePeriod && (
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black bg-white/50 px-3 py-1.5 rounded-xl border border-white/40 w-fit max-w-full">
            <span className="text-emerald-900 shrink-0">本期性质分布:</span>
            <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 shrink-0">
              包月 {activePeriodStats.monthly}人
            </span>
            {activePeriodStats.half > 0 && (
              <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 shrink-0">
                半月 {activePeriodStats.half}人
              </span>
            )}
            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
              按次 {activePeriodStats.perSession}人
            </span>
          </div>
        )}

        <p className="text-[10px] text-gray-500 font-bold pt-0.5 flex items-center gap-1">
          <span>💡</span> 各周期人员性质与费用独立维护。批量改性质或个人修改将自动同步至当前选定周期及录入记录。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <button onClick={exportToCSV} className="flex flex-col items-center justify-center p-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl shadow-sm active:bg-white/30 group">
          <div className="text-emerald-800 mb-1 group-active:scale-110 transition-transform"><Icons.Download /></div>
          <span className="text-[10px] font-black text-emerald-800/80">导出名单</span>
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center p-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl shadow-sm active:bg-white/30 group">
          <div className="text-blue-800 mb-1 group-active:scale-110 transition-transform"><Icons.Upload /></div>
          <span className="text-[10px] font-black text-emerald-800/80">导入名单</span>
        </button>
        <button onClick={downloadTemplate} className="flex flex-col items-center justify-center p-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl shadow-sm active:bg-white/30 group">
          <div className="text-amber-800 mb-1 text-xs font-black">CSV</div>
          <span className="text-[10px] font-black text-emerald-800/80">下载模板</span>
        </button>
        <input type="file" ref={fileInputRef} onChange={importFromCSV} accept=".csv" className="hidden" />
      </div>

      {/* 搜索成员 */}
      <div className="relative mb-4">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-emerald-800/60">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜索成员姓名、性质 (如：包月、按次)..."
          className="w-full bg-white/30 backdrop-blur-md border border-white/40 pl-10 pr-9 py-2.5 rounded-2xl text-xs font-bold text-emerald-950 placeholder-emerald-900/50 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none shadow-sm transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-gray-400 hover:text-gray-600 font-bold"
          >
            ✕
          </button>
        )}
      </div>

      {searchQuery.trim() && (
        <div className="mb-3 px-1 flex justify-between items-center text-[10px] font-bold text-emerald-800/80">
          <span>搜索结果: 共找到 <strong className="text-emerald-900 font-black">{filteredPlayers.length}</strong> 位成员</span>
          <button onClick={() => setSearchQuery('')} className="text-emerald-700 underline font-black">清除筛选</button>
        </div>
      )}

      {isAdding && (
        <div className="mb-6">
          {renderPlayerForm("录入新成员")}
        </div>
      )}

      <div className="space-y-3">
        {filteredPlayers.sort((a, b) => {
          const aIsFunder = Boolean(isCurrentlyFunder(a.id) || a.isFunder);
          const bIsFunder = Boolean(isCurrentlyFunder(b.id) || b.isFunder);
          if (aIsFunder !== bIsFunder) {
            return aIsFunder ? -1 : 1;
          }
          const aCfg = getPlayerPeriodConfig(a);
          const bCfg = getPlayerPeriodConfig(b);
          return getTypeOrder(aCfg.type) - getTypeOrder(bCfg.type);
        }).map(player => {
          if (editingId === player.id) {
            return (
              <div key={player.id} className="animate-in slide-in-from-top-1 duration-200">
                {renderPlayerForm(`正在编辑: ${player.name} (${activePeriod ? activePeriod.name : '默认配置'})`)}
              </div>
            );
          }

          const activeFunder = isCurrentlyFunder(player.id);
          const playerCfg = getPlayerPeriodConfig(player);

          return (
            <div key={player.id} className={`bg-white/20 backdrop-blur-md p-4 rounded-2xl shadow-sm border flex justify-between items-center transition-all ${activeFunder ? 'border-amber-400 bg-amber-500/10 ring-1 ring-amber-400/20' : 'border-white/30'}`}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-black text-emerald-900 text-base">{player.name}</span>
                  {activeFunder ? (
                    <span className="text-[9px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-black shadow-[0_0_10px_rgba(245,158,11,0.6)] ring-1 ring-amber-300 flex items-center gap-0.5">
                      <span className="text-[11px]">👑</span> 本期集资
                    </span>
                  ) : player.isFunder ? (
                    <span className="text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded font-black border border-gray-200">
                      备选
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-gray-500 mt-2 flex items-center gap-3 flex-wrap">
                  <span className={`px-2 py-1 rounded-lg text-white font-black shadow-lg ring-1 ring-white/50 ${
                    playerCfg.type === PlayerType.MONTHLY ? 'bg-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.6)]' : 
                    playerCfg.type === PlayerType.HALF_MONTHLY ? 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.6)]' : 
                    'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                  }`}>{playerCfg.type}</span>
                  <span className="font-mono font-black text-gray-700">¥{playerCfg.fee}</span>

                  {/* 快捷切换当前周期性质小按钮 */}
                  <div className="flex items-center gap-1 bg-white/40 p-1 rounded-xl border border-white/50 ml-1">
                    {[PlayerType.MONTHLY, PlayerType.HALF_MONTHLY, PlayerType.PER_SESSION].map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleQuickChangeNature(player.id, type)}
                        className={`text-[9px] px-2 py-0.5 rounded-lg font-black transition-all ${
                          playerCfg.type === type
                            ? (type === PlayerType.MONTHLY ? 'bg-purple-600 text-white shadow-sm' : type === PlayerType.HALF_MONTHLY ? 'bg-blue-600 text-white shadow-sm' : 'bg-emerald-600 text-white shadow-sm')
                            : 'text-gray-500 hover:text-emerald-900 hover:bg-white/60'
                        }`}
                        title={`切换为${type}`}
                      >
                        {type === PlayerType.MONTHLY ? '包月' : type === PlayerType.HALF_MONTHLY ? '半月' : '按次'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <button type="button" onClick={() => startEdit(player)} className="text-emerald-800 text-xs font-black bg-white/30 backdrop-blur-md border border-white/40 px-3 py-1.5 rounded-lg shadow-sm active:bg-white/40">编辑</button>
                <button 
                  type="button" 
                  onClick={(e) => handleDelete(e, player.id)} 
                  className={`transition-all p-2 rounded-xl flex items-center justify-center ${
                    confirmDeleteId === player.id 
                      ? 'bg-red-500 text-white w-20' 
                      : 'bg-red-50 text-red-500 w-10 active:bg-red-100'
                  }`}
                >
                  {confirmDeleteId === player.id ? <span className="text-[10px] font-black">确认?</span> : <Icons.Trash />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      
      {filteredPlayers.length === 0 && searchQuery.trim() && (
        <div className="text-center py-12 text-emerald-800/60 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 m-2">
          <p className="text-sm font-bold">未找到与“{searchQuery}”匹配的成员</p>
          <button onClick={() => setSearchQuery('')} className="mt-2 text-xs text-emerald-700 font-black underline">清除搜索</button>
        </div>
      )}

      {(!Array.isArray(players) || players.length === 0) && !isAdding && (
        <div className="text-center py-20 text-gray-300">
           <p className="text-4xl mb-4 opacity-20 text-emerald-500">🏸</p>
           <p className="text-sm font-black uppercase tracking-widest">暂无人员记录</p>
        </div>
      )}

      {isBatchEditing && renderBatchEditModal()}
    </div>
  );
};

export default PlayersList;
