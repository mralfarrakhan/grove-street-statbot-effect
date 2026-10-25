import { Data } from 'effect';

export type Report = Data.TaggedEnum<{
  NoChange: {};
  NewSeason: {};
  FirstRank: {
    readonly rank: string;
    readonly matchId: string;
    readonly map: string;
    readonly lastChange: number;
  };
  DownRank: {
    readonly oldRank: string;
    readonly newRank: string;
    readonly matchId: string;
    readonly map: string;
    readonly lastChange: number;
  };
  UpRank: {
    readonly oldRank: string;
    readonly newRank: string;
    readonly matchId: string;
    readonly map: string;
    readonly lastChange: number;
  };
  DerankProtected: {
    readonly rank: string;
    readonly matchId: string;
    readonly map: string;
    readonly lastChange: number;
  };
  RefundedRR: {
    readonly amount: number;
    readonly currentRank: string;
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
} = Data.taggedEnum<Report>();
