"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Save, X } from "lucide-react"
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

export function TokenForm({ provider, token, onSave, onCancel, isSaving = false }: TokenFormProps) {
  const isMelhorEnvio = provider === 'melhor_envio'
  const isPagarme = provider === 'pagarme'
  
  // NOTA: Apenas "Token direto (legacy)" funciona para Melhor Envio
  // NOTA: Apenas "Bearer" funciona como tipo de token (definido automaticamente no backend)

  const [formData, setFormData] = useState({
    environment: (token?.environment || 'production') as IntegrationEnvironment,
    token_value: token?.token_value && !token.token_value.startsWith('****') 
      ? token.token_value 
      : '',
    cep_origem: token?.additional_data?.cep_origem || '',
    public_key: token?.additional_data?.public_key || '', // Para Pagar.me
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validação: token é obrigatório
    if (!formData.token_value) {
      toast.warning(isPagarme ? 'Secret Key é obrigatória' : 'Token é obrigatório')
      return
    }
    
    // Salvar sempre como token direto (legacy) e bearer (definido no backend)
    await onSave({
      provider,
      environment: formData.environment,
      token_value: formData.token_value,
      cep_origem: isMelhorEnvio && formData.cep_origem ? formData.cep_origem : undefined,
      public_key: isPagarme && formData.public_key ? formData.public_key : undefined,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {token ? 'Editar' : 'Adicionar'} Token - {provider.replace('_', ' ').toUpperCase()}
        </CardTitle>
        <CardDescription>
          {isMelhorEnvio 
            ? 'Configure o token direto para o ambiente selecionado. Apenas o método "Token direto (legacy)" funciona.'
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
            {/* NOTA: Tipo de token sempre será "Bearer" (definido automaticamente no backend) */}
            <p className="text-xs text-muted-foreground italic">
              Tipo de token: Bearer (definido automaticamente)
            </p>
          </div>

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
