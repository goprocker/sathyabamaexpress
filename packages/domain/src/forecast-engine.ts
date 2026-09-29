import crypto from "node:crypto";
import type { Forecast, Obligation } from "@household/contracts";
import type { HouseholdStore } from "@household/db";

export function runForecastEngine(
  store: HouseholdStore,
  householdId = "hh_demo_001"
): {
  forecasts: Forecast[];
  obligations: Obligation[];
} {
  const resources = store.recomputeAllResources(householdId);
  const state = store.getState();
  const now = new Date();
  const nowIso = now.toISOString();

  const generatedForecasts: Forecast[] = [];

  for (const res of resources) {
    // 1. Check active meal shortage risk
    if (res.deficitQuantity > 0) {
      generatedForecasts.push({
        id: `frc_shortage_${res.id}`,
        householdId,
        targetType: "resource",
        targetId: res.id,
        targetName: res.canonicalName,
        riskType: "SHORTAGE_RISK",
        severity: "HIGH",
        predictedDate: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        daysRemaining: 0,
        headline: `${res.canonicalName} · ${res.formattedDeficit} short for planned meal`,
        explanation: `Required quantity exceeds available on-hand stock (${res.formattedOnHand}) by ${res.formattedDeficit}.`,
        whyEvidence: {
          id: `why_frc_${res.id}`,
          resourceId: res.id,
          resourceName: res.canonicalName,
          headline: `Why is ${res.canonicalName} ${res.formattedDeficit} short?`,
          triggerEventLabel: "Planned Meal Reservation vs. On-Hand Stock",
          triggerTimestamp: nowIso,
          requiredDisplay: res.formattedReserved,
          onHandDisplay: res.formattedOnHand,
          reservedOtherDisplay: res.formattedReserved,
          incomingDisplay: res.formattedIncoming,
          deficitDisplay: res.formattedDeficit,
          proposedResolution: `Approve vendor order for ${res.formattedDeficit} ${res.canonicalName}`,
          sources: ["Confirmed inventory ledger", "Active meal reservations"],
        },
        updatedAt: nowIso,
      });
    }

    // 2. Check lot expiry risk (within 36 hours)
    if (res.nearestExpiryAt) {
      const hoursLeft =
        (new Date(res.nearestExpiryAt).getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursLeft > 0 && hoursLeft <= 36 && res.onHandQuantity > 0) {
        const daysRemaining = Math.max(1, Math.round(hoursLeft / 24));
        generatedForecasts.push({
          id: `frc_expiry_${res.id}`,
          householdId,
          targetType: "resource",
          targetId: res.id,
          targetName: res.canonicalName,
          riskType: "EXPIRY_RISK",
          severity: "MEDIUM",
          predictedDate: res.nearestExpiryAt,
          daysRemaining,
          headline: `${res.canonicalName} · ${res.formattedOnHand} expiring tomorrow`,
          explanation: `Active lot (${res.formattedOnHand}) expires in ~${Math.round(
            hoursLeft
          )} hours before projected depletion.`,
          whyEvidence: {
            id: `why_expiry_${res.id}`,
            resourceId: res.id,
            resourceName: res.canonicalName,
            headline: `Why is ${res.canonicalName} flagged for expiry?`,
            triggerEventLabel: `Shelf-Life Monitor · ${res.canonicalName}`,
            triggerTimestamp: nowIso,
            requiredDisplay: `Consume ${res.formattedOnHand} within 24h`,
            onHandDisplay: res.formattedOnHand,
            reservedOtherDisplay: res.formattedReserved,
            incomingDisplay: res.formattedIncoming,
            deficitDisplay: "0 g (Waste Risk)",
            proposedResolution:
              "Use in morning tea/coffee or set homemade curd tonight",
            sources: ["Active inventory lot expiry timestamp", "Daily burn rate model"],
          },
          updatedAt: nowIso,
        });
      }
    }

    // 3. Check depletion horizon (low stock within 3 days)
    if (
      res.deficitQuantity === 0 &&
      res.daysUntilDepletion !== null &&
      res.daysUntilDepletion <= 3 &&
      res.status === "LOW"
    ) {
      generatedForecasts.push({
        id: `frc_depletion_${res.id}_${crypto.randomUUID().slice(0, 4)}`,
        householdId,
        targetType: "resource",
        targetId: res.id,
        targetName: res.canonicalName,
        riskType: "RECURRING_DEMAND",
        severity: "LOW",
        predictedDate: new Date(
          now.getTime() + res.daysUntilDepletion * 24 * 60 * 60 * 1000
        ).toISOString(),
        daysRemaining: res.daysUntilDepletion,
        headline: `${res.canonicalName} will run low in ~${res.daysUntilDepletion} days`,
        explanation: `Based on average daily consumption (${res.avgDailyBurn} ${res.baseUnit}/day), current stock (${res.formattedNetAvailable}) will deplete soon.`,
        updatedAt: nowIso,
      });
    }
  }

  // 4. Obligation compliance forecasts
  const obligations = state.obligations.filter((o) => o.householdId === householdId);
  for (const obl of obligations) {
    if (obl.status === "DUE_SOON" || obl.status === "OVERDUE") {
      generatedForecasts.push({
        id: `frc_obl_${obl.id}`,
        householdId,
        targetType: "obligation",
        targetId: obl.id,
        targetName: obl.title,
        riskType: "COMPLIANCE_RISK",
        severity: obl.daysUntilDue <= 5 ? "HIGH" : "MEDIUM",
        predictedDate: obl.dueDate,
        daysRemaining: Math.max(0, obl.daysUntilDue),
        headline: obl.title,
        explanation:
          obl.conflictDescription ||
          `Obligation due in ${obl.daysUntilDue} days (₹${obl.amountInr ?? 0}).`,
        updatedAt: nowIso,
      });
    }
  }

  store.mutate((draft) => {
    draft.forecasts = generatedForecasts;
  });

  return {
    forecasts: generatedForecasts,
    obligations,
  };
}
