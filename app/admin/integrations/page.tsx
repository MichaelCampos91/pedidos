"use client"

import { useState, useEffect } from "react"
import { IntegrationCard } from "@/components/integrations/IntegrationCard"
import { Loader2, Truck, CreditCard, Package } from "lucide-react"
import type { IntegrationProvider, IntegrationEnvironment, TokenType, IntegrationToken } from "@/lib/integrations-types"

const PROVIDERS: { value: IntegrationProvider; label: string; icon?: React.ReactNode }[] = [
  { value: 'melhor_envio', label: 'Melhor Envio', icon: <Truck className="h-5 w-5" /> },
  { value: 'pagarme', label: 'Pagar.me', icon: <CreditCard className="h-5 w-5" /> },
  { value: 'bling', label: 'Bling', icon: <Package className="h-5 w-5" /> },
]

export default function IntegrationsPage() {
  const [tokens, setTokens] = useState<IntegrationToken[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadTokens()
    
    // Verificar se há mensagens de sucesso/erro na URL (do callback OAuth2)
    const urlParams = new URLSearchParams(window.location.search)
    const urlError = urlParams.get('error')
    const urlSuccess = urlParams.get('success')
    
    if (urlError) {
      setError(urlError)
      // Limpar URL
      window.history.replaceState({}, '', window.location.pathname)
    }
    
    if (urlSuccess) {
      setSuccess(urlSuccess)
      // Limpar URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const loadTokens = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/integrations/tokens', {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('[Sistema] Erro ao carregar tokens')
      }

      const data = await response.json()
      setTokens(data.tokens || [])
    } catch (err: any) {
      // Manter prefixo se já tiver, caso contrário adicionar [Sistema]
      let errorMsg = err.message || 'Erro ao carregar tokens'
      if (!errorMsg.includes('[')) {
        errorMsg = `[Sistema] ${errorMsg}`
      }
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveToken = async (formData: {
    provider: IntegrationProvider
    environment: IntegrationEnvironment
    token_value?: string
    token_type?: TokenType
    client_id?: string
    client_secret?: string
    cep_origem?: string
    additional_data?: Record<string, any>
  }) => {
    try {
      setSaving(true)
      setError(null)

      const response = await fetch('/api/integrations/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao salvar token')
      }

      await loadTokens()
    } catch (err: any) {
      // Manter prefixo se já tiver
      let errorMsg = err.message || 'Erro ao salvar token'
      if (!errorMsg.includes('[')) {
        errorMsg = `[Sistema] ${errorMsg}`
      }
      setError(errorMsg)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const handleValidateToken = async (token: IntegrationToken) => {
    try {
      setValidating(`${token.provider}-${token.environment}`)
      setError(null)

      const response = await fetch(`/api/integrations/validate/${token.provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment: token.environment }),
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || errorData.message || 'Erro ao validar token')
      }

      await loadTokens()
    } catch (err: any) {
      // Manter prefixo se já tiver
      let errorMsg = err.message || 'Erro ao validar token'
      if (!errorMsg.includes('[')) {
        errorMsg = `[Sistema] ${errorMsg}`
      }
      setError(errorMsg)
    } finally {
      setValidating(null)
    }
  }

  const handleDeleteToken = async (token: IntegrationToken) => {
    if (!confirm(`Tem certeza que deseja deletar o token de ${token.provider} (${token.environment})?`)) {
      return
    }

    try {
      const response = await fetch(`/api/integrations/tokens/${token.provider}?environment=${token.environment}&action=delete`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Erro ao deletar token')
      }

      await loadTokens()
    } catch (err: any) {
      // Manter prefixo se já tiver
      let errorMsg = err.message || 'Erro ao deletar token'
      if (!errorMsg.includes('[')) {
        errorMsg = `[Sistema] ${errorMsg}`
      }
      setError(errorMsg)
    }
  }

  const handleEditToken = (token: IntegrationToken) => {
    // Edit é gerenciado pelo IntegrationCard
  }

  const handleAddToken = (provider: IntegrationProvider, environment: IntegrationEnvironment) => {
    // Add é gerenciado pelo IntegrationCard
  }

  const getTokensForProvider = (provider: IntegrationProvider) => {
    return tokens.filter(t => t.provider === provider)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Integrações</h2>
        <p className="text-muted-foreground">
          Gerencie tokens de autenticação para as integrações do sistema
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-destructive/10 text-destructive border border-destructive/20">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 rounded-md bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
          {success}
        </div>
      )}

      <div className="space-y-4">
        {PROVIDERS.map((provider) => {
          const providerTokens = getTokensForProvider(provider.value)
          const sandboxToken = providerTokens.find(t => t.environment === 'sandbox')
          const productionToken = providerTokens.find(t => t.environment === 'production')

          return (
            <IntegrationCard
              key={provider.value}
              provider={provider.value}
              providerLabel={provider.label}
              sandboxToken={sandboxToken}
              productionToken={productionToken}
              onEdit={handleEditToken}
              onDelete={handleDeleteToken}
              onValidate={handleValidateToken}
              onAdd={handleAddToken}
              onSave={handleSaveToken}
              isValidating={validating}
              isSaving={saving}
              icon={provider.icon}
            />
          )
        })}
      </div>
    </div>
  )
}
