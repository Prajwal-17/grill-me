# AI interaction primitives

Adapted from [Beautiful UI](https://www.beautifului.dev/) (MIT; see LICENSE):

- PromptBar and ChatComposer: auto-sizing prompt input, prompt surface, action toolbar, attachment chips, user messages, and assistant sections.
- ApprovalCard: a compact clarification view that replaces the composer inside the same surface. Choices use consistent radio styling, Something else reveals a multiline answer, and actions stay visible while long choices scroll internally. Selection never submits automatically. Create build confirms the answer; Skip uses the model's judgment, and Edit request restores the draft. Failed requests keep the answer editable.
- StreamingText: the cursor, word reveal, and completion actions are driven by actual NDJSON deltas. Markdown is rendered during streaming; code and math bypass word animation. The gallery’s timed demo loop, sample sources, and placeholder actions are omitted.

Registry sources: https://www.beautifului.dev/r/prompt-bar.json, https://www.beautifului.dev/r/chat-composer.json, https://www.beautifului.dev/r/approval-card.json, https://www.beautifului.dev/r/streaming-text.json, https://www.beautifului.dev/r/glide-menu.json.

Adaptations use Grill Me's neutral Tailwind tokens with semantic error and completion colors, shadcn controls, and Motion. Demo replies, timed simulated output, unrelated tools, and decorative actions are omitted. All content and status come from the existing API.

## Magic UI typing animation

The empty-composer typing state machine is adapted from [Magic UI's Typing Animation](https://magicui.design/docs/components/typing-animation) (MIT; see LICENSE). Grill Me pauses it by unmounting on focus or input, restarts only for an empty unfocused composer, hides it from assistive technology, and shows a static suggestion when reduced motion is requested.

Registry source: https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/typing-animation.tsx
