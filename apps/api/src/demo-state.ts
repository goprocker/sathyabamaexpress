// The demo household as the API serves it: the sample data plus the dated
// obligations that its documents, bills, subscriptions and vehicles imply
// (normally written when something is changed, so a freshly built demo needs it applied once).
import { buildDemoUserState, type CanonicalStateData } from "@household/db";
import { PROFILE_OBLIGATION_PREFIX, deriveObligations, todayIso } from "@household/life";

export function demoState(): CanonicalStateData {
  const state = buildDemoUserState();
  const householdId = state.households[0]?.id ?? "hh_demo_001";
  if (state.profile) {
    state.obligations = [
      ...state.obligations.filter((o) => !o.sourceEventId?.startsWith(PROFILE_OBLIGATION_PREFIX)),
      ...deriveObligations({ profile: state.profile, householdId, today: todayIso() }),
    ];
  }
  return state;
}
