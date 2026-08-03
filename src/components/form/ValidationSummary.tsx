import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc ps-4">
          {errors.map((e, i) => (
            <li key={`${e.field}-${i}`}>
              <span className="font-mono text-xs">{e.field}</span> — {e.message}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
