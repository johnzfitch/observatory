/**
 * Retry utilities for robust model loading
 *
 * Provides exponential backoff with jitter for transient failures
 * (network timeouts, IndexedDB locks, etc.)
 */

/**
 * Retry a function with exponential backoff and jitter
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {Function} options.shouldRetry - Function to determine if error is retryable
 * @param {Function} options.onRetry - Callback on retry attempt
 * @returns {Promise<*>} Result of the function
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    shouldRetry = () => true,
    onRetry = () => {}
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * 0.3 * baseDelay; // 0-30% jitter
      const delay = Math.round(baseDelay + jitter);

      // Notify callback
      onRetry({
        attempt: attempt + 1,
        maxRetries,
        delay,
        error
      });

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Determine if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error is retryable
 */
export function isRetryableError(error) {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();

  // Retryable errors - transient failures
  if (message.includes('fetch') || message.includes('network')) return true;
  if (message.includes('timeout') || message.includes('timed out')) return true;
  if (message.includes('quota') || message.includes('storage')) return true;
  if (message.includes('lock') || message.includes('busy')) return true;
  if (message.includes('aborted')) return true;

  // Non-retryable errors - permanent failures
  if (message.includes('404') || message.includes('not found')) return false;
  if (message.includes('invalid') || message.includes('corrupt')) return false;
  if (message.includes('unsupported')) return false;
  if (message.includes('out of memory') || message.includes('oom')) return false;

  // Default: retry unknown errors once
  return true;
}

/**
 * Create a timeout wrapper for promises
 * @param {Promise} promise - Promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {string} message - Timeout error message
 * @returns {Promise} Promise that rejects on timeout
 */
export function withTimeout(promise, ms, message = 'Operation timed out') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise])
    .finally(() => clearTimeout(timeoutId));
}
