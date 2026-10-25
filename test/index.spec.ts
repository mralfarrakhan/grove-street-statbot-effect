import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { Cause, Data, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import { extractCauseDetails } from '../src/logger';
import { getAgentPersona } from '../src/personas';
import { AccountV2, MMRHistoryV2 } from '../src/schemas';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Grove Street Statbot Worker API', () => {
  it('GET /api returns "ok" with status 200', async () => {
    const request = new IncomingRequest('http://example.com/api');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });

  it('GET /api/players returns 401 without Basic Auth', async () => {
    const request = new IncomingRequest('http://example.com/api/players');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });
});

describe('Structured Logger', () => {
  it('extracts concise error details from Cause with ParseError', () => {
    const TestSchema = Schema.Struct({ id: Schema.UUID });
    try {
      Schema.decodeUnknownSync(TestSchema)({ id: '' });
      expect.fail('Expected parse error');
    } catch (e) {
      const cause = Cause.fail(e);
      const details = extractCauseDetails(cause);
      expect(details.errorType).toBe('ParseError');
      expect(details.message).toContain('Expected a Universally Unique Identifier');
      expect(details.stack.length).toBeLessThanOrEqual(530);
    }
  });

  it('extracts status code and errorType from HTTP ResponseError', () => {
    class HttpRateLimitError extends Data.TaggedError('ResponseError')<{
      readonly status: number;
      readonly message: string;
    }> {}

    const cause = Cause.fail(
      new HttpRateLimitError({
        status: 429,
        message: 'Rate limit exceeded: 30 requests per minute',
      }),
    );
    const details = extractCauseDetails(cause);
    expect(details.errorType).toBe('ResponseError');
    expect(details.statusCode).toBe(429);
    expect(details.message).toBe('Rate limit exceeded: 30 requests per minute');
  });
});

describe('Agent Personas', () => {
  it('resolves known agent personas accurately', () => {
    const jett = getAgentPersona('Jett');
    expect(jett.displayName).toBe('Jett');
    expect(jett.archetype).toBe('Duelist');
    expect(jett.nativeLanguageSlips).toContain('Korean');

    const brimstone = getAgentPersona('Brimstone');
    expect(brimstone.displayName).toBe('Brimstone');
    expect(brimstone.archetype).toBe('Controller');
    expect(brimstone.voiceTraits).toContain('commander');
  });

  it('provides a resilient fallback persona for unknown agents', () => {
    const unknown = getAgentPersona('UnknownAgent99');
    expect(unknown.displayName).toBe('UnknownAgent99');
    expect(unknown.catchphrases.length).toBeGreaterThan(0);
    expect(unknown.partnerTone).toBeTruthy();
  });
});

describe('Schema Resilience with Riot Edge Cases', () => {
  it('decodes MMRHistoryV2 with empty string map and season IDs', () => {
    const mockMmrPayload = {
      status: 200,
      data: {
        account: {
          name: 'Synzdrome',
          tag: '9258',
          puuid: 'f031d578-58a6-5094-879c-bc861fc0e3f8',
        },
        history: [
          {
            tier: { id: 10, name: 'Silver 2' },
            match_id: '067a1956-0f12-4f97-bd8c-ab7d0863f4ee',
            map: { id: '', name: 'Unknown' },
            season: { id: '', short: 'Unknown' },
            rr: 64,
            last_change: -6,
            elo: 764,
            refunded_rr: 0,
            was_derank_protected: false,
            date: '2026-10-23T15:03:31Z',
          },
        ],
      },
    };

    const decoded = Schema.decodeUnknownSync(MMRHistoryV2)(mockMmrPayload);
    expect(decoded.data.history[0].map.id).toBe('');
    expect(decoded.data.history[0].season.id).toBe('');
    expect(decoded.data.history[0].match_id).toBe('067a1956-0f12-4f97-bd8c-ab7d0863f4ee');
  });

  it('decodes AccountV2 with string card and title IDs', () => {
    const mockAccountPayload = {
      status: 200,
      data: {
        puuid: '20e05298-a3b7-53c5-a872-105c0032759d',
        region: 'ap',
        account_level: 209,
        name: 'A Grothendieck',
        tag: '3110',
        card: 'custom-card-id',
        title: 'custom-title-id',
        platforms: ['PC'],
        updated_at: '2026-10-24T23:50:45.517Z',
      },
    };

    const decoded = Schema.decodeUnknownSync(AccountV2)(mockAccountPayload);
    expect(decoded.data.name).toBe('A Grothendieck');
    expect(decoded.data.card).toBe('custom-card-id');
    expect(decoded.data.title).toBe('custom-title-id');
  });
});
