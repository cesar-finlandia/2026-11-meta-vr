/**
 * Core curatorial domain types, store contracts, action registry interfaces,
 * human approval gate types, and structured run-trace schemas for Sightline Studio.
 */

export type ConservationMediumTier = "paper_50_lux" | "durable_200_lux";

export type FrameFinish = "walnut" | "gilt" | "ebony";

export type HangTemplateId =
  | "chronological_spine"
  | "salon_cluster"
  | "symmetrical_pair";

export type ViewMode =
  | "tabletop_maquette"
  | "passthrough_room"
  | "wheelchair_115"
  | "standing_152";

export type PostureMode = "wheelchair_115" | "standing_152";

export type TruthRuleId =
  | "RULE_WALL_BOUNDS"
  | "RULE_FRAME_CLEARANCE"
  | "RULE_ADA_PITCH"
  | "RULE_CENTERLINE_BAND"
  | "RULE_PLACARD_PLACEMENT"
  | "RULE_XAUR_LEGIBILITY"
  | "RULE_CCI_LUX";

export interface WallPlane {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
  position_m: [number, number, number];
  rotation_deg: number;
  source: "webxr_plane" | "virtual_twin";
}

export interface ArtworkCatalogItem {
  id: string;
  aicId: number;
  title: string;
  artist: string;
  year: number;
  medium: string;
  mediumTier: ConservationMediumTier;
  luxCap: 50 | 200;
  width_cm: number;
  height_cm: number;
  frame_border_cm: number;
  frameFinish: FrameFinish;
  themes: string[];
  paletteHex: [string, string, string];
  iiifImageUrl: string;
  provenance: string;
  cc0Url: string;
}

export interface PlacardLabel {
  id: string;
  mountId: string;
  wallId: string;
  titleText: string;
  artistLine: string;
  curatorialNote: string;
  wordCount: number;
  centerX_cm: number;
  centerY_cm: number;
  width_cm: number;
  height_cm: number;
  fontHeight_mm: number;
  side: "right" | "left";
}

export interface MountedArtwork {
  id: string;
  artworkId: string;
  wallId: string;
  centerX_cm: number;
  centerY_cm: number;
  spotLux: number;
  pinnedAnchorId: string | null;
  placard: PlacardLabel;
}

export interface SightlineCone {
  id: string;
  mountId: string;
  wallId: string;
  posture: PostureMode;
  eyeHeight_cm: number;
  viewingDistance_cm: number;
  origin_m: [number, number, number];
  target_m: [number, number, number];
  upwardPitch_deg: number;
  placardAngularHeight_deg: number;
  withinFovComfortCone: boolean;
  status: "pass" | "warning" | "fail";
}

export interface SpatialAnchorRecord {
  id: string;
  wallId: string;
  label: string;
  referenceSpace: "local-floor" | "bounded-floor" | "virtual-twin";
  poseMatrix16: number[];
  pinnedMountIds: string[];
  savedAtIso: string;
}

export interface TruthIssue {
  id: string;
  ruleId: TruthRuleId;
  severity: "error" | "warning";
  entityIds: string[];
  wallId: string;
  mountId?: string;
  measuredValue: number;
  limitValue: number;
  unit: "cm" | "deg" | "lux";
  message: string;
  suggestedAction: string;
  suggestedArgs: Record<string, unknown>;
}

export interface TimelineSnapshot {
  id: string;
  label: string;
  revision: number;
  createdAtIso: string;
  mounts: MountedArtwork[];
  anchors: SpatialAnchorRecord[];
  activeTheme: string;
  curatorialBrief: string;
  issueCount: number;
}

export interface ExhibitionModel {
  exhibitionTitle: string;
  curatorialBrief: string;
  activeTheme: string;
  selectedArtworkIds: string[];
  rejectedArtworkIds: string[];
  walls: WallPlane[];
  catalog: ArtworkCatalogItem[];
  mounts: MountedArtwork[];
  anchors: SpatialAnchorRecord[];
  snapshots: TimelineSnapshot[];
  viewMode: ViewMode;
  passthroughActive: boolean;
  scaleTwinActive: boolean;
  selectedMountId: string | null;
  selectedWallId: string;
  hudPitchOffset_deg: number;
  hudYawOffset_deg: number;
  revision: number;
}

export type DomainCommand =
  | { type: "SET_WALL_PLANES"; walls: WallPlane[]; passthroughActive: boolean }
  | { type: "SET_PASSTHROUGH_MODE"; enabled: boolean }
  | { type: "SET_SCALE_TWIN_MODE"; enabled: boolean; viewMode?: ViewMode }
  | { type: "SET_VIEW_MODE"; viewMode: ViewMode }
  | { type: "LOAD_CATALOG"; items: ArtworkCatalogItem[]; merge: boolean }
  | {
      type: "SET_CURATORIAL_THEME";
      brief: string;
      theme: string;
      selectedArtworkIds: string[];
      exhibitionTitle?: string;
    }
  | { type: "REPLACE_WALL_MOUNTS"; wallId: string; mounts: MountedArtwork[] }
  | { type: "UPSERT_MOUNT"; mount: MountedArtwork }
  | {
      type: "ADJUST_MOUNT_POSITION";
      mountId: string;
      centerX_cm?: number;
      centerY_cm?: number;
    }
  | { type: "SET_MOUNT_LUX"; mountId: string; spotLux: number }
  | {
      type: "UPDATE_PLACARD";
      mountId: string;
      curatorialNote: string;
      fontHeight_mm?: number;
      centerY_cm?: number;
    }
  | {
      type: "SWAP_MOUNT_ARTWORK";
      mountId: string;
      replacementArtworkId: string;
      newSpotLux?: number;
    }
  | { type: "REMOVE_MOUNT"; mountId: string }
  | { type: "SELECT_ENTITY"; mountId: string | null; wallId?: string }
  | { type: "PIN_ANCHOR"; anchor: SpatialAnchorRecord }
  | { type: "SAVE_SNAPSHOT"; id?: string; label: string; issueCount: number }
  | { type: "RESTORE_SNAPSHOT"; snapshotId: string }
  | { type: "RESET_EXHIBITION"; model: ExhibitionModel };

export interface DispatchEffect {
  kind:
    | "walls_updated"
    | "catalog_loaded"
    | "theme_filtered"
    | "mount_changed"
    | "lux_changed"
    | "placard_updated"
    | "anchor_pinned"
    | "view_changed"
    | "snapshot_saved"
    | "snapshot_restored"
    | "selection_changed";
  entityIds: string[];
  detail: string;
}

export type DispatchResult =
  | {
      ok: true;
      state_version: number;
      effects: DispatchEffect[];
      model: ExhibitionModel;
    }
  | {
      ok: false;
      reason: string;
      state_version: number;
    };

export type StoreListener = (model: ExhibitionModel, effects: DispatchEffect[]) => void;

export interface DomainStore {
  getState(): ExhibitionModel;
  dispatch(command: DomainCommand): DispatchResult;
  undo(): DispatchResult;
  redo(): DispatchResult;
  canUndo(): boolean;
  canRedo(): boolean;
  subscribe(listener: StoreListener): () => void;
}

export type ActionGroup =
  | "Read"
  | "Create/Change"
  | "Verify"
  | "Navigate/View"
  | "Collaborate"
  | "Cross-boundary";

export interface JsonSchemaProperty {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description: string;
  enum?: Array<string | number>;
  minimum?: number;
  maximum?: number;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: false;
}

export interface StrictActionInputSchema {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties: false;
}

export interface ActionAnnotations {
  readOnly: boolean;
  destructive: boolean;
  untrustedContent: boolean;
  dynamic?: boolean;
}

export interface ActionCallContext {
  source: "ui" | "agent" | "test" | "xr-hand";
  round?: number;
  role?: string;
  bypassGate?: boolean;
}

export interface ActionCallResult<T = Record<string, unknown>> {
  ok: boolean;
  summary: string;
  data: T;
  revision: number;
  validNextActions: string[];
  errorCode?: string;
  recoveryHint?: string;
}

export interface ActionDescriptor {
  name: string;
  camelAlias?: string;
  title: string;
  group: ActionGroup;
  description: string;
  inputSchema: StrictActionInputSchema;
  resultShape: string;
  annotations: ActionAnnotations;
  isAvailable?: (model: ExhibitionModel) => boolean;
  gateSummary?: (args: Record<string, unknown>, model: ExhibitionModel) => string;
  execute: (
    args: Record<string, unknown>,
    ctx: ActionCallContext
  ) => Promise<ActionCallResult> | ActionCallResult;
}

export interface ActionManifestEntry {
  name: string;
  title: string;
  group: "read" | "change" | "verify" | "navigate" | "collaborate" | "cross_boundary";
  description: string;
  input_schema: StrictActionInputSchema;
  annotations: {
    readOnly: boolean;
    destructive: boolean;
    untrustedContent: boolean;
  };
  dynamic: boolean;
}

export interface ActionManifest {
  version: "1.0.0";
  contract_version: number;
  contract_hash: string;
  generated_at: string;
  actions: ActionManifestEntry[];
  procedures: Array<{
    name: string;
    steps: string[];
  }>;
}

export interface ActionRegistry {
  register(descriptor: ActionDescriptor): void;
  unregister(name: string): void;
  list(options?: { includeUnavailable?: boolean }): ActionDescriptor[];
  get(nameOrAlias: string): ActionDescriptor | undefined;
  call(
    nameOrAlias: string,
    input: Record<string, unknown>,
    ctx: ActionCallContext
  ): Promise<ActionCallResult>;
  subscribe(listener: () => void): () => void;
}

export interface PendingApproval {
  id: string;
  actionName: string;
  plainSummary: string;
  args: Record<string, unknown>;
  source: ActionCallContext["source"];
  requestedAtIso: string;
}

export interface ApprovalDecision {
  approved: boolean;
  reason: string;
}

export interface ApprovalGate {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  getPending(): PendingApproval | null;
  requestApproval(
    req: Omit<PendingApproval, "id" | "requestedAtIso">,
    signal?: AbortSignal
  ): Promise<ApprovalDecision>;
  approve(id?: string): boolean;
  reject(id?: string, customNote?: string): boolean;
  subscribe(listener: (pending: PendingApproval | null, enabled: boolean) => void): () => void;
}

export interface TraceEntry {
  seq: number;
  round: number;
  kind: "model" | "action" | "approval" | "system";
  name: string;
  source: "agent" | "human" | "system";
  input_ref: string | null;
  args?: Record<string, unknown>;
  output_ref: string | null;
  ok: boolean;
  tokens?: {
    prompt: number;
    output: number;
    total: number;
  };
  latency_ms: number;
  decision?: string;
  state_change?: {
    revision_before: number;
    revision_after: number;
    entity_ids: string[];
  };
  truth?: {
    errors: number;
    warnings: number;
  };
}

export interface RunTraceSummary {
  model_calls: number;
  actions: number;
  rounds: number;
  model_roles: string[];
  verify_repair_rounds: number;
  human_checkpoints: number;
  approvals: {
    approved: number;
    rejected: number;
  };
  final_truth: {
    errors: number;
    warnings: number;
  } | null;
}

export interface RunTraceDocument {
  version: "1.0.0";
  run_id: string;
  started_at: string;
  entries: TraceEntry[];
  summary: RunTraceSummary;
}

export interface TraceCollector {
  record(entry: Omit<TraceEntry, "seq">): TraceEntry;
  getEntries(): TraceEntry[];
  clear(): void;
  toDocument(overrides?: Partial<Pick<RunTraceSummary, "verify_repair_rounds">>): RunTraceDocument;
  subscribe(listener: (entries: TraceEntry[]) => void): () => void;
}

export interface SessionOptions {
  seed?: "default" | "needs-repair" | "empty";
  gateEnabled?: boolean;
  sessionId?: string;
  attachWindow?: boolean;
}

export interface SightlineSession {
  readonly sessionId: string;
  readonly store: DomainStore;
  readonly truthEngine: {
    checkExhibition: (model: ExhibitionModel) => TruthIssue[];
    computeSightlineFrustums: (model: ExhibitionModel) => SightlineCone[];
  };
  readonly gate: ApprovalGate;
  readonly trace: TraceCollector;
  readonly registry: ActionRegistry;
}
