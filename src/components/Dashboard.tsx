
import React, { useMemo } from 'react';
import { Player, Period } from '../types';
import { formatDateChinese } from '../utils/dateUtils';
import { useAppContext } from '../context/AppContext';

interface DashboardProps {
  activePeriod: Period | null;
  onPeriodChange: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ activePeriod, onPeriodChange }) => {
  const { players, periods } = useAppContext();

  // Total fees collected
  const grossFees = (activePeriod?.sessions || []).reduce((acc, s) => acc + (s.attendees || []).reduce((sum, a) => sum + a.fee, 0), 0) || 0;
  // Total extra session costs
  const sessionCosts = (activePeriod?.sessions || []).reduce((acc, s) => acc + (s.sessionCost || 0), 0) || 0;
  
  // Total income is net (Gross Fees - Session Costs)
  const totalIncome = grossFees - sessionCosts;
  
  // Total expenses is just the base period cost (as sessions costs are deducted from income)
  const baseCourtCost = activePeriod?.courtCost || 0;
  const totalExpenses = baseCourtCost;
  
  const funderIdsCount = activePeriod?.funderIds?.length || 0;
  
  // Calculations per funder
  const investmentPerFunder = funderIdsCount > 0 ? totalExpenses / funderIdsCount : 0;
  const refundPerFunder = funderIdsCount > 0 ? totalIncome / funderIdsCount : 0;

  return (
    <div className="p-4 space-y-4">
      {/* Period Selection */}
      <div className="mb-2">
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
          当前查看周期
        </label>
        <div className="relative">
          <select
            value={activePeriod?.id || ''}
            onChange={(e) => onPeriodChange(e.target.value)}
            className="w-full bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl p-4 text-xs font-black text-emerald-900 outline-none appearance-none shadow-sm cursor-pointer"
          >
            {Array.isArray(periods) && periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {(!Array.isArray(periods) || periods.length === 0) && (
              <option value="" disabled>暂无结算周期</option>
            )}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>
      </div>

      {/* Active Period Summary Card */}
      <div className="bg-white/20 backdrop-blur-md rounded-3xl p-6 shadow-sm border border-gray-100/50">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-black text-gray-800 flex items-center gap-2">
            <span className="w-2 h-6 bg-emerald-500 rounded-full"></span>
            当前周期概览
          </h2>
          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-black uppercase tracking-wider shadow-sm">
            {activePeriod?.name || '无活跃周期'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/30">
            <p className="text-[10px] text-emerald-800 font-bold mb-1 uppercase tracking-widest">本期净余收入</p>
            <p className="text-xl font-black text-emerald-900">¥{totalIncome.toFixed(2)}</p>
            <p className="text-[8px] text-emerald-700 opacity-80">已扣除单场加支</p>
          </div>
          <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/30">
            <p className="text-[10px] text-red-800 font-bold mb-1 uppercase tracking-widest">本期基础成本</p>
            <p className="text-xl font-black text-red-900">¥{totalExpenses.toFixed(2)}</p>
            <p className="text-[8px] text-red-700 opacity-80">不含单场加支</p>
          </div>
        </div>

        {activePeriod && (
          <div className="space-y-3">
            <div className="p-5 bg-black/20 backdrop-blur-md text-white border border-white/10 rounded-2xl shadow-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-10 text-4xl">👑</div>
               <p className="text-[10px] font-black text-emerald-900 mb-2 uppercase tracking-widest">集资人财务结算 (每人)</p>
               
               <div className="flex justify-between items-end">
                 <div>
                   <p className="text-[10px] text-gray-800 font-bold mb-0.5">本期返款 (↑)</p>
                   <p className="text-2xl font-black">¥{refundPerFunder.toFixed(2)}</p>
                 </div>
                 <div className="text-right">
                   <p className="text-[10px] text-red-400 font-bold mb-0.5">预付投入 (↓)</p>
                   <p className="text-lg font-black opacity-80 text-[#e3e5e4]">¥{investmentPerFunder.toFixed(2)}</p>
                 </div>
               </div>

               <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
                 <span className="text-[10px] font-bold text-emerald-900 italic">本期集资人数：{funderIdsCount}人</span>
                 <span className={`text-xs font-black px-2 py-0.5 rounded ${refundPerFunder >= investmentPerFunder ? 'bg-emerald-500/20 text-[#fb676a]' : 'bg-white/20 text-red-400'}`}>
                   {refundPerFunder >= investmentPerFunder ? '盈余' : '超支'} ¥{Math.abs(refundPerFunder - investmentPerFunder).toFixed(2)}
                 </span>
               </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/20 backdrop-blur-md p-5 rounded-3xl shadow-sm border border-white/30 flex flex-col items-center justify-center text-center h-full">
          <div className="w-16 h-16 mb-2 flex items-center justify-center relative shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_4px_8px_rgba(0,0,0,0.1)] transition-transform hover:scale-105">
              {/* Background Blobs */}
              <path d="M72.5,23.5 C82.1,30.2 87.2,43.1 84.4,54.8 C81.6,66.5 70.9,77.0 57.5,80.1 C44.1,83.2 27.9,78.9 18.2,69.5 C8.5,60.1 5.3,45.6 10.6,33.5 C15.9,21.4 29.7,11.7 43.5,10.2 C57.3,8.7 71.1,15.4 72.5,23.5 Z" fill="#90e0ef" opacity="0.8"/>
              <path d="M26.5,26.5 C38.2,16.8 55.4,17.1 66.8,26.5 C78.2,35.9 83.8,54.4 78.5,68.2 C73.2,82.0 57.0,91.1 42.5,88.5 C28.0,85.9 15.2,71.6 11.5,57.5 C7.8,43.4 14.8,29.5 26.5,26.5 Z" fill="#48cae4" opacity="0.6"/>
              
              {/* Shuttlecock */}
              <g transform="translate(68, 18) rotate(30)">
                <path d="M0,0 L-4,-6 L4,-6 Z" fill="#ffffff"/>
                <path d="M-4,-6 L-6,-12 L-2,-10 L0,-14 L2,-10 L6,-12 L4,-6 Z" fill="#f8f9fa"/>
                <circle cx="0" cy="1" r="2" fill="#fff"/>
              </g>

              {/* Racket */}
              <g transform="translate(42, 45) rotate(-15)">
                <line x1="0" y1="0" x2="-8" y2="-18" stroke="#343a40" strokeWidth="1.5" strokeLinecap="round"/>
                <ellipse cx="-11" cy="-24" rx="4" ry="6" fill="none" stroke="#343a40" strokeWidth="1.5" transform="rotate(-20 -11 -24)"/>
                <ellipse cx="-11" cy="-24" rx="4" ry="6" fill="none" stroke="#e9ecef" strokeWidth="0.5" transform="rotate(-20 -11 -24)"/>
              </g>

              {/* Player Body */}
              <g transform="translate(45, 55)">
                {/* Left Arm */}
                <path d="M-5,-10 L-12,-4 L-15,3" fill="none" stroke="#fbc3a1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                
                {/* Right Arm */}
                <path d="M5,-12 L10,-18 L2,-23" fill="none" stroke="#fbc3a1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                
                {/* Legs */}
                <path d="M-3,5 L-8,12 L-10,18" fill="none" stroke="#fbc3a1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4,4 L10,8 L8,16" fill="none" stroke="#fbc3a1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                
                {/* Shoes */}
                <path d="M-12,18 L-7,20 L-10,17 Z" fill="#e0fbfc"/>
                <path d="M6,16 L12,17 L9,14 Z" fill="#e0fbfc"/>

                {/* Shorts (Black) */}
                <path d="M-6,0 L6,0 L8,6 L2,6 L0,4 L-2,6 L-8,6 Z" fill="#212529"/>
                
                {/* Shirt (Neon Yellow/Green) */}
                <path d="M-7,-10 L7,-12 L5,0 L-5,0 Z" fill="#d4d700"/>
                {/* Shirt Details (Black stripe) */}
                <path d="M-5,-5 L5,-6 L5,-3 L-5,-2 Z" fill="#212529"/>

                {/* Head */}
                <circle cx="0" cy="-18" r="4.5" fill="#fbc3a1"/>
                {/* Hair */}
                <path d="M-4.5,-18 C-4.5,-22 4.5,-22 4.5,-18 C4.5,-16 3,-20 0,-20 C-3,-20 -4.5,-16 -4.5,-18 Z" fill="#212529"/>
              </g>
            </svg>
            <p className="text-3xl hidden absolute">👥</p>
          </div>
          <p className="text-[11.5px] font-black text-emerald-800/80 uppercase tracking-widest mt-1">成员档案</p>
          <p className="text-xl font-black text-emerald-900">{players.length}</p>
        </div>
        <div className="bg-white/20 backdrop-blur-md p-5 rounded-3xl shadow-sm border border-white/30 flex flex-col items-center justify-center text-center h-full">
          <div className="w-16 h-16 mb-2 flex items-center justify-center relative shrink-0">
            <svg viewBox="0 0 100 100" className="w-[47px] h-[47px] drop-shadow-[0_4px_8px_rgba(0,0,0,0.1)] transition-transform hover:scale-105 mt-1 ml-1">
              <rect x="8" y="16" width="84" height="84" rx="16" fill="#f4f4f5" />
              <rect x="8" y="16" width="84" height="80" rx="16" fill="#ffffff" />
              <path d="M8 40 L8 32 C8 23.163 15.163 16 24 16 L76 16 C84.837 16 92 23.163 92 32 L92 40 Z" fill="#ef4444" />
              <path d="M26 6 L26 22" stroke="#d4d4d8" strokeWidth="6" strokeLinecap="round" />
              <path d="M74 6 L74 22" stroke="#d4d4d8" strokeWidth="6" strokeLinecap="round" />
              <text x="50" y="33" fontSize="12" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fill="#ffffff" textAnchor="middle" letterSpacing="1">FEB</text>
              <text x="50" y="82" fontSize="46" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fill="#27272a" textAnchor="middle" letterSpacing="-2">10</text>
            </svg>
          </div>
          <p className="text-[11.5px] font-black text-emerald-800/80 uppercase tracking-widest mt-1">结算历史</p>
          <p className="text-xl font-black text-emerald-900">{periods.length}</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
