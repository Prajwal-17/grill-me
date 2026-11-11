import type { ReactNode } from "react";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-supporting font-medium"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-supporting text-muted">{hint}</p>}
    </div>
  );
}
