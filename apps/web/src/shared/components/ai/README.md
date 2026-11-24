# AI interaction primitives

Adapted from [Beautiful UI](https://www.beautifului.dev/) (MIT; see LICENSE):

- PromptBar and ChatComposer: auto-sizing prompt input, prompt surface, action toolbar, attachment chips, user messages, and assistant sections.
- ApprovalCard: a compact clarification view that replaces the composer inside the same surface. Choices use consistent radio styling, Something else reveals a multiline answer, and actions stay visible while long choices scroll internally. Selection never submits automatically. Create build confirms the answer; Skip uses the model's judgment, and Edit request restores the draft. Failed requests keep the answer editable.

Registry sources: https://www.beautifului.dev/r/prompt-bar.json, https://www.beautifului.dev/r/chat-composer.json, https://www.beautifului.dev/r/approval-card.json.

Adaptations use Grill Me's neutral Tailwind tokens with semantic error and completion colors, shadcn controls, and Motion. Demo replies, timed simulated output, unrelated tools, and decorative actions are omitted. All content and status come from the existing API.

The empty composer uses a native, static placeholder. Keep its accessible name stable and expose current option values in menu trigger names so keyboard users and browser agents can identify the request controls without animation timing.
