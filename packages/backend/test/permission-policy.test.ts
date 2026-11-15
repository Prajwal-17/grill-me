import { describe, expect, test } from "bun:test";
import type { AgentPermissionMode } from "@repo/backend/shared/contracts";
import {
  permissionDecision,
  permissionDecisionFor,
  type PermissionDecision,
} from "@repo/backend/modules/ai/agent/permission-policy";

const modes: AgentPermissionMode[] = [
  "approval-required",
  "auto-accept-edits",
  "auto",
  "full-access",
];

const actions = [
  "read_workspace",
  "write_workspace",
  "run_command",
  "install",
  "network",
  "outside_workspace",
  "secrets",
] as const;

describe("agent permission matrix", () => {
  test("matches the documented allow, ask, and deny decisions", () => {
    const expected: Record<
      AgentPermissionMode,
      Record<(typeof actions)[number], PermissionDecision>
    > = {
      "approval-required": {
        read_workspace: "allow",
        write_workspace: "ask",
        run_command: "ask",
        install: "ask",
        network: "ask",
        outside_workspace: "ask",
        secrets: "ask",
      },
      "auto-accept-edits": {
        read_workspace: "allow",
        write_workspace: "allow",
        run_command: "ask",
        install: "ask",
        network: "ask",
        outside_workspace: "ask",
        secrets: "ask",
      },
      auto: {
        read_workspace: "allow",
        write_workspace: "allow",
        run_command: "allow",
        install: "ask",
        network: "ask",
        outside_workspace: "ask",
        secrets: "ask",
      },
      "full-access": {
        read_workspace: "allow",
        write_workspace: "allow",
        run_command: "allow",
        install: "allow",
        network: "allow",
        outside_workspace: "deny",
        secrets: "deny",
      },
    };
    for (const mode of modes)
      for (const action of actions)
        expect(permissionDecision(mode, action)).toBe(expected[mode][action]);
  });

  test("combines actions using deny over ask over allow", () => {
    expect(
      permissionDecisionFor("approval-required", [
        "read_workspace",
        "write_workspace",
      ]),
    ).toBe("ask");
    expect(permissionDecisionFor("auto", ["run_command", "install"])).toBe(
      "ask",
    );
    expect(
      permissionDecisionFor("full-access", ["run_command", "network"]),
    ).toBe("allow");
    expect(
      permissionDecisionFor("full-access", [
        "run_command",
        "outside_workspace",
      ]),
    ).toBe("deny");
  });
});
