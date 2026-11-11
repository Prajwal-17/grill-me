import type { DeveloperProject } from "@repo/backend/shared/preferences";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Button } from "@/shared/components/ui/button";

export function DeveloperProjects({
  value,
  onChange,
  disabled = false,
}: {
  value: DeveloperProject[];
  onChange: (value: DeveloperProject[]) => void;
  disabled?: boolean;
}) {
  function update(index: number, patch: Partial<DeveloperProject>) {
    onChange(
      value.map((project, i) =>
        i === index ? { ...project, ...patch } : project,
      ),
    );
  }
  return (
    <div className="space-y-6">
      {value.map((project, index) => (
        <fieldset
          key={index}
          disabled={disabled}
          className="grid min-w-0 gap-3 border-b border-line pb-5"
        >
          <legend className="sr-only">Project {index + 1}</legend>
          <div className="flex items-end gap-2">
            <label className="grid min-w-0 flex-1 gap-1.5 text-ui">
              Project name
              <Input
                value={project.name}
                required
                maxLength={120}
                onChange={(event) =>
                  update(index, { name: event.target.value })
                }
              />
            </label>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Remove project ${index + 1}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <Trash2 size={15} />
            </Button>
          </div>
          <label className="grid gap-1.5 text-ui">
            Technologies
            <span className="text-metadata text-muted">Comma-separated</span>
            <Input
              value={project.technologies.join(",")}
              maxLength={1600}
              onChange={(event) =>
                update(index, { technologies: event.target.value.split(",") })
              }
            />
          </label>
          <label className="grid gap-1.5 text-ui">
            Your contribution
            <Textarea
              value={project.contribution}
              required
              maxLength={600}
              rows={3}
              onChange={(event) =>
                update(index, { contribution: event.target.value })
              }
            />
          </label>
        </fieldset>
      ))}
      <Button
        type="button"
        disabled={disabled || value.length >= 10}
        onClick={() =>
          onChange([...value, { name: "", technologies: [], contribution: "" }])
        }
      >
        <Plus size={14} />
        Add project
      </Button>
    </div>
  );
}
