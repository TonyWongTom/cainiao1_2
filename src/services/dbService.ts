import { Player, Period } from '../types';

let currentPassword = localStorage.getItem('app_password') || '';

// Internal fetch that attaches password
async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-password': currentPassword,
    ...options.headers,
  };
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  return response.json();
}

// Global Auth State
let authStateListeners: ((isAuthenticated: boolean) => void)[] = [];

export const auth = {
  get isAuthenticated() {
    return !!currentPassword;
  },
  onAuthStateChanged: (callback: (isAuthenticated: boolean) => void) => {
    callback(!!currentPassword);
    authStateListeners.push(callback);
    return () => {
      authStateListeners = authStateListeners.filter(cb => cb !== callback);
    };
  },
  loginWithPassword: async (password: string) => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (res.ok) {
        currentPassword = password;
        localStorage.setItem('app_password', password);
        authStateListeners.forEach(cb => cb(true));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
  signOut: async () => {
    currentPassword = '';
    localStorage.removeItem('app_password');
    authStateListeners.forEach(cb => cb(false));
  }
};

export const loginWithPassword = auth.loginWithPassword;
export const logout = auth.signOut;

export const dbService = {
  async getPlayers(): Promise<Player[]> {
    try {
      return await apiFetch('/api/players');
    } catch (e) {
      console.error(e);
      throw e;
    }
  },

  async savePlayer(player: Player): Promise<boolean> {
    try {
      if (!player.id) {
          player.id = Date.now().toString();
      }
      await apiFetch('/api/players', {
        method: 'POST',
        body: JSON.stringify(player)
      });
      return true;
    } catch (e) {
       console.error(e);
      return false;
    }
  },

  async deletePlayer(playerId: string): Promise<boolean> {
    try {
      await apiFetch(`/api/players/${playerId}`, { method: 'DELETE' });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  async getPeriods(): Promise<Period[]> {
    try {
      return await apiFetch('/api/periods');
    } catch (e) {
      console.error(e);
      throw e;
    }
  },

  async savePeriod(period: Period): Promise<boolean> {
    try {
      await apiFetch('/api/periods', {
        method: 'POST',
        body: JSON.stringify(period)
      });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  async deletePeriod(periodId: string): Promise<boolean> {
    try {
      await apiFetch(`/api/periods/${periodId}`, { method: 'DELETE' });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  // Fake subscription by polling every 5s if we needed exactly the same UI interface
  subscribeToPlayers(callback: (players: Player[]) => void) {
    if (!auth.isAuthenticated) return () => {};
    let isActive = true;
    
    const fetchIt = async () => {
       if (!isActive) return;
       try {
         const data = await this.getPlayers();
         if(isActive) callback(data);
       } catch (e) {
          console.error("Subscription poll failed", e);
       }
    };
    
    fetchIt();
    const intervalId = setInterval(fetchIt, 5000);
    
    return () => {
       isActive = false;
       clearInterval(intervalId);
    };
  },

  subscribeToPeriods(callback: (periods: Period[]) => void) {
    if (!auth.isAuthenticated) return () => {};
    let isActive = true;
    
    const fetchIt = async () => {
       if (!isActive) return;
       try {
         const data = await this.getPeriods();
         if(isActive) callback(data);
       } catch (e) {
          console.error("Subscription poll failed", e);
       }
    };
    
    fetchIt();
    const intervalId = setInterval(fetchIt, 5000);
    
    return () => {
       isActive = false;
       clearInterval(intervalId);
    };
  }
};
