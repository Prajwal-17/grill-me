import { z } from "zod";
import {
  LANGUAGES,
  STACK,
  normalizeTechnologies,
  type ResumePreview,
} from "@repo/preferences";
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

// Document parsers preserve layout whitespace that the model may flatten when
// quoting an excerpt. Ignore that formatting, but preserve words, case, and
// punctuation so unsupported claims still fail evidence validation.
function normalizeEvidence(text: string) {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
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
  const supportedValues = [
    result.displayName,
    ...result.background,
    ...result.languages,
    ...result.technologies,
    ...result.projects.flatMap((project) => [
      project.name,
      project.contribution,
      ...project.technologies,
    ]),
  ].filter((value) => value !== null);
  const normalizedSource = normalizeEvidence(source);
  if (
    supportedValues.some(({ value, excerpt }) => {
      const normalizedExcerpt = normalizeEvidence(excerpt);
      return (
        !normalizedSource.includes(normalizedExcerpt) ||
        !normalizedExcerpt.includes(normalizeEvidence(value))
      );
    })
  )
    throw invalid();
  const warnings: string[] = [];
  const draft = {
    displayName: result.displayName?.value ?? null,
    aboutMe: result.background.map(({ value }) => value).join("\n\n") || null,
    languages: normalizeTechnologies(
      result.languages.map(({ value }) => value),
      LANGUAGES,
    ),
    stack: normalizeTechnologies(
      result.technologies.map(({ value }) => value),
      STACK,
    ),
    projects: result.projects.map((project) => ({
      name: project.name.value,
      technologies: normalizeTechnologies(
        project.technologies.map(({ value }) => value),
      ),
      contribution: project.contribution.value,
    })),
  };
  if (!supportedValues.length)
    warnings.push(
      "No supported developer details were found. You can enter them manually.",
    );
  if (draft.projects.length === 10)
    warnings.push(
      "The draft contains the maximum of ten projects. Review which ones to keep.",
    );
  return { draft, warnings };
}
