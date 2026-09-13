import { codexStatus, CODEX_VERSION } from "../src/modules/judges/codex";
const status = await codexStatus();
console.log(
  JSON.stringify(
    {
      codex: status,
      testedVersion: CODEX_VERSION,
      verification: Bun.which("docker")
        ? "Docker CLI available; daemon and images checked when running verification"
        : "Install Docker to enable isolated verification; reviews use code inspection until then",
      omniroute: process.env.LLM_BASE_URL ?? "http://localhost:20128/v1",
    },
    null,
    2,
  ),
);
if (!status.installed || !status.authenticated) process.exitCode = 1;
