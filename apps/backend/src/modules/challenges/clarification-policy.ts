export const ESSENTIAL_CLARIFICATION_POLICY = `A clarification requests missing requirements from the developer. It must never assign an exercise, request implementation code, test knowledge, or ask the developer to solve the challenge before it exists.
Ask only about conflicting mandatory requirements or an unavailable essential external API contract. For ordinary practice topics, choose sensible assignment details in generation and proceed without a question.
For example, "I just learned Python closures. Give me a small exercise to practice them." needs no clarification. "Implement make_multiplier(factor)" is an assignment, never a clarification. A genuine clarification is "What is the private SDK's required function signature?".`;

// Reject obvious implementation requests even when the provider puts them in
// the nullable question field. Do not reinterpret them as completed challenges
// or silently bypass a genuine missing-requirements question.
export function requestsImplementation(question: string) {
  const text = question.trim().replace(/^[\s*#>`-]+/u, "");
  return /^(?:(?:please|kindly)\s+)?(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?(?:implement|code|write|build|create|solve|refactor|debug)\b/iu.test(
    text,
  );
}
