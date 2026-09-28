// PARTNER API — deck completeness. Deterministic, not a model guess:
//   score = (points_with_slides + resolved_refs) / (total_points + total_refs)
// clamped to 0..1, rounded to 2 places, 1.0 when there is nothing to measure.

export const COMPLETENESS_FORMULA =
  "(points_with_slides + resolved_refs) / (total_points + total_refs), clamped to 0..1, rounded to 2 places; 1.0 when the denominator is 0";

export interface CompletenessInputs {
  total_points: number;
  points_with_slides: number;
  total_refs: number;
  resolved_refs: number;
  unresolved_verses: string[];
  points_without_slides: string[];
}

export const completenessScore = (inputs: Pick<CompletenessInputs, "total_points" | "points_with_slides" | "total_refs" | "resolved_refs">): number => {
  const denominator = inputs.total_points + inputs.total_refs;
  if (denominator <= 0) return 1;
  const raw = (inputs.points_with_slides + inputs.resolved_refs) / denominator;
  const clamped = Math.min(1, Math.max(0, raw));
  return Math.round(clamped * 100) / 100;
};

export const completenessPayload = (inputs: CompletenessInputs) => ({
  score: completenessScore(inputs),
  total_points: inputs.total_points,
  points_with_slides: inputs.points_with_slides,
  total_refs: inputs.total_refs,
  resolved_refs: inputs.resolved_refs,
  unresolved_verses: inputs.unresolved_verses,
  points_without_slides: inputs.points_without_slides,
  formula: COMPLETENESS_FORMULA,
});
