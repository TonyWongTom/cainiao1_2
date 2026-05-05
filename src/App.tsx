
// Build trigger: Updated Firebase configuration keys
import React, { useState, useMemo } from 'react';
import { Period, View } from './types';
import { Icons } from './constants';
import Dashboard from './components/Dashboard';
import PlayersList from './components/PlayersList';
import PeriodsList from './components/PeriodsList';
import FinanceReport from './components/FinanceReport';
import PasswordGate from './components/PasswordGate';
import { AppProvider, useAppContext } from './context/AppContext';

const MainApp: React.FC = () => {
  const [view, setView] = useState<View>('dashboard');
  
  const { players, periods, isLoading, error, notification, refreshData } = useAppContext();

  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  const activePeriod = useMemo(() => {
    if (selectedPeriodId && Array.isArray(periods)) {
      return periods.find(p => p.id === selectedPeriodId) || null;
    }
    return Array.isArray(periods) && periods.length > 0 ? periods[0] : null;
  }, [periods, selectedPeriodId]);

  const renderView = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-emerald-500 animate-pulse text-center p-8">
           <span className="text-5xl mb-6">🏸</span>
           <span className="text-sm font-black uppercase tracking-widest">数据联接中...</span>
           <p className="mt-4 text-xs text-gray-400 font-medium">如果是首次运行，请耐心等待 10-20 秒</p>
        </div>
      );
    }

    if (error && (!Array.isArray(players) || players.length === 0) && (!Array.isArray(periods) || periods.length === 0)) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
          <span className="text-5xl mb-6">⚠️</span>
          <h2 className="text-lg font-black text-gray-800 mb-2">连接异常</h2>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <div className="bg-amber-50 p-4 rounded-xl text-xs text-amber-800 mb-6 text-left max-w-xs">
            <p className="font-bold mb-1">可能原因：</p>
            <ul className="list-disc ml-4 space-y-1">
              <li>网络不稳定，请切换网络重试</li>
              <li>后端服务正在启动中，请稍候</li>
              <li>服务配置异常，请联系管理员</li>
            </ul>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-emerald-500 text-white rounded-full text-sm font-bold ring-1 ring-white/50 shadow-[0_0_15px_rgba(16,185,129,0.5)] active:scale-95 transition-transform"
          >
            重试
          </button>
        </div>
      );
    }

    switch (view) {
      case 'dashboard':
        return <Dashboard activePeriod={activePeriod} onPeriodChange={setSelectedPeriodId} />;
      case 'players':
        return <PlayersList />;
      case 'periods':
        return <PeriodsList />;
      case 'finance':
        return <FinanceReport initialPeriodId={selectedPeriodId} onPeriodChange={setSelectedPeriodId} />;
      default:
        return <Dashboard activePeriod={activePeriod} onPeriodChange={setSelectedPeriodId} />;
    }
  };

  const tabs: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: '首页', icon: <Icons.Home /> },
    { id: 'periods', label: '结算', icon: <Icons.Calendar /> },
    { id: 'players', label: '人员', icon: <Icons.Users /> },
    { id: 'finance', label: '报表', icon: <Icons.Chart /> },
  ];

  return (
    <PasswordGate>
      <div className="flex flex-col h-screen max-w-md mx-auto bg-gradient-to-b from-[#9be5b9] via-[#a3dfc6] to-[#dae5f5] relative overflow-hidden font-sans">
        {/* Connection/Sync Toast */}
        {notification && (
          <div className={`fixed top-1 left-1/2 -translate-x-1/2 z-[300] px-6 py-2 rounded-2xl shadow-xl font-black text-xs animate-in slide-in-from-top duration-300 w-[90%] max-w-[320px] text-center ${
            notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white shadow-emerald-200'
          }`}>
            <div className="flex items-center justify-center gap-2">
              {notification.type === 'error' ? '⚠️' : '✅'} {notification.message}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="pt-safe sticky top-0 z-50 pb-2 px-4 shadow-none pointer-events-none mt-4">
          <header className="bg-white/20 backdrop-blur-md text-emerald-900 p-4 shadow-[0_0_20px_rgba(0,0,0,0.05)] ring-1 ring-white/50 rounded-[2.5rem] pointer-events-auto">
            <div className="flex flex-col items-center justify-center">
              <h1 className="text-xl font-black flex items-center">
                <span className="mr-2">🏸</span>
                菜鸟基地小帮手
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5 cursor-pointer active:scale-95 transition-transform" onClick={() => refreshData()}>
                <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`}></div>
                <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-80 text-emerald-800">
                  {isLoading ? 'Syncing...' : 'Synced (Click to Refresh)'}
                </span>
              </div>
            </div>
          </header>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto no-scrollbar pb-32">
          {renderView()}
        </main>

        {/* Modern Floating Tab Bar */}
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-50 px-4 pb-safe pointer-events-none">
          <nav className="mb-4 bg-white/90 backdrop-blur-xl border border-white/20 shadow-[0_-10px_30px_-5px_rgba(0,0,0,0.05),0_10px_20px_-5px_rgba(0,0,0,0.1)] rounded-[2.5rem] flex justify-around items-center p-2 pointer-events-auto">
            {Array.isArray(tabs) && tabs.map((tab) => {
              const isActive = view === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setView(tab.id)}
                  className={`relative flex flex-col items-center justify-center flex-1 transition-all duration-300 py-2 group z-0`}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  {/* Active Background Bubble */}
                  <div className={`absolute inset-x-1 inset-y-0 rounded-3xl transition-all duration-300 -z-10 ${
                    isActive ? 'bg-emerald-500 ring-2 ring-white/80 shadow-[0_0_15px_rgba(255,255,255,0.8)] scale-100 opacity-100' : 'scale-75 opacity-0'
                  }`} />
                  
                  {/* Icon Wrapper */}
                  <div className={`transition-all duration-300 ${
                    isActive ? 'text-white transform -translate-y-0.5' : 'text-gray-400'
                  }`}>
                    {tab.icon}
                  </div>
                  
                  {/* Label */}
                  <span className={`text-[10px] mt-1 font-black transition-all duration-300 tracking-wider ${
                    isActive ? 'text-white opacity-100' : 'text-gray-400 opacity-70'
                  }`}>
                    {tab.label}
                  </span>

                  {/* Top Dot Indicator */}
                  {isActive && (
                     <div className="absolute top-0 w-1 h-1 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </PasswordGate>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
};

export default App;
