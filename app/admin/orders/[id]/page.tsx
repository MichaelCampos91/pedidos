"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Save, Plus, Trash2, MessageCircle } from "lucide-react"
import { ordersApi, clientsApi, productsApi } from "@/lib/api"
import { formatCurrency, formatCPF, formatPhone } from "@/lib/utils"

const STATUS_OPTIONS = [
  { value: 'aguardando_pagamento', label: 'Aguardando Pagamento' },
  { value: 'aguardando_producao', label: 'Aguardando Produção' },
  { value: 'em_producao', label: 'Em Produção' },
  { value: 'aguardando_envio', label: 'Aguardando Envio' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'nao_pagos', label: 'Não Pagos' },
  { value: 'cancelados', label: 'Cancelados' }
]

export default function OrderFormPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const isNew = id === 'new'

  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(!isNew)
  const [clients, setClients] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [formData, setFormData] = useState({
    client_id: '',
    status: 'aguardando_pagamento',
    items: [] as any[],
    shipping_address_id: ''
  })

  useEffect(() => {
    loadClients()
    loadProducts()
    if (!isNew) {
      loadOrder()
    }
  }, [id])

  const loadClients = async () => {
    try {
      const response = await clientsApi.list({ per_page: 100 })
      setClients(response.data)
    } catch (error) {
      console.error('Erro ao carregar clientes:', error)
    }
  }

  const loadProducts = async () => {
    try {
      const data = await productsApi.list()
      setProducts(data.filter((p: any) => p.active))
    } catch (error) {
      console.error('Erro ao carregar produtos:', error)
    }
  }

  const loadOrder = async () => {
    try {
      setLoadingData(true)
      const order = await ordersApi.get(parseInt(id))
      setFormData({
        client_id: order.client_id.toString(),
        status: order.status,
        items: (order.items || []).map((item: any) => ({
          ...item,
          product_id: item.product_id ? item.product_id.toString() : 'custom'
        })),
        shipping_address_id: order.shipping_address_id?.toString() || ''
      })
    } catch (error) {
      console.error('Erro ao carregar pedido:', error)
    } finally {
      setLoadingData(false)
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
    
    // Se selecionou um produto, preencher título e preço
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
    return formData.items.reduce((sum, item) => {
      return sum + (parseFloat(item.price || 0) * parseInt(item.quantity || 1))
    }, 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.client_id || formData.items.length === 0) {
      alert('Selecione um cliente e adicione pelo menos um item')
      return
    }

    setLoading(true)

    try {
      const orderData = {
        client_id: parseInt(formData.client_id),
        items: formData.items.map(item => ({
          product_id: item.product_id && item.product_id !== 'custom' ? parseInt(item.product_id) : null,
          title: item.title,
          price: parseFloat(item.price),
          quantity: parseInt(item.quantity),
          observations: item.observations
        })),
        shipping_address_id: formData.shipping_address_id ? parseInt(formData.shipping_address_id) : null
      }

      if (isNew) {
        await ordersApi.create(orderData)
      } else {
        const total = calculateTotal()
        await ordersApi.update(parseInt(id), {
          ...orderData,
          status: formData.status,
          total_items: total,
          total: total
        })
      }
      router.push('/admin/orders')
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar pedido')
      setLoading(false)
    }
  }

  const selectedClient = clients.find((c: any) => c.id.toString() === formData.client_id)

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{isNew ? 'Novo Pedido' : 'Editar Pedido'}</h2>
        <p className="text-muted-foreground">
          {isNew ? 'Crie um novo pedido no sistema' : 'Edite as informações do pedido'}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Dados do Pedido</CardTitle>
            <CardDescription>Informações básicas do pedido</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client_id">Cliente *</Label>
                <Select
                  value={formData.client_id}
                  onValueChange={(value) => setFormData({ ...formData, client_id: value, shipping_address_id: '' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client: any) => (
                      <SelectItem key={client.id} value={client.id.toString()}>
                        {client.name} - {formatCPF(client.cpf)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedClient && (
                  <div className="mt-2">
                    <a
                      href={`https://wa.me/${selectedClient.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-green-600 hover:underline flex items-center gap-1"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {formatPhone(selectedClient.whatsapp)}
                    </a>
                  </div>
                )}
              </div>
              {!isNew && (
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
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
              )}
              {selectedClient && selectedClient.addresses && selectedClient.addresses.length > 0 && (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="shipping_address_id">Endereço de Entrega</Label>
                  <Select
                    value={formData.shipping_address_id}
                    onValueChange={(value) => setFormData({ ...formData, shipping_address_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um endereço" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedClient.addresses.map((address: any) => (
                        <SelectItem key={address.id} value={address.id.toString()}>
                          {address.street}, {address.number} - {address.city}/{address.state}
                          {address.is_default && ' (Padrão)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Itens do Pedido</CardTitle>
                <CardDescription>Adicione os itens do pedido</CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {formData.items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum item adicionado. Clique em "Adicionar Item" para começar.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>Observações</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formData.items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Select
                          value={item.product_id}
                          onValueChange={(value) => updateItem(index, 'product_id', value)}
                        >
                          <SelectTrigger>
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
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.title}
                          onChange={(e) => updateItem(index, 'title', e.target.value)}
                          placeholder="Título do item"
                          required
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.price}
                          onChange={(e) => updateItem(index, 'price', e.target.value)}
                          placeholder="0.00"
                          required
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                          required
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.observations}
                          onChange={(e) => updateItem(index, 'observations', e.target.value)}
                          placeholder="Observações"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {formData.items.length > 0 && (
              <div className="mt-4 flex justify-end">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{formatCurrency(calculateTotal())}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-4 mt-6">
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar
              </>
            )}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  )
}
