"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Save, Plus, Trash2, MessageCircle, Truck, User, Package, MapPin, ArrowLeft, ArrowRight, AlertCircle, Edit, CheckCircle2, FileText } from "lucide-react"
import { ordersApi, clientsApi, productsApi } from "@/lib/api"
import { formatCurrency, formatCPF, formatPhone } from "@/lib/utils"
import { ShippingSelector, type ShippingOption } from "@/components/shipping/ShippingSelector"
import { Badge } from "@/components/ui/badge"
import { EnvironmentBadge } from "@/components/integrations/EnvironmentBadge"
import type { IntegrationEnvironment } from "@/lib/integrations-types"
import { CheckoutSteps } from "@/components/checkout/CheckoutSteps"
import { ClientSearch } from "@/components/orders/ClientSearch"
import { AddressForm } from "@/components/orders/AddressForm"
import { calculateDeliveryDate, formatDeliveryDate } from "@/lib/shipping-utils"
import { toast } from "@/lib/toast"

const STATUS_OPTIONS = [
  { value: 'aguardando_pagamento', label: 'Aguardando Pagamento' },
  { value: 'aguardando_producao', label: 'Aguardando Produção' },
  { value: 'em_producao', label: 'Em Produção' },
  { value: 'aguardando_envio', label: 'Aguardando Envio' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'nao_pagos', label: 'Não Pagos' },
  { value: 'cancelados', label: 'Cancelados' }
]

const STEPS = [
  { id: 1, name: "Cliente", description: "Selecione o cliente", icon: User },
  { id: 2, name: "Itens", description: "Adicione os itens", icon: Package },
  { id: 3, name: "Endereço e Frete", description: "Endereço e modalidade de frete", icon: Truck },
  { id: 4, name: "Revisão", description: "Revise o pedido", icon: FileText },
]

interface OrderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId?: number | null
  onSuccess?: () => void
}

export function OrderModal({ open, onOpenChange, orderId, onSuccess }: OrderModalProps) {
  const isNew = !orderId

  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [products, setProducts] = useState<any[]>([])
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [clientAddresses, setClientAddresses] = useState<any[]>([])
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null)
  const [activeEnvironment, setActiveEnvironment] = useState<IntegrationEnvironment | null>(null)
  const [loadingEnv, setLoadingEnv] = useState(true)
  const [showNewAddressForm, setShowNewAddressForm] = useState(false)
  const [showAddressSelector, setShowAddressSelector] = useState(false)
  const [freteClearedWarning, setFreteClearedWarning] = useState(false)
  const previousItemsRef = useRef<string>('')
  const previousAddressRef = useRef<number | null>(null)
  
  const [formData, setFormData] = useState({
    client_id: '',
    status: 'aguardando_pagamento',
    items: [] as any[],
    shipping_address_id: '',
  })

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
          setActiveEnvironment('production')
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

  useEffect(() => {
    if (open) {
      loadProducts()
      if (!isNew && orderId) {
        loadOrder()
      } else {
        // Reset form for new order
        resetForm()
      }
    }
  }, [open, orderId, isNew])

  // Monitorar mudanças nos itens e endereço para limpar frete
  useEffect(() => {
    const itemsKey = JSON.stringify(formData.items.map(i => ({ id: i.product_id, qty: i.quantity })))
    const addressId = formData.shipping_address_id ? parseInt(formData.shipping_address_id) : null

    // Se frete estava selecionado e itens ou endereço mudaram
    if (selectedShipping) {
      if (previousItemsRef.current && previousItemsRef.current !== itemsKey) {
        setSelectedShipping(null)
        setFreteClearedWarning(true)
        setTimeout(() => setFreteClearedWarning(false), 5000)
      } else if (previousAddressRef.current !== null && previousAddressRef.current !== addressId) {
        setSelectedShipping(null)
        setFreteClearedWarning(true)
        setTimeout(() => setFreteClearedWarning(false), 5000)
      }
    }

    previousItemsRef.current = itemsKey
    previousAddressRef.current = addressId
  }, [formData.items, formData.shipping_address_id, selectedShipping])

  const resetForm = () => {
    setFormData({
      client_id: '',
      status: 'aguardando_pagamento',
      items: [],
      shipping_address_id: '',
    })
    setSelectedClient(null)
    setClientAddresses([])
    setSelectedShipping(null)
    setCurrentStep(1)
    setShowNewAddressForm(false)
    setShowAddressSelector(false)
    setFreteClearedWarning(false)
    previousItemsRef.current = ''
    previousAddressRef.current = null
  }

  const loadProducts = async () => {
    try {
      const data = await productsApi.list()
      setProducts(data.filter((p: any) => p.active))
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Erro ao carregar produtos:', error)
      }
    }
  }

  const loadOrder = async () => {
    if (!orderId) return

    try {
      setLoadingData(true)
      const order = await ordersApi.get(orderId)
      
      // Load client
      if (order.client_id) {
        const client = await clientsApi.get(order.client_id)
        setSelectedClient(client)
        await loadClientAddresses(order.client_id)
      }

      setFormData({
        client_id: order.client_id.toString(),
        status: order.status,
        items: (order.items || []).map((item: any) => ({
          ...item,
          product_id: item.product_id ? item.product_id.toString() : 'custom'
        })),
        shipping_address_id: order.shipping_address_id?.toString() || ''
      })

      // If order has shipping info, create ShippingOption object
      if (order.shipping_method && order.shipping_option_id) {
        const shippingData = order.shipping_option_data 
          ? (typeof order.shipping_option_data === 'string' 
              ? JSON.parse(order.shipping_option_data) 
              : order.shipping_option_data)
          : {}
        
        // Ambiente não é mais necessário - será usado o ambiente ativo
        
        setSelectedShipping({
          id: parseInt(order.shipping_option_id.toString()),
          name: order.shipping_method,
          company: {
            id: 0,
            name: order.shipping_company_name || '',
          },
          price: order.total_shipping?.toString() || '0',
          currency: 'BRL',
          delivery_time: order.shipping_delivery_time || 0,
          delivery_range: shippingData.delivery_range,
          packages: shippingData.packages || 1,
        })
        previousAddressRef.current = order.shipping_address_id
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Erro ao carregar pedido:', error)
      }
    } finally {
      setLoadingData(false)
    }
  }

  const loadClientAddresses = async (clientId: number) => {
    try {
      const client = await clientsApi.get(clientId)
      setClientAddresses(client.addresses || [])
      
      // Pré-selecionar endereço padrão
      const defaultAddress = client.addresses?.find((a: any) => a.is_default) || client.addresses?.[0]
      if (defaultAddress) {
        setFormData(prev => ({
          ...prev,
          shipping_address_id: defaultAddress.id.toString()
        }))
        previousAddressRef.current = defaultAddress.id
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Erro ao carregar endereços:', error)
      }
      setClientAddresses([])
    }
  }

  const handleClientSelect = async (client: any) => {
    if (!client) {
      setSelectedClient(null)
      setClientAddresses([])
      setFormData(prev => ({ ...prev, client_id: '', shipping_address_id: '' }))
      setSelectedShipping(null)
      return
    }

    setSelectedClient(client)
    setFormData(prev => ({ ...prev, client_id: client.id.toString(), shipping_address_id: '' }))
    setSelectedShipping(null)
    await loadClientAddresses(client.id)
  }

  const handleSaveNewAddress = async (addressData: any) => {
    if (!selectedClient) {
      throw new Error('Cliente não selecionado')
    }

    try {
      const response = await clientsApi.addAddress(selectedClient.id, addressData)
      
      if (!response.success || !response.address) {
        throw new Error('Erro ao salvar endereço: resposta inválida da API')
      }

      await loadClientAddresses(selectedClient.id)
      setFormData(prev => ({
        ...prev,
        shipping_address_id: response.address.id.toString()
      }))
      setShowNewAddressForm(false)
      setShowAddressSelector(false)
    } catch (error: any) {
      // Re-throw para que o AddressForm possa exibir o erro
      throw error
    }
  }

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, {
        product_id: 'custom',
        title: '',
        price: '',
        quantity: 1,
        observations: ''
      }]
    })
  }

  const removeItem = (index: number) => {
    const newItems = formData.items.filter((_, i) => i !== index)
    setFormData({ ...formData, items: newItems })
  }

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...formData.items]
    newItems[index] = { ...newItems[index], [field]: value }
    
    if (field === 'product_id' && value && value !== 'custom') {
      const product = products.find((p: any) => p.id.toString() === value)
      if (product) {
        newItems[index].title = product.name
        newItems[index].price = product.base_price
      }
    }
    
    setFormData({ ...formData, items: newItems })
  }

  const calculateTotal = () => {
    const itemsTotal = formData.items.reduce((sum, item) => {
      return sum + (parseFloat(item.price || 0) * parseInt(item.quantity || 1))
    }, 0)
    const shippingTotal = selectedShipping ? parseFloat(selectedShipping.price) : 0
    return itemsTotal + shippingTotal
  }

  const handleShippingSelect = (option: ShippingOption) => {
    setSelectedShipping(option)
  }

  const handleNext = (e?: React.MouseEvent) => {
    // Prevenir qualquer comportamento padrão de formulário
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    
    // Validações por step
    if (currentStep === 1 && !formData.client_id) {
      toast.warning('Selecione um cliente')
      return
    }
    if (currentStep === 2 && formData.items.length === 0) {
      toast.warning('Adicione pelo menos um item')
      return
    }
    if (currentStep === 3 && !formData.shipping_address_id) {
      toast.warning('Selecione um endereço de entrega')
      return
    }
    if (currentStep === 3 && hasPhysicalItems && !selectedShipping) {
      toast.warning('Selecione uma modalidade de frete')
      return
    }

    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleEditStep = (stepNumber: number) => {
    setCurrentStep(stepNumber)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && currentStep < STEPS.length) {
      e.preventDefault()
      handleNext()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Se não estiver no último step, NUNCA processar - apenas avançar
    if (currentStep < STEPS.length) {
      handleNext()
      return
    }
    
    // Só processa se estiver EXATAMENTE no último step
    if (currentStep !== STEPS.length) {
      return
    }
    
    // Validações finais no último step (Revisão)
    if (!formData.client_id) {
      toast.warning('Selecione um cliente antes de salvar o pedido')
      return
    }
    if (formData.items.length === 0) {
      toast.warning('Adicione pelo menos um item antes de salvar o pedido')
      return
    }
    if (!formData.shipping_address_id) {
      toast.warning('Selecione um endereço de entrega antes de salvar o pedido')
      return
    }
    if (hasPhysicalItems && !selectedShipping) {
      toast.warning('Selecione uma modalidade de frete antes de salvar o pedido')
      return
    }

    setLoading(true)

    try {
      const itemsTotal = formData.items.reduce((sum, item) => {
        return sum + (parseFloat(item.price || 0) * parseInt(item.quantity || 1))
      }, 0)
      // total_shipping deve vir somente da opção selecionada (0 = frete grátis; > 0 = modalidade paga)
      const shippingTotal = selectedShipping ? parseFloat(selectedShipping.price) : 0

      const orderData: any = {
        client_id: parseInt(formData.client_id),
        items: formData.items.map(item => ({
          product_id: item.product_id && item.product_id !== 'custom' ? parseInt(item.product_id) : null,
          title: item.title,
          price: parseFloat(item.price),
          quantity: parseInt(item.quantity),
          observations: item.observations
        })),
        shipping_address_id: formData.shipping_address_id ? parseInt(formData.shipping_address_id) : null,
        total_items: itemsTotal,
        total: itemsTotal + shippingTotal,
      }

      // Add shipping data only when there are physical items and user selected a shipping option
      if (hasPhysicalItems && selectedShipping) {
        orderData.shipping_method = selectedShipping.name
        orderData.shipping_option_id = selectedShipping.id.toString()
        orderData.shipping_company_name = selectedShipping.company.name
        orderData.shipping_delivery_time = selectedShipping.delivery_time
        orderData.total_shipping = shippingTotal
        orderData.shipping_option_data = {
          delivery_range: selectedShipping.delivery_range,
          packages: selectedShipping.packages,
          originalPrice: selectedShipping.originalPrice, // Preço original antes do frete grátis
          freeShippingSelected: shippingTotal === 0, // true quando o vendedor escolheu a opção com frete grátis
        }
      } else {
        orderData.total_shipping = 0
      }

      if (isNew) {
        await ordersApi.create(orderData)
      } else {
        orderData.status = formData.status
        await ordersApi.update(orderId!, orderData)
      }

      onOpenChange(false)
      if (onSuccess) {
        onSuccess()
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar pedido')
    } finally {
      setLoading(false)
    }
  }

  const selectedAddress = clientAddresses.find((a: any) => a.id.toString() === formData.shipping_address_id)
  const itemsTotal = formData.items.reduce((sum, item) => {
    return sum + (parseFloat(item.price || 0) * parseInt(item.quantity || 1))
  }, 0)

  // Itens físicos: têm produto do catálogo com ao menos uma dimensão/peso (para cotação de frete)
  const hasPhysicalItems = useMemo(() => {
    return formData.items.some((item: any) => {
      if (!item.product_id || item.product_id === 'custom') return false
      const product = products.find((p: any) => p.id.toString() === item.product_id)
      if (!product) return false
      const w = Number(product.width)
      const h = Number(product.height)
      const l = Number(product.length)
      const weight = Number(product.weight)
      return (w > 0) || (h > 0) || (l > 0) || (weight > 0)
    })
  }, [formData.items, products])

  const physicalProductsForQuote = useMemo(() => {
    return formData.items
      .filter((item: any) => {
        if (!item.product_id || item.product_id === 'custom') return false
        const product = products.find((p: any) => p.id.toString() === item.product_id)
        if (!product) return false
        const w = Number(product.width)
        const h = Number(product.height)
        const l = Number(product.length)
        const weight = Number(product.weight)
        return (w > 0) || (h > 0) || (l > 0) || (weight > 0)
      })
      .map((item: any, index: number) => {
        const product = products.find((p: any) => p.id.toString() === item.product_id)
        return {
          id: item.product_id,
          largura: product?.width ? Number(product.width) : undefined,
          altura: product?.height ? Number(product.height) : undefined,
          comprimento: product?.length ? Number(product.length) : undefined,
          peso: product?.weight ? Number(product.weight) : undefined,
          valor: parseFloat(item.price || 0) * parseInt(item.quantity || 1),
          quantidade: parseInt(item.quantity || 1),
        }
      })
  }, [formData.items, products])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Novo Pedido' : 'Editar Pedido'}</DialogTitle>
          <DialogDescription>
            {isNew ? 'Crie um novo pedido no sistema' : 'Edite as informações do pedido'}
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Steps Indicator */}
            <Card>
              <CardContent className="pt-6">
                <CheckoutSteps currentStep={currentStep} steps={STEPS} />
              </CardContent>
            </Card>

            {/* Step 1: Cliente */}
            {currentStep === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Cliente
                  </CardTitle>
                  <CardDescription>Selecione o cliente para o pedido</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="client_search">Cliente *</Label>
                    <ClientSearch
                      value={selectedClient?.id || null}
                      onSelect={handleClientSelect}
                      placeholder="Buscar cliente por nome ou CPF..."
                    />
                  </div>
                  {selectedClient && (
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{selectedClient.name}</p>
                          <p className="text-sm text-muted-foreground">
                            CPF: {formatCPF(selectedClient.cpf)}
                          </p>
                          {selectedClient.email && (
                            <p className="text-sm text-muted-foreground">
                              Email: {selectedClient.email}
                            </p>
                          )}
                        </div>
                        {selectedClient.whatsapp && (
                          <a
                            href={`https://wa.me/${selectedClient.whatsapp.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-green-600 hover:underline flex items-center gap-1"
                          >
                            <MessageCircle className="h-4 w-4" />
                            {formatPhone(selectedClient.whatsapp)}
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 2: Itens */}
            {currentStep === 2 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Itens do Pedido
                      </CardTitle>
                      <CardDescription>Adicione os itens do pedido</CardDescription>
                    </div>
                    <Button type="button" variant="outline" onClick={addItem}>
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Item
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {freteClearedWarning && (
                    <div className="mb-4 p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      A modalidade de frete foi limpa porque os itens foram modificados.
                    </div>
                  )}
                  {formData.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum item adicionado. Clique em "Adicionar Item" para começar.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {formData.items.map((item, index) => (
                        <div key={index} className="border rounded-lg p-4 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs text-muted-foreground">Produto</label>
                              <Select
                                value={item.product_id}
                                onValueChange={(value) => updateItem(index, 'product_id', value)}
                              >
                                <SelectTrigger className="mt-1">
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="custom">Personalizado</SelectItem>
                                  {products.map((product: any) => (
                                    <SelectItem key={product.id} value={product.id.toString()}>
                                      {product.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Preço</label>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.price}
                                onChange={(e) => updateItem(index, 'price', e.target.value)}
                                onKeyDown={handleInputKeyDown}
                                placeholder="0.00"
                                className="mt-1"
                                required
                              />
                            </div>
                            <div className="flex gap-2 items-end">
                              <div className="flex-1">
                                <label className="text-xs text-muted-foreground">Quantidade</label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                                  onKeyDown={handleInputKeyDown}
                                  className="mt-1"
                                  required
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItem(index)}
                                className="shrink-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-muted-foreground">Título</label>
                              <Input
                                value={item.title}
                                onChange={(e) => updateItem(index, 'title', e.target.value)}
                                onKeyDown={handleInputKeyDown}
                                placeholder="Título do item"
                                className="mt-1"
                                required
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Observações</label>
                              <Input
                                value={item.observations}
                                onChange={(e) => updateItem(index, 'observations', e.target.value)}
                                onKeyDown={handleInputKeyDown}
                                placeholder="Observações"
                                className="mt-1"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {formData.items.length > 0 && (
                    <div className="mt-4 flex justify-end">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Subtotal Itens</p>
                        <p className="text-xl font-bold">{formatCurrency(itemsTotal)}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 3: Endereço e Frete */}
            {currentStep === 3 && (
              <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Endereço de Entrega
                  </CardTitle>
                  <CardDescription>Selecione ou cadastre o endereço de entrega</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!showNewAddressForm && !showAddressSelector && selectedAddress && (
                    <div className="space-y-4">
                      <div className="p-4 border rounded-lg bg-primary/5 border-primary">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">
                              {selectedAddress.street}, {selectedAddress.number}
                            </p>
                            {selectedAddress.complement && (
                              <p className="text-sm text-muted-foreground">
                                {selectedAddress.complement}
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground">
                              {selectedAddress.neighborhood} - {selectedAddress.city}/{selectedAddress.state}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              CEP: {selectedAddress.cep}
                            </p>
                            {selectedAddress.is_default && (
                              <Badge variant="outline" className="mt-2">
                                Endereço Padrão
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {clientAddresses.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setShowAddressSelector(true)
                              setShowNewAddressForm(false)
                            }}
                          >
                            Selecionar Outro Endereço
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setShowNewAddressForm(true)
                            setShowAddressSelector(false)
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Cadastrar Novo Endereço
                        </Button>
                      </div>
                    </div>
                  )}

                  {showAddressSelector && !showNewAddressForm && (
                    <div className="space-y-4">
                      <h3 className="font-medium">Selecione um endereço</h3>
                      <div className="space-y-2">
                        {clientAddresses.map((address: any) => (
                          <div
                            key={address.id}
                            className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                              formData.shipping_address_id === address.id.toString()
                                ? "border-primary bg-primary/5"
                                : "hover:border-primary/50"
                            }`}
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                shipping_address_id: address.id.toString()
                              }))
                              setShowAddressSelector(false)
                            }}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-medium">
                                  {address.street}, {address.number}
                                </p>
                                {address.complement && (
                                  <p className="text-sm text-muted-foreground">
                                    {address.complement}
                                  </p>
                                )}
                                <p className="text-sm text-muted-foreground">
                                  {address.neighborhood} - {address.city}/{address.state}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  CEP: {address.cep}
                                </p>
                                {address.is_default && (
                                  <Badge variant="outline" className="mt-2">
                                    Padrão
                                  </Badge>
                                )}
                              </div>
                              {formData.shipping_address_id === address.id.toString() && (
                                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                  <div className="w-2 h-2 rounded-full bg-white" />
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowAddressSelector(false)
                        }}
                      >
                        Voltar
                      </Button>
                    </div>
                  )}

                  {showNewAddressForm && !showAddressSelector && (
                    <div className="space-y-4">
                      <h3 className="font-medium">Cadastrar Novo Endereço</h3>
                      <AddressForm
                        clientId={selectedClient?.id || 0}
                        onSave={handleSaveNewAddress}
                        onCancel={() => {
                          setShowNewAddressForm(false)
                        }}
                      />
                    </div>
                  )}

                  {!selectedAddress && !showNewAddressForm && !showAddressSelector && (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="mb-4">Nenhum endereço selecionado</p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowNewAddressForm(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Cadastrar Novo Endereço
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Truck className="h-5 w-5" />
                        Frete
                      </CardTitle>
                      <CardDescription>
                        Selecione a modalidade de frete para o endereço selecionado
                      </CardDescription>
                    </div>
                    {activeEnvironment && (
                      <EnvironmentBadge environment={activeEnvironment} className="text-xs" />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {freteClearedWarning && (
                    <div className="mb-4 p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      A modalidade de frete foi limpa porque os itens ou endereço foram modificados.
                    </div>
                  )}
                  {!selectedAddress ? (
                    <p className="text-center text-muted-foreground py-8">
                      Selecione um endereço acima
                    </p>
                  ) : !hasPhysicalItems ? (
                    <p className="text-center text-muted-foreground py-8">
                      Este pedido contém apenas itens digitais. Não é necessário selecionar frete.
                    </p>
                  ) : (
                    <>
                      {selectedShipping ? (
                        <div className="space-y-4">
                          <div className="p-4 border rounded-lg bg-primary/5 border-primary">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <Badge variant="outline">{selectedShipping.name}</Badge>
                                  <span className="font-semibold">{selectedShipping.company.name}</span>
                                  {activeEnvironment && <EnvironmentBadge environment={activeEnvironment} />}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Prazo: {selectedShipping.delivery_time} dias úteis
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xl font-bold">
                                  {formatCurrency(parseFloat(selectedShipping.price))}
                                </p>
                              </div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSelectedShipping(null)}
                          >
                            Alterar Frete
                          </Button>
                        </div>
                      ) : (
                        <ShippingSelector
                          cep={selectedAddress.cep}
                          produtos={physicalProductsForQuote}
                          orderValue={itemsTotal}
                          destinationState={selectedAddress?.state}
                          // environment removido - componente busca automaticamente ou API usa padrão
                          onSelect={handleShippingSelect}
                        />
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
              </div>
            )}

            {/* Step 4: Revisão */}
            {currentStep === 4 && (
              <div className="space-y-4">
                {/* Dados do Cliente */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        <CardTitle>Cliente</CardTitle>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditStep(1)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {selectedClient ? (
                      <div className="space-y-2">
                        <p className="font-medium text-lg">{selectedClient.name}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">CPF: </span>
                            <span>{formatCPF(selectedClient.cpf)}</span>
                          </div>
                          {selectedClient.email && (
                            <div>
                              <span className="text-muted-foreground">Email: </span>
                              <span>{selectedClient.email}</span>
                            </div>
                          )}
                          {selectedClient.whatsapp && (
                            <div>
                              <span className="text-muted-foreground">WhatsApp: </span>
                              <a
                                href={`https://wa.me/${selectedClient.whatsapp.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:underline flex items-center gap-1"
                              >
                                <MessageCircle className="h-3 w-3" />
                                {formatPhone(selectedClient.whatsapp)}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-destructive">Cliente não selecionado</p>
                    )}
                  </CardContent>
                </Card>

                {/* Itens do Pedido */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        <CardTitle>Itens do Pedido</CardTitle>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditStep(2)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {formData.items.length > 0 ? (
                      <div className="space-y-4">
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead className="text-right">Quantidade</TableHead>
                                <TableHead className="text-right">Preço Unit.</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {formData.items.map((item, index) => {
                                const itemTotal = parseFloat(item.price || 0) * parseInt(item.quantity || 1)
                                const product = products.find((p: any) => p.id.toString() === item.product_id)
                                return (
                                  <TableRow key={index}>
                                    <TableCell>
                                      <div>
                                        <p className="font-medium">{item.title}</p>
                                        {product && (
                                          <p className="text-xs text-muted-foreground">
                                            Produto: {product.name}
                                          </p>
                                        )}
                                        {item.observations && (
                                          <p className="text-xs text-muted-foreground mt-1 italic">
                                            Obs: {item.observations}
                                          </p>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right">{item.quantity}</TableCell>
                                    <TableCell className="text-right">
                                      {formatCurrency(parseFloat(item.price || 0))}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                      {formatCurrency(itemTotal)}
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="flex justify-end pt-2 border-t">
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Subtotal dos Itens</p>
                            <p className="text-lg font-semibold">{formatCurrency(itemsTotal)}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-destructive">Nenhum item adicionado</p>
                    )}
                  </CardContent>
                </Card>

                {/* Endereço de Entrega */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-5 w-5" />
                        <CardTitle>Endereço de Entrega</CardTitle>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditStep(3)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {selectedAddress ? (
                      <div className="space-y-2">
                        <p className="font-medium">
                          {selectedAddress.street}, {selectedAddress.number}
                        </p>
                        {selectedAddress.complement && (
                          <p className="text-sm text-muted-foreground">
                            {selectedAddress.complement}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {selectedAddress.neighborhood} - {selectedAddress.city}/{selectedAddress.state}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          CEP: {selectedAddress.cep}
                        </p>
                        {selectedAddress.is_default && (
                          <Badge variant="outline" className="mt-2">
                            Endereço Padrão
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-destructive">Endereço não selecionado</p>
                    )}
                  </CardContent>
                </Card>

                {/* Frete */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Truck className="h-5 w-5" />
                        <CardTitle>Frete</CardTitle>
                      </div>
                      {hasPhysicalItems && selectedShipping && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditStep(3)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {!hasPhysicalItems ? (
                      <p className="text-sm text-muted-foreground">
                        Este pedido contém apenas itens digitais. Não é necessário frete.
                      </p>
                    ) : selectedShipping ? (
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Badge variant="outline">{selectedShipping.name}</Badge>
                              <span className="font-semibold">{selectedShipping.company.name}</span>
                              {activeEnvironment && <EnvironmentBadge environment={activeEnvironment} />}
                            </div>
                            <div className="space-y-1 text-sm">
                              <p className="text-muted-foreground">
                                Prazo: {selectedShipping.delivery_time} dias úteis
                                {selectedShipping.delivery_range && 
                                 selectedShipping.delivery_range.min !== selectedShipping.delivery_range.max && (
                                  <span className="ml-1">
                                    ({selectedShipping.delivery_range.min} a {selectedShipping.delivery_range.max} dias)
                                  </span>
                                )}
                              </p>
                              {selectedShipping.delivery_time > 0 && (
                                <p className="text-primary font-medium">
                                  Entrega estimada: {formatDeliveryDate(calculateDeliveryDate(selectedShipping.delivery_time))}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold">
                              {formatCurrency(parseFloat(selectedShipping.price))}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Nenhuma modalidade de frete selecionada
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditStep(3)}
                        >
                          <Truck className="h-4 w-4 mr-2" />
                          Selecionar Frete
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Status (apenas em edição) */}
                {!isNew && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        <CardTitle>Status do Pedido</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <Label htmlFor="status_review">Status</Label>
                        <Select
                          value={formData.status}
                          onValueChange={(value) => setFormData({ ...formData, status: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Resumo Financeiro */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      <CardTitle>Resumo Financeiro</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Subtotal dos Itens:</span>
                        <span className="font-medium">{formatCurrency(itemsTotal)}</span>
                      </div>
                      {selectedShipping && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Frete:</span>
                          <span className="font-medium">{formatCurrency(parseFloat(selectedShipping.price))}</span>
                        </div>
                      )}
                      {!selectedShipping && (
                        <div className="flex justify-between items-center text-sm text-muted-foreground">
                          <span>Frete:</span>
                          <span>Não selecionado</span>
                        </div>
                      )}
                      <div className="pt-3 border-t">
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-semibold">Total do Pedido:</span>
                          <span className="text-2xl font-bold text-primary">
                            {formatCurrency(calculateTotal())}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Validações e Avisos */}
                {(!formData.client_id || formData.items.length === 0 || !formData.shipping_address_id) && (
                  <Card className="border-yellow-200 bg-yellow-50">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                        <div className="flex-1 space-y-1">
                          <p className="font-medium text-yellow-900">Atenção: Informações incompletas</p>
                          <ul className="text-sm text-yellow-800 list-disc list-inside space-y-1">
                            {!formData.client_id && <li>Cliente não selecionado</li>}
                            {formData.items.length === 0 && <li>Nenhum item adicionado</li>}
                            {!formData.shipping_address_id && <li>Endereço de entrega não selecionado</li>}
                          </ul>
                          <p className="text-sm text-yellow-800 mt-2">
                            Use os botões "Editar" acima para completar as informações necessárias.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Navegação */}
            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 1}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              {currentStep < STEPS.length ? (
                <Button 
                  type="button" 
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleNext(e)
                  }}
                >
                  Próximo
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button 
                  type="submit" 
                  disabled={loading || !formData.client_id || formData.items.length === 0 || !formData.shipping_address_id || !selectedShipping}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Confirmar e Salvar Pedido
                    </>
                  )}
                </Button>
              )}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
