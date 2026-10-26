// Exercises termination of a parser that does not cooperate with cancellation.
self.onmessage = () => {
  while (true) {
    /* deliberately blocked */
  }
};
