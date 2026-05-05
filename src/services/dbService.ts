import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Player, Period } from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Authentication Logic
export const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

export const logout = async () => {
  return signOut(auth);
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const dbService = {
  async getPlayers(): Promise<Player[]> {
    try {
      const snap = await getDocs(collection(db, 'players'));
      return snap.docs.map(d => d.data() as Player);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'players');
      return []; // fallback for typescript compilation, handleFirestoreError throws
    }
  },

  async savePlayer(player: Player): Promise<boolean> {
    try {
      if (!player.id) {
          player.id = Date.now().toString(); // rudimentary ID if not present
      }
      await setDoc(doc(db, 'players', player.id), player);
      console.log('✅ 云端写入确认成功！ID:', player.id);
      return true;
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `players/${player.id}`);
      return false;
    }
  },

  async deletePlayer(playerId: string): Promise<boolean> {
    try {
      await deleteDoc(doc(db, 'players', playerId));
      return true;
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `players/${playerId}`);
      return false;
    }
  },

  async getPeriods(): Promise<Period[]> {
    try {
      const snap = await getDocs(collection(db, 'periods'));
      return snap.docs.map(d => d.data() as Period);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'periods');
      return [];
    }
  },

  async savePeriod(period: Period): Promise<boolean> {
    try {
      await setDoc(doc(db, 'periods', period.id), period);
      console.log('✅ 云端写入确认成功！ID:', period.id);
      return true;
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `periods/${period.id}`);
      return false;
    }
  },

  async deletePeriod(periodId: string): Promise<boolean> {
    try {
      await deleteDoc(doc(db, 'periods', periodId));
      return true;
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `periods/${periodId}`);
      return false;
    }
  },

  subscribeToPlayers(callback: (players: Player[]) => void) {
    if (!auth.currentUser) return () => {};
    const unsubscribe = onSnapshot(collection(db, 'players'), 
      (snap) => {
        callback(snap.docs.map(d => d.data() as Player));
      }, 
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'players');
      }
    );
    return unsubscribe;
  },

  subscribeToPeriods(callback: (periods: Period[]) => void) {
    if (!auth.currentUser) return () => {};
    const unsubscribe = onSnapshot(collection(db, 'periods'), 
      (snap) => {
        callback(snap.docs.map(d => d.data() as Period));
      }, 
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'periods');
      }
    );
    return unsubscribe;
  }
};
