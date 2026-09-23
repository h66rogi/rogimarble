import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/shared/lib/utils";

const cardVariants = cva(
  "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
  {
    variants: {
      variant: {
        default: "",
        featured: "border-2 border-primary bg-primary/5 shadow-none",
        floating:
          "relative isolate gap-0 rounded-2xl border-border/80 bg-card/60 px-4 py-4 shadow-none backdrop-blur-2xl sm:px-5",
        "floating-warning":
          "relative isolate gap-0 rounded-2xl border-warning/70 bg-warning-background/60 px-4 py-4 text-warning shadow-none ring-2 ring-warning/30 backdrop-blur-2xl sm:px-5",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Card({
  className,
  variant,
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  const floating = variant === "floating" || variant === "floating-warning";
  return (
    <div
      data-slot="card"
      data-variant={variant ?? "default"}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    >
      {floating && (
        <span
          aria-hidden="true"
          data-slot="card-frosted-backdrop"
          className="pointer-events-none absolute -inset-5 -z-10 rounded-3xl bg-background/20 backdrop-blur-3xl"
        />
      )}
      {children}
    </div>
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
