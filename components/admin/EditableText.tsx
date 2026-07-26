"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const baseClass =
  "w-full rounded-sm border-0 bg-transparent p-0 outline-none transition-colors " +
  "placeholder:text-[#b0a488] hover:bg-[var(--card-line)]/25 " +
  "focus:bg-transparent focus:ring-0 " +
  "focus:border-b focus:border-dashed focus:border-[var(--card-line)]";

export type EditableTextProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  multiline?: boolean;
  required?: boolean;
  ariaLabel: string;
};

export function EditableText({
  value,
  onChange,
  placeholder,
  className,
  multiline = false,
  required = false,
  ariaLabel,
}: EditableTextProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, multiline]);

  if (multiline) {
    return (
      <textarea
        ref={textareaRef}
        rows={1}
        aria-label={ariaLabel}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(baseClass, "resize-none overflow-hidden", className)}
      />
    );
  }

  return (
    <input
      type="text"
      aria-label={ariaLabel}
      required={required}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(baseClass, className)}
    />
  );
}
