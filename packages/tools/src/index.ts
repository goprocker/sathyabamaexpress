import crypto from "node:crypto";
import type {
  AgentRole,
  AgentRunTrace,
  AgentStepTrace,
  ToolCallTrace,
  ToolName,
} from "@household/contracts";
import type { HouseholdStore } from "@household/db";
import { verifyApprovalToken } from "@household/domain";

export const AGENT_TOOL_ALLOWLIST: Record<AgentRole, ToolName[]> = {
  Supervisor: ["state.read", "event.read", "state.compare"],
  IntakeAgent: ["state.read", "inventory.read", "recipe.read", "event.create"],
  InventoryEngine: [
    "inventory.read",
    "inventory.simulate",
    "inventory.commit",
    "state.compare",
  ],
  MealEngine: ["recipe.read", "inventory.read", "inventory.simulate"],
  RippleEngine: ["graph.read", "inventory.simulate", "forecast.run"],
  ForecastEngine: ["inventory.read", "forecast.run", "forecast.read"],
  ActionPlannerAgent: [
    "state.read",
    "forecast.read",
    "action.prepare",
    "action.read",
    "approval.request",
  ],
  ExecutionEngine: ["action.read", "snapserve.call", "snapserve.status"],
  ReconciliationAgent: [
    "action.read",
    "snapserve.status",
    "outcome.reconcile",
    "inventory.commit",
  ],
  System: [
    "state.read",
    "state.compare",
    "event.create",
    "event.read",
    "inventory.read",
    "inventory.simulate",
    "inventory.commit",
    "recipe.read",
    "graph.read",
    "forecast.run",
    "forecast.read",
    "action.prepare",
    "action.read",
    "approval.request",
    "snapserve.call",
    "snapserve.status",
    "outcome.reconcile",
  ],
};

export class ToolPermissionError extends Error {
  constructor(
    public readonly agent: AgentRole,
    public readonly tool: ToolName,
    message: string
  ) {
    super(message);
    this.name = "ToolPermissionError";
  }
}

export function assertToolAllowed(
  store: HouseholdStore,
  agent: AgentRole,
  tool: ToolName,
  options?: { actionId?: string; approvalToken?: string }
): void {
  const allowed = AGENT_TOOL_ALLOWLIST[agent] || [];
  if (!allowed.includes(tool)) {
    throw new ToolPermissionError(
      agent,
      tool,
      `Agent '${agent}' is not permitted to invoke tool '${tool}'.`
    );
  }

  // Privileged tool guard: snapserve.call requires a verified HMAC approval token
  if (tool === "snapserve.call") {
    if (!options?.actionId || !options?.approvalToken) {
      throw new ToolPermissionError(
        agent,
        tool,
        "Privileged tool 'snapserve.call' requires actionId and a valid approvalToken."
      );
    }
    const check = verifyApprovalToken(
      store,
      options.actionId,
      options.approvalToken
    );
    if (!check.valid) {
      throw new ToolPermissionError(
        agent,
        tool,
        `Approval token verification failed for 'snapserve.call': ${check.reason}`
      );
    }
  }
}

export class AgentTraceRecorder {
  private readonly run: AgentRunTrace;
  private readonly startTimeMs: number;

  constructor(
    private readonly store: HouseholdStore,
    householdId: string,
    workflowType: AgentRunTrace["workflowType"],
    triggerEventId?: string
  ) {
    this.startTimeMs = Date.now();
    this.run = {
      id: `run_${crypto.randomUUID().slice(0, 8)}`,
      householdId,
      triggerEventId,
      workflowType,
      status: "RUNNING",
      totalLatencyMs: 0,
      steps: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
  }

  public getRunId(): string {
    return this.run.id;
  }

  public async runStep<T>(params: {
    agentName: AgentRole;
    executionMode: "LLM_AGENT" | "DETERMINISTIC_ENGINE";
    action: string;
    reason: string;
    execute: (stepHelper: {
      callTool: <R>(
        toolName: ToolName,
        inputSummary: string,
        fn: () => Promise<R> | R,
        formatOutput?: (res: R) => string,
        privilegeOpts?: { actionId?: string; approvalToken?: string; idempotencyKey?: string }
      ) => Promise<R>;
    }) => Promise<T> | T;
  }): Promise<T> {
    const stepStart = Date.now();
    const stepId = `step_${crypto.randomUUID().slice(0, 8)}`;
    const toolCalls: ToolCallTrace[] = [];

    const callTool = async <R>(
      toolName: ToolName,
      inputSummary: string,
      fn: () => Promise<R> | R,
      formatOutput?: (res: R) => string,
      privilegeOpts?: {
        actionId?: string;
        approvalToken?: string;
        idempotencyKey?: string;
      }
    ): Promise<R> => {
      const toolStart = Date.now();
      try {
        assertToolAllowed(this.store, params.agentName, toolName, privilegeOpts);
        const result = await fn();
        const toolLatency = Math.max(1, Date.now() - toolStart);
        toolCalls.push({
          id: `tc_${crypto.randomUUID().slice(0, 8)}`,
          runId: this.run.id,
          agentStepId: stepId,
          toolName,
          idempotencyKey: privilegeOpts?.idempotencyKey,
          inputSummary,
          outputSummary: formatOutput ? formatOutput(result) : "OK",
          status: "SUCCESS",
          latencyMs: toolLatency,
          createdAt: new Date().toISOString(),
        });
        return result;
      } catch (err) {
        const toolLatency = Math.max(1, Date.now() - toolStart);
        const isPermission = err instanceof ToolPermissionError;
        toolCalls.push({
          id: `tc_${crypto.randomUUID().slice(0, 8)}`,
          runId: this.run.id,
          agentStepId: stepId,
          toolName,
          idempotencyKey: privilegeOpts?.idempotencyKey,
          inputSummary,
          outputSummary: err instanceof Error ? err.message : String(err),
          status: isPermission ? "BLOCKED" : "FAILED",
          latencyMs: toolLatency,
          createdAt: new Date().toISOString(),
        });
        throw err;
      }
    };

    try {
      const output = await params.execute({ callTool });
      const stepLatency = Math.max(1, Date.now() - stepStart);
      const stepRecord: AgentStepTrace = {
        id: stepId,
        runId: this.run.id,
        stepIndex: this.run.steps.length + 1,
        agentName: params.agentName,
        executionMode: params.executionMode,
        action: params.action,
        reason: params.reason,
        status: "COMPLETED",
        latencyMs: stepLatency,
        toolCalls,
        createdAt: new Date().toISOString(),
      };
      this.run.steps.push(stepRecord);
      return output;
    } catch (err) {
      const stepLatency = Math.max(1, Date.now() - stepStart);
      this.run.steps.push({
        id: stepId,
        runId: this.run.id,
        stepIndex: this.run.steps.length + 1,
        agentName: params.agentName,
        executionMode: params.executionMode,
        action: params.action,
        reason: err instanceof Error ? err.message : params.reason,
        status: "FAILED",
        latencyMs: stepLatency,
        toolCalls,
        createdAt: new Date().toISOString(),
      });
      throw err;
    }
  }

  public finalize(status: "COMPLETED" | "FAILED" = "COMPLETED"): AgentRunTrace {
    this.run.status = status;
    this.run.totalLatencyMs = Math.max(1, Date.now() - this.startTimeMs);
    this.run.completedAt = new Date().toISOString();

    this.store.mutate((draft) => {
      const existingIdx = draft.agentRuns.findIndex((r) => r.id === this.run.id);
      if (existingIdx !== -1) {
        draft.agentRuns[existingIdx] = this.run;
      } else {
        draft.agentRuns.unshift(this.run);
      }
    });

    return this.run;
  }
}
