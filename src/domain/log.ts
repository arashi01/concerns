/**
 * Structured logging for Forge resolver functions.
 *
 * Forge captures {@link console.log}, {@link console.warn}, and
 * {@link console.error} from backend functions and surfaces them
 * via `forge logs`. Frontend (UI Kit / Custom UI) output goes to
 * the browser console only.
 *
 * Platform limits: 100 log lines per runtime minute, 200 KiB per
 * invocation. Keep messages concise and guard verbose output
 * behind {@link LogLevel} `debug`.
 *
 * @see https://developer.atlassian.com/platform/forge/debugging/
 * @see https://developer.atlassian.com/platform/forge/monitor-app-logs/
 */

// ---- Log Level ----

/**
 * Severity levels in ascending order.
 *
 * - `debug` - verbose diagnostics, normally suppressed
 * - `info`  - routine operational events
 * - `warn`  - recoverable issues that merit attention
 * - `error` - failures requiring investigation
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ---- Active Level ----

/**
 * Parse a string into a {@link LogLevel}, returning `undefined`
 * for unrecognised values.
 */
const parseLevel = (value: string | undefined): LogLevel | undefined => {
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') return value;
  return undefined;
};

/**
 * Minimum severity that will be emitted. Messages below this
 * threshold are silently discarded.
 *
 * Reads from the `LOG_LEVEL` Forge environment variable at module
 * load time. Defaults to `info` (production-safe). Set per
 * environment with:
 *
 * ```sh
 * forge variables set LOG_LEVEL debug -e development
 * ```
 */
let activeLevel: LogLevel = parseLevel(process.env['LOG_LEVEL']) ?? 'info';

// ---- Companion Module ----

/**
 * Structured logger for Forge backend functions.
 *
 * Usage:
 * ```ts
 * Log.info('getTree', 'loaded tree', { treeId });
 * Log.error('saveTree', 'version conflict', { stored: 3, received: 2 });
 * ```
 *
 * Output format (consumed by `forge logs`):
 * ```
 * [getTree] loaded tree {"treeId":"abc-123"}
 * ```
 */
const Log = {
  /** Set the minimum severity threshold at runtime. */
  setLevel: (level: LogLevel): void => {
    activeLevel = level;
  },

  /** Current active level. */
  level: (): LogLevel => activeLevel,

  debug: (tag: string, message: string, data?: Record<string, unknown>): void => emit('debug', tag, message, data),

  info: (tag: string, message: string, data?: Record<string, unknown>): void => emit('info', tag, message, data),

  warn: (tag: string, message: string, data?: Record<string, unknown>): void => emit('warn', tag, message, data),

  error: (tag: string, message: string, data?: Record<string, unknown>): void => emit('error', tag, message, data),
} as const;

// ---- Internal ----

const emit = (level: LogLevel, tag: string, message: string, data: Record<string, unknown> | undefined): void => {
  if (LEVEL_RANK[level] < LEVEL_RANK[activeLevel]) return;

  const suffix = data !== undefined ? ` ${JSON.stringify(data)}` : '';
  const line = `[${tag}] ${message}${suffix}`;

  switch (level) {
    case 'debug':
    case 'info':
      console.log(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'error':
      console.error(line);
      break;
  }
};

export { Log };
export type { LogLevel };
