import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 font-semibold transition-[transform,box-shadow,background-color,border-color,opacity] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        // A pressed, printed button: solid ink shadow that the press closes.
        primary:
          "border-2 border-ink bg-accent text-accent-fg shadow-[3px_3px_0_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-ink)]",
        gold:
          "border-2 border-ink bg-gold text-ink shadow-[3px_3px_0_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-ink)]",
        secondary:
          "border-2 border-ink/80 bg-bg-elevated text-ink shadow-[2px_2px_0_0_rgba(28,23,18,0.35)] hover:bg-bg active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
        ghost: "text-ink-soft hover:bg-bg-subtle",
        danger:
          "border-2 border-ink bg-clay text-accent-fg shadow-[3px_3px_0_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-ink)]",
      },
      size: {
        md: "h-11 rounded-[8px] px-4 text-sm",
        lg: "h-12 rounded-[10px] px-5 text-[15px]",
        sm: "h-9 rounded-[7px] px-3 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
