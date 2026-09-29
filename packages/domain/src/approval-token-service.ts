import crypto from "node:crypto";
import type { HouseholdStore } from "@household/db";

const HMAC_SECRET =
  process.env.APPROVAL_HMAC_SECRET || "household-os-super-secret-hmac-key-2026";
const TOKEN_TTL_MS =
  Number(process.env.APPROVAL_TOKEN_TTL_MINUTES || 15) * 60 * 1000;

export function computePayloadHash(payload: unknown): string {
  const canonicalJson = JSON.stringify(payload);
  return crypto.createHash("sha256").update(canonicalJson).digest("hex");
}

export function issueApprovalToken(
  store: HouseholdStore,
  actionId: string,
  userId: string
): {
  token: string;
  expiresAt: string;
  payloadHash: string;
} {
  const state = store.getState();
  const action = state.actions.find((a) => a.id === actionId);
  if (!action) {
    throw new Error(`Action not found: ${actionId}`);
  }

  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const rawMessage = `${action.id}|${action.payloadHash}|${userId}|${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(rawMessage)
    .digest("hex");

  const token = `${Buffer.from(rawMessage).toString("base64url")}.${signature}`;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  store.mutate(
    (draft) => {
      draft.approvalTokens[actionId] = {
        actionId,
        tokenHash,
        payloadHash: action.payloadHash,
        userId,
        expiresAt,
      };
      const targetAction = draft.actions.find((a) => a.id === actionId);
      if (targetAction) {
        targetAction.status = "APPROVED";
        targetAction.approvedBy = userId;
        targetAction.approvedAt = new Date().toISOString();
        targetAction.updatedAt = new Date().toISOString();
      }
    },
    {
      householdId: action.householdId,
      actor: userId,
      operation: "ACTION_APPROVED",
      entityType: "Action",
      entityId: actionId,
    }
  );

  return {
    token,
    expiresAt,
    payloadHash: action.payloadHash,
  };
}

export function verifyApprovalToken(
  store: HouseholdStore,
  actionId: string,
  token: string
): { valid: boolean; reason?: string } {
  const state = store.getState();
  const action = state.actions.find((a) => a.id === actionId);
  if (!action) {
    return { valid: false, reason: "Action does not exist" };
  }

  const stored = state.approvalTokens[actionId];
  if (!stored) {
    return { valid: false, reason: "No approval token issued for this action" };
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  if (tokenHash !== stored.tokenHash) {
    return { valid: false, reason: "Approval token hash mismatch" };
  }

  if (stored.payloadHash !== action.payloadHash) {
    return {
      valid: false,
      reason: "Underlying action payload drifted after user approval",
    };
  }

  if (new Date(stored.expiresAt).getTime() < Date.now()) {
    return { valid: false, reason: "Approval token has expired" };
  }

  return { valid: true };
}
