"use client"

import { Badge } from "@/components/ui/badge"
import type { IntegrationEnvironment } from "@/lib/integrations-types"
import { cn } from "@/lib/utils"

interface EnvironmentBadgeProps {
  environment: IntegrationEnvironment
  className?: string
}

export function EnvironmentBadge({ environment, className }: EnvironmentBadgeProps) {
  return environment === 'sandbox' ? (
    <Badge 
      variant="outline" 
      className={cn("bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800", className)}
    >
      Sandbox
    </Badge>
  ) : (
    <Badge 
      variant="outline" 
      className={cn("bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800", className)}
    >
      Produção
    </Badge>
  )
}
