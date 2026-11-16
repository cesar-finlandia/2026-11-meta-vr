/**
 * Sightline Studio application entry point.
 * Imports self-hosted variable font weights, visual tokens, craft stylesheets,
 * and eagerly mounts optional spatial and replay modules via stage registry.
 */
import "@fontsource-variable/fraunces";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/jetbrains-mono";
import "./ui/tokens.css";
import "./ui/brandmark.css";
import "./ui/craft.css";

// Eagerly load optional 3D and /watch modules when present without hard compile coupling
import.meta.glob(["./3d/mount-3d.ts", "./showcase/mount-watch.ts"], { eager: true });

import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./ui/theme";
import { App } from "./App";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found in document");
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
