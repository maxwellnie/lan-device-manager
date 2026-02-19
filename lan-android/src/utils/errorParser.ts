import i18n from '../i18n';

export interface ParsedError {
  message: string;
  type: 'auth' | 'connection' | 'network' | 'server' | 'permission' | 'unknown';
  originalError?: string;
}

const errorPatterns: Array<{
  patterns: string[];
  type: ParsedError['type'];
  key: string;
}> = [
  // Blacklist errors - 优先检查
  {
    patterns: ['blacklist', 'ip blocked', 'blocked by blacklist', 'ip is blacklisted', 'connection blocked'],
    type: 'permission',
    key: 'errors.ipBlocked'
  },
  // Whitelist/Permission errors - 优先检查
  {
    patterns: ['not in whitelist', 'command not allowed', 'forbidden', '403', 'not permitted'],
    type: 'permission',
    key: 'errors.commandNotInWhitelist'
  },
  // Permission denied errors - 优先检查
  {
    patterns: ['permission denied', 'access denied'],
    type: 'permission',
    key: 'errors.permissionDenied'
  },
  // Authentication errors - 注意：不包含 "unauthorized"，避免与 permission 混淆
  {
    patterns: ['authentication failed', 'auth failed', 'invalid password', 'wrong password', 'password incorrect', '401'],
    type: 'auth',
    key: 'errors.authFailed'
  },
  // Connection errors
  {
    patterns: ['connection failed', 'connection refused', 'refused', 'ECONNREFUSED'],
    type: 'connection',
    key: 'errors.connectionFailed'
  },
  // Timeout errors
  {
    patterns: ['timeout', 'timed out', 'ETIMEDOUT', 'request timeout'],
    type: 'connection',
    key: 'errors.timeout'
  },
  // Network errors
  {
    patterns: ['network', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'no route to host'],
    type: 'network',
    key: 'errors.networkError'
  },
  // Device not responding
  {
    patterns: ['not responding', 'no response', 'device unreachable', 'unreachable'],
    type: 'connection',
    key: 'errors.notResponding'
  },
  // Server errors
  {
    patterns: ['server error', '500', '502', '503', '504', 'internal server error'],
    type: 'server',
    key: 'errors.serverError'
  }
];

/**
 * Parse complex error messages into user-friendly localized messages
 */
export function parseError(error: unknown): ParsedError {
  const errorStr = String(error).toLowerCase();
  const originalError = String(error);

  // Check against known patterns
  for (const { patterns, type, key } of errorPatterns) {
    if (patterns.some(pattern => errorStr.includes(pattern.toLowerCase()))) {
      return {
        message: i18n.t(key),
        type,
        originalError
      };
    }
  }

  // Default unknown error
  return {
    message: i18n.t('errors.unknownError'),
    type: 'unknown',
    originalError
  };
}

/**
 * Get a simple error message for display
 */
export function getErrorMessage(error: unknown): string {
  return parseError(error).message;
}

/**
 * Check if error is an authentication error
 */
export function isAuthError(error: unknown): boolean {
  return parseError(error).type === 'auth';
}

/**
 * Check if error is a connection error
 */
export function isConnectionError(error: unknown): boolean {
  const type = parseError(error).type;
  return type === 'connection' || type === 'network';
}

/**
 * Check if error is a permission error (whitelist, forbidden, etc.)
 */
export function isPermissionError(error: unknown): boolean {
  return parseError(error).type === 'permission';
}

/**
 * Parse connection result error from Rust backend
 */
export function parseConnectionError(error: string | null): string {
  if (!error) return i18n.t('errors.connectionFailed');
  return getErrorMessage(error);
}

/**
 * Get action-specific error message
 */
export function getActionErrorMessage(action: string, error: unknown): string {
  const parsed = parseError(error);

  switch (action) {
    case 'connect':
      return parsed.type === 'auth'
        ? i18n.t('errors.authFailed')
        : i18n.t('errors.failedToConnect');
    case 'execute':
      if (parsed.type === 'permission') {
        return parsed.message;
      }
      return i18n.t('errors.failedToExecute');
    case 'save':
      return i18n.t('errors.failedToSave');
    case 'delete':
      return i18n.t('errors.failedToDelete');
    default:
      return parsed.message;
  }
}
