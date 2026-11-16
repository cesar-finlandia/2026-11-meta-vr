/**
 * Self-registering entry: src/main.tsx loads this module through import.meta.glob.
 */
import { registerWatchRoute } from "../ui/stage-registry";
import { WatchReplayRoute } from "./WatchReplayRoute";

registerWatchRoute(WatchReplayRoute);
