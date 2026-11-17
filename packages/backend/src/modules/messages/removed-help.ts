import { AppError } from "../../shared/errors/app-error";

/** Keep old URLs explicit without retaining a path to paid inference. */
export function removedHelpFeature(): never {
  throw new AppError(
    "FEATURE_REMOVED",
    "Hints and discussions have been removed.",
    410,
    false,
  );
}
