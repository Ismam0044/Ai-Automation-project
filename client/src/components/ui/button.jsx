import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

const buttonStyles = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-blue-600 px-4 text-white hover:bg-blue-700",
        secondary: "border border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50",
        ghost: "px-3 text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        destructive: "border border-red-200 bg-red-50 px-4 text-red-800 hover:bg-red-100",
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
