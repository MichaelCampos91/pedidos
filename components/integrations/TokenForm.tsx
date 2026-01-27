"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Save, X, ExternalLink } from "lucide-react"
import type { IntegrationProvider, IntegrationEnvironment, TokenType, IntegrationToken } from "@/lib/integrations-types"

interface TokenFormProps {
  provider: IntegrationProvider
  token?: IntegrationToken | null
  onSave: (data: {
    provider: IntegrationProvider
    environment: IntegrationEnvironment
    token_value?: string
    token_type?: TokenType
    client_id?: string
    client_secret?: string
    cep_origem?: string
    public_key?: string
    additional_data?: Record<string, any>
  }) => Promise<void>
  onCancel: () => void
  isSaving?: boolean
}

export function TokenForm({ provider, token, onSave, onCancel, isSaving = false }: TokenFormProps) {
  const isMelhorEnvio = provider === 'melhor_envio'
  const isPagarme = provider === 'pagarme'
  
  // Detectar modo baseado no token existente
  const hasOAuth2Data = token?.additional_data?.client_id || token?.additional_data?.refresh_token
  const [authMode, setAuthMode] = useState<'oauth2' | 'token'>(
    isMelhorEnvio && (hasOAuth2Data || !token) ? 'oauth2' : 'token'
  )

  const [formData, setFormData] = useState({
    environment: (token?.environment || 'production') as IntegrationEnvironment,
    token_value: token?.token_value && !token.token_value.startsWith('****') 
      ? token.token_value 
      : '',
    token_type: (token?.token_type || 'bearer') as TokenType,
    client_id: token?.additional_data?.client_id || '',
    client_secret: '', // Nunca mostrar secret salvo por segurança
    cep_origem: token?.additional_data?.cep_origem || '',
    public_key: token?.additional_data?.public_key || '', // Para Pagar.me
  })

  const [isAuthorizing, setIsAuthorizing] = useState(false)

  const handleAuthorize = async () => {
    if (!formData.client_id && !token?.additional_data?.client_id) {
      alert('Configure o Client ID primeiro antes de autorizar')
      return
    }

    setIsAuthorizing(true)
    try {
      const clientId = formData.client_id || token?.additional_data?.client_id
      if (!clientId) {
        throw new Error('Client ID não encontrado')
      }

      // Primeiro, salvar client_id se ainda não estiver salvo
      if (!token && formData.client_id) {
        await onSave({
          provider,
          environment: formData.environment,
          client_id: formData.client_id,
          cep_origem: formData.cep_origem || undefined,
        })
      }

      // Obter URL de autorização
      const response = await fetch(
        `/api/integrations/melhor-envio/authorize?environment=${formData.environment}`
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao gerar URL de autorização')
      }

      const data = await response.json()
      
      // Redirecionar para URL de autorização
      window.location.href = data.authorization_url
    } catch (error: any) {
      alert(`Erro ao iniciar autorização: ${error.message}`)
      setIsAuthorizing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (isMelhorEnvio && authMode === 'oauth2') {
      // Modo OAuth2
      if (!formData.client_id) {
        alert('Client ID é obrigatório para OAuth2')
        return
      }
      
      // Se está criando novo, client_secret é obrigatório
      if (!token && !formData.client_secret) {
        alert('Client Secret é obrigatório ao criar nova integração OAuth2')
        return
      }
      
      const saveData: any = {
        provider,
        environment: formData.environment,
        client_id: formData.client_id,
        cep_origem: formData.cep_origem || undefined,
      }
      
      // Enviar client_secret apenas se fornecido (para criar novo ou atualizar)
      // Se não fornecido e está editando, o backend buscará do banco
      if (formData.client_secret) {
        saveData.client_secret = formData.client_secret
      }
      
      // Incluir public_key se for Pagar.me
      if (isPagarme && formData.public_key) {
        saveData.public_key = formData.public_key
      }
      
      await onSave(saveData)
    } else {
      // Modo token direto (legacy)
      if (!formData.token_value) {
        alert('Token é obrigatório')
        return
      }
      
      await onSave({
        provider,
        environment: formData.environment,
        token_value: formData.token_value,
        token_type: formData.token_type,
        cep_origem: formData.cep_origem || undefined,
        public_key: isPagarme && formData.public_key ? formData.public_key : undefined,
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {token ? 'Editar' : 'Adicionar'} Token - {provider.replace('_', ' ').toUpperCase()}
        </CardTitle>
        <CardDescription>
          {isMelhorEnvio 
            ? 'Configure a autenticação OAuth2 (recomendado) ou token direto para o ambiente selecionado'
            : `Configure o token para o ambiente ${formData.environment === 'sandbox' ? 'Sandbox' : 'Produção'}`
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="environment">Ambiente</Label>
            <select
              id="environment"
              value={formData.environment}
              onChange={(e) => setFormData({ ...formData, environment: e.target.value as IntegrationEnvironment })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              disabled={!!token}
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Produção</option>
            </select>
          </div>

          {isMelhorEnvio && (
            <div className="space-y-2">
              <Label htmlFor="authMode">Método de Autenticação</Label>
              <select
                id="authMode"
                value={authMode}
                onChange={(e) => setAuthMode(e.target.value as 'oauth2' | 'token')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={!!token}
              >
                <option value="oauth2">OAuth2 (Recomendado - Renovação automática)</option>
                <option value="token">Token Direto (Legacy)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                OAuth2 renova tokens automaticamente. Token direto requer renovação manual.
              </p>
            </div>
          )}

          {isMelhorEnvio && authMode === 'oauth2' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="client_id">Client ID *</Label>
                <Input
                  id="client_id"
                  type="text"
                  value={formData.client_id}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  placeholder="Seu Client ID do Melhor Envio"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Obtenha em: {formData.environment === 'sandbox' 
                    ? 'https://app-sandbox.melhorenvio.com.br/integracoes/area-dev'
                    : 'https://melhorenvio.com.br/integracoes/area-dev'
                  }
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  URL de redirecionamento (configure no app do Melhor Envio): 
                  <br />
                  <code className="text-xs bg-muted px-1 py-0.5 rounded mt-1 inline-block">
                    https://pedidos.lojacenario.com.br/api/auth/callback/melhor-envio
                  </code>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="client_secret">
                  Client Secret {token && token.additional_data?.client_secret ? '(deixe em branco para manter o atual)' : '*'}
                </Label>
                <Input
                  id="client_secret"
                  type="password"
                  value={formData.client_secret}
                  onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                  placeholder={token && token.additional_data?.client_secret 
                    ? "Deixe em branco para manter o atual ou digite um novo"
                    : "Seu Client Secret do Melhor Envio"
                  }
                  required={authMode === 'oauth2' && !token}
                />
                <p className="text-xs text-muted-foreground">
                  {token && token.additional_data?.client_secret
                    ? "Deixe em branco para manter o Client Secret atual, ou digite um novo para atualizar."
                    : "Mantenha o Client Secret seguro e nunca o compartilhe."
                  }
                </p>
              </div>

              {/* Botão de autorização OAuth2 */}
              {(token?.additional_data?.client_id || formData.client_id) && (
                <div className="space-y-2 pt-2 border-t">
                  <Label>Autorização OAuth2</Label>
                  <p className="text-xs text-muted-foreground">
                    Para obter tokens com todas as permissões (recomendado), autorize o app no Melhor Envio.
                    Isso solicitará as permissões necessárias (shipping-calculate, shipping-read).
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAuthorize}
                    disabled={isAuthorizing || isSaving}
                    className="w-full"
                  >
                    {isAuthorizing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Redirecionando...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Autorizar App no Melhor Envio
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Após autorizar, você será redirecionado de volta e o token será salvo automaticamente.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="token_value">Token *</Label>
                <Input
                  id="token_value"
                  type="password"
                  value={formData.token_value}
                  onChange={(e) => setFormData({ ...formData, token_value: e.target.value })}
                  placeholder="Cole o token aqui"
                  required={authMode === 'token'}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="token_type">Tipo de Token</Label>
                <select
                  id="token_type"
                  value={formData.token_type}
                  onChange={(e) => setFormData({ ...formData, token_type: e.target.value as TokenType })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="bearer">Bearer</option>
                  <option value="basic">Basic</option>
                  <option value="api_key">API Key</option>
                </select>
              </div>
            </>
          )}

          {isMelhorEnvio && (
            <div className="space-y-2">
              <Label htmlFor="cep_origem">CEP de Origem (Opcional)</Label>
              <Input
                id="cep_origem"
                type="text"
                value={formData.cep_origem}
                onChange={(e) => setFormData({ ...formData, cep_origem: e.target.value.replace(/\D/g, '') })}
                placeholder="00000000"
                maxLength={8}
              />
              <p className="text-xs text-muted-foreground">
                CEP de onde os produtos serão enviados. Se não informado, será usado o CEP padrão configurado.
              </p>
            </div>
          )}

          {isPagarme && (
            <div className="space-y-2">
              <Label htmlFor="public_key">
                Public Key {token && token.additional_data?.public_key ? '(deixe em branco para manter o atual)' : '(Opcional - para tokenização de cartão)'}
              </Label>
              <Input
                id="public_key"
                type="password"
                value={formData.public_key}
                onChange={(e) => setFormData({ ...formData, public_key: e.target.value })}
                placeholder={token && token.additional_data?.public_key 
                  ? "Deixe em branco para manter o atual ou digite uma nova"
                  : "pk_live_... ou pk_test_..."
                }
              />
              <p className="text-xs text-muted-foreground">
                {token && token.additional_data?.public_key
                  ? "Deixe em branco para manter a Public Key atual, ou digite uma nova para atualizar."
                  : "Chave pública para tokenização de cartões no frontend. Encontre no painel do Pagar.me em Configurações → Chaves de API. A Public Key é diferente da API Key (Secret Key) e é necessária para que pagamentos com cartão funcionem. Se não configurada, a tokenização de cartão não funcionará."
                }
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                <strong>Onde encontrar:</strong> No painel do Pagar.me, acesse Configurações → Chaves de API. 
                Você verá duas chaves: <strong>API Key</strong> (Secret Key - usada no backend) e <strong>Public Key</strong> (usada para tokenização no frontend).
                A Public Key começa com <code className="text-xs bg-muted px-1 py-0.5 rounded">pk_live_</code> (produção) ou <code className="text-xs bg-muted px-1 py-0.5 rounded">pk_test_</code> (sandbox).
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
