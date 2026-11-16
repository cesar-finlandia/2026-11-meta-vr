import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

// If invoked without tsx loader, re-exec with --import tsx
try {
  // Test if we can load TypeScript
  await import("../src/domain/session.ts");
} catch (err) {
  if (err?.code === "ERR_MODULE_NOT_FOUND" || err?.code === "ERR_UNKNOWN_FILE_EXTENSION") {
    execFileSync(process.execPath, ["--import", "tsx", process.argv[1], ...process.argv.slice(2)], {
      stdio: "inherit",
    });
    process.exit(0);
  }
  throw err;
}

const { createSession } = await import("../src/domain/session.ts");
const { bindCuratorialActions, exportActionManifest } = await import("../src/agent/actions.ts");
const { lintDescriptor } = await import("../src/agent/descriptor-linter.ts");

const session = createSession({ seed: "default" });
bindCuratorialActions(session);

const descriptors = session.registry.list({ includeUnavailable: true });
const domainDescriptors = descriptors.filter((d) => d.name !== "get_capabilities");

let lintErrors = 0;
for (const desc of domainDescriptors) {
  const errs = lintDescriptor(desc);
  if (errs.length > 0) {
    console.error(`Lint error for action '${desc.name}':`, errs);
    lintErrors += errs.length;
  }
}

if (lintErrors > 0) {
  console.error(`Descriptor linting failed with ${lintErrors} error(s).`);
  process.exit(1);
}

const manifest = exportActionManifest(session.registry);
const manifestPath = resolve(process.cwd(), "actions.manifest.json");

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(
  `actions.manifest.json written: ${manifest.actions.length} actions, hash=${manifest.contract_hash}`
);
