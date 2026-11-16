/**
 * Production and local development HTTP server entrypoint for Sightline Studio API.
 */
import { createApiApp } from "./app";

const port = Number(process.env.PORT ?? 8787);
const app = createApiApp();

app.listen(port, () => {
  console.log(`Sightline Studio API listening on http://localhost:${port}`);
  console.log(`Mode: ${process.env.SIGHTLINE_AI_MODE ?? "auto"}`);
});
