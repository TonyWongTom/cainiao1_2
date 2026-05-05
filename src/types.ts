
export enum PlayerType {
  MONTHLY = '包月',
  HALF_MONTHLY = '包半月',
  PER_SESSION = '按次'
}

export interface Player {
  id: string;
  name: string;
  type: PlayerType;
  defaultFee: number;
  isFunder: boolean;
}

export interface Session {
  id: string;
  date: string;
  sessionCost?: number; // 当日额外场地费用
  attendees: {
    playerId: string;
    fee: number;
  }[];
}

export interface PeriodPlayerConfig {
  playerId: string;
  type: PlayerType;
  fee: number;
}

export interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  courtCost: number; // 周期基础场地总成本
  sessions: Session[];
  funderIds: string[]; // 本期参加集资的人员 ID
  playerConfigs?: PeriodPlayerConfig[]; // 本期人员性质配置
}

export type View = 'dashboard' | 'players' | 'periods' | 'finance';
