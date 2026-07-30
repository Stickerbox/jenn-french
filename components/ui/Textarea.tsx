import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/field";
import type { TextareaHTMLAttributes } from "react";

export function Textarea({
  className,
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea rows={rows} className={cn(fieldClassName, className)} {...props} />
  );
}
