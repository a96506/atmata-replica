export type ValidationError = {
  field: string;
  message: string;
};

export function ValidationSummary({
  errors,
  title = "Fix the following before submitting:",
}: {
  errors: ValidationError[];
  title?: string;
}) {
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
    >
      <div className="font-medium">{title}</div>
      <ul className="mt-2 list-disc space-y-0.5 pl-5">
        {errors.map((e, i) => (
          <li key={`${e.field}-${i}`}>
            <span className="font-mono text-xs">{e.field}</span> — {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
