"use client"

import { useState, useEffect } from "react"
import { ShippingRulesSection } from "@/components/settings/ShippingRulesSection"
import { PaymentSettingsSection } from "@/components/settings/PaymentSettingsSection"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Truck, CreditCard, Settings as SettingsIcon } from "lucide-react"
import type { IntegrationEnvironment } from "@/lib/integrations-types"

export default function SettingsPage() {
  const [environment, setEnvironment] = useState<IntegrationEnvironment>('production')

  useEffect(() => {
    // Buscar ambiente ativo do Pagar.me
    const fetchActiveEnvironment = async () => {
      try {
        const response = await fetch('/api/integrations/active-environment?provider=pagarme', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          if (data.environment) {
            setEnvironment(data.environment)
          }
        }
      } catch (error) {
        console.warn('Erro ao buscar ambiente ativo:', error)
      }
    }

    fetchActiveEnvironment()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" />
          Configurações Gerais
        </h2>
        <p className="text-muted-foreground">
          Gerencie regras de frete, descontos e configurações de pagamento
        </p>
      </div>

      {/* Seletor de Ambiente */}
      <Card>
        <CardHeader>
          <CardTitle>Ambiente</CardTitle>
          <CardDescription>
            Selecione o ambiente para configurar taxas de parcelamento
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={environment} onValueChange={(value) => setEnvironment(value as IntegrationEnvironment)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Sandbox</SelectItem>
              <SelectItem value="production">Produção</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Regras de Frete */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Regras de Frete
          </CardTitle>
          <CardDescription>
            Configure regras de frete grátis, descontos, acréscimos e prazo de produção
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ShippingRulesSection />
        </CardContent>
      </Card>

      {/* Configurações de Pagamento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Configurações de Pagamento
          </CardTitle>
          <CardDescription>
            Configure descontos PIX e taxas de juros de parcelamento
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentSettingsSection environment={environment} />
        </CardContent>
      </Card>
    </div>
  )
}
