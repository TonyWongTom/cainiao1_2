import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Player, Period } from '../types';
import { dbService } from '../services/dbService';
import { INITIAL_FUNDERS } from '../constants';

const PLAYERS_CACHE_KEY = 'app_players_cache';
const PERIODS_CACHE_KEY = 'app_periods_cache';

interface AppContextType {
  players: Player[];
  periods: Period[];
  setPlayers: (action: React.SetStateAction<Player[]>) => void;
  setPeriods: (action: React.SetStateAction<Period[]>) => void;
  isLoading: boolean;
  error: string | null;
  notification: { message: string, type: 'error' | 'success' } | null;
  setNotification: (notification: { message: string, type: 'error' | 'success' } | null) => void;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [players, setPlayersState] = useState<Player[]>(() => {
    try {
      const cached = localStorage.getItem(PLAYERS_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  
  const [periods, setPeriodsState] = useState<Period[]>(() => {
    try {
      const cached = localStorage.getItem(PERIODS_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });

  // If we have cache, we don't start with loading true. If empty, we start with loading true.
  const initialLoading = players.length === 0 || periods.length === 0;
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'error' | 'success'} | null>(null);

  // Sync to LocalStorage on change
  useEffect(() => {
    localStorage.setItem(PLAYERS_CACHE_KEY, JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    localStorage.setItem(PERIODS_CACHE_KEY, JSON.stringify(periods));
  }, [periods]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchFromDB = useCallback(async () => {
    try {
      setIsLoading(true);
      const [fetchedPlayers, fetchedPeriods] = await Promise.all([
        dbService.getPlayers(),
        dbService.getPeriods()
      ]);
      
      let finalPlayers = fetchedPlayers;
      if (fetchedPlayers.length === 0) {
        // Initialize logic if DB is empty
        for (const p of INITIAL_FUNDERS) {
          try { await dbService.savePlayer(p); } catch (e) {}
        }
        finalPlayers = await dbService.getPlayers();
      }
      
      setPlayersState(finalPlayers);
      setPeriodsState(fetchedPeriods);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch on mount if cache is empty
    if (initialLoading) {
      fetchFromDB();
    }
  }, [initialLoading, fetchFromDB]);

  const refreshData = async () => {
    setNotification({ message: "正在刷新数据...", type: 'success' });
    await fetchFromDB();
    setNotification({ message: "数据已更新", type: 'success' });
  };

  const setPlayers = (action: React.SetStateAction<Player[]>) => {
    const nextPlayers = typeof action === 'function' ? action(players) : action;
    
    // Process changes
    const processChanges = async () => {
      try {
        // Check for deletions
        for (const p of players) {
          if (!nextPlayers.find(np => np.id === p.id)) {
            await dbService.deletePlayer(p.id);
          }
        }
        
        // Check for additions/updates
        for (const p of nextPlayers) {
          const existing = players.find(ep => ep.id === p.id);
          if (!existing || JSON.stringify(existing) !== JSON.stringify(p)) {
            await dbService.savePlayer(p);
          }
        }
        
        // Update local state ONLY after successful DB operations
        setPlayersState(nextPlayers);
        setNotification({ 
          message: "人员更新成功", 
          type: 'success' 
        });
      } catch (err: any) {
        console.error("Sync error:", err);
        setNotification({ 
          message: "数据保存失败，请检查网络权限: " + err.message, 
          type: 'error' 
        });
      }
    };

    processChanges();
  };

  const setPeriods = (action: React.SetStateAction<Period[]>) => {
    const nextPeriods = typeof action === 'function' ? action(periods) : action;
    
    const processChanges = async () => {
      try {
        for (const p of nextPeriods) {
          const existing = periods.find(ep => ep.id === p.id);
          if (!existing || JSON.stringify(existing) !== JSON.stringify(p)) {
            await dbService.savePeriod(p);
          }
        }
        
        for (const p of periods) {
          if (!nextPeriods.find(np => np.id === p.id)) {
            await dbService.deletePeriod(p.id);
          }
        }
        
        // Update local state ONLY after successful DB operations
        setPeriodsState(nextPeriods);
        setNotification({ 
          message: "结算信息更新成功", 
          type: 'success' 
        });
      } catch (err: any) {
        console.error("Sync error:", err);
        setNotification({ 
          message: "数据保存失败，请检查网络权限: " + err.message, 
          type: 'error' 
        });
      }
    };

    processChanges();
  };

  return (
    <AppContext.Provider value={{ players, periods, setPlayers, setPeriods, isLoading, error, notification, setNotification, refreshData }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
