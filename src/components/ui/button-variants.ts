import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 rounded-full font-bold transition-[transform,box-shadow,background-color,opacity] duration-150 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "border-2 border-ink bg-accent text-accent-fg shadow-[3px_3px_0_var(--color-ink)] hover:brightness-110",
        gold: "border-2 border-ink bg-gold text-ink shadow-[3px_3px_0_var(--color-ink)] hover:brightness-105",
        secondary: "border-2 border-ink bg-bg-elevated text-ink shadow-[3px_3px_0_var(--color-ink)] hover:bg-bg-subtle",
        ghost: "text-ink-soft hover:bg-bg-subtle",
        danger: "border-2 border-ink bg-clay text-white shadow-[3px_3px_0_var(--color-ink)] hover:brightness-105",
      },
      size: {
        md: "h-11 px-5 text-sm",
        lg: "h-13 px-6 text-[15px]",
        sm: "h-9 px-4 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
