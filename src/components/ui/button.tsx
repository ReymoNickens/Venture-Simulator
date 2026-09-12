import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-[opacity,transform,background-color,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg hover:opacity-95 shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]",
        secondary:
          "bg-bg-elevated text-ink border border-line hover:border-line-strong",
        ghost: "text-ink-soft hover:bg-bg-subtle",
        danger: "bg-bad text-accent-fg hover:opacity-95",
      },
      size: {
        md: "h-11 px-4 text-sm rounded-[10px]",
        lg: "h-12 px-5 text-sm rounded-[12px]",
        sm: "h-9 px-3 text-sm rounded-[8px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
