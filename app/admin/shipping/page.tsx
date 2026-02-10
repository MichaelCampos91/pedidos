"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Truck, Search, Package, MessageCircle, Zap, DollarSign, X, Minus, Plus, Eraser } from "lucide-react"
import { formatShippingPrice, formatDeliveryTime } from "@/lib/melhor-envio-utils"
import { calculateDeliveryDate, formatDeliveryDate, generateWhatsAppShareLink } from "@/lib/shipping-utils"
import { maskCEP, formatDateTime, formatCurrency } from "@/lib/utils"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
  category_name?: string | null
  category_id?: number | null
}

interface ProductGroup {
  categoryName: string | null
  products: Product[]
}

interface ShippingRuleSummary {
  id: number
  rule_type: string
  condition_type: string
  condition_value: any
  active: boolean
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
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(new Set())
  const [productQuantities, setProductQuantities] = useState<Record<number, number>>({})
  const [productPopoverOpen, setProductPopoverOpen] = useState(false)
  const [freeShippingRules, setFreeShippingRules] = useState<ShippingRuleSummary[]>([])
const [quotes, setQuotes] = useState<any[]>([])
const [loadingHistory, setLoadingHistory] = useState(false)
const [historyError, setHistoryError] = useState<string | null>(null)
const [detailsModal, setDetailsModal] = useState<{ open: boolean; quote: any | null }>({ open: false, quote: null })
const [historyQuoteModal, setHistoryQuoteModal] = useState<{ open: boolean; quote: any | null; refreshing: boolean }>({ open: false, quote: null, refreshing: false })

// Limites máximos de negócio para cotação manual
const MAX_WEIGHT = 20 // kg
const MAX_HEIGHT = 50 // cm
const MAX_WIDTH = 50  // cm
const MAX_LENGTH = 50 // cm

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

  // Carregar histórico de cotações
  useEffect(() => {
    const loadHistory = async () => {
      setLoadingHistory(true)
      try {
        const res = await fetch('/api/shipping/quotes?per_page=10', { credentials: 'include' })
        if (!res.ok) throw new Error('Erro ao carregar histórico de cotações')
        const data = await res.json()
        setQuotes(data.data || [])
        setHistoryError(null)
      } catch (e: any) {
        setHistoryError(e.message || 'Erro ao carregar histórico de cotações')
      } finally {
        setLoadingHistory(false)
      }
    }
    loadHistory()
  }, [])

  // Carregar regras de frete grátis ativas (para debug no console)
  useEffect(() => {
    const loadFreeShippingRules = async () => {
      try {
        const response = await fetch('/api/settings/shipping-rules', {
          credentials: 'include',
        })
        if (!response.ok) return
        const data = await response.json()
        const rules = (data.rules || []) as any[]
        const freeRules = rules.filter(
          (r) => r.rule_type === 'free_shipping' && r.active === true
        )
        setFreeShippingRules(
          freeRules.map((r) => ({
            id: r.id,
            rule_type: r.rule_type,
            condition_type: r.condition_type,
            condition_value: r.condition_value,
            active: r.active,
          }))
        )
      } catch {
        // Silencioso: logs são apenas para debug, não quebrar a tela
      }
    }
    loadFreeShippingRules()
  }, [])

  // Lista filtrada para o combobox (usada apenas dentro do popover)
  const filteredProducts = useMemo(() => {
    const filtered = productSearch.trim()
      ? products.filter(product =>
          product.name.toLowerCase().includes(productSearch.toLowerCase())
        )
      : products
    return filtered.slice(0, 50) // Aumentar limite para multi-select
  }, [products, productSearch])

  // Agrupar produtos por categoria
  const groupedProducts = useMemo(() => {
    const groups = new Map<string | null, Product[]>()
    
    filteredProducts.forEach(product => {
      const categoryName = product.category_name || null
      if (!groups.has(categoryName)) {
        groups.set(categoryName, [])
      }
      groups.get(categoryName)!.push(product)
    })

    // Converter para array e ordenar: categorias por nome, null por último
    const sortedGroups: ProductGroup[] = Array.from(groups.entries())
      .map(([categoryName, products]) => ({
        categoryName,
        products: products.sort((a, b) => a.name.localeCompare(b.name))
      }))
      .sort((a, b) => {
        if (a.categoryName === null && b.categoryName === null) return 0
        if (a.categoryName === null) return 1 // null sempre por último
        if (b.categoryName === null) return -1
        return a.categoryName.localeCompare(b.categoryName)
      })

    return sortedGroups
  }, [filteredProducts])

  // Produtos selecionados (derivado de selectedProductIds)
  const selectedProducts = useMemo(() => {
    return products.filter(p => selectedProductIds.has(p.id))
  }, [products, selectedProductIds])

  // Preencher peso, dimensões e valor com totais quando há produtos selecionados (considerando quantidade)
  useEffect(() => {
    if (selectedProducts.length === 0) return
    const peso = selectedProducts.reduce(
      (sum, p) => sum + (Number(p.weight) || 0.3) * (productQuantities[p.id] ?? 1),
      0
    )
    const altura = selectedProducts.reduce(
      (sum, p) => sum + (Number(p.height) || 10) * (productQuantities[p.id] ?? 1),
      0
    )
    const largura = selectedProducts.reduce(
      (sum, p) => sum + (Number(p.width) || 20) * (productQuantities[p.id] ?? 1),
      0
    )
    const comprimento = selectedProducts.reduce(
      (sum, p) => sum + (Number(p.length) || 30) * (productQuantities[p.id] ?? 1),
      0
    )
    const valor = selectedProducts.reduce(
      (sum, p) => sum + (Number(p.base_price) || 100) * (productQuantities[p.id] ?? 1),
      0
    )

    // Aplicar limites máximos de negócio
    const pesoClamped = Math.min(MAX_WEIGHT, peso)
    const alturaClamped = Math.min(MAX_HEIGHT, altura)
    const larguraClamped = Math.min(MAX_WIDTH, largura)
    const comprimentoClamped = Math.min(MAX_LENGTH, comprimento)

    setFormData(prev => ({
      ...prev,
      peso: String(pesoClamped.toFixed(2)),
      altura: String(alturaClamped.toFixed(2)),
      largura: String(larguraClamped.toFixed(2)),
      comprimento: String(comprimentoClamped.toFixed(2)),
      valor: String(valor.toFixed(2)),
    }))
  }, [selectedProductIds, selectedProducts, productQuantities])

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

  const handleProductToggle = (productId: number) => {
    setSelectedProductIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(productId)) {
        newSet.delete(productId)
        setProductQuantities(q => {
          const next = { ...q }
          delete next[productId]
          return next
        })
      } else {
        newSet.add(productId)
        setProductQuantities(q => ({ ...q, [productId]: 1 }))
      }
      return newSet
    })
  }

  const handleQuantityChange = (productId: number, delta: number) => {
    const current = productQuantities[productId] ?? 0
    const next = Math.min(10, Math.max(0, current + delta))
    if (next === 0) {
      setSelectedProductIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(productId)
        return newSet
      })
      setProductQuantities(q => {
        const nextQ = { ...q }
        delete nextQ[productId]
        return nextQ
      })
    } else {
      if (current === 0) {
        setSelectedProductIds(prev => new Set(prev).add(productId))
      }
      setProductQuantities(q => ({ ...q, [productId]: next }))
    }
  }

  const handleClearSelection = () => {
    setSelectedProductIds(new Set())
    setProductQuantities({})
  }

  const handleClearForm = () => {
    setFormData({
      cep_destino: '',
      peso: '0.3',
      altura: '10',
      largura: '20',
      comprimento: '30',
      valor: '100',
    })
    setSelectedProductIds(new Set())
    setProductQuantities({})
    setProductSearch('')
    setError(null)
    setShippingOptions([])
    setShowModal(false)
    setProductPopoverOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setShippingOptions([])

    try {
      // Se há produtos selecionados, enviar array de produtos
      // Caso contrário, usar dados manuais do formulário (modo legacy)
      const body: any = {
        cep_destino: formData.cep_destino,
      }

      if (selectedProductIds.size > 0) {
        // Montar array de produtos com defaults da API e quantidade por item
        body.produtos = selectedProducts.map(p => ({
          id: String(p.id),
          width: Number(p.width) || 20,
          height: Number(p.height) || 10,
          length: Number(p.length) || 30,
          weight: Number(p.weight) || 0.3,
          valor: Number(p.base_price) || 100,
          quantity: productQuantities[p.id] ?? 1,
        }))
        // order_value sempre usa o valor do campo, mesmo quando há produtos selecionados
        // Isso permite que o usuário edite manualmente o valor e a cotação respeite essa edição
        body.order_value = parseFloat(formData.valor) || 0
      } else {
        // Modo legacy: enviar campos individuais
        body.peso = formData.peso
        body.altura = formData.altura
        body.largura = formData.largura
        body.comprimento = formData.comprimento
        body.valor = formData.valor
        body.order_value = parseFloat(formData.valor) || 0
      }

      const response = await fetch('/api/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

      // Logs de diagnóstico de regras de frete grátis aplicadas
      try {
        const appliedRules = Array.isArray(data.appliedRules) ? data.appliedRules : []
        const debugList = freeShippingRules.map(rule => ({
          id: rule.id,
          rule_type: rule.rule_type,
          condition_type: rule.condition_type,
          condition_value: rule.condition_value,
          active: rule.active,
          applied: appliedRules.some(
            (ar: any) =>
              ar.ruleId === rule.id && String(ar.ruleType) === 'free_shipping'
          ),
        }))
        // Log apenas no navegador (não afeta backend)
        // eslint-disable-next-line no-console
        console.log('[ShippingRulesDebug]', {
          orderValue: body.order_value,
          cep: body.cep_destino,
          freeShippingRules: debugList,
          appliedRules,
          productionDaysAdded: data.productionDaysAdded,
        })
      } catch {
        // Não falhar se algo der errado no log
      }
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

      <Card className="max-w-5xl">
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
            {/* Primeira linha: Produto (max 300px), Valor (max 80px), CEP flutuante à direita (max 100px) */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-full max-w-[500px] space-y-2">
                <Label>Produto (opcional)</Label>
                <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between font-normal"
                    >
                      <span className={selectedProductIds.size > 0 ? "text-foreground" : "text-muted-foreground"}>
                        {selectedProductIds.size > 0 
                          ? `${selectedProductIds.size} produto(s) selecionado(s)`
                          : "Selecione um ou mais produtos"}
                      </span>
                      <div className="flex items-center gap-1">
                        {selectedProductIds.size > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleClearSelection()
                            }}
                            className="rounded p-0.5 hover:bg-muted"
                            aria-label="Limpar seleção"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <div className="p-2 border-b">
                      <Input
                        placeholder="Digite para buscar..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="h-9"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-60 overflow-auto">
                      {groupedProducts.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground text-center">
                          Nenhum produto encontrado
                        </p>
                      ) : (
                        groupedProducts.map((group) => (
                          <div key={group.categoryName || 'sem-categoria'}>
                            <div className="px-4 pt-3 pb-1 sticky top-0 bg-background z-10 border-b">
                              <p className="text-xs font-semibold text-muted-foreground uppercase">
                                {group.categoryName || 'Sem categoria'}
                              </p>
                            </div>
                            {group.products.map((product) => {
                              const isSelected = selectedProductIds.has(product.id)
                              const qty = productQuantities[product.id] ?? 0
                              const checkboxId = `product-${product.id}`
                              return (
                                <div
                                  key={product.id}
                                  className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-accent hover:text-accent-foreground transition-colors border-b last:border-b-0 min-h-[44px]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <label className="flex flex-1 min-w-0 cursor-pointer flex items-start gap-3">
                                    <input
                                      type="checkbox"
                                      id={checkboxId}
                                      checked={isSelected}
                                      onChange={(e) => {
                                        e.stopPropagation()
                                        handleProductToggle(product.id)
                                      }}
                                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-input text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer accent-primary"
                                      onClick={(e) => e.stopPropagation()}
                                      aria-label={`Selecionar ${product.name}`}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium">{product.name}</div>
                                      {(product.width || product.height || product.length || product.weight) && (
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                          {product.width && `L: ${product.width}cm`}
                                          {product.height && ` × A: ${product.height}cm`}
                                          {product.length && ` × C: ${product.length}cm`}
                                          {product.weight && ` | P: ${product.weight}kg`}
                                        </div>
                                      )}
                                    </div>
                                  </label>
                                  <div
                                    className="flex items-center gap-1 shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      aria-label="Diminuir quantidade"
                                      disabled={qty === 0}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleQuantityChange(product.id, -1)
                                      }}
                                      className="h-6 w-6 shrink-0 rounded-full border border-input bg-background p-0 flex items-center justify-center hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                                    >
                                      <Minus className="h-3 w-3" />
                                    </button>
                                    <span className="min-w-[1rem] text-center text-xs tabular-nums" aria-label={`Quantidade: ${qty}`}>
                                      {qty}
                                    </span>
                                    <button
                                      type="button"
                                      aria-label="Aumentar quantidade"
                                      disabled={qty === 10}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleQuantityChange(product.id, 1)
                                      }}
                                      className="h-6 w-6 shrink-0 rounded-full border border-input bg-background p-0 flex items-center justify-center hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {/*
                {selectedProductIds.size > 0 && (
                  <div className="mt-2 p-2 bg-muted/50 rounded-md text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {selectedProductIds.size} produto(s) selecionado(s)
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleClearSelection}
                        className="h-7 text-xs"
                      >
                        Limpar
                      </Button>
                    </div>
                    {selectedProducts.length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Peso total: {selectedProducts.reduce((sum, p) => sum + (Number(p.weight) || 0), 0).toFixed(2)}kg
                        {' · '}
                        Valor total: R$ {selectedProducts.reduce((sum, p) => sum + (Number(p.base_price) || 0), 0).toFixed(2)}
                      </div>
                    )}
                  </div>
                )}
                */}
              </div>
              <div className="space-y-2 max-w-[120px]">
                <Label htmlFor="valor">Valor R$</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  value={formData.valor}
                  onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                  placeholder="100.00"
                />
              </div>
              <div className="ml-auto space-y-2 max-w-[250px] text-right">
                <Label htmlFor="cep_destino" className="text-blue-600 dark:text-blue-400">
                  CEP de Destino *
                </Label>
                <Input
                  id="cep_destino"
                  value={formData.cep_destino}
                  onChange={(e) => setFormData({ ...formData, cep_destino: maskCEP(e.target.value) })}
                  placeholder="00000-000"
                  maxLength={9}
                  required
                  className="border-blue-300 focus-visible:ring-blue-500 dark:border-blue-400"
                />
              </div>
            </div>

            {/* Segunda linha: Peso, Altura, Largura, Comprimento */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="peso">Peso (kg)</Label>
                <Input
                  id="peso"
                  type="number"
                  step="0.1"
                  value={formData.peso}
                  min={0}
                  max={MAX_WEIGHT}
                  onChange={(e) => {
                    const raw = Number(e.target.value.replace(',', '.'))
                    if (isNaN(raw)) {
                      setFormData({ ...formData, peso: '' })
                      return
                    }
                    const clamped = Math.min(MAX_WEIGHT, Math.max(0, raw))
                    setFormData({ ...formData, peso: String(clamped) })
                  }}
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
                  min={0}
                  max={MAX_HEIGHT}
                  onChange={(e) => {
                    const raw = Number(e.target.value.replace(',', '.'))
                    if (isNaN(raw)) {
                      setFormData({ ...formData, altura: '' })
                      return
                    }
                    const clamped = Math.min(MAX_HEIGHT, Math.max(0, raw))
                    setFormData({ ...formData, altura: String(clamped) })
                  }}
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
                  min={0}
                  max={MAX_WIDTH}
                  onChange={(e) => {
                    const raw = Number(e.target.value.replace(',', '.'))
                    if (isNaN(raw)) {
                      setFormData({ ...formData, largura: '' })
                      return
                    }
                    const clamped = Math.min(MAX_WIDTH, Math.max(0, raw))
                    setFormData({ ...formData, largura: String(clamped) })
                  }}
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
                  min={0}
                  max={MAX_LENGTH}
                  onChange={(e) => {
                    const raw = Number(e.target.value.replace(',', '.'))
                    if (isNaN(raw)) {
                      setFormData({ ...formData, comprimento: '' })
                      return
                    }
                    const clamped = Math.min(MAX_LENGTH, Math.max(0, raw))
                    setFormData({ ...formData, comprimento: String(clamped) })
                  }}
                  placeholder="30"
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

            <div className="flex justify-center items-center gap-4 pt-2 flex-wrap">
              <Button
                type="submit"
                disabled={loading}
                size="lg"
                className="min-w-[200px] py-6 px-8 text-lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Calculando...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-5 w-5" />
                    Calcular Frete
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-w-[200px] py-6 px-8 text-lg"
                onClick={handleClearForm}
              >
                <Eraser className="mr-2 h-5 w-5" />
                Limpar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Card de Histórico de Cotações */}
      <Card className="max-w-5xl">
        <CardHeader>
          <CardTitle>Histórico de Cotações</CardTitle>
          <CardDescription>Últimas cotações realizadas nesta conta</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="text-sm text-muted-foreground">Carregando histórico...</div>
          ) : historyError ? (
            <div className="text-sm text-destructive">{historyError}</div>
          ) : quotes.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhuma cotação registrada ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 pr-2 text-left">Data</th>
                    <th className="py-2 px-2 text-left">Destino</th>
                    <th className="py-2 px-2 text-left">Valor Pedido</th>
                    <th className="py-2 px-2 text-left">Frete Grátis</th>
                    <th className="py-2 pl-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => (
                    <tr key={quote.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-2 align-top whitespace-nowrap">
                        {quote.created_at ? formatDateTime(quote.created_at) : '-'}
                      </td>
                      <td className="py-2 px-2 align-top">
                        {quote.cep_destino
                          ? `${maskCEP(String(quote.cep_destino))}${quote.destination_state ? ` (${quote.destination_state})` : ''}`
                          : '-'}
                      </td>
                      <td className="py-2 px-2 align-top">
                        {formatCurrency(Number(quote.order_value || 0))}
                      </td>
                      <td className="py-2 px-2 align-top">
                        {quote.free_shipping_applied
                          ? `Sim${quote.free_shipping_rule_id ? ` - Regra #${quote.free_shipping_rule_id}` : ''}`
                          : 'Não'}
                      </td>
                      <td className="py-2 pl-2 align-top">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/shipping/quotes/${quote.id}`, {
                                  credentials: 'include',
                                })
                                if (!res.ok) throw new Error('Erro ao carregar detalhes da cotação')
                                const full = await res.json()
                                setDetailsModal({ open: true, quote: full })
                              } catch (e: any) {
                                console.error(e)
                              }
                            }}
                          >
                            Ver detalhes
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/shipping/quotes/${quote.id}`, {
                                  credentials: 'include',
                                })
                                if (!res.ok) throw new Error('Erro ao carregar cotação')
                                const full = await res.json()
                                setHistoryQuoteModal({ open: true, quote: full, refreshing: false })
                              } catch (e: any) {
                                console.error(e)
                              }
                            }}
                          >
                            Ver cotação
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

      {/* Modal de Detalhes do Histórico */}
      <Dialog open={detailsModal.open} onOpenChange={(open) => setDetailsModal(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Cotação</DialogTitle>
            <DialogDescription>Dados utilizados e resultado da cotação selecionada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            {!detailsModal.quote ? (
              <p className="text-muted-foreground">Nenhuma cotação selecionada.</p>
            ) : (
              <>
                <div>
                  <p><span className="font-medium">Data:</span> {detailsModal.quote.created_at ? formatDateTime(detailsModal.quote.created_at) : '-'}</p>
                  <p>
                    <span className="font-medium">Destino:</span>{' '}
                    {detailsModal.quote.cep_destino
                      ? `${maskCEP(String(detailsModal.quote.cep_destino))}${detailsModal.quote.destination_state ? ` (${detailsModal.quote.destination_state})` : ''}`
                      : '-'}
                  </p>
                  <p><span className="font-medium">Valor do pedido:</span> {formatCurrency(Number(detailsModal.quote.order_value || 0))}</p>
                  <p><span className="font-medium">Ambiente:</span> {detailsModal.quote.environment || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Entrada</p>
                  <pre className="text-xs bg-muted rounded-md p-2 overflow-x-auto">
                    {JSON.stringify(detailsModal.quote.request_body || {}, null, 2)}
                  </pre>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Regras de Frete</p>
                  <p>
                    Frete grátis:{' '}
                    {detailsModal.quote.free_shipping_applied
                      ? `Sim${detailsModal.quote.free_shipping_rule_id ? ` - Regra #${detailsModal.quote.free_shipping_rule_id}` : ''}`
                      : 'Não'}
                  </p>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Cotação do Histórico */}
      <Dialog open={historyQuoteModal.open} onOpenChange={(open) => setHistoryQuoteModal(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Cotação Salva</DialogTitle>
                <DialogDescription>
                  Visualize as opções de frete salvas e atualize a cotação se necessário.
                </DialogDescription>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={historyQuoteModal.refreshing || !historyQuoteModal.quote}
                onClick={async () => {
                  if (!historyQuoteModal.quote) return
                  setHistoryQuoteModal(prev => ({ ...prev, refreshing: true }))
                  try {
                    const res = await fetch(`/api/shipping/quotes/${historyQuoteModal.quote.id}/refresh`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                    })
                    if (!res.ok) throw new Error('Erro ao atualizar cotação')
                    const updated = await res.json()
                    setHistoryQuoteModal(prev => ({ ...prev, quote: updated, refreshing: false }))
                    setQuotes(prev => prev.map(q => q.id === updated.id ? { ...q, ...updated } : q))
                  } catch (e: any) {
                    console.error(e)
                    setHistoryQuoteModal(prev => ({ ...prev, refreshing: false }))
                  }
                }}
              >
                {historyQuoteModal.refreshing ? 'Atualizando...' : 'Atualizar cotação'}
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {(() => {
              const quote = historyQuoteModal.quote
              const options = quote?.options || []
              if (!quote) {
                return <p className="text-sm text-muted-foreground">Nenhuma cotação selecionada.</p>
              }
              if (!Array.isArray(options) || options.length === 0) {
                return <p className="text-sm text-muted-foreground">Nenhuma opção de frete salva para esta cotação.</p>
              }

              const cheapestPrice = Math.min(...options.map((o: any) => parseFloat(o.price)))
              const fastestTime = Math.min(...options.map((o: any) => o.delivery_range?.min ?? o.delivery_time))

              return (
                <div className="space-y-4">
                  {options.map((option: any) => {
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
                              <h3 className="font-semibold">{option.company?.name}</h3>
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
                              Entrega estimada em {deliveryDateFormatted} ({formatDeliveryTime(option.delivery_time)})
                            </p>
                          </div>
                          <div className="ml-4 text-right">
                            <p className="text-lg font-bold">
                              {formatShippingPrice(option.price)}
                            </p>
                            {option.originalPrice !== undefined && parseFloat(option.price) === 0 && (
                              <p className="text-xs text-muted-foreground line-through">
                                {formatShippingPrice(option.originalPrice.toFixed(2))}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
