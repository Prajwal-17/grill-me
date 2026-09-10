import { Brain, Clock3, Code2, Gauge, Pencil, Target } from "lucide-react";
import Link from "next/link";
import { LoadingIndicator } from "../../../shared/components/ui/feedback";
import type { ProfilePreferences } from "../../../shared/types/api";

function ContextItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-line bg-canvas/45 p-3">
      <span className="mt-0.5 text-brand-bright">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">
          {label}
        </span>
        <span className="mt-1 block break-words text-sm leading-5 text-foreground">
          {value}
        </span>
      </span>
    </div>
  );
}

export function PersonalContextCard({
  preferences,
  loading,
  error,
}: {
  preferences?: ProfilePreferences;
  loading: boolean;
  error?: string;
}) {
  const difficulty = preferences?.difficulty ?? "balanced";

  return (
    <aside className="surface-panel card-lift rounded-2xl p-5 lg:sticky lg:top-20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="grid size-9 place-items-center rounded-xl border border-brand/25 bg-brand/10 text-brand-bright">
            <Brain size={17} />
          </span>
          <h2 className="mt-4 text-base font-semibold tracking-tight">
            Personal context
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            Included with this request before generation.
          </p>
        </div>
        <Link
          href="/preferences"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted transition hover:bg-elevated hover:text-foreground"
        >
          <Pencil size={13} /> Edit
        </Link>
      </div>

      {loading ? (
        <div className="mt-6 rounded-xl border border-line bg-canvas/45 p-4">
          <LoadingIndicator label="Loading your context…" />
        </div>
      ) : error ? (
        <p className="mt-6 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs leading-5 text-red-300">
          Context preview could not be loaded. Generation will still use the
          latest saved profile on the server.
        </p>
      ) : (
        <div className="mt-6 grid gap-2.5">
          <ContextItem
            icon={<Code2 size={15} />}
            label="Level and stack"
            value={
              [preferences?.experienceLevel, preferences?.languagesStack]
                .filter(Boolean)
                .join(" · ") || "Not specified"
            }
          />
          <ContextItem
            icon={<Target size={15} />}
            label="Learning goals"
            value={preferences?.learningGoals || "Open-ended practice"}
          />
          <div className="grid grid-cols-2 gap-2.5">
            <ContextItem
              icon={<Clock3 size={15} />}
              label="Duration"
              value={`${preferences?.preferredDuration ?? 60} min`}
            />
            <ContextItem
              icon={<Gauge size={15} />}
              label="Difficulty"
              value={difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
            />
          </div>

          <div className="mt-1 rounded-xl border border-brand/20 bg-brand-soft/35 p-3.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-bright">
              Your memory
            </span>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted">
              {preferences?.aboutMe ||
                "No About me memory saved yet. You can add one at any time."}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
