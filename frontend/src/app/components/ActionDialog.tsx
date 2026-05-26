import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export type ActionDialogField = {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  helperText?: string;
  options?: Array<{ label: string; value: string }>;
};

type ActionDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  fields?: ActionDialogField[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (values: Record<string, string>) => Promise<void> | void;
};

export default function ActionDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  fields = [],
  onOpenChange,
  onConfirm,
}: ActionDialogProps) {
  const initialValues = useMemo(() => {
    return fields.reduce<Record<string, string>>((accumulator, field) => {
      accumulator[field.name] = field.defaultValue ?? "";
      return accumulator;
    }, {});
  }, [fields]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setError("");
      setSubmitting(false);
    }
  }, [initialValues, open]);

  const updateField = (name: string, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  const handleConfirm = async () => {
    setError("");
    setSubmitting(true);
    try {
      await onConfirm(values);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0B0E14] border-[#1e2532] text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">{title}</DialogTitle>
          {description ? <DialogDescription className="text-gray-400">{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="space-y-3">
          {fields.map((field) => (
            <label key={field.name} className="block space-y-1">
              <span className="text-sm text-gray-300">{field.label}</span>
              {field.options?.length ? (
                <select
                  value={values[field.name] ?? ""}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  className="w-full bg-[#151921] border border-[#1e2532] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00A3FF]"
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type || "text"}
                  value={values[field.name] ?? ""}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  autoFocus={field.defaultValue == null}
                  className="w-full bg-[#151921] border border-[#1e2532] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#00A3FF]"
                />
              )}
              {field.helperText ? <span className="text-xs text-gray-500">{field.helperText}</span> : null}
            </label>
          ))}
        </div>

        {error && <div className="rounded-lg border border-[#FF4D4D]/20 bg-[#FF4D4D]/10 px-3 py-2 text-sm text-[#FF4D4D]">{error}</div>}

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2.5 rounded-lg border border-[#1e2532] text-gray-300 hover:text-white hover:border-[#00A3FF] transition-colors text-sm"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className={`px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              destructive
                ? "bg-[#FF4D4D] text-white hover:bg-[#ff6666]"
                : "bg-[#00A3FF] text-black hover:bg-[#5bbcff]"
            }`}
          >
            {submitting ? "Working..." : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}