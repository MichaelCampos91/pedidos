"use client"

import { useState, useEffect } from "react"
import { ShippingRulesSection } from "@/components/settings/ShippingRulesSection"
import { PaymentSettingsSection } from "@/components/settings/PaymentSettingsSection"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Truck, DollarSign, Settings as SettingsIcon, Clock, Loader2, Save } from "lucide-react"
import { toast } from "@/lib/toast"
import type { IntegrationEnvironment } from "@/lib/integrations-types"

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('frete')
  const [environment, setEnvironment] = useState<IntegrationEnvironment>('production')
  const [productionDays, setProductionDays] = useState('0')
  const [savingFrete, setSavingFrete] = useState(false)
  const [savingPagamento, setSavingPagamento] = useState(false)

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

    // Carregar prazo de produção
    loadProductionDays()
  }, [])

  const loadProductionDays = async () => {
    try {
      const response = await fetch('/api/settings/payment', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setProductionDays(data.productionDays?.toString() || '0')
      }
    } catch (error) {
      console.error('Erro ao carregar prazo de produção:', error)
    }
  }

  const handleSaveFrete = async () => {
    setSavingFrete(true)
    try {
      const response = await fetch('/api/settings/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productionDays: parseInt(productionDays) || 0,
        }),
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Erro ao salvar prazo de produção')
      }

      toast.success('Regras de frete salvas com sucesso!')
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      toast.error(error.message || 'Erro ao salvar regras de frete')
    } finally {
      setSavingFrete(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" />
          Configurações Gerais
        </h2>
        <p className="text-muted-foreground">
          Gerencie regras de frete, descontos e configurações de pagamento
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="frete" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Frete
          </TabsTrigger>
          <TabsTrigger value="pagamento" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Pagamento
          </TabsTrigger>
        </TabsList>

        {/* Tab Frete */}
        <TabsContent value="frete" className="space-y-6 mt-6">
          <div className="space-y-6">
            <ShippingRulesSection />

            {/* Prazo de Produção */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-600" />
                  Prazo de Produção
                </CardTitle>
                <CardDescription>
                  Adicione dias úteis ao prazo de entrega do frete
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="production_days">Dias Úteis</Label>
                  <Input
                    id="production_days"
                    type="number"
                    min="0"
                    value={productionDays}
                    onChange={(e) => setProductionDays(e.target.value)}
                    placeholder="0"
                    className="max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Este valor será adicionado ao prazo retornado pela cotação de frete
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Botão Salvar Frete */}
          <div className="flex justify-end pt-6 border-t">
            <Button onClick={handleSaveFrete} disabled={savingFrete} size="lg">
              {savingFrete ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Regras de Frete
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        {/* Tab Pagamento */}
        <TabsContent value="pagamento" className="space-y-6 mt-6">
          <PaymentSettingsSection 
            environment={environment} 
            onEnvironmentChange={setEnvironment}
            onSave={setSavingPagamento}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
