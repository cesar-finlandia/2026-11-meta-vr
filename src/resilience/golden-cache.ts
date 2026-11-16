/**
 * Content-addressed SHA-256 record/replay cache and bounded-retry resilience wrapper
 * supporting live, record, replay, and auto execution modes.
 */

export type AiExecutionMode = "live" | "record" | "replay" | "auto";

export interface GoldenCacheKeyInput {
  provider: "vertex-gemini";
  role: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  tools?: unknown[];
  responseSchema?: unknown;
  temperature: number;
}

export interface CachedModelRecord<T = unknown> {
  hash: string;
  role: string;
  model: string;
  recordedAt: string;
  usage: { promptTokens: number; outputTokens: number; totalTokens: number };
  payload: T;
}

export type ResilientCallOutcome<T> =
  | {
      ok: true;
      data: T;
      fromCache: boolean;
      degraded: false;
      hash: string;
      model: string;
      usage: { promptTokens: number; outputTokens: number; totalTokens: number };
      latencyMs: number;
    }
  | {
      ok: false;
      degraded: true;
      fromCache: false;
      hash: string;
      reason: string;
      fallbackData: T;
      latencyMs: number;
    };

function sortJsonKeys(val: unknown): unknown {
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(sortJsonKeys);
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(val as Record<string, unknown>).sort();
  for (const k of keys) {
    sorted[k] = sortJsonKeys((val as Record<string, unknown>)[k]);
  }
  return sorted;
}

function sha256Bytes(bytes: Uint8Array): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }
  const maxWord = Math.pow(2, 32);
  let i: number, j: number;
  let result = "";
  const words: number[] = [];
  const bitLength = bytes.length * 8;
  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  hash = hash.slice(0, 8);
  const extended = new Uint8Array(((bytes.length + 8) >> 6 << 6) + 64);
  extended.set(bytes);
  extended[bytes.length] = 0x80;
  const view = new DataView(extended.buffer);
  view.setUint32(extended.length - 4, bitLength, false);
  view.setUint32(extended.length - 8, Math.floor(bitLength / maxWord), false);

  for (i = 0; i < extended.length; i += 4) {
    words.push(view.getUint32(i, false));
  }

  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (i = 0; i < 8; i++) {
    result += (hash[i] >>> 0).toString(16).padStart(8, "0");
  }
  return result;
}

export function computeGoldenHash(input: GoldenCacheKeyInput): string {
  const canonical = sortJsonKeys({
    provider: input.provider,
    role: input.role,
    system: input.system,
    messages: input.messages,
    responseSchema: input.responseSchema,
    temperature: input.temperature,
  });
  const jsonString = JSON.stringify(canonical);
  return sha256Bytes(new TextEncoder().encode(jsonString));
}

export interface GoldenCacheStore {
  getMode(): AiExecutionMode;
  read<T>(hash: string): Promise<CachedModelRecord<T> | null>;
  write<T>(record: CachedModelRecord<T>): Promise<void>;
}

export function createNodeGoldenCache(options?: {
  dirPath?: string;
  mode?: AiExecutionMode;
}): GoldenCacheStore {
  const mode =
    options?.mode ??
    ((typeof process !== "undefined" ? process.env?.SIGHTLINE_AI_MODE : undefined) as AiExecutionMode) ??
    "auto";

  let resolvedDirPromise: Promise<string> | null = null;

  const NODE_PATH_MOD = "node:" + "path";
  const NODE_FS_MOD = "node:" + "fs/promises";

  async function getDir(): Promise<string> {
    if (options?.dirPath) return options.dirPath;
    if (!resolvedDirPromise) {
      resolvedDirPromise = (async () => {
        const { resolve } = await import(/* @vite-ignore */ NODE_PATH_MOD);
        return resolve(process.cwd(), "public", "golden");
      })();
    }
    return resolvedDirPromise;
  }

  return {
    getMode(): AiExecutionMode {
      return mode;
    },
    async read<T>(hash: string): Promise<CachedModelRecord<T> | null> {
      if (mode === "live") return null;

      try {
        const dir = await getDir();
        const { join } = await import(/* @vite-ignore */ NODE_PATH_MOD);
        const { readFile } = await import(/* @vite-ignore */ NODE_FS_MOD);
        const filePath = join(dir, `${hash}.json`);
        const raw = await readFile(filePath, "utf8");
        return JSON.parse(raw) as CachedModelRecord<T>;
      } catch {
        return null;
      }
    },
    async write<T>(record: CachedModelRecord<T>): Promise<void> {
      if (mode === "live" || mode === "replay") return;

      try {
        const dir = await getDir();
        const { join } = await import(/* @vite-ignore */ NODE_PATH_MOD);
        const { mkdir, writeFile, readFile } = await import(/* @vite-ignore */ NODE_FS_MOD);

        await mkdir(dir, { recursive: true });
        const filePath = join(dir, `${record.hash}.json`);
        await writeFile(filePath, JSON.stringify(record, null, 2) + "\n", "utf8");

        // Update manifest.json
        const manifestPath = join(dir, "manifest.json");
        let manifest: {
          version: string;
          count: number;
          records: Array<{ hash: string; role: string; model: string; recordedAt: string }>;
        } = {
          version: "1.0.0",
          count: 0,
          records: [],
        };

        try {
          const raw = await readFile(manifestPath, "utf8");
          manifest = JSON.parse(raw);
        } catch {
          // New manifest
        }

        const existingIndex = manifest.records.findIndex((r) => r.hash === record.hash);
        const entry = {
          hash: record.hash,
          role: record.role,
          model: record.model,
          recordedAt: record.recordedAt,
        };

        if (existingIndex >= 0) {
          manifest.records[existingIndex] = entry;
        } else {
          manifest.records.push(entry);
        }
        manifest.count = manifest.records.length;

        await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
      } catch (err) {
        console.error("Golden cache write error:", err);
      }
    },
  };
}

export function createBrowserGoldenCache(options?: {
  baseUrl?: string;
  mode?: AiExecutionMode;
}): GoldenCacheStore {
  const mode = options?.mode ?? "auto";
  const baseUrl = options?.baseUrl ?? "";

  return {
    getMode(): AiExecutionMode {
      return mode;
    },
    async read<T>(hash: string): Promise<CachedModelRecord<T> | null> {
      if (mode === "live") return null;

      try {
        const url = `${baseUrl}/golden/${hash}.json`;
        const res = await fetch(url);
        if (!res.ok) return null;
        return (await res.json()) as CachedModelRecord<T>;
      } catch {
        return null;
      }
    },
    async write(): Promise<void> {
      // Browser cache is read-only
      return Promise.resolve();
    },
  };
}
