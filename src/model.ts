import { Data } from 'effect';

export type Report = Data.TaggedEnum<{
  NoChange: {};
  NewSeason: {};
  FirstRank: {
    readonly rank: string;
    readonly matchId: string;
    readonly map: string;
    readonly lastChange: number;
    readonly kills?: number;
  };
  DownRank: {
    readonly oldRank: string;
    readonly newRank: string;
    readonly matchId: string;
    readonly map: string;
    readonly lastChange: number;
    readonly streakCount?: number;
    readonly kills?: number;
  };
  UpRank: {
    readonly oldRank: string;
    readonly newRank: string;
    readonly matchId: string;
    readonly map: string;
    readonly lastChange: number;
    readonly streakCount?: number;
    readonly kills?: number;
  };
  DerankProtected: {
    readonly rank: string;
    readonly matchId: string;
    readonly map: string;
    readonly lastChange: number;
    readonly kills?: number;
  };
  RefundedRR: {
    readonly amount: number;
    readonly currentRank: string;
  };
  WinStreak: {
    readonly streakCount: number;
    readonly matchId: string;
    readonly map: string;
    readonly lastChange: number;
    readonly kills?: number;
  };
  LossStreak: {
    readonly streakCount: number;
    readonly matchId: string;
    readonly map: string;
    readonly lastChange: number;
    readonly kills?: number;
  };
  MonsterCarry: {
    readonly kills: number;
    readonly deaths: number;
    readonly assists: number;
    readonly score: number;
    readonly won: boolean;
    readonly matchId: string;
    readonly map: string;
    readonly lastChange: number;
    readonly isMatchMvp?: boolean;
  };
}>;

export const {
  $match: reportMatch,
  NoChange,
  FirstRank,
  DownRank,
  UpRank,
  NewSeason,
  DerankProtected,
  RefundedRR,
  WinStreak,
  LossStreak,
  MonsterCarry,
} = Data.taggedEnum<Report>();
