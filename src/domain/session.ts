/**
 * Application composition root assembling an isolated curatorial store,
 * deterministic truth engine, human approval gate, trace collector, and action registry.
 */
import { createTruthEngine } from "./truth-engine";
import { createSeedExhibition } from "./seed";
import { createDomainStore } from "./store";
import type {
  ActionCallContext,
  ActionCallResult,
  ActionDescriptor,
  ActionManifestEntry,
  ActionRegistry,
  ApprovalDecision,
  ApprovalGate,
  DomainStore,
  PendingApproval,
  RunTraceDocument,
  RunTraceSummary,
  SessionOptions,
  SightlineSession,
  TraceCollector,
  TraceEntry,
} from "./types";

export function createApprovalGate(initialEnabled = true): ApprovalGate {
  let enabled = Boolean(initialEnabled);
  let pending: PendingApproval | null = null;
  let activeResolver: ((decision: ApprovalDecision) => void) | null = null;
  const listeners = new Set<(p: PendingApproval | null, e: boolean) => void>();

  function notify(): void {
    for (const l of listeners) {
      try {
        l(pending, enabled);
      } catch (err) {
        console.error("ApprovalGate listener error:", err);
      }
    }
  }

  function resolvePending(decision: ApprovalDecision): void {
    if (activeResolver) {
      const resolver = activeResolver;
      activeResolver = null;
      pending = null;
      notify();
      resolver(decision);
    }
  }

  return {
    isEnabled(): boolean {
      return enabled;
    },
    setEnabled(value: boolean): void {
      enabled = Boolean(value);
      notify();
    },
    getPending(): PendingApproval | null {
      return pending;
    },
    requestApproval(
      req: Omit<PendingApproval, "id" | "requestedAtIso">,
      signal?: AbortSignal
    ): Promise<ApprovalDecision> {
      if (!enabled) {
        return Promise.resolve({
          approved: true,
          reason: "Approval gate disabled by curator.",
        });
      }

      if (pending && activeResolver) {
        // Pre-empt existing pending request if a new one arrives
        resolvePending({
          approved: false,
          reason: "Superseded by a new approval request.",
        });
      }

      const id = `appr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      pending = {
        ...req,
        id,
        requestedAtIso: new Date().toISOString(),
      };

      return new Promise<ApprovalDecision>((resolve) => {
        activeResolver = resolve;

        if (signal) {
          const onAbort = () => {
            signal.removeEventListener("abort", onAbort);
            if (pending?.id === id) {
              resolvePending({
                approved: false,
                reason: "Approval request aborted.",
              });
            }
          };
          signal.addEventListener("abort", onAbort, { once: true });
        }

        // Notify subscribers AFTER activeResolver is set so synchronous approvals/rejections resolve correctly
        notify();
      });
    },
    approve(id?: string): boolean {
      if (!pending || (id && pending.id !== id)) {
        return false;
      }
      resolvePending({
        approved: true,
        reason: "Approved by curator.",
      });
      return true;
    },
    reject(id?: string, customNote?: string): boolean {
      if (!pending || (id && pending.id !== id)) {
        return false;
      }
      const reason =
        customNote ??
        `The curator declined ${pending.plainSummary}; ask what adjustment to make instead or keep the current hang.`;
      resolvePending({
        approved: false,
        reason,
      });
      return true;
    },
    subscribe(listener: (pending: PendingApproval | null, enabled: boolean) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function createTraceCollector(
  sessionId: string,
  store: DomainStore,
  attachWindow = true
): TraceCollector {
  const sessionStartedAtIso = new Date().toISOString();
  const entries: TraceEntry[] = [];
  const listeners = new Set<(e: TraceEntry[]) => void>();

  function notify(): void {
    const list = [...entries];
    for (const l of listeners) {
      try {
        l(list);
      } catch (err) {
        console.error("TraceCollector listener error:", err);
      }
    }
  }

  function syncWindow(collector: TraceCollector): void {
    if (attachWindow && typeof window !== "undefined") {
      const target = window as unknown as {
        __runTrace?: TraceEntry[];
        __exportRunTrace?: () => RunTraceDocument;
      };
      target.__runTrace = [...entries];
      target.__exportRunTrace = () => collector.toDocument();
    }
  }

  const collector: TraceCollector = {
    record(entry: Omit<TraceEntry, "seq">): TraceEntry {
      const fullEntry: TraceEntry = {
        seq: entries.length + 1,
        ...entry,
      };
      entries.push(fullEntry);
      syncWindow(collector);
      notify();
      return fullEntry;
    },
    getEntries(): TraceEntry[] {
      return [...entries];
    },
    clear(): void {
      entries.length = 0;
      syncWindow(collector);
      notify();
    },
    toDocument(overrides?: Partial<Pick<RunTraceSummary, "verify_repair_rounds">>): RunTraceDocument {
      const modelCalls = entries.filter((e) => e.kind === "model").length;
      const actions = entries.filter((e) => e.kind === "action").length;
      const maxRound = entries.reduce((max, e) => Math.max(max, e.round), 0);
      const roles = Array.from(
        new Set(
          entries
            .filter((e) => e.kind === "model")
            .map((e) => e.name)
            .filter(Boolean)
        )
      );
      const approvals = entries.filter((e) => e.kind === "approval");
      const approvedCount = approvals.filter((e) => e.ok).length;
      const rejectedCount = approvals.filter((e) => !e.ok).length;

      const lastTruthEntry = [...entries].reverse().find((e) => e.truth !== undefined);
      const finalTruth = lastTruthEntry?.truth ?? null;

      const summary: RunTraceSummary = {
        model_calls: modelCalls,
        actions,
        rounds: maxRound,
        model_roles: roles,
        verify_repair_rounds:
          overrides?.verify_repair_rounds ??
          entries.filter(
            (e) =>
              e.name === "repair_layout_violation" ||
              e.name === "verify_spatial_compliance" ||
              e.name === "validate_ada_compliance"
          ).length,
        human_checkpoints: approvals.length,
        approvals: {
          approved: approvedCount,
          rejected: rejectedCount,
        },
        final_truth: finalTruth,
      };

      return {
        version: "1.0.0",
        run_id: sessionId,
        started_at: sessionStartedAtIso,
        entries: [...entries],
        summary,
      };
    },
    subscribe(listener: (entries: TraceEntry[]) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  syncWindow(collector);
  return collector;
}

export function createBaseActionRegistry(
  store: DomainStore,
  gate: ApprovalGate,
  trace: TraceCollector
): ActionRegistry {
  const descriptors = new Map<string, ActionDescriptor>();
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const l of listeners) {
      try {
        l();
      } catch (err) {
        console.error("ActionRegistry listener error:", err);
      }
    }
  }

  const registry: ActionRegistry = {
    register(descriptor: ActionDescriptor): void {
      descriptors.set(descriptor.name, descriptor);
      if (descriptor.camelAlias) {
        descriptors.set(descriptor.camelAlias, descriptor);
      }
      notify();
    },
    unregister(name: string): void {
      const desc = descriptors.get(name);
      if (desc) {
        descriptors.delete(desc.name);
        if (desc.camelAlias) {
          descriptors.delete(desc.camelAlias);
        }
        notify();
      }
    },
    list(options?: { includeUnavailable?: boolean }): ActionDescriptor[] {
      const model = store.getState();
      const unique = Array.from(new Set(descriptors.values()));
      if (options?.includeUnavailable) {
        return unique;
      }
      return unique.filter((d) => (d.isAvailable ? d.isAvailable(model) : true));
    },
    get(nameOrAlias: string): ActionDescriptor | undefined {
      return descriptors.get(nameOrAlias);
    },
    async call(
      nameOrAlias: string,
      input: Record<string, unknown>,
      ctx: ActionCallContext
    ): Promise<ActionCallResult> {
      const descriptor = descriptors.get(nameOrAlias);
      if (!descriptor) {
        return {
          ok: false,
          summary: `Action '${nameOrAlias}' not found in registry.`,
          data: {},
          revision: store.getState().revision,
          validNextActions: ["get_capabilities"],
          errorCode: "ACTION_NOT_FOUND",
        };
      }

      const model = store.getState();
      if (descriptor.isAvailable && !descriptor.isAvailable(model)) {
        return {
          ok: false,
          summary: `Action '${descriptor.name}' is currently unavailable in this exhibition state.`,
          data: {},
          revision: model.revision,
          validNextActions: ["get_capabilities"],
          errorCode: "ACTION_UNAVAILABLE",
        };
      }

      // Input validation against required schema properties
      const required = descriptor.inputSchema?.required ?? [];
      for (const field of required) {
        if (input[field] === undefined || input[field] === null) {
          return {
            ok: false,
            summary: `Missing required parameter '${field}' for action '${descriptor.name}'.`,
            data: {},
            revision: model.revision,
            validNextActions: [descriptor.name],
            errorCode: "INVALID_ARGUMENT",
          };
        }
      }

      // Approval Gating for destructive actions
      if (descriptor.annotations.destructive && gate.isEnabled() && !ctx.bypassGate) {
        const plainSummary = descriptor.gateSummary
          ? descriptor.gateSummary(input, model)
          : `destructive action '${descriptor.name}'`;

        const decision = await gate.requestApproval({
          actionName: descriptor.name,
          plainSummary,
          args: input,
          source: ctx.source,
        });

        trace.record({
          round: ctx.round ?? 1,
          kind: "approval",
          name: descriptor.name,
          source: ctx.source === "agent" ? "agent" : "human",
          input_ref: null,
          args: input,
          output_ref: null,
          ok: decision.approved,
          decision: decision.reason,
          latency_ms: 0,
        });

        if (!decision.approved) {
          return {
            ok: false,
            summary: decision.reason,
            data: { rejected: true },
            revision: store.getState().revision,
            validNextActions: ["validate_ada_compliance", "propose_wall_layout"],
            errorCode: "GATE_REJECTED",
          };
        }
      }

      const t0 = performance.now();
      const revBefore = store.getState().revision;

      try {
        const result = await descriptor.execute(input, ctx);
        const t1 = performance.now();
        const revAfter = store.getState().revision;

        const truthPayload =
          result.data && typeof result.data.errorCount === "number"
            ? {
                errors: result.data.errorCount as number,
                warnings: typeof result.data.warningCount === "number" ? (result.data.warningCount as number) : 0,
              }
            : undefined;

        trace.record({
          round: ctx.round ?? 1,
          kind: "action",
          name: descriptor.name,
          source: ctx.source === "agent" ? "agent" : "human",
          input_ref: null,
          args: input,
          output_ref: null,
          ok: result.ok,
          latency_ms: Math.round(t1 - t0),
          state_change: {
            revision_before: revBefore,
            revision_after: revAfter,
            entity_ids: [],
          },
          ...(truthPayload ? { truth: truthPayload } : {}),
        });

        return result;
      } catch (err) {
        const t1 = performance.now();
        const errorMessage = err instanceof Error ? err.message : String(err);
        const revAfter = store.getState().revision;

        trace.record({
          round: ctx.round ?? 1,
          kind: "action",
          name: descriptor.name,
          source: ctx.source === "agent" ? "agent" : "human",
          input_ref: null,
          args: input,
          output_ref: null,
          ok: false,
          latency_ms: Math.round(t1 - t0),
          state_change: {
            revision_before: revBefore,
            revision_after: revAfter,
            entity_ids: [],
          },
        });

        return {
          ok: false,
          summary: `Action execution error: ${errorMessage}`,
          data: {},
          revision: revAfter,
          validNextActions: ["get_capabilities"],
          errorCode: "EXECUTION_ERROR",
        };
      }
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  // Register built-in read action: get_capabilities
  registry.register({
    name: "get_capabilities",
    camelAlias: "getCapabilities",
    title: "Get Curatorial Capabilities",
    group: "Read",
    description:
      "Returns all currently registered action descriptors and procedures available to the human curator or curatorial assistant.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    resultShape:
      "{ actions: ActionManifestEntry[], procedures: Array<{ name: string, steps: string[] }> }",
    annotations: {
      readOnly: true,
      destructive: false,
      untrustedContent: false,
    },
    execute(): ActionCallResult {
      const activeActions = registry.list({ includeUnavailable: true });
      const manifestActions: ActionManifestEntry[] = activeActions.map((a) => ({
        name: a.name,
        title: a.title,
        group:
          a.group === "Read"
            ? "read"
            : a.group === "Verify"
              ? "verify"
              : a.group === "Navigate/View"
                ? "navigate"
                : a.group === "Collaborate"
                  ? "collaborate"
                  : a.group === "Cross-boundary"
                    ? "cross_boundary"
                    : "change",
        description: a.description,
        input_schema: a.inputSchema,
        annotations: {
          readOnly: a.annotations.readOnly,
          destructive: a.annotations.destructive,
          untrustedContent: a.annotations.untrustedContent,
        },
        dynamic: Boolean(a.annotations.dynamic),
      }));

      return {
        ok: true,
        summary: `Retrieved ${manifestActions.length} registered capabilities.`,
        data: {
          actions: manifestActions,
          procedures: [
            {
              name: "audit_and_repair_wall",
              steps: [
                "validate_ada_compliance",
                "check_conservation_lux",
                "reflow_wall_spacing",
                "save_curatorial_snapshot",
              ],
            },
          ],
        },
        revision: store.getState().revision,
        validNextActions: manifestActions.map((a) => a.name),
      };
    },
  });

  return registry;
}

export function createSession(options?: SessionOptions): SightlineSession {
  const sessionId =
    options?.sessionId ?? `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const preset = options?.seed ?? "default";
  const seedExhibition = createSeedExhibition(preset);

  const store = createDomainStore(seedExhibition);
  const truthEngine = createTruthEngine();
  const gate = createApprovalGate(options?.gateEnabled ?? true);
  const trace = createTraceCollector(sessionId, store, options?.attachWindow ?? true);
  const registry = createBaseActionRegistry(store, gate, trace);

  return {
    sessionId,
    store,
    truthEngine: {
      checkExhibition: (m) => truthEngine.checkExhibition(m),
      computeSightlineFrustums: (m) => truthEngine.computeSightlineFrustums(m),
    },
    gate,
    trace,
    registry,
  };
}
