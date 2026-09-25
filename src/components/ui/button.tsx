import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-semibold transition-[opacity,transform,background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-[#184a37] shadow-[0_1px_0_rgba(255,255,255,0.14)_inset,0_8px_18px_-10px_rgba(31,92,69,0.8)]",
        sun: "bg-sun text-night hover:brightness-105 shadow-[0_8px_18px_-10px_rgba(234,165,48,0.9)]",
        secondary: "bg-bg-elevated text-ink border border-line hover:border-line-strong",
        ghost: "text-ink-soft hover:bg-bg-subtle",
        danger: "bg-bad text-accent-fg hover:opacity-95",
        dark: "bg-night text-accent-fg hover:bg-ink",
      },
      size: {
        sm: "h-9 px-3 text-sm rounded-[10px]",
        md: "h-11 px-4 text-[15px] rounded-[12px]",
        lg: "h-13 px-5 text-base rounded-[14px] min-h-[52px]",
        icon: "size-10 rounded-full",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  block,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size, block }), className)} {...props} />;
}
