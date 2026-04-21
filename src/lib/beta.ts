export const getBetaTrialDaysRemaining = (trialEndsAt?: string | null) => {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  const diff = end - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
};

export const formatBetaTrialCountdown = (daysRemaining: number | null) => {
  if (daysRemaining === null) return "Trial end date unavailable";
  if (daysRemaining === 0) return "Trial ends today";
  return `Trial ends in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;
};
