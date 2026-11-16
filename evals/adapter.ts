/**
 * Agent-surface evaluation adapter. The treatment arm drives the typed curatorial actions
 * through the registry; the control arm drives the same app through generic screen actions.
 */
import { createSession } from "../src/domain/session";
import { bindCuratorialActions } from "../src/agent/actions";
import { sanitizeSchemaForVertex } from "../src/agent/descriptor-linter";
import type { ExhibitionModel, TruthIssue } from "../src/domain/types";
import { runCheck, type WorldSnapshot } from "./checks";
import { createUiControlSession } from "./ui-control";

interface ToolDecl {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
interface ToolOutcome {
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: string;
  invalid_args?: boolean;
}
interface EvalWorld {
  tools(): ToolDecl[];
  call(name: string, args: Record<string, unknown>): Promise<ToolOutcome>;
  verify(checkId: string): Promise<{ passed: boolean; detail: string }>;
  describeOutcome(): Promise<string>;
  recordFinalText?(text: string): void;
  close(): Promise<void>;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function validAgainst(schema: Record<string, unknown>, args: Record<string, unknown>): string | null {
  const required = (schema.required as string[] | undefined) ?? [];
  const missing = required.filter((k) => args[k] === undefined);
  return missing.length ? `Missing required: ${missing.join(", ")}` : null;
}

async function createTreatmentWorld(seed: string): Promise<EvalWorld> {
  const session = createSession({ seed: seed as "default" | "needs-repair" | "empty", gateEnabled: true, attachWindow: false });
  bindCuratorialActions(session);
  // The curator approves every gated change during an evaluation run.
  session.gate.subscribe((pending) => {
    if (pending) session.gate.approve(pending.id);
  });
  const initial = clone(session.store.getState());
  let finalText = "";

  const snapshot = (): WorldSnapshot => ({
    model: session.store.getState(),
    issues: session.truthEngine.checkExhibition(session.store.getState()),
    initial,
    finalText,
  });

  return {
    tools: () =>
      session.registry.list().map((d) => ({
        name: d.name,
        description: d.description,
        parameters: sanitizeSchemaForVertex(d.inputSchema),
      })),
    async call(name, args) {
      const d = session.registry.get(name);
      if (!d) return { ok: false, summary: "", error: `Unknown action ${name}`, invalid_args: true };
      const bad = validAgainst(d.inputSchema as unknown as Record<string, unknown>, args ?? {});
      if (bad) return { ok: false, summary: "", error: bad, invalid_args: true };
      const res = await session.registry.call(name, args ?? {}, { source: "agent" });
      return {
        ok: res.ok,
        summary: res.summary,
        data: { ...res.data, validNextActions: res.validNextActions },
        error: res.ok ? undefined : [res.summary, res.recoveryHint].filter(Boolean).join(" "),
      };
    },
    verify: async (id) => runCheck(id, snapshot()),
    describeOutcome: async () => {
      const s = snapshot();
      return `${s.model.mounts.length} works mounted, ${s.issues.filter((i) => i.severity === "error").length} errors, view ${s.model.viewMode}`;
    },
    recordFinalText: (t) => {
      finalText = t;
    },
    close: async () => undefined,
  };
}

async function createControlWorld(seed: string): Promise<EvalWorld> {
  const baseUrl = process.env.EVAL_BASE_URL ?? "http://127.0.0.1:8787";
  const ui = await createUiControlSession(baseUrl, seed);
  const first = (await ui.readAppState()) as { model: ExhibitionModel; issues: TruthIssue[] };
  const initial = clone(first.model);
  let finalText = "";

  const snapshot = async (): Promise<WorldSnapshot> => {
    const s = (await ui.readAppState()) as { model: ExhibitionModel; issues: TruthIssue[] };
    return { model: s.model, issues: s.issues, initial, finalText };
  };

  return {
    tools: () => ui.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })),
    async call(name, args) {
      const tool = ui.tools.find((t) => t.name === name);
      if (!tool) return { ok: false, summary: "", error: `Unknown action ${name}`, invalid_args: true };
      try {
        const out = await tool.execute(args ?? {});
        return {
          ok: out.ok === true,
          summary: String(out.summary ?? ""),
          error: out.error === undefined ? undefined : String(out.error),
          invalid_args: out.invalid_args === true,
        };
      } catch (e) {
        return { ok: false, summary: "", error: (e as Error).message.split("\n")[0] };
      }
    },
    verify: async (id) => runCheck(id, await snapshot()),
    describeOutcome: async () => {
      const s = await snapshot();
      return `${s.model.mounts.length} works mounted, ${s.issues.filter((i) => i.severity === "error").length} errors, view ${s.model.viewMode}`;
    },
    recordFinalText: (t) => {
      finalText = t;
    },
    close: () => ui.close(),
  };
}

const adapter = {
  product: "Sightline Studio",
  createWorld: (arm: "treatment" | "control", seed: string): Promise<EvalWorld> =>
    arm === "treatment" ? createTreatmentWorld(seed) : createControlWorld(seed),
};

export default adapter;
