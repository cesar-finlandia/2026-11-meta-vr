/**
 * Per-run and per-session model call and token budget guard.
 */

export interface CostGuardLimits {
  maxCallsPerRun: number;
  maxCallsPerSession: number;
  maxTokensPerRun: number;
  maxTokensPerSession: number;
}

export interface BudgetSnapshot {
  runCalls: number;
  sessionCalls: number;
  runTokens: number;
  sessionTokens: number;
  limits: CostGuardLimits;
  exceededReason: string | null;
}

export interface CostGuard {
  startNewRun(): void;
  checkCanCall(): { allowed: true } | { allowed: false; reason: string };
  recordUsage(tokens: { prompt: number; output: number; total: number }): BudgetSnapshot;
  getSnapshot(): BudgetSnapshot;
  subscribe(listener: (snap: BudgetSnapshot) => void): () => void;
}

export const DEFAULT_COST_GUARD_LIMITS: CostGuardLimits = {
  maxCallsPerRun: 16,
  maxCallsPerSession: 60,
  maxTokensPerRun: 64000,
  maxTokensPerSession: 240000,
};

export function createCostGuard(limits?: Partial<CostGuardLimits>): CostGuard {
  const mergedLimits: CostGuardLimits = {
    ...DEFAULT_COST_GUARD_LIMITS,
    ...limits,
  };

  let runCalls = 0;
  let sessionCalls = 0;
  let runTokens = 0;
  let sessionTokens = 0;
  let exceededReason: string | null = null;

  const listeners = new Set<(snap: BudgetSnapshot) => void>();

  function evaluateLimit(): string | null {
    if (runCalls >= mergedLimits.maxCallsPerRun) {
      return `Budget exceeded: run calls ceiling reached (${runCalls}/${mergedLimits.maxCallsPerRun})`;
    }
    if (sessionCalls >= mergedLimits.maxCallsPerSession) {
      return `Budget exceeded: session calls ceiling reached (${sessionCalls}/${mergedLimits.maxCallsPerSession})`;
    }
    if (runTokens >= mergedLimits.maxTokensPerRun) {
      return `Budget exceeded: run tokens ceiling reached (${runTokens}/${mergedLimits.maxTokensPerRun})`;
    }
    if (sessionTokens >= mergedLimits.maxTokensPerSession) {
      return `Budget exceeded: session tokens ceiling reached (${sessionTokens}/${mergedLimits.maxTokensPerSession})`;
    }
    return null;
  }

  function getSnapshot(): BudgetSnapshot {
    return {
      runCalls,
      sessionCalls,
      runTokens,
      sessionTokens,
      limits: { ...mergedLimits },
      exceededReason,
    };
  }

  function notify(): void {
    const snap = getSnapshot();
    for (const l of listeners) {
      try {
        l(snap);
      } catch (err) {
        console.error("CostGuard listener error:", err);
      }
    }
  }

  return {
    startNewRun(): void {
      runCalls = 0;
      runTokens = 0;
      exceededReason = evaluateLimit();
      notify();
    },

    checkCanCall(): { allowed: true } | { allowed: false; reason: string } {
      const reason = evaluateLimit();
      if (reason) {
        exceededReason = reason;
        return { allowed: false, reason };
      }
      return { allowed: true };
    },

    recordUsage(tokens: { prompt: number; output: number; total: number }): BudgetSnapshot {
      runCalls++;
      sessionCalls++;
      runTokens += tokens.total;
      sessionTokens += tokens.total;
      exceededReason = evaluateLimit();
      notify();
      return getSnapshot();
    },

    getSnapshot,

    subscribe(listener: (snap: BudgetSnapshot) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
