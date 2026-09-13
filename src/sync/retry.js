/**
 * Executes an async function with exponential backoff, jitter, and Retry-After header support.
 *
 * Designed to handle external API rate limits (HTTP 429) and transient server errors (HTTP 5xx).
 * Non-retryable errors (e.g. 400 Bad Request, 401 Unauthorized, 404 Not Found) are thrown immediately.
 *
 * @param {Function} fn - Async operation to execute
 * @param {Object} options - Configuration options
 * @param {number} [options.maxAttempts=5] - Maximum retry attempts
 * @param {number} [options.baseMs=500] - Base backoff delay in milliseconds
 * @param {number} [options.maxMs=30000] - Maximum backoff delay cap in milliseconds
 * @param {Function} [options.isRetryable] - Predicate determining if an error is transient
 * @param {Function} [options.sleeper] - Sleeper function for testing (defaults to setTimeout Promise)
 * @returns {Promise<any>}
 */
export async function withRetry(fn, {
  maxAttempts = 5,
  baseMs = 500,
  maxMs = 30000,
  sleeper = (ms) => new Promise((r) => setTimeout(r, ms)),
  isRetryable = (err) => {
    const status = err?.status ?? err?.response?.status;
    return status === 429 || (status >= 500 && status < 600);
  }
} = {}) {
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      // If error is not transient (e.g. 400, 401, 404) or we exhausted all attempts, throw immediately
      if (!isRetryable(err) || attempt === maxAttempts) {
        throw err;
      }

      // Check for Retry-After header (supports both seconds and string representation)
      const headers = err?.response?.headers || err?.headers || {};
      const retryAfterVal = typeof headers.get === 'function'
        ? headers.get('retry-after')
        : (headers['retry-after'] || headers['Retry-After']);

      let backoff;
      const parsedRetryAfter = Number(retryAfterVal);

      if (!isNaN(parsedRetryAfter) && parsedRetryAfter > 0) {
        // Honor upstream server instruction in milliseconds
        backoff = parsedRetryAfter * 1000;
      } else {
        // Full jitter exponential backoff: baseMs * 2^(attempt-1) capped at maxMs, + random jitter up to 250ms
        const exponentialDelay = Math.min(maxMs, baseMs * (2 ** (attempt - 1)));
        const jitter = Math.random() * 250;
        backoff = exponentialDelay + jitter;
      }

      await sleeper(backoff);
    }
  }

  throw lastErr;
}

export default withRetry;
