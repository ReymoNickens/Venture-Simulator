import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition-[transform,background-color,opacity] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-ink text-white hover:bg-ink/85",
        gold: "bg-gold text-ink hover:brightness-95",
        secondary: "border border-line-strong bg-bg-elevated text-ink hover:border-ink/40",
        ghost: "text-ink-soft hover:bg-bg-subtle",
        danger: "bg-clay text-white hover:brightness-95",
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
