"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent } from "@/components/ui/dialog"
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
import { toast } from "@/lib/toast"
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
    cep_origem?: string
    public_key?: string
    additional_data?: Record<string, any>
  }) => Promise<void>
  onTokensUpdated?: () => void // Callback para recarregar tokens após salvar
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
  onTokensUpdated,
  isValidating,
  isSaving: externalSaving,
  icon
}: IntegrationCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formEnvironment, setFormEnvironment] = useState<IntegrationEnvironment>('production')
  const [editingToken, setEditingToken] = useState<IntegrationToken | null>(null)
  const [internalSaving, setInternalSaving] = useState(false)
  const [activeEnvironment, setActiveEnvironment] = useState<IntegrationEnvironment | null>(null)
  const [loadingActiveEnv, setLoadingActiveEnv] = useState(true)
  const [connectingBling, setConnectingBling] = useState(false)

  const saving = externalSaving || internalSaving
  const isBling = provider === 'bling'

  const hasAnyToken = !!sandboxToken || !!productionToken
  const hasBothTokens = !!sandboxToken && !!productionToken

  // Buscar ambiente ativo ao montar componente e quando tokens mudarem
  useEffect(() => {
    const fetchActiveEnvironment = async () => {
      if (!hasAnyToken) {
        setLoadingActiveEnv(false)
        return
      }

      try {
        const response = await fetch(`/api/integrations/active-environment?provider=${provider}`, {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          setActiveEnvironment(data.environment || null)
        }
      } catch (error) {
        console.error('Erro ao buscar ambiente ativo:', error)
        // Fallback: usar produção se existir, senão sandbox
        if (productionToken) {
          setActiveEnvironment('production')
        } else if (sandboxToken) {
          setActiveEnvironment('sandbox')
        }
      } finally {
        setLoadingActiveEnv(false)
      }
    }

    fetchActiveEnvironment()
  }, [provider, hasAnyToken, productionToken, sandboxToken])

  // Determinar opções disponíveis para o select
  const getAvailableEnvironments = (): IntegrationEnvironment[] => {
    const envs: IntegrationEnvironment[] = []
    if (sandboxToken) envs.push('sandbox')
    if (productionToken) envs.push('production')
    return envs
  }

  // Determinar ambiente padrão se não houver selecionado
  const getDefaultEnvironment = (): IntegrationEnvironment => {
    if (activeEnvironment) return activeEnvironment
    if (productionToken) return 'production'
    if (sandboxToken) return 'sandbox'
    return 'production'
  }

  const handleEnvironmentChange = async (newEnvironment: IntegrationEnvironment) => {
    try {
      const response = await fetch('/api/integrations/active-environment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, environment: newEnvironment }),
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Erro ao salvar ambiente ativo')
      }

      setActiveEnvironment(newEnvironment)
      toast.success(`Ambiente ${newEnvironment === 'sandbox' ? 'Sandbox' : 'Produção'} definido como ativo`)
    } catch (error: any) {
      toast.error(error.message || 'Erro ao alterar ambiente ativo')
    }
  }

  const handleAddClick = (environment: IntegrationEnvironment) => {
    setFormEnvironment(environment)
    setEditingToken(null)
    setIsModalOpen(true)
  }

  const handleEditClick = (token: IntegrationToken) => {
    setEditingToken(token)
    setFormEnvironment(token.environment)
    setIsModalOpen(true)
  }

  const handleSave = async (data: {
    provider: IntegrationProvider
    environment: IntegrationEnvironment
    token_value?: string
    cep_origem?: string
    public_key?: string
    additional_data?: Record<string, any>
  }) => {
    setInternalSaving(true)
    try {
      await onSave(data)
      setIsModalOpen(false)
      setEditingToken(null)
      // Recarregar tokens e ambiente ativo
      if (onTokensUpdated) {
        await onTokensUpdated()
        // Recarregar ambiente ativo após tokens atualizados
        const response = await fetch(`/api/integrations/active-environment?provider=${provider}`, {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          setActiveEnvironment(data.environment || null)
        }
      } else {
        // Fallback: recarregar página se callback não fornecido
        window.location.reload()
      }
    } catch (error) {
      console.error('Erro ao salvar token:', error)
      throw error
    } finally {
      setInternalSaving(false)
    }
  }

  const handleConnectBling = async () => {
    const env = activeEnvironment || getDefaultEnvironment()
    setConnectingBling(true)
    try {
      const response = await fetch(`/api/integrations/bling/authorize?environment=${env}`, {
        credentials: 'include',
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error(data.error || 'Erro ao obter URL de autorização. Configure Client ID e Client Secret na integração Bling.')
        return
      }
      if (data.authorization_url) {
        window.location.href = data.authorization_url
      } else {
        toast.error('URL de autorização não retornada.')
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao conectar com Bling.')
    } finally {
      setConnectingBling(false)
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
    const isActive = activeEnvironment === environment

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

    // Para Pagar.me, exibir Public Key se existir
    const isPagarme = provider === 'pagarme'
    const publicKey = token.additional_data?.public_key
    const maskedPublicKey = publicKey 
      ? `****${publicKey.substring(publicKey.length - 4)}`
      : null

    return (
      <div className="p-4 border rounded-lg space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <EnvironmentBadge environment={environment} />
            {isActive && (
              <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                Ativo
              </Badge>
            )}
            <TokenStatusBadge status={token.last_validation_status} />
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onValidate(token)}
              disabled={isCurrentlyValidating}
              className="h-8 px-2"
              title="Validar token"
            >
              {isCurrentlyValidating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              <span className="text-xs">Validar</span>
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
            <p className="text-xs text-muted-foreground mb-1">
              {isPagarme ? 'Secret Key' : 'Token'}
            </p>
            <p className="text-sm font-mono text-foreground">{maskedToken}</p>
          </div>

          {isPagarme && maskedPublicKey && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Public Key</p>
              <p className="text-sm font-mono text-foreground">{maskedPublicKey}</p>
            </div>
          )}

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

  const availableEnvironments = getAvailableEnvironments()
  const currentActiveEnv = activeEnvironment || getDefaultEnvironment()

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 flex-1">
              {icon || <Link2 className="h-5 w-5 text-primary" />}
              <div className="flex-1">
                <CardTitle className="text-lg mb-2">{providerLabel}</CardTitle>
                <CardDescription className="mt-1">
                  {isBling
                    ? 'Conecte com Bling para enviar pedidos aprovados. Configure Client ID e Client Secret (Informações do app no Bling) e clique em Conectar com Bling.'
                    : hasAnyToken
                      ? hasBothTokens
                        ? 'Ambos os ambientes configurados'
                        : sandboxToken
                          ? 'Apenas sandbox configurado'
                          : 'Apenas produção configurado'
                      : 'Nenhum token configurado'}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isBling && (
                <Button
                  onClick={handleConnectBling}
                  disabled={connectingBling || saving}
                  size="sm"
                  className="shrink-0"
                >
                  {connectingBling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Redirecionando...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      Conectar com Bling
                    </>
                  )}
                </Button>
              )}
              {hasAnyToken && !loadingActiveEnv && (
                <Select
                  value={currentActiveEnv}
                  onValueChange={(value) => handleEnvironmentChange(value as IntegrationEnvironment)}
                  disabled={availableEnvironments.length === 0}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEnvironments.map((env) => (
                      <SelectItem key={env} value={env}>
                        {env === 'sandbox' ? 'Sandbox' : 'Produção'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TokenRow token={sandboxToken} environment="sandbox" />
            <TokenRow token={productionToken} environment="production" />
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <TokenForm
            provider={provider}
            token={editingToken}
            onSave={handleSave}
            onCancel={() => {
              setIsModalOpen(false)
              setEditingToken(null)
            }}
            isSaving={saving}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
