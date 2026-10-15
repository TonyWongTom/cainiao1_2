
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Player, PlayerType, Period } from '../types';
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
  const { players, setPlayers, periods } = useAppContext();

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

  const latestPeriod = useMemo(() => {
    return Array.isArray(periods) && periods.length > 0 ? periods[periods.length - 1] : null;
  }, [periods]);

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
      alert('请先输入或选择要统一修改性质的成员');
      return;
    }
    const finalFee = batchFee === '' ? (
      batchTargetType === PlayerType.MONTHLY ? DEFAULT_MONTHLY_FEE :
      batchTargetType === PlayerType.HALF_MONTHLY ? DEFAULT_HALF_MONTHLY_FEE : DEFAULT_SESSION_FEE
    ) : Number(batchFee);

    setPlayers(prev => prev.map(p => {
      if (batchSelectedPlayerIds.includes(p.id)) {
        return {
          ...p,
          type: batchTargetType,
          defaultFee: finalFee
        };
      }
      return p;
    }));

    const modifiedCount = batchSelectedPlayerIds.length;
    alert(`成功将 ${modifiedCount} 位成员的性质统一修改为【${batchTargetType}】！`);
    setIsBatchEditing(false);
    setBatchInputText('');
    setBatchSelectedPlayerIds([]);
  };

  const filteredPlayers = useMemo(() => {
    if (!Array.isArray(players)) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return players;
    return players.filter(p => 
      p.name.toLowerCase().includes(q) ||
      (p.type && p.type.toLowerCase().includes(q))
    );
  }, [players, searchQuery]);

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

    if (editingId) {
      setPlayers(prev => prev.map(p => p.id === editingId ? { ...p, ...formData, name: formData.name!.trim() } as Player : p));
      setEditingId(null);
    } else {
      const newPlayer: Player = {
        id: Date.now().toString(),
        name: formData.name.trim(),
        type: formData.type as PlayerType || PlayerType.PER_SESSION,
        defaultFee: formData.defaultFee !== undefined ? formData.defaultFee : (formData.type === PlayerType.MONTHLY ? DEFAULT_MONTHLY_FEE : formData.type === PlayerType.HALF_MONTHLY ? DEFAULT_HALF_MONTHLY_FEE : DEFAULT_SESSION_FEE),
        isFunder: !!formData.isFunder
      };
      setPlayers(prev => [...prev, newPlayer]);
      setIsAdding(false);
    }
    setFormData({ name: '', type: PlayerType.PER_SESSION, defaultFee: DEFAULT_SESSION_FEE, isFunder: false });
  };

  const startEdit = (player: Player) => {
    setEditingId(player.id);
    setFormData(player);
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
              <h3 className="text-lg font-black text-emerald-900">⚡ 批量修改成员性质</h3>
              <p className="text-[10px] text-gray-500 font-bold">同时输入或点选多人，一键统一修改性质与收费</p>
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
      <div className="flex justify-between items-center mb-6">
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
          return getTypeOrder(a.type) - getTypeOrder(b.type);
        }).map(player => {
          if (editingId === player.id) {
            return (
              <div key={player.id} className="animate-in slide-in-from-top-1 duration-200">
                {renderPlayerForm(`正在编辑: ${player.name}`)}
              </div>
            );
          }

          const activeFunder = isCurrentlyFunder(player.id);
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
                <div className="text-xs text-gray-500 mt-2 flex items-center gap-3">
                  <span className={`px-2 py-1 rounded-lg text-white font-black shadow-lg ring-1 ring-white/50 ${
                    player.type === PlayerType.MONTHLY ? 'bg-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.6)]' : 
                    player.type === PlayerType.HALF_MONTHLY ? 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.6)]' : 
                    'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                  }`}>{player.type}</span>
                  <span className="font-mono font-black text-gray-700">¥{player.defaultFee}</span>
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
