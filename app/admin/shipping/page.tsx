"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Truck, Search, Package, MessageCircle, Zap, DollarSign } from "lucide-react"
import { formatShippingPrice, formatDeliveryTime } from "@/lib/melhor-envio-utils"
import { calculateDeliveryDate, formatDeliveryDate, generateWhatsAppShareLink } from "@/lib/shipping-utils"
import { maskCEP } from "@/lib/utils"
import { EnvironmentBadge } from "@/components/integrations/EnvironmentBadge"
import { productsApi } from "@/lib/api"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import type { IntegrationEnvironment } from "@/lib/integrations-types"

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
  delivery_range?: {
    min: number
    max: number
  }
  packages: number
}

interface Product {
  id: number
  name: string
  base_price?: number | string
  width?: number | string
  height?: number | string
  length?: number | string
  weight?: number | string
  active?: boolean
}

export default function ShippingPage() {
  const [loading, setLoading] = useState(false)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [activeEnvironment, setActiveEnvironment] = useState<IntegrationEnvironment | null>(null)
  const [loadingEnv, setLoadingEnv] = useState(true)
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
  const [showModal, setShowModal] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  // Buscar ambiente ativo ao montar componente
  useEffect(() => {
    const fetchActiveEnvironment = async () => {
      try {
        const response = await fetch('/api/integrations/active-environment?provider=melhor_envio', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          setActiveEnvironment(data.environment || 'production')
        } else {
          setActiveEnvironment('production') // Fallback
        }
      } catch (error) {
        console.warn('Erro ao buscar ambiente ativo, usando produção:', error)
        setActiveEnvironment('production')
      } finally {
        setLoadingEnv(false)
      }
    }
    fetchActiveEnvironment()
  }, [])

  // Carregar produtos ao montar componente
  useEffect(() => {
    loadProducts()
  }, [])

  // Filtrar produtos conforme busca
  useEffect(() => {
    if (!productSearch.trim()) {
      setFilteredProducts([])
      return
    }

    const filtered = products.filter(product =>
      product.name.toLowerCase().includes(productSearch.toLowerCase())
    )
    setFilteredProducts(filtered.slice(0, 5)) // Limitar a 5 resultados
  }, [productSearch, products])

  const loadProducts = async () => {
    setLoadingProducts(true)
    try {
      const data = await productsApi.list()
      setProducts(data.filter((p: Product) => p.active !== false))
    } catch (error) {
      console.error('Erro ao carregar produtos:', error)
    } finally {
      setLoadingProducts(false)
    }
  }

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product)
    setProductSearch(product.name)
    setFilteredProducts([])

    // Preencher dimensões, peso e preço se disponíveis
    setFormData(prev => ({
      ...prev,
      largura: product.width ? String(product.width) : prev.largura,
      altura: product.height ? String(product.height) : prev.altura,
      comprimento: product.length ? String(product.length) : prev.comprimento,
      peso: product.weight ? String(product.weight) : prev.peso,
      valor: product.base_price ? String(product.base_price) : prev.valor,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setShippingOptions([])

    try {
      const response = await fetch('/api/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          // environment removido - API usa ambiente ativo automaticamente
        }),
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
        
        let errorMessage = errorData.error || 'Erro ao calcular frete'
        
        // Tratar erro 401 especificamente
        if (response.status === 401) {
          errorMessage = 'Você não está autenticado. Por favor, faça login novamente.'
        }
        
        // Adicionar detalhes se disponível
        if (errorData.details) {
          errorMessage += `\n\n${errorData.details}`
        }
        
        throw new Error(errorMessage)
      }

      const data = await response.json()
      const options = data.options || []
      setShippingOptions(options)
      
      // Se não há opções mas há mensagem, mostrar como informação
      if (options.length === 0 && data.message) {
        setError(data.message)
        setShowModal(false)
      } else if (options.length > 0) {
        // Abrir modal automaticamente se houver opções
        setShowModal(true)
        setError(null)
      } else {
        setError(null)
        setShowModal(false)
      }
    } catch (err: any) {
      // Manter prefixo se já tiver (vem da API)
      let errorMsg = err.message || 'Erro ao calcular frete'
      if (!errorMsg.includes('[')) {
        errorMsg = `[Sistema] ${errorMsg}`
      }
      setError(errorMsg)
      setShowModal(false)
    } finally {
      setLoading(false)
    }
  }

  const handleShareWhatsApp = () => {
    // Converter ShippingOption para ShippingOptionForShare
    const optionsForShare = shippingOptions.map(option => ({
      name: option.name,
      company: { name: option.company.name },
      price: formatShippingPrice(option.price), // Formatar preço
      delivery_time: option.delivery_time,
      delivery_range: option.delivery_range,
    }))
    const shareLink = generateWhatsAppShareLink(optionsForShare, formData.cep_destino)
    window.open(shareLink, '_blank')
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
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Dados para Cotação</CardTitle>
              <CardDescription>Preencha os dados para calcular o frete</CardDescription>
            </div>
            {activeEnvironment && (
              <EnvironmentBadge environment={activeEnvironment} className="text-xs" />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Busca de Produtos */}
            <div className="space-y-2 relative">
              <Label htmlFor="product_search">Buscar Produto (Opcional)</Label>
              <div className="relative">
                <Input
                  id="product_search"
                  type="text"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value)
                    if (!e.target.value) {
                      setSelectedProduct(null)
                    }
                  }}
                  placeholder="Digite o nome do produto..."
                  className="pr-10"
                />
                <Package className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              
              {/* Dropdown de resultados */}
              {filteredProducts.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleProductSelect(product)}
                      className="w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <div className="font-medium">{product.name}</div>
                      {(product.width || product.height || product.length || product.weight) && (
                        <div className="text-xs text-muted-foreground">
                          {product.width && `L: ${product.width}cm`}
                          {product.height && ` × A: ${product.height}cm`}
                          {product.length && ` × C: ${product.length}cm`}
                          {product.weight && ` | P: ${product.weight}kg`}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {selectedProduct && (
                <p className="text-xs text-muted-foreground">
                  Produto selecionado: <strong>{selectedProduct.name}</strong>
                  {' '}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(null)
                      setProductSearch('')
                    }}
                    className="text-primary hover:underline"
                  >
                    (limpar)
                  </button>
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cep_destino">CEP de Destino *</Label>
                <Input
                  id="cep_destino"
                  value={formData.cep_destino}
                  onChange={(e) => setFormData({ ...formData, cep_destino: maskCEP(e.target.value) })}
                  placeholder="00000-000"
                  maxLength={9}
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
                  step="0.1"
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
                  step="0.1"
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
                  step="0.1"
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
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm whitespace-pre-line">
                {error}
                {error.includes('[Melhor Envio]') && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Esta mensagem veio da integração Melhor Envio.
                  </div>
                )}
                {error.includes('[Sistema]') && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Esta mensagem veio do sistema.
                  </div>
                )}
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

      {/* Modal de Resultados */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Opções de Frete</DialogTitle>
                <DialogDescription>
                  Modalidades disponíveis no ambiente {activeEnvironment === 'sandbox' ? 'Sandbox' : 'Produção'}
                </DialogDescription>
              </div>
              {activeEnvironment && <EnvironmentBadge environment={activeEnvironment} />}
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {(() => {
              // Calcular opções mais rápida e mais barata
              const cheapestPrice = Math.min(...shippingOptions.map(o => parseFloat(o.price)))
              const fastestTime = Math.min(...shippingOptions.map(o => o.delivery_range?.min ?? o.delivery_time))
              
              return shippingOptions.map((option) => {
                const deliveryDate = calculateDeliveryDate(option.delivery_time)
                const deliveryDateFormatted = formatDeliveryDate(deliveryDate)
                const optionPrice = parseFloat(option.price)
                const optionTime = option.delivery_range?.min ?? option.delivery_time
                const isCheapest = optionPrice === cheapestPrice
                const isFastest = optionTime === fastestTime
                
                return (
                  <div
                    key={option.id}
                    className="p-4 border rounded-lg hover:border-primary transition-colors"
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
                      </div>
                    </div>
                  </div>
                )
              })
            })()}
          </div>

          <DialogFooter>
            <Button
              onClick={handleShareWhatsApp}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Compartilhar no WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
