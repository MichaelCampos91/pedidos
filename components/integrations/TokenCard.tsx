"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, AlertCircle, Loader2, Edit, Trash2, TestTube } from "lucide-react"
import { formatDateTime } from "@/lib/utils"
import type { IntegrationToken } from "@/lib/integrations-types"

interface TokenCardProps {
  token: IntegrationToken
  onEdit: (token: IntegrationToken) => void
  onDelete: (token: IntegrationToken) => void
  onValidate: (token: IntegrationToken) => Promise<void>
  isValidating?: boolean
}

export function TokenCard({ token, onEdit, onDelete, onValidate, isValidating = false }: TokenCardProps) {
  const getStatusBadge = () => {
    if (!token.last_validation_status) {
      return (
        <Badge variant="outline" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Não testado
        </Badge>
      )
    }

    switch (token.last_validation_status) {
      case 'valid':
        return (
          <Badge variant="default" className="bg-green-500 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Válido
          </Badge>
        )
      case 'invalid':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Inválido
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Erro
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Pendente
          </Badge>
        )
    }
  }

  const getEnvironmentBadge = () => {
    return token.environment === 'sandbox' ? (
      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
        Sandbox
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        Produção
      </Badge>
    )
  }

  return (
    <Card className="relative">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <CardTitle className="text-lg">{token.provider.replace('_', ' ').toUpperCase()}</CardTitle>
              {getEnvironmentBadge()}
            </div>
            <CardDescription>
              Token: {token.token_value ? (token.token_value.startsWith('****') ? token.token_value : `****${token.token_value.substring(token.token_value.length - 4)}`) : 'Não configurado'}
            </CardDescription>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {token.last_validated_at && (
            <div className="text-sm text-muted-foreground">
              Última validação: {formatDateTime(new Date(token.last_validated_at))}
            </div>
          )}
          
          {token.last_validation_error && (
            <div className="p-2 rounded-md bg-destructive/10 text-destructive text-sm">
              {token.last_validation_error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onValidate(token)}
              disabled={isValidating}
              className="flex-1"
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Testar
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(token)}
              disabled={isValidating}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDelete(token)}
              disabled={isValidating}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
