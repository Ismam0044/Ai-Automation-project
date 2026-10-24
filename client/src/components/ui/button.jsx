import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

const buttonStyles = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1016] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[#5eead4] px-4 text-[#07110f] hover:bg-[#91f2e2]",
        secondary: "border border-[#2a3c49] bg-[#15212b] px-4 text-[#d8e5eb] hover:bg-[#1b2b37]",
        ghost: "px-3 text-[#b8c8d1] hover:bg-[#18252f] hover:text-[#f1f8fa]",
        destructive: "border border-red-900/70 bg-red-950/35 px-4 text-red-200 hover:bg-red-950/60",
      },
      size: {
        default: "min-h-10 px-4",
        sm: "min-h-9 px-3 text-xs",
        lg: "min-h-12 px-5",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({ className, variant, size, type = "button", ...props }) {
  return <button className={cn(buttonStyles({ variant, size }), className)} type={type} {...props} />;
}
