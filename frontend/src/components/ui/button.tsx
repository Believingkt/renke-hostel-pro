import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium shadow-sm ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 touch-manipulation",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        "ghost-destructive": "text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors",
        link: "text-primary underline-offset-4 hover:underline",
        info: "bg-blue-500 text-white hover:bg-blue-600",
        success: "bg-success text-success-foreground hover:bg-success/90",
      },
      size: {
        default: "min-h-[48px] md:h-10 px-5 md:px-4 py-3 md:py-2 text-base md:text-sm [&_svg]:size-5 md:[&_svg]:size-4",
        sm: "min-h-[44px] md:h-9 rounded-lg px-4 md:px-3 py-2.5 md:py-2 text-base md:text-sm [&_svg]:size-5 md:[&_svg]:size-4",
        lg: "min-h-[52px] md:h-11 rounded-lg px-8 md:px-6 py-3.5 md:py-2.5 text-lg md:text-base [&_svg]:size-6 md:[&_svg]:size-5",
        icon: "min-h-[48px] min-w-[48px] md:h-10 md:w-10 [&_svg]:size-5 md:[&_svg]:size-4",
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
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
