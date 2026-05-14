import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill border font-sans text-[13px] font-normal",
    "transition-colors duration-150 ease-out",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:shrink-0 [&_svg]:size-[15px]",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-transparent border-border text-foreground hover:bg-white/[0.04]",
        primary:
          "bg-primary border-primary text-primary-foreground hover:bg-white/90",
        outline:
          "bg-transparent border-border text-foreground hover:bg-white/[0.04]",
        secondary:
          "bg-secondary border-transparent text-foreground hover:bg-white/[0.08]",
        ghost:
          "bg-transparent border-transparent text-foreground/85 hover:bg-white/[0.06] hover:text-foreground",
        destructive:
          "bg-transparent border-destructive/60 text-destructive hover:bg-destructive/10",
        link:
          "bg-transparent border-transparent text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-4",
        sm: "h-7 px-3 text-[12px]",
        lg: "h-9 px-5",
        icon: "size-8 px-0",
        "icon-sm": "size-7 px-0 [&_svg]:size-[14px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
