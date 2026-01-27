"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Truck, Zap, DollarSign } from "lucide-react"
import { formatShippingPrice, formatDeliveryTime } from "@/lib/melhor-envio-utils"
import { calculateDeliveryDate, formatDeliveryDate } from "@/lib/shipping-utils"
import type { IntegrationEnvironment } from "@/lib/integrations-types"

export interface ShippingOption {
  id: number
  name: string
  company: {
    id: number
    name: string
  }
  price: string
  currency: string
  delivery_time: number
  delivery_range?: {
    min: number
    max: number
  }
  packages: number
}

interface ShippingSelectorProps {
  cep: string
  peso?: number | string
  altura?: number | string
  largura?: number | string
  comprimento?: number | string
  valor?: number | string
  produtos?: Array<{
    id?: string
    largura?: number
    altura?: number
    comprimento?: number
    peso?: number
    valor?: number
    quantidade?: number
  }>
  environment?: IntegrationEnvironment
  onSelect: (option: ShippingOption) => void
  selectedOptionId?: number | string | null
  className?: string
}

export function ShippingSelector({
  cep,
  peso = '0.3',
  altura = '10',
  largura = '20',
  comprimento = '30',
  valor = '100',
  produtos,
  environment,
  onSelect,
  selectedOptionId,
  className = '',
}: ShippingSelectorProps) {
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<ShippingOption[]>([])
  const [error, setError] = useState<string | null>(null)

  const calculateShipping = async () => {
    if (!cep || cep.replace(/\D/g, '').length !== 8) {
      setError('CEP inválido')
      return
    }

    setLoading(true)
    setError(null)
    setOptions([])

    try {
      const body: any = {
        cep_destino: cep,
        // environment só é adicionado se explicitamente fornecido
      }

      // Adicionar environment apenas se fornecido
      if (environment) {
        body.environment = environment
      }

      if (produtos && produtos.length > 0) {
        body.produtos = produtos.map((p, index) => ({
          id: p.id || `produto-${index + 1}`,
          largura: p.largura || Number(largura),
          altura: p.altura || Number(altura),
          comprimento: p.comprimento || Number(comprimento),
          peso: p.peso || Number(peso),
          valor: p.valor || Number(valor),
          quantidade: p.quantidade || 1,
        }))
      } else {
        body.peso = String(peso)
        body.altura = String(altura)
        body.largura = String(largura)
        body.comprimento = String(comprimento)
        body.valor = String(valor)
      }

      const response = await fetch('/api/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
        throw new Error(errorData.error || 'Erro ao calcular frete')
      }

      const data = await response.json()
      const shippingOptions = data.options || []
      setOptions(shippingOptions)

      if (shippingOptions.length === 0) {
        setError(data.message || 'Nenhuma opção de frete disponível')
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao calcular frete')
    } finally {
      setLoading(false)
    }
  }

  if (options.length === 0 && !loading && !error) {
    return (
      <div className={className}>
        <Button
          type="button"
          variant="outline"
          onClick={calculateShipping}
          disabled={loading || !cep}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calculando...
            </>
          ) : (
            <>
              <Truck className="mr-2 h-4 w-4" />
              Cotar Frete
            </>
          )}
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`space-y-2 ${className}`}>
        <p className="text-sm text-destructive">{error}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={calculateShipping}
        >
          Tentar Novamente
        </Button>
      </div>
    )
  }

  const cheapestPrice = options.length > 0 ? Math.min(...options.map(o => parseFloat(o.price))) : 0
  const fastestTime = options.length > 0 ? Math.min(...options.map(o => o.delivery_range?.min ?? o.delivery_time)) : 0

  return (
    <div className={`space-y-3 ${className}`}>
      {options.map((option) => {
        const deliveryDate = calculateDeliveryDate(option.delivery_time)
        const deliveryDateFormatted = formatDeliveryDate(deliveryDate)
        const optionPrice = parseFloat(option.price)
        const optionTime = option.delivery_range?.min ?? option.delivery_time
        const isCheapest = optionPrice === cheapestPrice
        const isFastest = optionTime === fastestTime
        const isSelected = selectedOptionId && String(selectedOptionId) === String(option.id)

        return (
          <div
            key={option.id}
            className={`p-4 border rounded-lg cursor-pointer transition-colors ${
              isSelected
                ? "border-primary bg-primary/5"
                : "hover:border-primary/50"
            }`}
            onClick={() => onSelect(option)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Truck className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">{option.company.name}</h3>
                  <Badge variant="outline" className="text-xs">
                    {option.name}
                  </Badge>
                  {isFastest && (
                    <Badge
                      variant="outline"
                      className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800"
                    >
                      <Zap className="h-3 w-3 mr-1" />
                      Mais Rápida
                    </Badge>
                  )}
                  {isCheapest && (
                    <Badge
                      variant="outline"
                      className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800"
                    >
                      <DollarSign className="h-3 w-3 mr-1" />
                      Mais Barata
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-1">
                  Prazo: {formatDeliveryTime(option.delivery_time)}
                  {option.delivery_range && option.delivery_range.min !== option.delivery_range.max && (
                    <span>
                      {' '}({option.delivery_range.min} a {option.delivery_range.max} dias)
                    </span>
                  )}
                </p>
                <p className="text-sm font-medium text-primary">
                  Entrega estimada: {deliveryDateFormatted}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">
                  {formatShippingPrice(option.price)}
                </p>
                {option.packages > 1 && (
                  <p className="text-xs text-muted-foreground">
                    {option.packages} volumes
                  </p>
                )}
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center mt-2 ml-auto">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
