import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold ring-offset-background transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-purple text-primary-foreground hover:bg-purple/90 active:bg-purple/80 shadow-sm",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-border bg-card text-foreground hover:bg-muted",
        secondary: "bg-muted text-foreground border border-border hover:bg-border",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-purple underline-offset-4 hover:underline",
        icon: "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        hero: "bg-purple text-primary-foreground hover:bg-purple/90 active:bg-purple/80 shadow-sm text-base",
      },
      size: {
        default: "h-10 px-5 py-2.5 text-sm",
        sm: "h-9 px-4 py-2 text-sm",
        lg: "h-11 px-6 py-3 text-sm",
        xl: "h-12 px-8 py-3 text-base",
        icon: "h-9 w-9",
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
