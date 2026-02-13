/**
 * ContextTracker — tracks context window usage per session.
 *
 * Data source: `assistant_text` events with `event.usage` from the
 * claude.activity stream (API-accurate values, not heuristic).
 *
 * Context window = inputTokens + cacheRead + cacheCreation
 *   - inputTokens: new (non-cached) input tokens per turn
 *   - cacheRead: tokens read from prompt cache (the bulk of context)
 *   - cacheCreation: tokens newly written to cache
 *
 * Follows the same singleton + onChange pattern as costTracker.
 */

// Claude context window size (200K tokens)
const MAX_CONTEXT_TOKENS = 200_000;

class ContextTracker {
  constructor() {
    /** @type {Map<string, { totalTokens: number, timestamp: string }>} */
    this.sessions = new Map();
    this.listeners = new Set();
  }

  /**
   * Feed a claude.activity event for a session.
   * Only processes `assistant_text` events that carry usage data.
   * @param {string} sessionId
   * @param {object} event
   */
  onEvent(sessionId, event) {
    if (event.kind !== 'assistant_text') return;
    if (!event.usage) return;

    const u = event.usage;
    // Total context = new input tokens + cached tokens read + cached tokens created
    const total = (u.inputTokens || 0) + (u.cacheRead || 0) + (u.cacheCreation || 0);
    if (total <= 0) return;

    const existing = this.sessions.get(sessionId);

    // Only update if total increased (or first data point)
    if (existing && existing.totalTokens >= total) return;

    this.sessions.set(sessionId, {
      totalTokens: total,
      timestamp: event.timestamp || new Date().toISOString(),
    });

    this._notify(sessionId);
  }

  /**
   * Get context usage for a session.
   * @param {string} sessionId
   * @returns {{ totalTokens: number, percentage: number, timestamp: string } | null}
   */
  getContext(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    return {
      totalTokens: s.totalTokens,
      percentage: Math.min((s.totalTokens / MAX_CONTEXT_TOKENS) * 100, 100),
      timestamp: s.timestamp,
    };
  }

  /**
   * Subscribe to context updates.
   * @param {function} cb - called with (sessionId)
   * @returns {function} unsubscribe
   */
  onChange(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Remove session data. */
  removeSession(sessionId) {
    this.sessions.delete(sessionId);
    this._notify(sessionId);
  }

  _notify(sessionId) {
    for (const cb of this.listeners) {
      try { cb(sessionId); } catch { /* ignore */ }
    }
  }
}

/**
 * Color for a given context percentage.
 * @param {number} pct - 0-100
 * @returns {string} hex color
 */
export function contextColorForPercentage(pct) {
  if (pct > 85) return '#ff0080';
  if (pct > 60) return '#ffaa00';
  return '#00f0ff';
}

/**
 * Format token count for display. e.g. 142300 → "142.3K"
 * @param {number} n
 * @returns {string}
 */
export function formatContextTokens(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
}

// Singleton
const contextTracker = new ContextTracker();
export default contextTracker;
