import { Cause, Console, Effect, Option } from 'effect';

export interface FormattedError {
  readonly errorType: string;
  readonly message: string;
  readonly statusCode?: number;
  readonly stack: string;
}

/**
 * Extracts a concise, human-readable summary from an Effect Cause tree.
 * Prevents massive fiber AST dumps from overflowing Cloudflare log limits.
 */
export const extractCauseDetails = (cause: Cause.Cause<unknown>): FormattedError => {
  const failure = Cause.failureOption(cause);
  const defect = Cause.dieOption(cause);
  const err = Option.getOrUndefined(failure) ?? Option.getOrUndefined(defect);

  let errorType = 'UnknownError';
  let message = 'An unknown error occurred';
  let statusCode: number | undefined;

  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;

    if (typeof obj._tag === 'string') {
      errorType = obj._tag;
    } else if (typeof obj.name === 'string') {
      errorType = obj.name;
    }

    if (typeof obj.message === 'string') {
      message = obj.message;
    }

    // Extract HTTP status code if present
    if (typeof obj.status === 'number') {
      statusCode = obj.status;
    } else if (
      obj.response &&
      typeof obj.response === 'object' &&
      typeof (obj.response as Record<string, unknown>).status === 'number'
    ) {
      statusCode = (obj.response as Record<string, unknown>).status as number;
    }
  } else if (typeof err === 'string') {
    message = err;
  }

  // Generate clean human-readable stack and cap to 500 chars to guarantee no truncation
  const rawPretty = Cause.pretty(cause);
  const stack = rawPretty.length > 500 ? `${rawPretty.slice(0, 500)}... [truncated]` : rawPretty;

  return {
    errorType,
    message,
    statusCode,
    stack,
  };
};

/**
 * Emits a structured JSON log line to Cloudflare's Console.error.
 */
export const logStructuredError = (
  event: string,
  cause: Cause.Cause<unknown>,
  context?: Record<string, unknown>,
): Effect.Effect<void> => {
  const details = extractCauseDetails(cause);
  const payload = {
    event,
    errorType: details.errorType,
    message: details.message,
    ...(details.statusCode !== undefined ? { statusCode: details.statusCode } : {}),
    ...(context ? { context } : {}),
    stack: details.stack,
  };

  return Console.error(JSON.stringify(payload));
};
