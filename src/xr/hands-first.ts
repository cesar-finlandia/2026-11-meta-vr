/**
 * Bare-hand pinch math with hysteresis, 1 cm wall-drag quantization and gesture state.
 */
export interface PinchGestureState {
  pinching: boolean;
  twoFingerDismiss: boolean;
  activeMountId: string | null;
  dragDeltaCm: [number, number];
}

export const PINCH_ENGAGE_M = 0.018;
export const PINCH_RELEASE_M = 0.025;

export function evaluatePinchDistanceMeters(
  thumbTip: [number, number, number],
  indexTip: [number, number, number],
  wasPinching: boolean
): boolean {
  const d = Math.hypot(
    thumbTip[0] - indexTip[0],
    thumbTip[1] - indexTip[1],
    thumbTip[2] - indexTip[2]
  );
  return wasPinching ? d <= PINCH_RELEASE_M : d < PINCH_ENGAGE_M;
}

export function quantizeWallDragCm(rawCm: number): number {
  return Math.round(rawCm);
}

export function initialGestureState(): PinchGestureState {
  return { pinching: false, twoFingerDismiss: false, activeMountId: null, dragDeltaCm: [0, 0] };
}
