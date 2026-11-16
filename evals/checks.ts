/**
 * Outcome checks shared by both evaluation arms. Each check reads a plain snapshot of the
 * exhibition model, the compliance audit and the model's final answer.
 */
import type { ExhibitionModel, TruthIssue } from "../src/domain/types";

export interface WorldSnapshot {
  model: ExhibitionModel;
  issues: TruthIssue[];
  initial: ExhibitionModel;
  finalText: string;
}

export interface CheckOutcome {
  passed: boolean;
  detail: string;
}

const titleOf = (m: ExhibitionModel, artworkId: string): string => m.catalog.find((c) => c.id === artworkId)?.title ?? "";
const artistOf = (m: ExhibitionModel, artworkId: string): string => m.catalog.find((c) => c.id === artworkId)?.artist ?? "";
const mountsOn = (m: ExhibitionModel, wallId: string) => m.mounts.filter((x) => x.wallId === wallId);
const sig = (m: ExhibitionModel, wallId?: string): string =>
  JSON.stringify(
    m.mounts
      .filter((x) => (wallId ? x.wallId === wallId : true))
      .map((x) => [x.id, x.artworkId, x.wallId, x.centerX_cm, x.centerY_cm, x.spotLux])
      .sort()
  );
const errors = (s: WorldSnapshot): TruthIssue[] => s.issues.filter((i) => i.severity === "error");
const pass = (detail: string): CheckOutcome => ({ passed: true, detail });
const fail = (detail: string): CheckOutcome => ({ passed: false, detail });

export const CHECKS: Record<string, (s: WorldSnapshot) => CheckOutcome> = {
  "answer-mentions-zero-issues": (s) =>
    /\b(no|zero|0)\b[^.\n]{0,60}\b(issues?|problems?|violations?|errors?)\b/i.test(s.finalText)
      ? pass("answer reports no problems")
      : fail(`answer does not report zero problems: "${s.finalText.slice(0, 120)}"`),

  "read-only-unchanged-revision": (s) =>
    sig(s.model) === sig(s.initial) ? pass("no mount changed") : fail("a mount changed during a read-only task"),

  "great-wave-lux-safe": (s) => {
    const mount = s.model.mounts.find((m) => /great wave/i.test(titleOf(s.model, m.artworkId)));
    if (!mount) return fail("Great Wave is no longer mounted");
    return mount.spotLux <= 50 ? pass(`lux ${mount.spotLux}`) : fail(`lux ${mount.spotLux} is above 50`);
  },

  "west-and-east-walls-untouched": (s) =>
    sig(s.model, "wall-west") === sig(s.initial, "wall-west") && sig(s.model, "wall-east") === sig(s.initial, "wall-east")
      ? pass("west and east unchanged")
      : fail("west or east wall changed"),

  "east-wall-untouched": (s) =>
    sig(s.model, "wall-east") === sig(s.initial, "wall-east") ? pass("east unchanged") : fail("east wall changed"),

  "ada-pitch-all-pass": (s) => {
    const bad = s.issues.filter((i) => i.ruleId === "RULE_ADA_PITCH");
    return bad.length === 0 ? pass("no pitch issues") : fail(`${bad.length} pitch issue(s) remain`);
  },

  "frame-clearance-all-pass": (s) => {
    const bad = s.issues.filter((i) => i.ruleId === "RULE_FRAME_CLEARANCE");
    return bad.length === 0 ? pass("no clearance issues") : fail(`${bad.length} clearance issue(s) remain`);
  },

  "all-truth-errors-zero": (s) => {
    const e = errors(s);
    return e.length === 0 ? pass("0 errors") : fail(`${e.length} error(s): ${e.slice(0, 2).map((i) => i.ruleId).join(", ")}`);
  },

  "north-wall-has-at-least-3-botanical": (s) => {
    const n = mountsOn(s.model, "wall-north").filter((m) => s.model.catalog.find((c) => c.id === m.artworkId)?.themes.includes("botanical")).length;
    return n >= 3 ? pass(`${n} botanical on north`) : fail(`only ${n} botanical works on north`);
  },

  "view-mode-wheelchair-115": (s) =>
    s.model.viewMode === "wheelchair_115" ? pass("wheelchair view") : fail(`view mode is ${s.model.viewMode}`),

  "selected-magnolia": (s) => {
    const sel = s.model.mounts.find((m) => m.id === s.model.selectedMountId);
    return sel && /magnolia/i.test(titleOf(s.model, sel.artworkId)) ? pass("Magnolia selected") : fail("Magnolia is not selected");
  },

  "mounts-coordinates-unchanged": (s) =>
    sig(s.model) === sig(s.initial) ? pass("coordinates unchanged") : fail("mount coordinates changed"),

  "great-wave-placard-42-to-75-words": (s) => {
    const mount = s.model.mounts.find((m) => /great wave/i.test(titleOf(s.model, m.artworkId)));
    if (!mount) return fail("Great Wave is not mounted");
    const words = mount.placard.curatorialNote.split(/\s+/).filter(Boolean).length;
    return words >= 42 && words <= 75 ? pass(`${words} words`) : fail(`${words} words`);
  },

  "snapshot-conservation-ready-exists": (s) =>
    s.model.snapshots.some((x) => /conservation ready/i.test(x.label)) ? pass("snapshot saved") : fail("no snapshot named Conservation Ready"),

  "piranesi-and-wright-mounted": (s) => {
    const mounted = s.model.mounts.map((m) => artistOf(s.model, m.artworkId));
    const p = mounted.some((a) => /piranesi/i.test(a));
    const w = mounted.some((a) => /wright/i.test(a));
    return p && w ? pass("both mounted") : fail(`Piranesi ${p ? "yes" : "no"}, Wright ${w ? "yes" : "no"}`);
  },

  "scale-twin-enabled": (s) => (s.model.scaleTwinActive ? pass("scale twin on") : fail("scale twin is off")),
};

export function runCheck(id: string, snapshot: WorldSnapshot): CheckOutcome {
  const check = CHECKS[id];
  return check ? check(snapshot) : fail(`unknown check ${id}`);
}
