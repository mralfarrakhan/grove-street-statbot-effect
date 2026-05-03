import { D1Client } from '@effect/sql-d1';
import { env } from 'cloudflare:workers';

export const D1Live = D1Client.layer({
  db: env.STATBOT_DB,
});
