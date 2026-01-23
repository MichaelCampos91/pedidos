"use client"

import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, AlertCircle, AlertTriangle } from "lucide-react"
import type { ValidationStatus } from "@/lib/integrations-types"
import { cn } from "@/lib/utils"

interface TokenStatusBadgeProps {
  status?: ValidationStatus
  className?: string
}

export function TokenStatusBadge({ status, className }: TokenStatusBadgeProps) {
  if (!status || status === 'pending') {
    return (
      <Badge 
        variant="outline" 
        className={cn("gap-1.5 bg-muted/50 text-muted-foreground", className)}
      >
        <AlertCircle className="h-3 w-3" />
        Não testado
      </Badge>
    )
  }

  switch (status) {
    case 'valid':
      return (
        <Badge 
          variant="outline" 
          className={cn("gap-1.5 bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800", className)}
        >
          <CheckCircle2 className="h-3 w-3" />
          Válido
        </Badge>
      )
    case 'invalid':
      return (
        <Badge 
          variant="outline" 
          className={cn("gap-1.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800", className)}
        >
          <XCircle className="h-3 w-3" />
          Inválido
        </Badge>
      )
    case 'error':
      return (
        <Badge 
          variant="outline" 
          className={cn("gap-1.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800", className)}
        >
          <AlertTriangle className="h-3 w-3" />
          Erro
        </Badge>
      )
    default:
      return (
        <Badge 
          variant="outline" 
          className={cn("gap-1.5 bg-muted/50 text-muted-foreground", className)}
        >
          <AlertCircle className="h-3 w-3" />
          Pendente
        </Badge>
      )
  }
}
