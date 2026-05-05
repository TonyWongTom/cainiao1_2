
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Player, PlayerType, Period } from '../types';
import { Icons, DEFAULT_SESSION_FEE } from '../constants';
import { useAppContext } from '../context/AppContext';

interface PlayersListProps {
}

const PlayersList: React.FC<PlayersListProps> = () => {
  const { players, setPlayers, periods } = useAppContext();

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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
        defaultFee: formData.defaultFee !== undefined ? formData.defaultFee : (formData.type === PlayerType.PER_SESSION ? DEFAULT_SESSION_FEE : 0),
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
          defaultFee: Number(feeStr) || 0,
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
                const fee = type === PlayerType.PER_SESSION ? DEFAULT_SESSION_FEE : (formData.defaultFee || 0);
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
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={handleSave} className="flex-1 bg-emerald-500 text-white py-2.5 rounded-lg font-black text-sm shadow-[0_0_15px_rgba(16,185,129,0.5)] ring-1 ring-emerald-300 active:scale-95 transition-all">保存</button>
          <button type="button" onClick={() => { setIsAdding(false); setEditingId(null); }} className="flex-1 bg-gray-100 text-gray-500 py-2.5 rounded-lg font-bold text-sm">取消</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-black text-gray-800">成员档案</h2>
          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">MEMBER DIRECTORY</p>
        </div>
        <button 
          type="button"
          onClick={() => {
            setIsAdding(true);
            setEditingId(null);
            setFormData({ name: '', type: PlayerType.PER_SESSION, defaultFee: DEFAULT_SESSION_FEE, isFunder: false });
          }}
          className="bg-black/20 backdrop-blur-md text-white border border-white/20 px-4 py-2 rounded-xl text-sm flex items-center gap-1 font-black shadow-lg shadow-black/5 active:scale-95 transition-all"
        >
          <Icons.Plus /> 新增成员
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
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

      {isAdding && (
        <div className="mb-6">
          {renderPlayerForm("录入新成员")}
        </div>
      )}

      <div className="space-y-3">
        {Array.isArray(players) && [...players].sort((a,b) => (a.isFunder === b.isFunder ? 0 : a.isFunder ? -1 : 1)).map(player => {
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
      
      {(!Array.isArray(players) || players.length === 0) && !isAdding && (
        <div className="text-center py-20 text-gray-300">
           <p className="text-4xl mb-4 opacity-20 text-emerald-500">🏸</p>
           <p className="text-sm font-black uppercase tracking-widest">暂无人员记录</p>
        </div>
      )}
    </div>
  );
};

export default PlayersList;
