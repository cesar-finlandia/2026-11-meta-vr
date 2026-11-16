/**
 * Real-time dual-scale gallery: a 1:1 limestone room plus a synchronized 1:8 seated tabletop maquette,
 * rendered on demand with pooled PBR materials, sprite plaques and named camera shots.
 */
import { Canvas, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type {
  ExhibitionModel,
  SightlineCone,
  SightlineSession,
  TruthIssue,
} from "../domain/types";
import { renderArtworkPlateDataUrl } from "../domain/collection-loader";
import type { SpatialStageMountProps } from "../ui/stage-registry";
import { toSceneDescription } from "./adapter";
import {
  applyPaletteToMaterials,
  createPooledSceneMaterials,
  DEFAULT_LAB_PARAMS,
  readScenePaletteFromCss,
  type LabLightingParams,
  type ScenePaletteHexes,
} from "./materials";
import { createPlacardSprite, disposePlacardSprite } from "./sprite-label";
import type { SceneDescription, SceneEntityNode, SceneMaterialName } from "./scene-types";
import { WebGlFallbackSvg } from "./WebGlFallbackSvg";
import { initIwerQuest3Runtime, type IwerRuntimeHandle } from "../xr/iwer-setup";
import { createIwsdkGalleryBridge, type IwsdkBridgeHandle } from "../xr/iwsdk-bridge";
import { createSpatialAudioCues, type SpatialAudioCues } from "../xr/spatial-audio";

export interface Demo3dController {
  play: (shot: string) => void;
  shots: string[];
  fpsProbe: (durationMs?: number) => Promise<number>;
}

declare global {
  interface Window {
    __demo3d?: Demo3dController;
    __SIGHTLINE_IWER__?: IwerRuntimeHandle;
    __SIGHTLINE_STATE__?: {
      revision: number;
      entityCount: number;
      mountCount: number;
      mountIds: string[];
      openErrorCount: number;
      viewMode: string;
      passthroughActive: boolean;
      scaleTwinActive: boolean;
      selectedMountId: string | null;
      iwsdkReady: boolean;
      shaderLinks: number;
    };
    __SIGHTLINE_SHADER_LINKS__?: number;
  }
}

export function detectWebGlSupport(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

const SHOT_ALIASES: Record<string, string> = {
  "standing-overview": "standing-152",
  "wheelchair-north": "wheelchair-115",
  "maquette-orbit": "tabletop-maquette",
};

const SHOT_BUTTONS: Array<{ shot: string; label: string }> = [
  { shot: "overview", label: "Overview" },
  { shot: "tabletop-maquette", label: "1:8 Tabletop" },
  { shot: "wheelchair-115", label: "Wheelchair 115 cm" },
  { shot: "standing-152", label: "Standing 152 cm" },
  { shot: "passthrough-wall", label: "1:1 Passthrough" },
];

interface CameraShot {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

function resolveShot(name: string, desc: SceneDescription): CameraShot | null {
  const key = SHOT_ALIASES[name] ?? name;
  switch (key) {
    case "overview":
      return { position: v3(0, 2.05, 4.1), target: v3(0, 1.2, -1) };
    case "tabletop-maquette":
      return { position: v3(0, 1.5, 0.85), target: v3(0, 1.0, -0.8) };
    case "wheelchair-115":
      return { position: v3(1.0, 1.15, 1.3), target: v3(-0.3, 1.35, -2.1) };
    case "standing-152":
      return { position: v3(1.0, 1.52, 1.5), target: v3(-0.3, 1.4, -2.1) };
    case "passthrough-wall":
      return { position: v3(0, 1.45, 1.7), target: v3(0, 1.4, -2.1) };
    default:
      break;
  }
  if (key.startsWith("focus:")) {
    const id = key.slice("focus:".length);
    const e = desc.entities.find((n) => n.id === id && n.kind === "framed_artwork");
    if (!e) return null;
    const rotY = e.rotationEuler[1];
    const dist = Math.max(1.7, Math.max(e.size[0], e.size[1]) * 2.1);
    return {
      position: v3(
        e.position[0] + Math.sin(rotY) * dist,
        Math.min(1.6, e.position[1]),
        e.position[2] + Math.cos(rotY) * dist
      ),
      target: v3(e.position[0], e.position[1], e.position[2]),
    };
  }
  return null;
}

function shotForViewMode(viewMode: ExhibitionModel["viewMode"]): string {
  switch (viewMode) {
    case "wheelchair_115":
      return "wheelchair-115";
    case "standing_152":
      return "standing-152";
    case "passthrough_room":
      return "passthrough-wall";
    default:
      return "tabletop-maquette";
  }
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/* ----------------------------------------------------------------- scene parts */

interface SceneCtx {
  mats: Record<SceneMaterialName, THREE.MeshStandardMaterial>;
  palette: ScenePaletteHexes;
  plateMaterial: (item: ExhibitionModel["catalog"][number]) => THREE.MeshStandardMaterial;
  onSelect: (mountId: string) => void;
  rayGeometry: THREE.BufferGeometry;
  boxGeometry: THREE.BoxGeometry;
  postureFilter: "wheelchair_115" | "standing_152" | null;
}

function Placard({ entity, ctx }: { entity: SceneEntityNode; ctx: SceneCtx }): JSX.Element {
  const border =
    entity.status === "fail"
      ? ctx.palette.materials["cone-fail"]
      : entity.status === "warning"
        ? ctx.palette.materials["cone-warn"]
        : ctx.palette.materials["cone-pass"];
  const sprite = useMemo(
    () =>
      createPlacardSprite({
        title: entity.label,
        subtitle: entity.subLabel ?? "",
        bgHex: ctx.palette.materials.plaque,
        textHex: ctx.palette.text,
        borderHex: border,
        widthMeters: Math.max(0.22, entity.size[0] * 1.5),
        heightMeters: Math.max(0.11, entity.size[1] * 1.5),
      }),
    [entity.label, entity.subLabel, entity.size, ctx.palette.materials.plaque, ctx.palette.text, border]
  );
  useEffect(() => () => disposePlacardSprite(sprite), [sprite]);
  return <primitive object={sprite} position={entity.position} />;
}

function Frame({ entity, ctx, catalog }: { entity: SceneEntityNode; ctx: SceneCtx; catalog: Map<string, ExhibitionModel["catalog"][number]> }): JSX.Element {
  const item = catalog.get(String(entity.metadata.artworkId));
  const artW = Number(entity.metadata.art_w_m);
  const artH = Number(entity.metadata.art_h_m);
  const depth = entity.size[2];
  return (
    <group position={entity.position} rotation={entity.rotationEuler}>
      <mesh
        geometry={ctx.boxGeometry}
        material={ctx.mats[entity.materialName]}
        scale={entity.size}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          ctx.onSelect(entity.id);
        }}
      />
      {item ? (
        <mesh
          position={[0, 0, depth / 2 + 0.002]}
          material={ctx.plateMaterial(item)}
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            ctx.onSelect(entity.id);
          }}
        >
          <planeGeometry args={[artW, artH]} />
        </mesh>
      ) : null}
      {entity.selected ? (
        <mesh
          geometry={ctx.boxGeometry}
          material={ctx.mats.accent}
          receiveShadow
          scale={[entity.size[0] + 0.06, entity.size[1] + 0.06, 0.01]}
          position={[0, 0, -depth / 2 - 0.004]}
        />
      ) : null}
    </group>
  );
}

function Ray({ entity, ctx }: { entity: SceneEntityNode; ctx: SceneCtx }): JSX.Element | null {
  const m = entity.metadata;
  if (ctx.postureFilter && m.posture !== ctx.postureFilter) return null;
  const origin = new THREE.Vector3(Number(m.ox), Number(m.oy), Number(m.oz));
  const target = new THREE.Vector3(Number(m.tx), Number(m.ty), Number(m.tz));
  const dir = target.clone().sub(origin);
  const length = dir.length();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const mid = origin.clone().add(target).multiplyScalar(0.5);
  return (
    <mesh
      geometry={ctx.rayGeometry}
      material={ctx.mats[entity.materialName]}
      receiveShadow
      position={mid}
      quaternion={quat}
      scale={[Math.max(0.05, length * 0.055), length, Math.max(0.05, length * 0.055)]}
    />
  );
}

function RoomContents({ desc, ctx, catalog, includeRays }: { desc: SceneDescription; ctx: SceneCtx; catalog: Map<string, ExhibitionModel["catalog"][number]>; includeRays: boolean }): JSX.Element {
  return (
    <>
      {desc.entities.map((e) => {
        switch (e.kind) {
          case "gallery_wall":
            return (
              <mesh
                key={e.id}
                geometry={ctx.boxGeometry}
                material={ctx.mats.wall}
                position={e.position}
                rotation={e.rotationEuler}
                scale={e.size}
                castShadow
                receiveShadow
              />
            );
          case "framed_artwork":
            return <Frame key={e.id} entity={e} ctx={ctx} catalog={catalog} />;
          case "placard_label":
            return <Placard key={e.id} entity={e} ctx={ctx} />;
          case "sightline_ray":
            return includeRays ? <Ray key={e.id} entity={e} ctx={ctx} /> : null;
          default:
            return null;
        }
      })}
    </>
  );
}

/* ----------------------------------------------------------------- inner scene */

interface InnerProps {
  desc: SceneDescription;
  model: ExhibitionModel;
  palette: ScenePaletteHexes;
  params: LabLightingParams;
  onSelect: (mountId: string) => void;
  onReady: () => void;
  openErrorCount: number;
}

function GalleryScene({ desc, model, palette, params, onSelect, onReady, openErrorCount }: InnerProps): JSX.Element {
  const { gl, scene, camera, invalidate } = useThree();
  const mats = useMemo(() => createPooledSceneMaterials(palette, params), []); // eslint-disable-line react-hooks/exhaustive-deps
  const boxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const rayGeometry = useMemo(() => {
    // Sightline cone: apex at local -Y (the eye), open base at +Y (the artwork).
    const g = new THREE.ConeGeometry(1, 1, 28, 1, true);
    g.rotateX(Math.PI);
    return g;
  }, []);
  const plateCache = useRef(new Map<string, THREE.MeshStandardMaterial>());
  const keyLight = useRef<THREE.DirectionalLight>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const tweenRef = useRef<number | null>(null);
  const descRef = useRef(desc);
  descRef.current = desc;
  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const catalog = useMemo(() => new Map(model.catalog.map((c) => [c.id, c])), [model.catalog]);

  // Shader-link instrumentation (budget: <= 15 programs).
  useEffect(() => {
    window.__SIGHTLINE_SHADER_LINKS__ = window.__SIGHTLINE_SHADER_LINKS__ ?? 0;
    const ctx = gl.getContext() as WebGLRenderingContext & { __patched?: boolean };
    if (!ctx.__patched) {
      const orig = ctx.linkProgram.bind(ctx);
      ctx.linkProgram = (p: WebGLProgram) => {
        window.__SIGHTLINE_SHADER_LINKS__ = (window.__SIGHTLINE_SHADER_LINKS__ ?? 0) + 1;
        orig(p);
      };
      ctx.__patched = true;
    }
  }, [gl]);

  // Renderer quality: ACES filmic tone mapping, sRGB output, soft shadows, room IBL.
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const envTex = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envTex;
    invalidateRef.current();
    onReadyRef.current();
    return () => {
      envTex.dispose();
      pmrem.dispose();
      room.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);

  // Palette / lab parameter changes mutate pooled materials in place.
  useEffect(() => {
    applyPaletteToMaterials(mats, palette, params);
    plateCache.current.forEach((m) => {
      m.roughness = 0.6;
    });
    scene.environmentIntensity = params.envIntensity;
    const alpha = desc.passthroughActive ? 0.08 : 1;
    gl.setClearColor(new THREE.Color(palette.bg), alpha);
    invalidate();
  }, [mats, palette, params, scene, gl, invalidate, desc.passthroughActive]);

  // Key light placement from lab parameters.
  useEffect(() => {
    const l = keyLight.current;
    if (!l) return;
    const az = (params.keyAzimuthDeg * Math.PI) / 180;
    const el = (params.keyElevationDeg * Math.PI) / 180;
    const r = 7;
    l.position.set(Math.sin(az) * Math.cos(el) * r, Math.sin(el) * r, Math.cos(az) * Math.cos(el) * r);
    l.intensity = params.keyIntensity;
    invalidate();
  }, [params, invalidate]);

  const plateMaterial = useCallback(
    (item: ExhibitionModel["catalog"][number]): THREE.MeshStandardMaterial => {
      const cached = plateCache.current.get(item.id);
      if (cached) return cached;
      const m = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, color: "#ffffff" });
      plateCache.current.set(item.id, m);
      new THREE.TextureLoader().load(renderArtworkPlateDataUrl(item), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        m.map = tex;
        m.needsUpdate = true;
        invalidate();
      });
      return m;
    },
    [invalidate]
  );

  useEffect(() => {
    const cache = plateCache.current;
    return () => {
      cache.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
      cache.clear();
      Object.values(mats).forEach((m) => m.dispose());
      boxGeometry.dispose();
      rayGeometry.dispose();
    };
  }, [mats, boxGeometry, rayGeometry]);

  // Camera controls + named shots.
  const jumpTo = useCallback(
    (shot: CameraShot) => {
      camera.position.copy(shot.position);
      controlsRef.current?.target.copy(shot.target);
      camera.lookAt(shot.target);
      controlsRef.current?.update();
      invalidate();
    },
    [camera, invalidate]
  );

  const play = useCallback(
    (name: string) => {
      const shot = resolveShot(name, descRef.current);
      if (!shot) throw new Error(`Unknown 3D shot: ${name}`);
      if (tweenRef.current !== null) cancelAnimationFrame(tweenRef.current);
      const duration = prefersReducedMotion() ? 1 : 780;
      const fromPos = camera.position.clone();
      const fromTarget = controlsRef.current?.target.clone() ?? new THREE.Vector3(0, 1.2, -1);
      const t0 = performance.now();
      const step = (now: number): void => {
        const t = Math.min(1, (now - t0) / duration);
        const k = easeInOut(t);
        camera.position.lerpVectors(fromPos, shot.position, k);
        const tgt = fromTarget.clone().lerp(shot.target, k);
        controlsRef.current?.target.copy(tgt);
        camera.lookAt(tgt);
        controlsRef.current?.update();
        invalidate();
        tweenRef.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      tweenRef.current = requestAnimationFrame(step);
    },
    [camera, invalidate]
  );

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.minDistance = 0.4;
    controls.maxDistance = 9;
    const onChange = (): void => invalidate();
    controls.addEventListener("change", onChange);
    controlsRef.current = controls;
    const first = resolveShot(shotForViewMode(model.viewMode), descRef.current) ?? resolveShot("overview", descRef.current);
    if (first) jumpTo(first);
    return () => {
      controls.removeEventListener("change", onChange);
      controls.dispose();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  // Follow view-mode changes made from the 2D shell.
  const lastViewMode = useRef(model.viewMode);
  useEffect(() => {
    if (lastViewMode.current !== model.viewMode) {
      lastViewMode.current = model.viewMode;
      play(shotForViewMode(model.viewMode));
    }
  }, [model.viewMode, play]);

  // Recorder / E2E hooks.
  useEffect(() => {
    const probe = (durationMs = 3000): Promise<number> =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now: number): void => {
          frames += 1;
          invalidate();
          if (now - start >= durationMs) resolve(Math.round((frames / ((now - start) / 1000)) * 10) / 10);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    window.__demo3d = {
      play,
      get shots() {
        const names = ["overview", "tabletop-maquette", "wheelchair-115", "standing-152", "passthrough-wall"];
        return [...names, ...descRef.current.namedShots.filter((s) => s.startsWith("focus:"))];
      },
      fpsProbe: probe,
    } as Demo3dController;
    return () => {
      delete window.__demo3d;
    };
  }, [play, invalidate]);

  // Bounded 320 ms redraw window after each revision so pulses and entrances settle.
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number): void => {
      invalidate();
      if (now - t0 < 320) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [desc.revision, desc.entities, invalidate]);

  useEffect(
    () => () => {
      if (tweenRef.current !== null) cancelAnimationFrame(tweenRef.current);
    },
    []
  );

  // Deterministic state hook for E2E.
  useEffect(() => {
    window.__SIGHTLINE_STATE__ = {
      revision: desc.revision,
      entityCount: desc.entities.length,
      mountCount: model.mounts.length,
      mountIds: model.mounts.map((m) => m.id),
      openErrorCount,
      viewMode: model.viewMode,
      passthroughActive: model.passthroughActive,
      scaleTwinActive: model.scaleTwinActive,
      selectedMountId: model.selectedMountId,
      iwsdkReady: true,
      shaderLinks: window.__SIGHTLINE_SHADER_LINKS__ ?? 0,
    };
  });

  const ctx: SceneCtx = {
    mats,
    palette,
    plateMaterial,
    onSelect,
    rayGeometry,
    boxGeometry,
    postureFilter:
      model.viewMode === "wheelchair_115" ? "wheelchair_115" : model.viewMode === "standing_152" ? "standing_152" : null,
  };

  const base = desc.entities.find((e) => e.kind === "maquette_base");
  const hud = desc.entities.find((e) => e.kind === "fov_hud");
  const roomBox = useMemo(() => new THREE.BoxGeometry(4.2, 2.8, 4.2), []);
  useEffect(() => () => roomBox.dispose(), [roomBox]);
  const groundMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 }), []);
  useEffect(() => {
    groundMat.color.set(palette.ground);
    invalidate();
  }, [groundMat, palette.ground, invalidate]);
  useEffect(() => () => groundMat.dispose(), [groundMat]);

  return (
    <>
      <directionalLight
        ref={keyLight}
        castShadow
        intensity={DEFAULT_LAB_PARAMS.keyIntensity}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        shadow-radius={5}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} material={groundMat} receiveShadow>
        <planeGeometry args={[14, 14]} />
      </mesh>

      <RoomContents desc={desc} ctx={ctx} catalog={catalog} includeRays />

      {desc.passthroughActive ? (
        <lineSegments position={[0, 1.4, 0]}>
          <edgesGeometry args={[roomBox]} />
          <lineBasicMaterial color={palette.accent} />
        </lineSegments>
      ) : null}

      {desc.scaleTwinActive && base ? (
        <>
          <mesh
            geometry={boxGeometry}
            material={mats["maquette-base"]}
            position={base.position}
            scale={base.size}
            castShadow
            receiveShadow
          />
          <group scale={desc.maquetteScale} position={[0, base.position[1] + base.size[1] / 2, base.position[2]]}>
            <RoomContents desc={desc} ctx={ctx} catalog={catalog} includeRays={false} />
          </group>
        </>
      ) : null}

      {hud && desc.passthroughActive ? <Placard entity={{ ...hud, size: [0.32, 0.12, 0.005] }} ctx={ctx} /> : null}
    </>
  );
}

/* ----------------------------------------------------------------- public canvas */

export interface GalleryCanvasProps extends SpatialStageMountProps {
  labParams?: LabLightingParams;
  showShotButtons?: boolean;
  height?: number | string;
}

function useModel(session: SightlineSession): ExhibitionModel {
  const [model, setModel] = useState<ExhibitionModel>(() => session.store.getState());
  useEffect(() => {
    setModel(session.store.getState());
    return session.store.subscribe((m) => setModel(m));
  }, [session]);
  return model;
}

export function GalleryCanvas(props: GalleryCanvasProps): JSX.Element {
  const { session, issues, cones, theme, forceFallback2d, labParams, showShotButtons = true, height } = props;
  const model = useModel(session);
  const [ready, setReady] = useState(false);
  const [palette, setPalette] = useState<ScenePaletteHexes>(() => readScenePaletteFromCss());
  const bridge = useRef<IwsdkBridgeHandle | null>(null);
  const audio = useRef<SpatialAudioCues | null>(null);
  const lastErrors = useRef<number>(0);

  const fallback2d = useMemo(() => {
    if (forceFallback2d) return true;
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("fallback2d") === "1") return true;
    return !detectWebGlSupport();
  }, [forceFallback2d]);

  const desc = useMemo(() => toSceneDescription(model, issues, cones), [model, issues, cones]);
  const openErrorCount = useMemo(() => issues.filter((i) => i.severity === "error").length, [issues]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPalette(readScenePaletteFromCss()));
    return () => cancelAnimationFrame(id);
  }, [theme]);

  useEffect(() => {
    bridge.current = createIwsdkGalleryBridge();
    audio.current = createSpatialAudioCues();
    return () => bridge.current?.dispose();
  }, []);

  // Restore spatial anchors saved by an earlier visit (local-floor persistence).
  useEffect(() => {
    const persisted = bridge.current?.loadPersistedAnchors() ?? [];
    for (const anchor of persisted) {
      if (!session.store.getState().anchors.some((a) => a.id === anchor.id)) {
        session.store.dispatch({ type: "PIN_ANCHOR", anchor });
      }
    }
  }, [session]);

  // Quest 3 runtime emulation with hand-gesture helpers (exposed for the XR acceptance run).
  useEffect(() => {
    let cancelled = false;
    void initIwerQuest3Runtime(session).then((handle) => {
      if (!cancelled) window.__SIGHTLINE_IWER__ = handle;
    });
    return () => {
      cancelled = true;
      delete window.__SIGHTLINE_IWER__;
    };
  }, [session]);

  useEffect(() => {
    bridge.current?.syncSceneEntities(desc);
  }, [desc]);

  // Spatial audio feedback when the error count moves.
  useEffect(() => {
    if (openErrorCount < lastErrors.current) audio.current?.playCompliancePassChord();
    else if (openErrorCount > lastErrors.current) audio.current?.playViolationPulse();
    lastErrors.current = openErrorCount;
  }, [openErrorCount]);

  useEffect(() => {
    const anchors = model.anchors;
    if (anchors.length > 0) bridge.current?.persistAnchorSnapshot(anchors);
  }, [model.anchors]);

  const onSelect = useCallback(
    (mountId: string) => {
      const mount = session.store.getState().mounts.find((m) => m.id === mountId);
      audio.current?.playWoodFrameClick();
      session.store.dispatch({ type: "SELECT_ENTITY", mountId, wallId: mount?.wallId });
    },
    [session]
  );

  const [activeShot, setActiveShot] = useState<string>("overview");
  const play = (shot: string): void => window.__demo3d?.play(shot);

  if (fallback2d) {
    return <WebGlFallbackSvg desc={desc} onSelectMount={onSelect} />;
  }

  return (
    <div data-demo-3d="sightline-gallery" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", minWidth: 0 }}>
      <div
        style={{ position: "relative", width: "100%", aspectRatio: height ? undefined : "16 / 9", height, minHeight: 280, borderRadius: 8, overflow: "hidden", background: "var(--scene-bg)" }}
      >
        <Canvas
          frameloop="demand"
          shadows
          dpr={props.quality === "low" ? 1 : [1, 2]}
          camera={{ fov: 45, near: 0.05, far: 60, position: [0, 2, 4] }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
          style={{ position: "absolute", inset: 0 }}
        >
          <GalleryScene
            desc={desc}
            model={model}
            palette={palette}
            params={labParams ?? DEFAULT_LAB_PARAMS}
            onSelect={onSelect}
            onReady={() => setReady(true)}
            openErrorCount={openErrorCount}
          />
        </Canvas>
      </div>
      {!ready ? (
        <p role="status" style={{ margin: 0, fontSize: 13 }} data-testid="gallery-3d-loading">
          Preparing the 3D gallery…
        </p>
      ) : null}
      {showShotButtons ? (
        <div role="group" aria-label="Camera shots" style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {SHOT_BUTTONS.map((b) => (
            <button
              key={b.shot}
              type="button"
              className="btn btn--sm"
              data-testid={`shot-${b.shot}`}
              aria-pressed={activeShot === b.shot}
              style={activeShot === b.shot ? { background: "var(--accent)", color: "var(--accent-contrast)", borderColor: "var(--accent)" } : undefined}
              onClick={() => {
                setActiveShot(b.shot);
                play(b.shot);
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SightlineSpatialCanvas(props: SpatialStageMountProps): JSX.Element {
  return <GalleryCanvas {...props} />;
}

export type { SightlineCone, TruthIssue };
