import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import type { JudgeInput, ModelGateway } from "../ai/model-gateway";
import {
  criteriaFor,
  type VerificationEvidence,
} from "../reviews/review.schema";

export async function verifySubmission(
  llm: Pick<ModelGateway, "planVerification">,
  input: JudgeInput,
  snapshot: string,
): Promise<VerificationEvidence> {
  if (!Bun.which("docker"))
    return {
      status: "inspection_only",
      reason:
        "Docker is unavailable. Source was not executed; install Docker to enable isolated checks.",
      checks: [],
    };
  if (!llm.planVerification || !input.attachments.length)
    return {
      status: "inspection_only",
      reason:
        "Automatic harness generation is unavailable for this submission. The judge will inspect source.",
      checks: [],
    };
  const dir = await mkdtemp(join(tmpdir(), "grill-checks-"));
  const evidence: VerificationEvidence = {
    status: "checks_run",
    reason:
      "Generated checks ran in an isolated container against unchanged source.",
    checks: [],
  };
  try {
    const plan = await llm.planVerification(input);
    if (plan.runtime === "unsupported" || !plan.checks.length)
      return { status: "inspection_only", reason: plan.reason, checks: [] };
    const images = {
      python: "python:3.13-alpine",
      javascript: "node:24-alpine",
      typescript: "oven/bun:1.4.2-alpine",
      go: "golang:1.25-alpine",
    };
    const ids = criteriaFor(input.challenge).map((c) => c.id);
    for (const check of plan.checks) {
      input.signal?.throwIfAborted();
      if (
        !ids.includes(check.criterionId) ||
        basename(check.filename) !== check.filename ||
        !/^[a-zA-Z0-9_-]+\.(py|js|mjs|ts|go)$/.test(check.filename)
      )
        throw new Error(
          "Generated check has an invalid criterion or filename.",
        );
      await writeFile(join(dir, check.filename), check.content);
      const command =
        plan.runtime === "python"
          ? ["python", `/checks/${check.filename}`]
          : plan.runtime === "javascript"
            ? ["node", `/checks/${check.filename}`]
            : plan.runtime === "typescript"
              ? ["bun", `/checks/${check.filename}`]
              : [
                  "sh",
                  "-c",
                  "mkdir -p /tmp/work && cp -R /submission/. /tmp/work && cp /checks/*.go /tmp/work/ && cd /tmp/work && GOTOOLCHAIN=local GOCACHE=/tmp/cache go test ./...",
                ];
      const name = "grill-check-" + crypto.randomUUID();
      const args = [
        "run",
        "--rm",
        "--pull=never",
        "--name",
        name,
        "--network=none",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--pids-limit=64",
        "--memory=512m",
        "--cpus=1",
        "--tmpfs",
        "/tmp:rw,nosuid,size=128m",
        "--mount",
        `type=bind,src=${snapshot},dst=/submission,readonly`,
        "--mount",
        `type=bind,src=${dir},dst=/checks,readonly`,
        "-e",
        "PYTHONPATH=/submission",
        "-e",
        "PYTHONDONTWRITEBYTECODE=1",
        "-w",
        "/submission",
        images[plan.runtime],
        ...command,
      ];
      const result = await new Promise<{
        exitCode: number | null;
        output: string;
      }>((resolve, reject) => {
        const child = spawn("docker", args, {
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        const stop = () => {
          child.kill("SIGKILL");
          const clean = spawn("docker", ["rm", "-f", name], {
            stdio: "ignore",
          });
          clean.on("error", () => {});
        };
        const timer = setTimeout(stop, 30000);
        input.signal?.addEventListener("abort", stop, { once: true });
        const append = (data: Buffer) => {
          if (output.length < 16000)
            output += data.toString().slice(0, 16000 - output.length);
        };
        child.stdout.on("data", append);
        child.stderr.on("data", append);
        child.on("error", (error) => {
          clearTimeout(timer);
          input.signal?.removeEventListener("abort", stop);
          reject(error);
        });
        child.on("close", (exitCode) => {
          clearTimeout(timer);
          input.signal?.removeEventListener("abort", stop);
          resolve({ exitCode, output });
        });
      });
      evidence.checks.push({
        criterionId: check.criterionId,
        command: command.join(" "),
        ...result,
      });
      if (
        result.exitCode === null ||
        result.exitCode === 125 ||
        result.exitCode === 126 ||
        result.exitCode === 127
      ) {
        evidence.status = "incomplete";
        evidence.reason =
          "The verification environment could not finish a check. This is not a proven source defect.";
      }
    }
    return evidence;
  } catch (error) {
    if (input.signal?.aborted) throw error;
    return {
      ...evidence,
      status: "incomplete",
      reason:
        error instanceof Error ? error.message : "Verification unavailable.",
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
