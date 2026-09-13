import { describe, it, expect, jest } from '@jest/globals';
import { withRetry } from '../src/sync/retry.js';

describe('Retry Engine (withRetry)', () => {
  it('should succeed on the first attempt if no error occurs', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const sleeper = jest.fn();

    const result = await withRetry(fn, { maxAttempts: 3, sleeper });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleeper).not.toHaveBeenCalled();
  });

  it('should retry on HTTP 429 Rate Limit and succeed on subsequent attempt', async () => {
    const rateLimitError = new Error('Rate limit exceeded');
    rateLimitError.status = 429;

    const fn = jest.fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce('recovered');
    const sleeper = jest.fn().mockResolvedValue();

    const result = await withRetry(fn, { maxAttempts: 3, baseMs: 100, sleeper });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleeper).toHaveBeenCalledTimes(1);
  });

  it('should retry on HTTP 500 and HTTP 503 server errors', async () => {
    const serverError = new Error('Internal Server Error');
    serverError.status = 500;

    const gatewayError = new Error('Service Unavailable');
    gatewayError.status = 503;

    const fn = jest.fn()
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(gatewayError)
      .mockResolvedValueOnce('healthy');
    const sleeper = jest.fn().mockResolvedValue();

    const result = await withRetry(fn, { maxAttempts: 4, baseMs: 50, sleeper });

    expect(result).toBe('healthy');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleeper).toHaveBeenCalledTimes(2);
  });

  it('should honor the Retry-After header when provided on HTTP 429', async () => {
    const rateLimitError = new Error('Too Many Requests');
    rateLimitError.status = 429;
    rateLimitError.headers = { 'retry-after': '3' }; // 3 seconds

    const fn = jest.fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce('after_backoff');
    const sleeper = jest.fn().mockResolvedValue();

    const result = await withRetry(fn, { maxAttempts: 3, sleeper });

    expect(result).toBe('after_backoff');
    expect(sleeper).toHaveBeenCalledTimes(1);
    // 3 seconds = 3000ms
    expect(sleeper).toHaveBeenCalledWith(3000);
  });

  it('should give up and rethrow after maxAttempts are exhausted', async () => {
    const error500 = new Error('Persistent failure');
    error500.status = 500;

    const fn = jest.fn().mockRejectedValue(error500);
    const sleeper = jest.fn().mockResolvedValue();

    await expect(withRetry(fn, { maxAttempts: 3, baseMs: 50, sleeper }))
      .rejects.toThrow('Persistent failure');

    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleeper).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-retryable 4xx client errors (400, 401, 404)', async () => {
    const badRequestError = new Error('Bad Request');
    badRequestError.status = 400;

    const fn = jest.fn().mockRejectedValue(badRequestError);
    const sleeper = jest.fn();

    await expect(withRetry(fn, { maxAttempts: 5, sleeper }))
      .rejects.toThrow('Bad Request');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleeper).not.toHaveBeenCalled();
  });
});
