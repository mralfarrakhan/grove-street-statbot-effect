import { Data } from 'effect';

export type Report = Data.TaggedEnum<{
  NoChange: {};
  FirstRank: {};
  DownRank: {};
  UpRank: {};
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
