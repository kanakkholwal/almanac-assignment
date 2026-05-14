import * as React from "react";

import { cn } from "@/lib/utils";

export function Kbd({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-pill border border-border bg-transparent px-1.5",
        "font-mono text-[10px] uppercase leading-none tracking-[0.08em] text-foreground/70",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
