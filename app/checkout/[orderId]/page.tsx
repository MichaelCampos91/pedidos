"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckoutSteps } from "@/components/checkout/CheckoutSteps"
import { PaymentForm } from "@/components/checkout/PaymentForm"
import { Loader2, ArrowLeft, ArrowRight, Truck } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

const STEPS = [
  { id: 1, name: "Itens", description: "Confirme os itens" },
  { id: 2, name: "Frete", description: "Escolha o frete" },
  { id: 3, name: "Endereço", description: "Selecione o endereço" },
  { id: 4, name: "Pagamento", description: "Finalize o pagamento" },
]

export default function CheckoutPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.orderId as string

  const [loading, setLoading] = useState(true)
  const [currentStep, setCurrentStep] = useState(1)
  const [order, setOrder] = useState<any>(null)
  const [selectedAddress, setSelectedAddress] = useState<number | null>(null)
  const [shippingOptions, setShippingOptions] = useState<any[]>([])
  const [selectedShipping, setSelectedShipping] = useState<any>(null)
  const [loadingShipping, setLoadingShipping] = useState(false)

  useEffect(() => {
    loadCheckoutData()
  }, [orderId])

  const loadCheckoutData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/checkout/${orderId}`)
      if (!response.ok) {
        throw new Error("Pedido não encontrado")
      }
      const data = await response.json()
      setOrder(data)
      setSelectedAddress(data.shipping_address_id || (data.addresses?.[0]?.id || null))
    } catch (error) {
      console.error("Erro ao carregar checkout:", error)
      alert("Erro ao carregar dados do pedido")
    } finally {
      setLoading(false)
    }
  }

  const loadShippingOptions = async () => {
    if (!selectedAddress) return

    const address = order.addresses?.find((a: any) => a.id === selectedAddress)
    if (!address) return

    setLoadingShipping(true)
    try {
      const response = await fetch('/api/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cep_destino: address.cep,
          peso: '0.5', // Peso padrão, pode ser calculado dos itens
          altura: '10',
          largura: '20',
          comprimento: '30',
          valor: totalItems.toString(),
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setShippingOptions(data.options || [])
      }
    } catch (error) {
      console.error('Erro ao carregar opções de frete:', error)
    } finally {
      setLoadingShipping(false)
    }
  }

  const handleNext = async () => {
    if (currentStep === 2) {
      // Carregar opções de frete quando selecionar endereço
      if (selectedAddress && shippingOptions.length === 0) {
        await loadShippingOptions()
        return // Não avança ainda, espera seleção do frete
      }
      if (!selectedShipping) {
        alert('Selecione uma opção de frete')
        return
      }
      // Salvar frete selecionado no pedido
      await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipping_method: selectedShipping.name,
          total_shipping: parseFloat(selectedShipping.price),
          total: totalItems + parseFloat(selectedShipping.price),
        }),
      })
    }
    if (currentStep === 3) {
      // Salvar endereço selecionado
      if (selectedAddress) {
        await fetch(`/api/checkout/${orderId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shipping_address_id: selectedAddress }),
        })
      }
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Pedido não encontrado
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalItems = order.items?.reduce((sum: number, item: any) => {
    return sum + parseFloat(item.price) * parseInt(item.quantity)
  }, 0) || 0

  const totalShipping = selectedShipping ? parseFloat(selectedShipping.price) : 0
  const totalWithShipping = totalItems + totalShipping

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Checkout</h1>
          <p className="text-muted-foreground">
            Pedido #{orderId} - {order.client_name}
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <CheckoutSteps currentStep={currentStep} steps={STEPS} />
          </CardContent>
        </Card>

        {/* Etapa 1: Itens */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Itens do Pedido</CardTitle>
              <CardDescription>Confirme os itens e valores</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {order.items?.map((item: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{item.title}</p>
                      {item.observations && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.observations}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground mt-1">
                        Quantidade: {item.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatCurrency(parseFloat(item.price) * parseInt(item.quantity))}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(parseFloat(item.price))} cada
                      </p>
                    </div>
                  </div>
                ))}
                <div className="border-t pt-4 flex justify-between items-center">
                  <span className="text-lg font-semibold">Total:</span>
                  <span className="text-2xl font-bold">
                    {formatCurrency(totalItems)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Etapa 2: Frete */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Frete</CardTitle>
              <CardDescription>Selecione o endereço e escolha a modalidade de frete</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Seleção de endereço primeiro */}
                <div>
                  <h3 className="font-medium mb-4">Endereço de Entrega</h3>
                  <div className="space-y-4">
                    {order.addresses?.map((address: any) => (
                      <div
                        key={address.id}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedAddress === address.id
                            ? "border-primary bg-primary/5"
                            : "hover:border-primary/50"
                        }`}
                        onClick={() => {
                          setSelectedAddress(address.id)
                          setShippingOptions([])
                          setSelectedShipping(null)
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
                          </div>
                          {selectedAddress === address.id && (
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <div className="w-2 h-2 rounded-full bg-white" />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Opções de frete */}
                {selectedAddress && (
                  <div>
                    <h3 className="font-medium mb-4">Modalidades de Frete</h3>
                    {loadingShipping ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : shippingOptions.length === 0 ? (
                      <Button
                        variant="outline"
                        onClick={loadShippingOptions}
                        className="w-full"
                      >
                        Calcular Frete
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        {shippingOptions.map((option: any) => (
                          <div
                            key={option.id}
                            className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                              selectedShipping?.id === option.id
                                ? "border-primary bg-primary/5"
                                : "hover:border-primary/50"
                            }`}
                            onClick={() => setSelectedShipping(option)}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{option.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {option.company.name} - {option.delivery_time} dias úteis
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold">
                                  {formatCurrency(parseFloat(option.price))}
                                </p>
                                {selectedShipping?.id === option.id && (
                                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center mt-2 ml-auto">
                                    <div className="w-2 h-2 rounded-full bg-white" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(!order.addresses || order.addresses.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum endereço cadastrado. Selecione um endereço na próxima etapa.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Etapa 3: Endereço */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Endereço de Entrega</CardTitle>
              <CardDescription>Selecione o endereço de entrega</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {order.addresses?.map((address: any) => (
                  <div
                    key={address.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedAddress === address.id
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/50"
                    }`}
                    onClick={() => setSelectedAddress(address.id)}
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
                          <span className="inline-block mt-2 px-2 py-1 text-xs bg-primary/10 text-primary rounded">
                            Padrão
                          </span>
                        )}
                      </div>
                      {selectedAddress === address.id && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-white" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {(!order.addresses || order.addresses.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum endereço cadastrado
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Etapa 4: Pagamento */}
        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Pagamento</CardTitle>
              <CardDescription>Escolha a forma de pagamento</CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentForm
                orderId={parseInt(orderId)}
                total={totalWithShipping}
                customer={{
                  name: order.client_name,
                  email: order.client_email || '',
                  document: order.client_cpf,
                  phone: order.client_whatsapp,
                }}
                onSuccess={(transaction) => {
                  if (transaction.status === 'paid') {
                    alert('Pagamento confirmado! Redirecionando...')
                    // Redirecionar para página de sucesso ou pedido
                  } else {
                    alert('Pagamento processado. Aguardando confirmação...')
                  }
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Navegação */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          {currentStep < STEPS.length && (
            <Button onClick={handleNext} disabled={(currentStep === 2 && (!selectedAddress || !selectedShipping)) || (currentStep === 3 && !selectedAddress)}>
              Próximo
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
