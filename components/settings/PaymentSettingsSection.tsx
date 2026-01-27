"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { InstallmentRatesTable } from "./InstallmentRatesTable"
import { DollarSign, QrCode, CreditCard, Loader2, Save, Globe, Gift } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/lib/toast"
import type { IntegrationEnvironment } from "@/lib/integrations-types"

interface PaymentSettingsSectionProps {
  environment: IntegrationEnvironment
  onEnvironmentChange: (env: IntegrationEnvironment) => void
  onSave: (saving: boolean) => void
}

export function PaymentSettingsSection({ 
  environment, 
  onEnvironmentChange,
  onSave 
}: PaymentSettingsSectionProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pixDiscount, setPixDiscount] = useState({
    active: false,
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: '',
  })
  const [installmentRates, setInstallmentRates] = useState<any[]>([])

  useEffect(() => {
    loadSettings()
  }, [environment])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/settings/payment', {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Erro ao carregar configurações')
      }

      const data = await response.json()
      
      // Buscar configuração PIX
      const pixSetting = data.paymentSettings?.find(
        (s: any) => s.payment_method === 'pix' && s.setting_type === 'discount'
      )

      if (pixSetting) {
        setPixDiscount({
          active: pixSetting.active,
          discount_type: pixSetting.discount_type || 'percentage',
          discount_value: pixSetting.discount_value?.toString() || '',
        })
      }

      // Carregar taxas de parcelamento
      const ratesResponse = await fetch(`/api/settings/installment-rates?environment=${environment}`, {
        credentials: 'include',
      })

      if (ratesResponse.ok) {
        const ratesData = await ratesResponse.json()
        setInstallmentRates(ratesData.rates || [])
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error)
      toast.error('Erro ao carregar configurações')
    } finally {
      setLoading(false)
    }
  }

  const handleSavePixDiscount = async () => {
    setSaving(true)
    onSave(true)
    try {
      const response = await fetch('/api/settings/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pixDiscount: {
            active: pixDiscount.active,
            discount_type: pixDiscount.discount_type,
            discount_value: pixDiscount.discount_value ? parseFloat(pixDiscount.discount_value) : null,
          },
        }),
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Erro ao salvar configurações')
      }

      toast.success('Desconto PIX salvo com sucesso!')
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      toast.error(error.message || 'Erro ao salvar desconto PIX')
    } finally {
      setSaving(false)
      onSave(false)
    }
  }

  const handleSaveInstallmentRates = async (rates: any[]) => {
    setSaving(true)
    onSave(true)
    try {
      const response = await fetch('/api/settings/installment-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rates,
          environment,
        }),
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Erro ao salvar taxas')
      }

      setInstallmentRates(rates)
      toast.success('Taxas de parcelamento salvas com sucesso!')
    } catch (error: any) {
      console.error('Erro ao salvar taxas:', error)
      toast.error(error.message || 'Erro ao salvar taxas de parcelamento')
    } finally {
      setSaving(false)
      onSave(false)
    }
  }

  const handleSaveAll = async () => {
    setSaving(true)
    onSave(true)
    try {
      // Salvar desconto PIX
      const pixResponse = await fetch('/api/settings/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pixDiscount: {
            active: pixDiscount.active,
            discount_type: pixDiscount.discount_type,
            discount_value: pixDiscount.discount_value ? parseFloat(pixDiscount.discount_value) : null,
          },
        }),
        credentials: 'include',
      })

      if (!pixResponse.ok) {
        throw new Error('Erro ao salvar desconto PIX')
      }

      toast.success('Configurações de pagamento salvas com sucesso!')
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      toast.error(error.message || 'Erro ao salvar configurações de pagamento')
    } finally {
      setSaving(false)
      onSave(false)
    }
  }

  const calculatePixPreview = () => {
    if (!pixDiscount.active || !pixDiscount.discount_value) return null
    const exampleValue = 1000
    const discountValue = parseFloat(pixDiscount.discount_value) || 0

    if (pixDiscount.discount_type === 'percentage') {
      const discount = (exampleValue * discountValue) / 100
      return {
        original: exampleValue,
        discount,
        final: exampleValue - discount,
      }
    } else {
      return {
        original: exampleValue,
        discount: discountValue,
        final: exampleValue - discountValue,
      }
    }
  }

  const pixPreview = calculatePixPreview()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Desconto PIX */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-green-600" />
            Desconto PIX
          </CardTitle>
          <CardDescription>
            Configure desconto para pagamentos via PIX
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="pix_active"
              checked={pixDiscount.active}
              onChange={(e) => setPixDiscount({ ...pixDiscount, active: e.target.checked })}
              className="rounded"
            />
            <Label htmlFor="pix_active" className="cursor-pointer">
              Ativar desconto PIX
            </Label>
          </div>

          {pixDiscount.active && (
            <>
              <div className="space-y-2">
                <Label htmlFor="pix_discount_type">Tipo de Desconto</Label>
                <Select
                  value={pixDiscount.discount_type}
                  onValueChange={(value: 'percentage' | 'fixed') =>
                    setPixDiscount({ ...pixDiscount, discount_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                    <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pix_discount_value">
                  {pixDiscount.discount_type === 'percentage' ? 'Porcentagem (%)' : 'Valor (R$)'}
                </Label>
                <Input
                  id="pix_discount_value"
                  type="number"
                  step="0.01"
                  value={pixDiscount.discount_value}
                  onChange={(e) => setPixDiscount({ ...pixDiscount, discount_value: e.target.value })}
                  placeholder={pixDiscount.discount_type === 'percentage' ? '0.00' : '0.00'}
                />
              </div>

              {pixPreview && (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium mb-2">Preview (exemplo: R$ {formatCurrency(pixPreview.original)})</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Valor original:</span>
                      <span>{formatCurrency(pixPreview.original)}</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span>Desconto:</span>
                      <span>-{formatCurrency(pixPreview.discount)}</span>
                    </div>
                    <div className="flex justify-between font-bold border-t pt-1">
                      <span>Total com desconto:</span>
                      <span>{formatCurrency(pixPreview.final)}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Juros de Parcelamento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            Juros de Parcelamento
          </CardTitle>
          <CardDescription>
            Configure as taxas de juros para cada número de parcelas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Seletor de Ambiente */}
          <div className="space-y-2">
            <Label htmlFor="environment" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Ambiente
            </Label>
            <Select value={environment} onValueChange={(value) => onEnvironmentChange(value as IntegrationEnvironment)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox</SelectItem>
                <SelectItem value="production">Produção</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Selecione o ambiente para configurar taxas de parcelamento
            </p>
          </div>

          <InstallmentRatesTable
            rates={installmentRates}
            environment={environment}
            onSave={handleSaveInstallmentRates}
          />
        </CardContent>
      </Card>

      {/* Botão Salvar */}
      <div className="flex justify-end pt-6 border-t">
        <Button onClick={handleSaveAll} disabled={saving} size="lg">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Salvar Configurações de Pagamento
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
