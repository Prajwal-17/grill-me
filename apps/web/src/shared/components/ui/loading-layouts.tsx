import { Skeleton, LoadingRegion } from "./skeleton";

const rows = [0, 1, 2, 3];

export function CollectionSkeleton({ kind }: { kind: "quizzes" | "logs" }) {
  const quiz = kind === "quizzes";
  const columns = quiz
    ? [
        "",
        "w-20",
        "w-32",
        "w-16",
        "hidden w-20 @[850px]/quiz-list:table-column",
        "w-28",
      ]
    : [
        "w-[34%]",
        "w-[19%]",
        "w-[92px]",
        "w-[82px]",
        "hidden w-[82px] lg:table-column",
        "w-[82px]",
        "hidden w-[138px] xl:table-column",
      ];
  const labels = quiz
    ? ["Quiz", "Difficulty", "Progress", "Score", "Created", ""]
    : ["Request", "Model", "Status", "Tokens", "Cost", "Latency", "Started"];
  const cellClass = (i: number) =>
    quiz
      ? i === 4
        ? "hidden @[850px]/quiz-list:table-cell"
        : ""
      : i === 4
        ? "hidden lg:table-cell"
        : i === 6
          ? "hidden xl:table-cell"
          : "";
  return (
    <LoadingRegion
      label={`Loading ${kind}…`}
      layout={kind}
      className="min-w-0 overflow-auto bg-surface"
    >
      <table
        aria-hidden="true"
        className={
          quiz
            ? "hidden w-full table-fixed @[640px]/quiz-list:table"
            : "w-full min-w-[680px] table-fixed"
        }
      >
        <colgroup>
          {columns.map((column, i) => (
            <col key={i} className={column} />
          ))}
        </colgroup>
        <thead className="border-b border-line bg-panel text-left text-metadata text-muted">
          <tr>
            {labels.map((label, i) => (
              <th key={i} className={`px-3 py-2 font-normal ${cellClass(i)}`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row}>
              {columns.map((_, i) => (
                <td key={i} className={`px-3 py-3 ${cellClass(i)}`}>
                  <div className="space-y-2">
                    <Skeleton
                      className={`h-4 ${i === 0 ? (row % 2 ? "w-3/5" : "w-4/5") : "w-3/4"}`}
                    />
                    {(i === 0 || (!quiz && i === 1)) && (
                      <Skeleton className="h-3 w-1/2" />
                    )}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {quiz && (
        <div className="divide-y divide-line @[640px]/quiz-list:hidden">
          {rows.map((row) => (
            <div key={row} className="space-y-3 p-3">
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      )}
    </LoadingRegion>
  );
}

export function PreferencesSkeleton() {
  return (
    <LoadingRegion
      label="Loading preferences…"
      layout="preferences"
      className="mx-auto w-full max-w-[1100px] p-4 md:p-6"
    >
      <div className="grid min-w-0 gap-6 md:grid-cols-[160px_minmax(0,1fr)] md:gap-8">
        <div className="flex gap-1 border-b border-line pb-2 md:flex-col md:border-0">
          {rows.map((i) => (
            <Skeleton key={i} className="h-9 w-20 md:w-full" />
          ))}
        </div>
        <div className="min-w-0 max-w-[760px]">
          <div className="flex h-12 items-start justify-between border-b border-line">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-8 w-28" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="grid gap-2 border-b border-line py-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-6"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className={i === 4 ? "h-24" : "h-11 md:h-9"} />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

export function BuildSkeleton() {
  return (
    <LoadingRegion label="Loading build…" layout="build" className="w-full">
      <div className="flex h-11 items-center gap-6 border-b border-line px-4">
        {rows.map((i) => (
          <Skeleton key={i} className="h-4 w-16" />
        ))}
      </div>
      <div className="mx-auto max-w-[928px] space-y-7 p-4 md:p-6">
        <div className="flex items-center gap-2 border-b border-line pb-6">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="ml-auto h-8 w-28" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
        <Skeleton className="h-8 w-40" />
      </div>
    </LoadingRegion>
  );
}

export function RecentBuildsSkeleton() {
  return (
    <LoadingRegion
      label="Loading recent builds…"
      layout="recent-builds"
      className="mt-10"
    >
      <div className="mb-3 flex justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="divide-y divide-line border-y border-line">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-3.5">
            <Skeleton className="size-3.5" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function CodeSkeleton({ label = "Loading file…" }: { label?: string }) {
  return (
    <LoadingRegion
      label={label}
      layout="code"
      className="min-h-56 space-y-3 p-4"
    >
      {[80, 60, 90, 45, 70, 55, 85, 35].map((width, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-3 w-4 shrink-0" />
          <Skeleton className="h-3" style={{ width: `${width}%` }} />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function LogDetailSkeleton() {
  return (
    <LoadingRegion label="Loading request…" layout="log-detail">
      <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 border-b border-line pb-6 md:grid-cols-4">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-28 max-w-full" />
          </div>
        ))}
      </div>
      <div className="flex gap-6 border-b border-line pb-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-5 w-20" />
        ))}
      </div>
      <div className="mt-5 space-y-3">
        {rows.map((i) => (
          <Skeleton key={i} className={i % 2 ? "h-4 w-3/5" : "h-4 w-4/5"} />
        ))}
      </div>
    </LoadingRegion>
  );
}

export function QuizDetailSkeleton() {
  return (
    <LoadingRegion
      label="Loading quiz…"
      layout="quiz-detail"
      className="min-h-0 flex-1 space-y-5 overflow-y-auto"
    >
      <Skeleton className="h-7 w-3/5" />
      <div className="h-1 bg-line" />
      <div className="grid gap-5 @[850px]/quiz:grid-cols-[minmax(0,74ch)_196px]">
        <div className="space-y-4">
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-6 w-3/5" />
          {rows.map((i) => (
            <div
              key={i}
              className="flex min-h-14 items-center gap-3 rounded-md border border-line p-3"
            >
              <Skeleton className="size-7 shrink-0" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
        <div className="space-y-3 border-t border-line pt-3 @[850px]/quiz:border-t-0 @[850px]/quiz:border-l @[850px]/quiz:pl-5">
          <Skeleton className="h-4 w-28" />
          <div className="grid grid-cols-5 gap-2 @[850px]/quiz:grid-cols-2">
            {rows.map((i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}

export function ReviewSkeleton() {
  return (
    <LoadingRegion
      label="Loading submissions…"
      layout="reviews"
      className="mx-auto w-full max-w-[900px] space-y-6 px-5 py-6 md:px-10"
    >
      <Skeleton className="ml-auto h-8 w-52" />
      <div className="space-y-3 border-b border-line pb-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </LoadingRegion>
  );
}
