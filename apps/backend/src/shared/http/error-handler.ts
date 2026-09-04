import { AppError } from "../errors/app-error";

export function handleError(error: Error) {
  const known = error instanceof AppError;

  if (!known) console.error(error);

  return new Response(
    JSON.stringify({
      error: {
        code: known ? error.code : "INTERNAL_ERROR",
        message: known ? error.message : "Something went wrong.",
        retryable: known ? error.retryable : false,
      },
    }),
    {
      status: known ? error.status : 500,
      headers: { "Content-Type": "application/json" },
    },
  );
}
