import React, { useState, useEffect } from 'react';
import { auth, loginWithGoogle } from '../services/dbService';
import { onAuthStateChanged, User } from 'firebase/auth';

interface PasswordGateProps {
  children: React.ReactNode;
}

const PasswordGate: React.FC<PasswordGateProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
      setError(false);
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

  if (user) {
    if (!user.emailVerified) {
       return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-transparent px-4 text-center">
          <div className="w-full max-w-sm bg-white/20 backdrop-blur-md rounded-[2.5rem] p-8 shadow-xl border border-white/30">
             <div className="text-4xl mb-4">⚠️</div>
             <h2 className="text-xl font-black text-emerald-900 mb-2">Email verification required</h2>
             <p className="text-sm text-emerald-800/80 mb-8 font-medium">Please verify your email to continue.</p>
             <button onClick={() => auth.signOut()} className="px-4 py-2 bg-emerald-500 rounded text-white font-bold">Sign Out</button>
          </div>
        </div>
       )
    }
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-transparent px-4">
      <div className="w-full max-w-sm bg-white/20 backdrop-blur-md rounded-[2.5rem] p-8 shadow-xl border border-white/30 animate-slide-up text-center">
        <div className="w-16 h-16 bg-white/30 backdrop-blur-md text-emerald-800 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl border border-white/40">
          🏸
        </div>
        <h2 className="text-xl font-black text-emerald-900 mb-2">菜鸟基地小帮手</h2>
        <p className="text-sm text-emerald-800/80 mb-8 font-medium">请登录以继续</p>
        
        <div className="space-y-4">
          <button
            onClick={handleLogin}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-black shadow-[0_0_20px_rgba(16,185,129,0.5)] ring-1 ring-white/50 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            使用 Google 账号登录
          </button>
          {error && <p className="text-[10px] font-bold text-red-500 animate-fade-in">❌ 登录失败，请重试</p>}
        </div>
      </div>
      
      <p className="mt-8 text-[10px] text-emerald-900/60 font-bold uppercase tracking-widest">
        Badminton Club Financial Helper v2.0
      </p>
    </div>
  );
};

export default PasswordGate;
