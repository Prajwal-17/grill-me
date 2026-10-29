import type { KeyboardEvent } from "react";

export function shouldSubmitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  return (
    event.key === "Enter" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.nativeEvent.isComposing
  );
}
