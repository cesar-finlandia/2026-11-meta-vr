# Failures — iteration 1

## t04 — Full north wall compliance repair
failed 2/2
last calls of the first failed run:
- adjust_frame_height ok=true
- validate_ada_compliance ok=true
- repair_layout_violation ok=true
cause: step limit reached; shorten the path or add a combined action

## t07 — Write accessible wall placard and save milestone
failed 2/2
last calls of the first failed run:
- draft_curatorial_placard ok=true
- scrub_timeline_snapshot ok=true
cause: the agent finished without achieving the outcome

## t08 — Curate architectural study across two walls
failed 2/2
frequent errors:
- (2x) No valid catalog artworks resolved from provided artworkIds.
last calls of the first failed run:
- propose_wall_layout ok=true
- toggle_seated_scale_twin ok=true
- validate_ada_compliance ok=true
cause: the agent finished without achieving the outcome
