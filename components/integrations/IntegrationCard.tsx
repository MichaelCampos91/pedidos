"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TokenStatusBadge } from "./TokenStatusBadge"
import { EnvironmentBadge } from "./EnvironmentBadge"
import { TokenForm } from "./TokenForm"
import { 
  Plus, 
  Edit, 
  Trash2, 
  TestTube, 
  Loader2, 
  Link2,
  CheckCircle2,
  AlertCircle
} from "lucide-react"
import { formatDateTime } from "@/lib/utils"
import type { IntegrationProvider, IntegrationToken, IntegrationEnvironment } from "@/lib/integrations-types"

interface IntegrationCardProps {
  provider: IntegrationProvider
  providerLabel: string
  sandboxToken?: IntegrationToken
  productionToken?: IntegrationToken
  onEdit: (token: IntegrationToken) => void
  onDelete: (token: IntegrationToken) => void
  onValidate: (token: IntegrationToken) => Promise<void>
  onAdd: (provider: IntegrationProvider, environment: IntegrationEnvironment) => void
  onSave: (data: {
    provider: IntegrationProvider
    environment: IntegrationEnvironment
    token_value?: string
    token_type?: string
    client_id?: string
    client_secret?: string
    cep_origem?: string
    additional_data?: Record<string, any>
  }) => Promise<void>
  isValidating?: string | null
  isSaving?: boolean
  icon?: React.ReactNode
}

export function IntegrationCard({
  provider,
  providerLabel,
  sandboxToken,
  productionToken,
  onEdit,
  onDelete,
  onValidate,
  onAdd,
  onSave,
  isValidating,
  isSaving: externalSaving,
  icon
}: IntegrationCardProps) {
  const [showForm, setShowForm] = useState(false)
  const [formEnvironment, setFormEnvironment] = useState<IntegrationEnvironment>('production')
  const [editingToken, setEditingToken] = useState<IntegrationToken | null>(null)
  const [internalSaving, setInternalSaving] = useState(false)
  
  const saving = externalSaving || internalSaving

  const hasAnyToken = !!sandboxToken || !!productionToken
  const hasBothTokens = !!sandboxToken && !!productionToken

  const handleAddClick = (environment: IntegrationEnvironment) => {
    setFormEnvironment(environment)
    setEditingToken(null)
    setShowForm(true)
  }

  const handleEditClick = (token: IntegrationToken) => {
    setEditingToken(token)
    setFormEnvironment(token.environment)
    setShowForm(true)
  }

  const handleSave = async (data: {
    provider: IntegrationProvider
    environment: IntegrationEnvironment
    token_value?: string
    token_type?: string
    client_id?: string
    client_secret?: string
    cep_origem?: string
    additional_data?: Record<string, any>
  }) => {
    setInternalSaving(true)
    try {
      await onSave(data)
      setShowForm(false)
      setEditingToken(null)
    } catch (error) {
      console.error('Erro ao salvar token:', error)
      throw error
    } finally {
      setInternalSaving(false)
    }
  }

  const TokenRow = ({ 
    token, 
    environment 
  }: { 
    token?: IntegrationToken
    environment: IntegrationEnvironment
  }) => {
    const envLabel = environment === 'sandbox' ? 'Sandbox' : 'Produção'
    const isCurrentlyValidating = isValidating === `${provider}-${environment}`
    const hasToken = !!token

    if (showForm && formEnvironment === environment && (!editingToken || editingToken.environment === environment)) {
      return (
        <div className="col-span-2">
          <TokenForm
            provider={provider}
            token={editingToken}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false)
              setEditingToken(null)
            }}
            isSaving={saving}
          />
        </div>
      )
    }

    if (!hasToken) {
      return (
        <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
          <div className="flex items-center gap-3">
            <EnvironmentBadge environment={environment} />
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {envLabel} não configurado
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure o token para usar este ambiente
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAddClick(environment)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar
          </Button>
        </div>
      )
    }

    const maskedToken = token.token_value.startsWith('****') 
      ? token.token_value 
      : `****${token.token_value.substring(token.token_value.length - 4)}`

    return (
      <div className="p-4 border rounded-lg space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <EnvironmentBadge environment={environment} />
            <TokenStatusBadge status={token.last_validation_status} />
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onValidate(token)}
              disabled={isCurrentlyValidating}
              className="h-8 w-8 p-0"
              title="Testar token"
            >
              {isCurrentlyValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleEditClick(token)}
              disabled={isCurrentlyValidating}
              className="h-8 w-8 p-0"
              title="Editar token"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(token)}
              disabled={isCurrentlyValidating}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              title="Deletar token"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Token</p>
            <p className="text-sm font-mono text-foreground">{maskedToken}</p>
          </div>

          {token.last_validated_at && (
            <div>
              <p className="text-xs text-muted-foreground">
                Última validação: {formatDateTime(new Date(token.last_validated_at))}
              </p>
            </div>
          )}

          {token.last_validation_error && (
            <div className="p-2 rounded-md bg-destructive/10 text-destructive text-xs">
              {token.last_validation_error}
            </div>
          )}

          {token.last_validation_status === 'valid' && (
            <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Token configurado e válido</span>
            </div>
          )}

          {!token.last_validation_status && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Token não testado ainda</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {icon || <Link2 className="h-5 w-5 text-primary" />}
            <div>
              <CardTitle className="text-lg">{providerLabel}</CardTitle>
              <CardDescription className="mt-1">
                {hasAnyToken 
                  ? hasBothTokens 
                    ? 'Ambos os ambientes configurados'
                    : sandboxToken 
                      ? 'Apenas sandbox configurado'
                      : 'Apenas produção configurado'
                  : 'Nenhum token configurado'}
              </CardDescription>
            </div>
          </div>
          {hasAnyToken && (
            <div className="flex items-center gap-1.5">
              {sandboxToken?.last_validation_status === 'valid' && (
                <div className="h-2 w-2 rounded-full bg-green-500" title="Sandbox válido" />
              )}
              {productionToken?.last_validation_status === 'valid' && (
                <div className="h-2 w-2 rounded-full bg-green-500" title="Produção válido" />
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TokenRow token={sandboxToken} environment="sandbox" />
          <TokenRow token={productionToken} environment="production" />
        </div>
      </CardContent>
    </Card>
  )
}
