import * as React from "react";

import { cn } from "@/lib/utils";

export function Kbd({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[20px] min-w-[20px] items-center justify-center rounded border border-white/[0.08] bg-white/[0.05] px-1.5",
        "font-sans text-[10.5px] font-medium leading-none text-foreground/70",
        "shadow-[inset_0_-1px_0_oklch(0_0_0/0.2)]",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
