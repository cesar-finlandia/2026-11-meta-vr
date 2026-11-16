/**
 * Self-registering entry: src/main.tsx loads this module through import.meta.glob.
 */
import { registerLabRoute, registerSpatialStage } from "../ui/stage-registry";
import { SightlineSpatialCanvas } from "./SightlineSpatialCanvas";
import { LabTuningRoute } from "./LabTuningRoute";

registerSpatialStage(SightlineSpatialCanvas);
registerLabRoute(LabTuningRoute);
