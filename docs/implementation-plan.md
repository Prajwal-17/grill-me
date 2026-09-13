Grill Me implementation plan
============================

Updated 2026-09-13 to reflect the requested UI and completion changes.

Grill Me keeps creation simple: choose a topic, mode, and difficulty, then work in your own editor. The workspace separates Challenge, Submit, and Reviews into tabs. Submit code or files without writing an explanation. Review results help you improve, while you decide when to pause or mark a challenge completed. Projects use Codex for file exploration; small self-contained submissions use OmniRoute.

Implemented behavior
--------------------

1. **Calibrated challenges.** Focused, Feature, and System control scope; Easy, Medium, Hard, and Grill control reasoning difficulty. Save a numeric difficulty estimate, its reason, the frozen generation context, and prompt/calibration versions. Keep briefs concise and source-code deliverables explicit. Systems ask for a bounded working core and assess design choices visible in code.
2. **Simple creation and optional history.** Creation has no practice-context panel or time/familiarity/emphasis controls. Saved preferences remain available separately. “Send recent challenges to AI” is an explicit setting, off by default. When disabled, new generation requests omit recent tasks and review findings. Old stored context remains unchanged; unrelated historical evidence is excluded from review prompts.
3. **Three tabs.** Challenge contains the task and optional help. Submit contains files, folder upload, a local project connection, and optional pasted code. Reviews contains one selected submission and review run at a time. Keep the header and tab bar visible, with independently scrolling content and a narrow-screen layout.
4. **Code-only submissions.** No written explanation is required. Score correctness (4), implementation reasoning (3), and engineering judgment (3) using concrete source evidence. This assesses the submitted implementation, not a person's intelligence. Missing evidence stays unassessed. Hints, retries, and test authorship do not reduce scores.
5. **Learner-controlled completion.** Review verdicts remain accepted, needs revision, or needs evidence. Acceptance does not complete a challenge. Pause, Resume, and Mark completed control learning status independently. Resuming completed work permits another submission. Preserve prior manual and judge-completed history without inventing scores.
6. **Files and folders without count/size caps.** Chunk uploads and streamed snapshots support large source trees. Native folder upload preserves subdirectories and repeated basenames in different directories. A local folder browser connects a path available to the backend; Docker paths must be mounted. Exclude credentials and generated/dependency directories, report skipped uploads, reject traversal, and preserve immutable source snapshots.
7. **Saved reviews and ephemeral Codex sessions.** Save submissions before judging and retain failed/cancelled attempts. Use ephemeral app-server sessions with restricted snapshot tools, save every sent/received protocol message immediately in SQLite, and link reviews to their database logs. Choose the review model in Preferences, defaulting to GPT-5.6 Sol. Historical persistent sessions remain untouched.
8. **Verification and progress.** Generate independent checks only through the isolated runner when its runtime is available. Otherwise label the review inspection-only. History shows progress by topic/mode/difficulty, counting the latest assessment per challenge. Review acceptance and the learner's completion status are separate.

Validation and setup
--------------------

The implementation passes 22 automated tests, formatting, lint, and type checks. Browser checks cover the tabs, multiple submissions/review runs, code-only attachments, nested folder upload, folder browser, saved history setting, manual completion, and mobile layout. A real Codex review accepted a two-file code-only submission, and a separate app-server connection successfully read its persisted history. Saved prompts, response, and tool activity were verified.

See [runtime setup](runtime-setup.md) for setup, migration, CLI history commands, production-build validation, and remaining environmental limitations. OmniRoute generation calibration and Docker execution require those services to be available locally. Numeric difficulty bands alone do not prove semantic calibration.

Challenge generation now enforces per-criterion and total brief limits, then independently assesses topic relevance, prerequisites, scope, and reasoning difficulty. At most one repair is permitted before returning an actionable error. The additive protocol-event migration preserves earlier data; Drizzle Studio uses the installed libSQL driver against the same SQLite file.
