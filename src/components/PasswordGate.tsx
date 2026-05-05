import React, { useState, useEffect } from 'react';
import { auth, loginWithPassword } from '../services/dbService';

interface PasswordGateProps {
  children: React.ReactNode;
}

const PasswordGate: React.FC<PasswordGateProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((isAuth) => {
      setIsAuthenticated(isAuth);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password) return;
    try {
      const success = await loginWithPassword(password);
      if (success) {
        setError(false);
      } else {
        setError(true);
      }
    } catch (e) {
      console.error(e);
      setError(true);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-transparent px-4">
         <div className="text-emerald-800 animate-pulse font-black">Loading...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-transparent px-4">
      <div className="w-full max-w-sm bg-white/20 backdrop-blur-md rounded-[2.5rem] p-8 shadow-xl border border-white/30 animate-slide-up text-center">
        <div className="w-16 h-16 bg-white/30 backdrop-blur-md text-emerald-800 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl border border-white/40">
          🏸
        </div>
        <h2 className="text-xl font-black text-emerald-900 mb-2">菜鸟基地小帮手</h2>
        <p className="text-sm text-emerald-800/80 mb-8 font-medium">由于已切换为独立部署后端，请使用访问密码登录</p>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <input 
            type="password" 
            placeholder="请输入密码" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-white/40 bg-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-center text-lg placeholder-emerald-900/40"
          />
          <button
            type="submit"
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-black shadow-[0_0_20px_rgba(16,185,129,0.5)] ring-1 ring-white/50 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            登录
          </button>
          {error && <p className="text-[10px] font-bold text-red-500 animate-fade-in">❌ 密码错误或服务器未响应</p>}
        </form>
      </div>
      
      <p className="mt-8 text-[10px] text-emerald-900/60 font-bold uppercase tracking-widest">
        Badminton Club Financial Helper v2.0
      </p>
    </div>
  );
};

export default PasswordGate;
