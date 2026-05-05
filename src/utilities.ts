import { Effect } from 'effect';

export class Unimplemented {
  readonly _tag = 'Unimplemented';
}

export const todo = Effect.fail(new Unimplemented());
