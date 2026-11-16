/**
 * Platform-aware Chromium WebGL launch flags: hardware ANGLE on Windows/macOS,
 * SwiftShader software rendering on Linux or when E2E_GPU=0.
 */
export function isSoftwareGlMode(
  platform: NodeJS.Platform = process.platform,
  gpuEnv: string | undefined = process.env.E2E_GPU
): boolean {
  if (gpuEnv === "0") return true;
  return platform !== "win32" && platform !== "darwin";
}

/** Lifts the headless frame-rate and vsync caps so fpsProbe measures render cost, not pacing. */
const UNCAPPED_FRAMES = ["--disable-frame-rate-limit", "--disable-gpu-vsync"];

export function glLaunchArgs(
  platform: NodeJS.Platform = process.platform,
  gpuEnv: string | undefined = process.env.E2E_GPU
): string[] {
  if (isSoftwareGlMode(platform, gpuEnv)) {
    return ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", ...UNCAPPED_FRAMES];
  }
  const backend = platform === "darwin" ? "metal" : "d3d11";
  return [`--use-angle=${backend}`, "--ignore-gpu-blocklist", "--enable-gpu", "--enable-webgl", ...UNCAPPED_FRAMES];
}
