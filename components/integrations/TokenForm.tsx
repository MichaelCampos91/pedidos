"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Save, X, Eye, EyeOff } from "lucide-react"
import type { IntegrationProvider, IntegrationEnvironment, IntegrationToken } from "@/lib/integrations-types"
import { toast } from "@/lib/toast"

interface TokenFormProps {
  provider: IntegrationProvider
  token?: IntegrationToken | null
  onSave: (data: {
    provider: IntegrationProvider
    environment: IntegrationEnvironment
    token_value?: string
    cep_origem?: string
    public_key?: string
    additional_data?: Record<string, any>
  }) => Promise<void>
  onCancel: () => void
  isSaving?: boolean
}

const BLING_OAUTH_PLACEHOLDER = '__oauth_pending__'

export function TokenForm({ provider, token, onSave, onCancel, isSaving = false }: TokenFormProps) {
  const isMelhorEnvio = provider === 'melhor_envio'
  const isPagarme = provider === 'pagarme'
  const isBling = provider === 'bling'
  const isCorreiosContrato = provider === 'correios_contrato'

  const [showPassword, setShowPassword] = useState(false)
  const [showToken, setShowToken] = useState(false)

  const [formData, setFormData] = useState({
    environment: (token?.environment || 'production') as IntegrationEnvironment,
    token_value:
      token?.token_value && !token.token_value.startsWith('****') ? token.token_value : '',
    cep_origem: token?.additional_data?.cep_origem || '',
    public_key: token?.additional_data?.public_key || '', // Para Pagar.me
    // Bling OAuth
    client_id: token?.additional_data?.client_id || '',
    client_secret: token?.additional_data?.client_secret || '',
    // Contrato Correios
    username: token?.additional_data?.username || '',
    password: '',
    cartao_numero: token?.additional_data?.cartao_numero || token?.additional_data?.numero || '',
    contrato: token?.additional_data?.contrato || '',
    dr: token?.additional_data?.dr ? String(token.additional_data.dr) : '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isBling) {
      if (!formData.client_id?.trim() || !formData.client_secret?.trim()) {
        toast.warning('Client ID e Client Secret são obrigatórios para o Bling')
        return
      }
      await onSave({
        provider,
        environment: formData.environment,
        token_value: BLING_OAUTH_PLACEHOLDER,
        additional_data: { client_id: formData.client_id.trim(), client_secret: formData.client_secret.trim() },
      })
      return
    }

    // Validação: token é obrigatório (Melhor Envio e Pagar.me).
    // Para Contrato Correios, o token é opcional (pode ser gerado automaticamente).
    if (!formData.token_value && !isCorreiosContrato) {
      toast.warning(isPagarme ? 'Secret Key é obrigatória' : 'Token é obrigatório')
      return
    }

    const payload: {
      provider: IntegrationProvider
      environment: IntegrationEnvironment
      token_value?: string
      cep_origem?: string
      public_key?: string
      additional_data?: Record<string, any>
    } = {
      provider,
      environment: formData.environment,
      token_value: formData.token_value || undefined,
      cep_origem: isMelhorEnvio && formData.cep_origem ? formData.cep_origem : undefined,
      public_key: isPagarme && formData.public_key ? formData.public_key : undefined,
    }

    if (isCorreiosContrato) {
      const existingAdditional = token?.additional_data || {}
      const username = formData.username.trim()
      const password = formData.password.trim()
      const cartaoNumero = formData.cartao_numero.trim()
      const contrato = formData.contrato.trim()
      const dr = formData.dr.trim()

      if (!username || !cartaoNumero) {
        toast.warning('Usuário e número do cartão de postagem são obrigatórios para o Contrato Correios')
        return
      }

      payload.additional_data = {
        ...existingAdditional,
        username,
        ...(password ? { password } : {}),
        cartao_numero: cartaoNumero,
        contrato: contrato || existingAdditional.contrato,
        dr: dr ? Number(dr) : existingAdditional.dr,
      }
    }

    await onSave(payload)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isCorreiosContrato
            ? `${token ? 'Editar' : 'Adicionar'} Token - Contrato Correios`
            : `${token ? 'Editar' : 'Adicionar'} Token - ${provider.replace('_', ' ').toUpperCase()}`}
        </CardTitle>
        <CardDescription>
          {isBling
            ? 'Configure Client ID e Client Secret (Informações do app no Bling). Depois use "Conectar com Bling" para obter o token OAuth.'
            : isMelhorEnvio
              ? 'Configure o token direto para o ambiente selecionado. Apenas o método "Token direto (legacy)" funciona.'
              : `Configure o token para o ambiente ${formData.environment === 'sandbox' ? 'Sandbox' : 'Produção'}`
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="environment">Ambiente</Label>
            {isCorreiosContrato ? (
              <Input id="environment" value="Produção" disabled className="w-full" />
            ) : (
              <select
                id="environment"
                value={formData.environment}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    environment: e.target.value as IntegrationEnvironment,
                  })
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                disabled={!!token}
              >
                <option value="sandbox">Sandbox</option>
                <option value="production">Produção</option>
              </select>
            )}
          </div>

          {isBling && (
            <>
              <div className="space-y-2">
                <Label htmlFor="client_id">Client ID *</Label>
                <Input
                  id="client_id"
                  type="text"
                  value={formData.client_id}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  placeholder="Client ID do app Bling"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Encontre em: Bling → Configurações → Informações do app
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_secret">Client Secret *</Label>
                <Input
                  id="client_secret"
                  type="password"
                  value={formData.client_secret}
                  onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                  placeholder="Client Secret do app Bling"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  O token de acesso será obtido ao clicar em &quot;Conectar com Bling&quot; após salvar.
                </p>
              </div>
            </>
          )}

          {!isBling && !isCorreiosContrato && (
            <div className="space-y-2">
              <Label htmlFor="token_value">
                {isPagarme ? 'Secret Key *' : 'Token *'}
              </Label>
              <Input
                id="token_value"
                type="password"
                value={formData.token_value}
                onChange={(e) => setFormData({ ...formData, token_value: e.target.value })}
                placeholder={isPagarme ? "Cole a Secret Key aqui (sk_live_... ou sk_test_...)" : "Cole o token aqui"}
                required
              />
              {isPagarme && (
                <p className="text-xs text-muted-foreground">
                  Secret Key do Pagar.me. Encontre no painel em Configurações → Chaves de API.
                  A Secret Key começa com <code className="text-xs bg-muted px-1 py-0.5 rounded">sk_live_</code> (produção) ou <code className="text-xs bg-muted px-1 py-0.5 rounded">sk_test_</code> (sandbox).
                </p>
              )}
              {isMelhorEnvio && (
                <p className="text-xs text-muted-foreground">
                  Token do Melhor Envio. Obtenha em: {formData.environment === 'sandbox'
                    ? 'https://app-sandbox.melhorenvio.com.br/integracoes/area-dev'
                    : 'https://melhorenvio.com.br/integracoes/area-dev'
                  }
                </p>
              )}
              <p className="text-xs text-muted-foreground italic">
                Tipo de token: Bearer (definido automaticamente)
              </p>
            </div>
          )}

          {isCorreiosContrato && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="username">Usuário / idCorreios *</Label>
                  <Input
                    id="username"
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Usuário do Meu Correios"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="password">Código de Acesso API *</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Senha/código de acesso às APIs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Essa senha é gerenciada em &quot;Gestão de acesso a API&apos;s&quot; no CWS. Deixe em
                    branco para manter a atual.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cartao_numero">Cartão de Postagem *</Label>
                  <Input
                    id="cartao_numero"
                    type="text"
                    value={formData.cartao_numero}
                    onChange={(e) =>
                      setFormData({ ...formData, cartao_numero: e.target.value.replace(/\\s/g, '') })
                    }
                    placeholder="Ex.: 0078555280"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="contrato">Número do Contrato</Label>
                  <Input
                    id="contrato"
                    type="text"
                    value={formData.contrato}
                    onChange={(e) =>
                      setFormData({ ...formData, contrato: e.target.value.replace(/\\s/g, '') })
                    }
                    placeholder="Ex.: 9912655956"
                  />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="dr">DR</Label>
                  <Input
                    id="dr"
                    type="text"
                    value={formData.dr}
                    onChange={(e) =>
                      setFormData({ ...formData, dr: e.target.value.replace(/\\D/g, '') })
                    }
                    placeholder="Ex.: 74"
                    maxLength={3}
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2 border rounded-md p-3 bg-muted/20">
                <Label htmlFor="token_value_correios">Token Atual (JWT) – opcional</Label>
                <div className="flex items-start gap-2">
                  {showToken ? (
                    <textarea
                      id="token_value_correios"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      rows={4}
                      value={formData.token_value}
                      onChange={(e) =>
                        setFormData({ ...formData, token_value: e.target.value })
                      }
                      placeholder="Opcional: cole um token manualmente, ou deixe vazio para o sistema gerar automaticamente"
                    />
                  ) : (
                    <textarea
                      id="token_value_correios"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-muted-foreground"
                      rows={4}
                      value={formData.token_value ? '********' : ''}
                      readOnly
                    />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="mt-1"
                    onClick={() => setShowToken((prev) => !prev)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  O sistema usará as credenciais acima para gerar e renovar o token automaticamente pela
                  API Token dos Correios. Esse campo é útil apenas se você precisar colar um token
                  temporário manualmente.
                </p>
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
                  : "Chave pública para tokenização de cartões no frontend. Encontre no painel do Pagar.me em Configurações → Chaves de API. A Public Key é diferente da Secret Key e é necessária para que pagamentos com cartão funcionem. Se não configurada, a tokenização de cartão não funcionará."
                }
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                <strong>Onde encontrar:</strong> No painel do Pagar.me, acesse Configurações → Chaves de API. 
                Você verá duas chaves: <strong>Secret Key</strong> (usada no backend) e <strong>Public Key</strong> (usada para tokenização no frontend).
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
