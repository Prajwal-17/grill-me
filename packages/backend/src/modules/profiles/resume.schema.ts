import { z } from "zod";
import {
  LANGUAGES,
  STACK,
  normalizeTechnologies,
  type ResumePreview,
} from "@repo/backend/shared/preferences";
import { AppError } from "../../shared/errors/app-error";

const supported = (max: number) =>
  z.strictObject({
    value: z.string().trim().min(1).max(max),
    excerpt: z.string().trim().min(1).max(1600),
  });
export const resumeExtractionSchema = z.strictObject({
  displayName: supported(120).nullable(),
  background: z.array(supported(750)).max(5),
  languages: z.array(supported(80)).max(50),
  technologies: z.array(supported(80)).max(50),
  projects: z
    .array(
      z.strictObject({
        name: supported(120),
        technologies: z.array(supported(80)).max(20),
        contribution: supported(600),
      }),
    )
    .max(10),
});
export type ResumeExtraction = z.infer<typeof resumeExtractionSchema>;

// PDF text preserves list markers and line wraps that a quoted value may omit.
// Ignore only this layout, keeping words, case, internal symbols, and hyphens.
function normalizeEvidence(text: string) {
  return text
    .normalize("NFC")
    .replace(/^[^\S\r\n]*[•●◦▪▫‣⁃][^\S\r\n]+/gmu, "")
    .replace(/(?<=\p{L})-\s+(?=\p{L})/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
}

export function validateResumeExtraction(
  raw: unknown,
  source: string,
): ResumePreview {
  const parsed = resumeExtractionSchema.safeParse(raw);
  const invalid = () =>
    new AppError(
      "RESUME_OUTPUT_INVALID",
      "The AI returned details without valid document evidence. Try again or edit your profile manually.",
      502,
      true,
    );
  if (!parsed.success) throw invalid();
  const result = parsed.data;
  const normalizedSource = normalizeEvidence(source);
  let omitted = 0;
  type SupportedValue = { value: string; excerpt: string };
  function read(field: SupportedValue | null) {
    if (field === null) return null;
    const excerpt = normalizeEvidence(field.excerpt);
    if (
      normalizedSource.includes(excerpt) &&
      excerpt.includes(normalizeEvidence(field.value))
    )
      return field.value;
    omitted++;
    return null;
  }
  function readAll(fields: SupportedValue[]) {
    return fields.flatMap((field) => {
      const value = read(field);
      return value === null ? [] : [value];
    });
  }
  const warnings: string[] = [];
  const draft = {
    displayName: read(result.displayName),
    aboutMe: readAll(result.background).join("\n\n") || null,
    languages: normalizeTechnologies(readAll(result.languages), LANGUAGES),
    stack: normalizeTechnologies(readAll(result.technologies), STACK),
    projects: result.projects.flatMap((project) => {
      const name = read(project.name);
      const contribution = read(project.contribution);
      if (name === null || contribution === null) return [];
      return [
        {
          name,
          contribution,
          technologies: normalizeTechnologies(readAll(project.technologies)),
        },
      ];
    }),
  };
  const hasDetails = Boolean(
    draft.displayName ||
    draft.aboutMe ||
    draft.languages.length ||
    draft.stack.length ||
    draft.projects.length,
  );
  // Never turn an entirely unsupported response into a successful empty import.
  if (omitted && !hasDetails) throw invalid();
  if (omitted)
    warnings.push(
      `${omitted} ${omitted === 1 ? "detail could" : "details could"} not be matched to the document and ${omitted === 1 ? "was" : "were"} left out. Review the remaining draft before applying it.`,
    );
  if (!hasDetails)
    warnings.push(
      "No supported developer details were found. You can enter them manually.",
    );
  if (draft.projects.length === 10)
    warnings.push(
      "The draft contains the maximum of ten projects. Review which ones to keep.",
    );
  return { draft, warnings };
}
