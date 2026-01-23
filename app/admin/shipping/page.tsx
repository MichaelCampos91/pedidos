"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Truck, Search } from "lucide-react"
import { formatShippingPrice, formatDeliveryTime } from "@/lib/melhor-envio"

interface ShippingOption {
  id: number
  name: string
  company: {
    id: number
    name: string
  }
  price: string
  currency: string
  delivery_time: number
  delivery_range: {
    min: number
    max: number
  }
  packages: number
}

export default function ShippingPage() {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    cep_destino: '',
    peso: '0.3',
    altura: '10',
    largura: '20',
    comprimento: '30',
    valor: '100',
  })
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setShippingOptions([])

    try {
      const response = await fetch('/api/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Erro ao calcular frete')
      }

      const data = await response.json()
      setShippingOptions(data.options || [])
    } catch (err: any) {
      setError(err.message || 'Erro ao calcular frete')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Cotação de Frete</h2>
        <p className="text-muted-foreground">
          Calcule o frete sem precisar criar um pedido
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados para Cotação</CardTitle>
          <CardDescription>Preencha os dados para calcular o frete</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cep_destino">CEP de Destino *</Label>
                <Input
                  id="cep_destino"
                  value={formData.cep_destino}
                  onChange={(e) => setFormData({ ...formData, cep_destino: e.target.value })}
                  placeholder="00000-000"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="peso">Peso (kg)</Label>
                <Input
                  id="peso"
                  type="number"
                  step="0.1"
                  value={formData.peso}
                  onChange={(e) => setFormData({ ...formData, peso: e.target.value })}
                  placeholder="0.3"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="altura">Altura (cm)</Label>
                <Input
                  id="altura"
                  type="number"
                  value={formData.altura}
                  onChange={(e) => setFormData({ ...formData, altura: e.target.value })}
                  placeholder="10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="largura">Largura (cm)</Label>
                <Input
                  id="largura"
                  type="number"
                  value={formData.largura}
                  onChange={(e) => setFormData({ ...formData, largura: e.target.value })}
                  placeholder="20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comprimento">Comprimento (cm)</Label>
                <Input
                  id="comprimento"
                  type="number"
                  value={formData.comprimento}
                  onChange={(e) => setFormData({ ...formData, comprimento: e.target.value })}
                  placeholder="30"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valor">Valor do Produto (R$)</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  value={formData.valor}
                  onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                  placeholder="100.00"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full md:w-auto">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calculando...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Calcular Frete
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {shippingOptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Opções de Frete</CardTitle>
            <CardDescription>Modalidades disponíveis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {shippingOptions.map((option) => (
                <div
                  key={option.id}
                  className="p-4 border rounded-lg hover:border-primary transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Truck className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold">{option.name}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {option.company.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Prazo: {formatDeliveryTime(option.delivery_time)}
                        {option.delivery_range.min !== option.delivery_range.max && (
                          <span>
                            {' '}({option.delivery_range.min} a {option.delivery_range.max} dias)
                          </span>
                        )}
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
