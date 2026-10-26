import { useEffect, useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import {
  applyResumeDraft,
  optionLabel,
  LANGUAGES,
  STACK,
  type ResumeDraft,
  type ResumeField,
  type ResumePreview,
} from "@repo/preferences";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { previewResume } from "../api/profile-api";
import { DeveloperProjects } from "./developer-projects";
import type { PreferenceValues } from "./preferences-fields";

const fields: ResumeField[] = [
  "displayName",
  "aboutMe",
  "languages",
  "stack",
  "projects",
];
const labels: Record<ResumeField, string> = {
  displayName: "Name",
  aboutMe: "Background",
  languages: "Languages",
  stack: "Stack",
  projects: "Projects",
};
const hasValue = (value: ResumeDraft[ResumeField]) =>
  Array.isArray(value) ? value.length > 0 : Boolean(value?.trim());
export function ResumeImport({
  profileId,
  values,
  onApply,
  disabled,
}: {
  profileId: string;
  values: PreferenceValues;
  onApply: (values: PreferenceValues) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<ResumePreview | null>(null);
  const [draft, setDraft] = useState<ResumeDraft | null>(null);
  const [selected, setSelected] = useState<ResumeField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  function close(next: boolean) {
    if (!next) {
      active.current?.abort();
      active.current = null;
      setPending(false);
      setPreview(null);
      setDraft(null);
      setError(null);
      setText("");
    }
    setOpen(next);
  }
  async function extract(input: string | File) {
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    setPending(true);
    setError(null);
    try {
      const result = await previewResume(profileId, input, controller.signal);
      if (controller.signal.aborted || active.current !== controller) return;
      setPreview(result);
      setDraft(result.draft);
      setSelected(
        fields.filter(
          (key) => !hasValue(values[key]) && hasValue(result.draft[key]),
        ),
      );
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Resume extraction failed. Try again or edit your profile manually.",
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }
  function edit<K extends ResumeField>(key: K, value: ResumeDraft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          <FileUp size={15} />
          Import resume
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {draft
              ? "Review resume draft"
              : pending
                ? "Extracting resume"
                : "Import resume"}
          </DialogTitle>
          <DialogDescription>
            {draft
              ? "Select details to apply to your editable form. Use Save preferences afterward to persist them."
              : "Prefill your developer profile, then review the details before saving."}
          </DialogDescription>
        </DialogHeader>
        {!pending && !draft && (
          <div className="grid gap-5">
            <label className="grid gap-2 text-sm font-medium">
              Choose a document
              <span className="text-xs font-normal text-muted">
                PDF or DOCX · up to 10 MiB · PDFs up to 30 pages
              </span>
              <Input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void extract(file);
                  event.target.value = "";
                }}
              />
            </label>
            <div className="grid gap-3 border-t border-line pt-5">
              <label className="grid gap-2 text-sm font-medium">
                Or paste resume text
                <Textarea
                  rows={7}
                  value={text}
                  maxLength={100000}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Paste 40–100,000 characters of resume text"
                />
              </label>
              <Button
                type="button"
                className="justify-self-start"
                disabled={text.trim().length < 40}
                onClick={() => void extract(text)}
              >
                Extract from text
              </Button>
            </div>
          </div>
        )}
        {pending && (
          <div
            role="status"
            className="flex flex-col items-center gap-3 py-8 text-center"
          >
            <LoaderCircle size={24} className="animate-spin text-muted" />
            <p className="text-sm">Preparing your developer profile draft…</p>
            <p className="text-xs leading-5 text-muted">
              You can cancel and continue editing manually.
            </p>
            <Button
              type="button"
              onClick={() => {
                active.current?.abort();
                active.current = null;
                setPending(false);
              }}
            >
              Cancel extraction
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm leading-6 text-destructive">
            {error}
          </p>
        )}
        {draft && (
          <div className="grid gap-5">
            {preview?.warnings.map((warning) => (
              <p
                key={warning}
                role="status"
                className="text-sm leading-6 text-warning"
              >
                {warning}
              </p>
            ))}
            {fields.map((key) => (
              <section
                key={key}
                className="grid gap-3 border-t border-line pt-4"
              >
                <label className="flex items-start gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="mt-1 accent-foreground"
                    checked={selected.includes(key)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, key]
                          : selected.filter((value) => value !== key),
                      )
                    }
                  />
                  <span>
                    {labels[key]}
                    <span className="mt-1 block text-xs font-normal text-muted">
                      {key === "languages" ||
                      key === "stack" ||
                      key === "projects"
                        ? "Merges with existing entries"
                        : hasValue(values[key])
                          ? "Replaces the current form value"
                          : "Fills an empty field"}
                    </span>
                  </span>
                </label>
                {key === "displayName" ? (
                  <Input
                    aria-label="Draft name"
                    value={draft.displayName ?? ""}
                    maxLength={120}
                    onChange={(event) =>
                      edit("displayName", event.target.value || null)
                    }
                  />
                ) : key === "aboutMe" ? (
                  <Textarea
                    aria-label="Draft background"
                    value={draft.aboutMe ?? ""}
                    maxLength={4000}
                    rows={4}
                    onChange={(event) =>
                      edit("aboutMe", event.target.value || null)
                    }
                  />
                ) : key === "projects" ? (
                  <DeveloperProjects
                    value={draft.projects}
                    onChange={(value) => edit("projects", value)}
                  />
                ) : (
                  <label className="grid gap-2 text-xs text-muted">
                    One technology per line
                    <Textarea
                      aria-label={`Draft ${labels[key].toLowerCase()}`}
                      value={draft[key]
                        .map((value) =>
                          optionLabel(
                            key === "languages" ? LANGUAGES : STACK,
                            value,
                          ),
                        )
                        .join("\n")}
                      rows={3}
                      onChange={(event) =>
                        edit(key, event.target.value.split("\n"))
                      }
                    />
                  </label>
                )}
              </section>
            ))}
            {selected.includes("projects") &&
              values.projects.length + draft.projects.length > 10 && (
                <p className="text-xs leading-5 text-warning">
                  Your existing projects stay first. Only entries that fit
                  within the ten-project limit will be added.
                </p>
              )}
            <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                  setPreview(null);
                }}
              >
                Choose another resume
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={
                  !selected.length ||
                  (selected.includes("projects") &&
                    draft.projects.some(
                      (project) =>
                        !project.name.trim() ||
                        !project.contribution.trim() ||
                        project.technologies.filter((value) => value.trim())
                          .length > 20,
                    ))
                }
                onClick={() => {
                  onApply(
                    applyResumeDraft(
                      values,
                      {
                        ...draft,
                        languages: draft.languages.filter((value) =>
                          value.trim(),
                        ),
                        stack: draft.stack.filter((value) => value.trim()),
                        projects: draft.projects.map((project) => ({
                          ...project,
                          technologies: project.technologies
                            .map((value) => value.trim())
                            .filter(Boolean),
                        })),
                      },
                      selected,
                    ),
                  );
                  close(false);
                }}
              >
                Apply selected details
              </Button>
            </div>
          </div>
        )}
        <p className="border-t border-line pt-4 text-xs leading-5 text-muted">
          Extracted text is sent to your configured AI provider and can appear
          in existing AI logs. Uploaded files are not retained. Scanned PDFs
          need readable text; OCR is not included.
        </p>
      </DialogContent>
    </Dialog>
  );
}
