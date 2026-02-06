"use client"

import { useState, useEffect } from "react"
import { IntegrationCard } from "@/components/integrations/IntegrationCard"
import { BlingSyncCard } from "@/components/integrations/BlingSyncCard"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Truck, CreditCard, Package } from "lucide-react"
import type { IntegrationProvider, IntegrationEnvironment, IntegrationToken } from "@/lib/integrations-types"

const PROVIDERS: { value: IntegrationProvider; label: string; icon?: React.ReactNode }[] = [
  { value: 'melhor_envio', label: 'Melhor Envio', icon: <Truck className="h-5 w-5" /> },
  { value: 'pagarme', label: 'Pagar.me', icon: <CreditCard className="h-5 w-5" /> },
  { value: 'bling', label: 'Bling', icon: <Package className="h-5 w-5" /> },
]

type IntegrationTab = 'pagarme' | 'melhor_envio' | 'bling'

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<IntegrationTab>('pagarme')
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
    cep_origem?: string
    public_key?: string
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

  const handleTokensUpdated = async () => {
    // Recarregar tokens após salvar
    await loadTokens()
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as IntegrationTab)} className="w-full">
        <TabsList>
          <TabsTrigger value="pagarme" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Pagar.me
          </TabsTrigger>
          <TabsTrigger value="melhor_envio" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Melhor Envio
          </TabsTrigger>
          <TabsTrigger value="bling" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Bling
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pagarme" className="space-y-4 mt-6">
          <IntegrationCard
            provider="pagarme"
            providerLabel="Pagar.me"
            sandboxToken={getTokensForProvider('pagarme').find(t => t.environment === 'sandbox')}
            productionToken={getTokensForProvider('pagarme').find(t => t.environment === 'production')}
            onEdit={handleEditToken}
            onDelete={handleDeleteToken}
            onValidate={handleValidateToken}
            onAdd={handleAddToken}
            onSave={handleSaveToken}
            onTokensUpdated={handleTokensUpdated}
            isValidating={validating}
            isSaving={saving}
            icon={<CreditCard className="h-5 w-5" />}
          />
        </TabsContent>

        <TabsContent value="melhor_envio" className="space-y-4 mt-6">
          <IntegrationCard
            provider="melhor_envio"
            providerLabel="Melhor Envio"
            sandboxToken={getTokensForProvider('melhor_envio').find(t => t.environment === 'sandbox')}
            productionToken={getTokensForProvider('melhor_envio').find(t => t.environment === 'production')}
            onEdit={handleEditToken}
            onDelete={handleDeleteToken}
            onValidate={handleValidateToken}
            onAdd={handleAddToken}
            onSave={handleSaveToken}
            onTokensUpdated={handleTokensUpdated}
            isValidating={validating}
            isSaving={saving}
            icon={<Truck className="h-5 w-5" />}
          />
        </TabsContent>

        <TabsContent value="bling" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Bling
              </CardTitle>
              <CardDescription>
                Conecte com o Bling para enviar pedidos aprovados e sincronizar categorias, produtos, clientes e pedidos.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <IntegrationCard
                provider="bling"
                providerLabel="Bling"
                productionToken={getTokensForProvider('bling').find(t => t.environment === 'production')}
                onEdit={handleEditToken}
                onDelete={handleDeleteToken}
                onValidate={handleValidateToken}
                onAdd={handleAddToken}
                onSave={handleSaveToken}
                onTokensUpdated={handleTokensUpdated}
                isValidating={validating}
                isSaving={saving}
                icon={<Package className="h-5 w-5" />}
                asSection
                singleEnvironment="production"
              />
              <BlingSyncCard asSection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
