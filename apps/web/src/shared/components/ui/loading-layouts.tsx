import { cn } from "@/shared/lib/cn";
import { Skeleton, LoadingRegion } from "./skeleton";

const rows = [0, 1, 2, 3];

/** Practice feeds and quiz collections share the same two-line row. */
export function PracticeRowsSkeleton({
  label,
  dated = false,
  rowActions = false,
}: {
  label: string;
  dated?: boolean;
  rowActions?: boolean;
}) {
  return (
    <LoadingRegion label={label} layout="practice-rows">
      {dated && (
        <div
          className={cn(
            "flex h-9 items-center border-b border-line",
            rowActions && "px-3 sm:px-4",
          )}
        >
          <Skeleton className="h-3 w-16" />
        </div>
      )}
      {rows.map((row) => (
        <div
          key={row}
          className={cn(
            "flex min-h-15 items-center gap-3 px-3 py-2.5 sm:px-4",
            rowActions && "border-b border-line/60",
          )}
        >
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton
              className={cn("h-4 max-w-120", row % 2 ? "w-4/5" : "w-3/5")}
            />
            <Skeleton className="h-3 w-2/5 max-w-52" />
          </div>
          {rowActions && (
            <>
              {dated && (
                <Skeleton className="hidden h-3 w-12 shrink-0 sm:block" />
              )}
              <Skeleton className="size-4 shrink-0" />
            </>
          )}
        </div>
      ))}
    </LoadingRegion>
  );
}

export function SettingsFormSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label} layout="settings-form" className="w-full">
      <div className="mb-2 flex min-h-10 items-start border-b border-line pb-3">
        <Skeleton className="h-6 w-36" />
      </div>
      {rows.map((row) => (
        <div
          key={row}
          className="grid gap-2 py-3 @min-[600px]:grid-cols-[150px_minmax(0,1fr)] @min-[600px]:gap-6"
        >
          <Skeleton className="h-4 w-24 max-w-full @min-[600px]:mt-1.5" />
          <Skeleton className={cn("h-9", row === 3 && "max-w-64")} />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function BuildSkeleton({ tab }: { tab: string | null }) {
  return (
    <LoadingRegion
      label="Loading challenge"
      layout="build"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-clip min-[1180px]:flex-row"
    >
      <div className="flex h-9 shrink-0 items-center gap-4 px-4 min-[1180px]:h-auto min-[1180px]:w-44 min-[1180px]:flex-col min-[1180px]:items-start min-[1180px]:gap-5 min-[1180px]:px-8 min-[1180px]:pt-8">
        {rows.map((row) => (
          <Skeleton className="h-3.5 w-12 sm:w-16" key={row} />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1152px] px-4 sm:px-6">
          <div className="flex items-center gap-3 pt-4 pb-3 md:pt-5">
            <Skeleton className="h-6 w-3/5 max-w-128" />
            <Skeleton className="ml-auto h-8 w-14 shrink-0" />
          </div>
          <div aria-hidden="true">
            {tab === "review" ? (
              <ReviewSkeleton />
            ) : tab === "activity" || tab === "runs" ? (
              <ActivitySkeleton />
            ) : tab === "quizzes" ? (
              <PracticeRowsSkeleton
                label="Loading challenge quizzes"
                rowActions
              />
            ) : (
              <div className="@container">
                <div className="grid items-start gap-y-4 @min-[680px]:grid-cols-[minmax(0,1fr)_13rem] @min-[680px]:gap-x-8 @min-[1000px]:grid-cols-[minmax(0,1fr)_14rem]">
                  <div className="grid grid-cols-2 gap-x-4 min-[520px]:grid-cols-3 @min-[680px]:col-start-2 @min-[680px]:row-start-1 @min-[680px]:grid-cols-1 @min-[680px]:border-l @min-[680px]:border-line @min-[680px]:pl-4">
                    {[...rows, 4].map((row) => (
                      <div
                        key={row}
                        className="flex flex-col gap-1 py-2 @min-[680px]:flex-row @min-[680px]:justify-between"
                      >
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0 @min-[680px]:col-start-1 @min-[680px]:row-start-1">
                    <div className="max-w-[76ch] space-y-3">
                      <div className="mb-5 flex h-10 items-center border-b border-line pb-2">
                        <Skeleton className="h-3.5 w-28" />
                      </div>
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-11/12" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}

export function BuildProgressSkeleton() {
  return (
    <LoadingRegion
      label="Loading build progress"
      layout="build-progress"
      className="mx-auto w-full max-w-4xl px-4 pt-5 sm:px-6"
    >
      <div className="flex items-start gap-2">
        <Skeleton className="size-8 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      </div>
      <div className="mt-4 mb-4 flex gap-5 border-b border-line pb-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div aria-hidden="true">
        <ActivitySkeleton header={false} />
      </div>
    </LoadingRegion>
  );
}

export function ActivitySkeleton({
  header = true,
  trajectory = false,
}: {
  header?: boolean;
  trajectory?: boolean;
}) {
  return (
    <LoadingRegion
      label={trajectory ? "Loading trajectory" : "Loading activity"}
      layout="activity"
    >
      {header && (
        <div className="mb-3 flex items-center gap-2">
          <Skeleton className="h-8 w-14" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="ml-auto h-8 w-24" />
        </div>
      )}
      {trajectory ? (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-line py-2">
            <Skeleton className="h-3.5 w-1/4" />
            <Skeleton className="h-8 w-2/5 max-w-56" />
          </div>
          {rows.map((row) => (
            <div
              key={row}
              className="flex items-center gap-3 border-b border-line/40 py-3"
            >
              <Skeleton className="h-4 w-16 shrink-0" />
              <Skeleton className={cn("h-3.5", row % 2 ? "w-2/5" : "w-3/5")} />
            </div>
          ))}
        </>
      ) : (
        <div className="space-y-3">
          <div className="ml-auto w-3/4 max-w-xl space-y-2 rounded-xl border border-line bg-surface p-3">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3.5 w-2/5" />
        </div>
      )}
    </LoadingRegion>
  );
}

export function ReviewSkeleton() {
  return (
    <LoadingRegion
      label="Loading reviews"
      layout="review"
      className="max-w-[76ch] space-y-3"
    >
      <Skeleton className="h-4 w-48 max-w-full" />
      {rows.slice(0, 3).map((row) => (
        <div key={row} className="flex items-center gap-2 py-1">
          <Skeleton className="size-3.5 shrink-0 rounded-full" />
          <Skeleton className={cn("h-3.5", row % 2 ? "w-2/3" : "w-4/5")} />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function CodeSkeleton() {
  return (
    <LoadingRegion
      label="Loading file contents"
      layout="code"
      className="min-h-56 space-y-2 overflow-hidden p-4"
    >
      {[
        "w-4/5",
        "w-3/5",
        "w-11/12",
        "w-2/5",
        "w-3/4",
        "w-1/2",
        "w-4/5",
        "w-1/3",
      ].map((width, index) => (
        <div key={index} className="flex min-w-0 items-center gap-4">
          <Skeleton className="h-3 w-4 shrink-0" />
          <Skeleton className={cn("h-3 min-w-0", width)} />
        </div>
      ))}
    </LoadingRegion>
  );
}

/** Quiz attempt geometry is full width, with question navigation beneath it. */
export function QuizDetailSkeleton() {
  return (
    <LoadingRegion
      label="Loading quiz"
      layout="quiz-detail"
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden pb-4">
        <div className="mb-4 flex justify-between gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-5 w-4/5" />
        {rows.map((row) => (
          <div
            key={row}
            className="flex min-h-12 items-center gap-3 rounded-md border border-line px-3"
          >
            <Skeleton className="size-4 shrink-0 rounded-full" />
            <Skeleton className={cn("h-4", row % 2 ? "w-2/3" : "w-3/4")} />
          </div>
        ))}
      </div>
      <div className="flex shrink-0 gap-2 border-t border-line pt-2">
        {rows.map((row) => (
          <Skeleton key={row} className="size-8 shrink-0" />
        ))}
        <Skeleton className="ml-auto h-8 w-20" />
      </div>
    </LoadingRegion>
  );
}
