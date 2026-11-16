import { describe, expect, it } from "vitest";
import { createSession } from "../../src/domain/session";
import { bindCuratorialActions } from "../../src/agent/actions";

function freshSession(seed: "default" | "needs-repair" | "empty") {
  const session = createSession({ seed, gateEnabled: false, attachWindow: false });
  bindCuratorialActions(session);
  return session;
}

const errorCount = (s: ReturnType<typeof freshSession>): number =>
  s.truthEngine.checkExhibition(s.store.getState()).filter((i) => i.severity === "error").length;

describe("repair_layout_violation", () => {
  it("repairAll clears every open error in one call", async () => {
    const s = freshSession("needs-repair");
    expect(errorCount(s)).toBeGreaterThan(0);
    const res = await s.registry.call("repair_layout_violation", { repairAll: true }, { source: "test" });
    expect(res.ok).toBe(true);
    expect(errorCount(s)).toBe(0);
  });

  it("an issueId alone applies that issue's recommended correction", async () => {
    const s = freshSession("needs-repair");
    const before = errorCount(s);
    const issue = s.truthEngine.checkExhibition(s.store.getState()).find((i) => i.severity === "error" && i.ruleId === "RULE_CCI_LUX");
    expect(issue).toBeDefined();
    const res = await s.registry.call("repair_layout_violation", { issueId: issue!.id }, { source: "test" });
    expect(res.ok).toBe(true);
    expect(errorCount(s)).toBeLessThan(before);
  });

  it("moves a placard into the reach band", async () => {
    const s = freshSession("default");
    const mount = s.store.getState().mounts[0];
    const res = await s.registry.call(
      "repair_layout_violation",
      { mountIdOrTitle: mount.id, targetPlacardCenterY_cm: 130 },
      { source: "test" }
    );
    expect(res.ok).toBe(true);
    expect(s.store.getState().mounts.find((m) => m.id === mount.id)!.placard.centerY_cm).toBe(130);
  });
});

describe("filter_curatorial_theme query", () => {
  it("lists artist matches first and includes them regardless of theme", async () => {
    const s = freshSession("empty");
    const res = await s.registry.call(
      "filter_curatorial_theme",
      { brief: "Architectural etchings", theme: "impressionist", query: "Piranesi Wright" },
      { source: "test" }
    );
    expect(res.ok).toBe(true);
    const artists = (res.data.matchingArtworks as Array<{ artist: string }>).map((a) => a.artist);
    expect(artists.slice(0, 3).some((a) => /Piranesi/.test(a))).toBe(true);
    expect(artists.some((a) => /Wright/.test(a))).toBe(true);
  });
});

describe("draft_curatorial_placard", () => {
  it("rejects a note outside 40 to 75 words and accepts one inside", async () => {
    const s = freshSession("default");
    const mount = s.store.getState().mounts[0];
    const short = await s.registry.call("draft_curatorial_placard", { mountIdOrTitle: mount.id, curatorialNote: "A short note." }, { source: "test" });
    expect(short.ok).toBe(false);
    expect(short.errorCode).toBe("NOTE_LENGTH_OUT_OF_RANGE");
    const ok = await s.registry.call(
      "draft_curatorial_placard",
      { mountIdOrTitle: mount.id, curatorialNote: Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ") },
      { source: "test" }
    );
    expect(ok.ok).toBe(true);
    expect((ok.data as { wordCountInRange: boolean }).wordCountInRange).toBe(true);
  });
});

describe("placard text persistence", () => {
  it("stores the drafted note and its word count on the mount", async () => {
    const s = freshSession("default");
    const mount = s.store.getState().mounts[0];
    const note = Array.from({ length: 52 }, (_, i) => `w${i}`).join(" ");
    await s.registry.call("draft_curatorial_placard", { mountIdOrTitle: mount.id, curatorialNote: note }, { source: "test" });
    const stored = s.store.getState().mounts.find((m) => m.id === mount.id)!.placard;
    expect(stored.curatorialNote).toBe(note);
    expect(stored.wordCount).toBe(52);
  });
});
