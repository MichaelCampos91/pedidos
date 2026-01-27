"use client"

import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = CollapsiblePrimitive.Trigger

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.Content
    ref={ref}
    className={cn(
      "overflow-hidden transition-all duration-200 ease-in-out",
      className
    )}
    {...props}
  />
))
CollapsibleContent.displayName = CollapsiblePrimitive.Content.displayName

const CollapsibleHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    children: React.ReactNode
    isOpen?: boolean
  }
>(({ className, children, isOpen, ...props }, ref) => (
  <CollapsibleTrigger asChild>
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between w-full cursor-pointer hover:bg-muted/50 rounded-lg p-4 transition-colors",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown
        className={cn(
          "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0",
          isOpen && "rotate-180"
        )}
      />
    </div>
  </CollapsibleTrigger>
))
CollapsibleHeader.displayName = "CollapsibleHeader"

export { Collapsible, CollapsibleTrigger, CollapsibleContent, CollapsibleHeader }
