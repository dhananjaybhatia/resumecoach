// lib/debug.ts - Environment-based debug logging utility

const DEBUG = process.env.NODE_ENV === 'development';

/**
 * Debug logging utility that only logs in development mode
 * @param args - Arguments to log
 */
export const debug = (...args: any[]) => {
  if (DEBUG) {
    console.log(...args);
  }
};

/**
 * Debug logging with a specific key (useful for tracking specific debug points)
 * @param key - Unique identifier for this debug point
 * @param args - Arguments to log
 */
export const debugOnce = (() => {
  const seen = new Set<string>();
  return (key: string, ...args: any[]) => {
    if (DEBUG && !seen.has(key)) {
      seen.add(key);
      console.log(`[${key}]`, ...args);
    }
  };
})();

/**
 * Error logging (always shows, regardless of environment)
 * @param args - Arguments to log
 */
export const logError = (...args: any[]) => {
  console.error(...args);
};

/**
 * Warning logging (always shows, regardless of environment)
 * @param args - Arguments to log
 */
export const logWarning = (...args: any[]) => {
  console.warn(...args);
};

/**
 * Info logging (only shows in development)
 * @param args - Arguments to log
 */
export const logInfo = (...args: any[]) => {
  if (DEBUG) {
    console.info(...args);
  }
};
