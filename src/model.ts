import { Data } from 'effect';
import { MMRHistoryV2History } from './schemas';

export type Report = Data.TaggedEnum<{
  NewRank: {
    lastMatch: typeof MMRHistoryV2History.Type;
  };
  DeRank: {
    lastMatch: typeof MMRHistoryV2History.Type;
  };
  UpRank: {
    lastMatch: typeof MMRHistoryV2History.Type;
  };
}>;

export const { $match: reportMatch } = Data.taggedEnum<Report>();
