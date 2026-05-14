import { Data } from 'effect';

export type Report = Data.TaggedEnum<{
  NoChange: {};
  FirstRank: {
    readonly rank: string;
  };
  DownRank: {
    readonly oldRank: string;
    readonly newRank: string;
  };
  UpRank: {
    readonly oldRank: string;
    readonly newRank: string;
  };
  NewSeason: {};
}>;

export const {
  $match: reportMatch,
  NoChange,
  FirstRank,
  DownRank,
  UpRank,
  NewSeason,
} = Data.taggedEnum<Report>();
