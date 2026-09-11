# AI interaction primitives

Adapted from [Beautiful UI](https://www.beautifului.dev/) (MIT; see LICENSE):

- PromptBar and ChatComposer: auto-sizing prompt input, prompt surface, action toolbar, attachment chips, user messages, and assistant sections.
- ApprovalCard: the supplied compact question card with GlideMenu hover/focus highlighting, inline custom input, pill actions, and delayed single-choice submission. The adapter passes the selected value directly and cancels pending submissions when the request changes. Custom answers submit with Enter or the action button; failed requests keep the card editable.
- StreamingText: the cursor, word reveal, and completion actions are driven by actual NDJSON deltas. Markdown is rendered during streaming; code and math bypass word animation. The gallery’s timed demo loop, sample sources, and placeholder actions are omitted.

Registry sources: https://www.beautifului.dev/r/prompt-bar.json, https://www.beautifului.dev/r/chat-composer.json, https://www.beautifului.dev/r/approval-card.json, https://www.beautifului.dev/r/streaming-text.json, https://www.beautifului.dev/r/glide-menu.json.

Adaptations use Grill Me's neutral Tailwind tokens with semantic error and completion colors, shadcn controls, and Motion. Demo replies, timed simulated output, unrelated tools, and decorative actions are omitted. All content and status come from the existing API.
