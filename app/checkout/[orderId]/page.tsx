"use client"

import { useState, useEffect } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckoutSteps } from "@/components/checkout/CheckoutSteps"
import { PaymentForm } from "@/components/checkout/PaymentForm"
import { Collapsible, CollapsibleContent, CollapsibleHeader } from "@/components/ui/collapsible"
import { Loader2, AlertCircle, FileText, CreditCard, CheckCircle2, XCircle, Lock, Truck, MessageCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { calculateDeliveryDate, formatDeliveryDate } from "@/lib/shipping-utils"
import { formatDeliveryTime } from "@/lib/melhor-envio-utils"

// Steps do checkout
const STEPS = [
  { id: 1, name: "Revisão", description: "Revise seu pedido", icon: FileText },
  { id: 2, name: "Pagamento", description: "Escolha o pagamento", icon: CreditCard },
  { id: 3, name: "Concluído", description: "Pedido finalizado", icon: CheckCircle2 },
]

// Funções auxiliares
const truncateText = (text: string, maxLength: number): string => {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

const openWhatsApp = (message: string) => {
  const phoneNumber = "5518997264861" // (18) 99726-4861
  const encodedMessage = encodeURIComponent(message)
  const url = `https://wa.me/${phoneNumber}?text=${encodedMessage}`
  window.open(url, '_blank')
}

const checkCheckoutCompleted = (orderId: string): boolean => {
  if (typeof window === 'undefined') return false
  const key = `checkout_completed_${orderId}`
  return localStorage.getItem(key) === 'true'
}

const markCheckoutCompleted = (orderId: string) => {
  if (typeof window === 'undefined') return
  const key = `checkout_completed_${orderId}`
  localStorage.setItem(key, 'true')
}

export default function CheckoutPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const orderId = params.orderId as string

  const [loading, setLoading] = useState(true)
  const [currentStep, setCurrentStep] = useState(1)
  const [order, setOrder] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending' | 'failed' | null>(null)
  const [itemsExpanded, setItemsExpanded] = useState(false)
  const [addressExpanded, setAddressExpanded] = useState(false)

  useEffect(() => {
    loadCheckoutData()
  }, [orderId])

  useEffect(() => {
    // Verificar se checkout já foi concluído
    if (checkCheckoutCompleted(orderId)) {
      setCurrentStep(3)
    }
  }, [orderId])


  const loadCheckoutData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Extrair token da URL
      const token = searchParams.get('token')
      const url = token 
        ? `/api/checkout/${orderId}?token=${token}`
        : `/api/checkout/${orderId}`
      
      const response = await fetch(url)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
        throw new Error(errorData.error || "Erro ao carregar pedido")
      }
      
      const data = await response.json()
      setOrder(data)
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Erro ao carregar checkout:", error)
      }
      setError(error.message || "Erro ao carregar dados do pedido")
    } finally {
      setLoading(false)
    }
  }

  const handlePaymentSuccess = (transaction: any) => {
    setPaymentStatus(transaction.status === 'paid' ? 'paid' : transaction.status === 'failed' ? 'failed' : 'pending')
    markCheckoutCompleted(orderId)
    setCurrentStep(3)
  }

  const handleRequestChange = () => {
    openWhatsApp("Olá, preciso alterar os dados do meu pedido.")
  }

  const handleGoToPayment = () => {
    if (checkCheckoutCompleted(orderId)) {
      setCurrentStep(3)
      return
    }
    setCurrentStep(2)
  }

  const handleBack = () => {
    if (checkCheckoutCompleted(orderId)) return // Bloquear navegação se concluído
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Erro ao acessar checkout
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                {error || "Pedido não encontrado"}
              </p>
              <p className="text-sm text-muted-foreground">
                Se você recebeu um link de pagamento, verifique se ele está correto e não expirou.
                Entre em contato com o vendedor para solicitar um novo link.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const totalItems = order.items?.reduce((sum: number, item: any) => {
    return sum + parseFloat(item.price) * parseInt(item.quantity)
  }, 0) || 0

  const totalShipping = parseFloat(order.total_shipping || 0)
  const totalWithShipping = totalItems + totalShipping

  // Buscar endereço selecionado
  const selectedAddress = order.addresses?.find((a: any) => a.id === order.shipping_address_id) || order.addresses?.[0]

  // Preparar dados do frete
  const shippingData = order.shipping_option_data 
    ? (typeof order.shipping_option_data === 'string' 
        ? JSON.parse(order.shipping_option_data) 
        : order.shipping_option_data)
    : {}

  const deliveryDate = order.shipping_delivery_time 
    ? calculateDeliveryDate(order.shipping_delivery_time)
    : null

  const isCompleted = checkCheckoutCompleted(orderId)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="container mx-auto px-4 max-w-4xl flex-1 py-8">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src="/logo.png"
            alt="Cenário Studio"
            width={200}
            height={80}
            className="object-contain"
            priority
          />
        </div>

        {/* Stepper */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <CheckoutSteps currentStep={currentStep} steps={STEPS} />
          </CardContent>
        </Card>

        {/* Etapa 1: Revisão */}
        {currentStep === 1 && (
          <div className="space-y-4">
            {/* Collapsible Itens */}
            <Card>
              <Collapsible open={itemsExpanded} onOpenChange={setItemsExpanded}>
                <CollapsibleHeader isOpen={itemsExpanded} className="border-0">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">Itens ({order.items?.length || 0})</h3>
                      {!itemsExpanded && (
                        <div className="mt-1">
                          <p className="text-sm text-muted-foreground">
                            {order.items?.map((item: any) => truncateText(item.title, 30)).join(', ')}
                          </p>
                          <p className="text-sm font-medium mt-1">
                            Subtotal: {formatCurrency(totalItems)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CollapsibleHeader>
                <CollapsibleContent className="px-4 pb-4">
                  <div className="space-y-4 pt-2">
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
                      <span className="text-lg font-semibold">Subtotal:</span>
                      <span className="text-xl font-bold">
                        {formatCurrency(totalItems)}
                      </span>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Collapsible Endereço */}
            {selectedAddress && (
              <Card>
                <Collapsible open={addressExpanded} onOpenChange={setAddressExpanded}>
                  <CollapsibleHeader isOpen={addressExpanded} className="border-0">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">Endereço</h3>
                        {!addressExpanded && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {truncateText(selectedAddress.street, 30)}, {selectedAddress.number}
                          </p>
                        )}
                      </div>
                    </div>
                  </CollapsibleHeader>
                  <CollapsibleContent className="px-4 pb-4">
                    <div className="pt-2">
                      <div className="p-4 border rounded-lg bg-muted/30">
                        <p className="font-medium">
                          {selectedAddress.street}, {selectedAddress.number}
                        </p>
                        {selectedAddress.complement && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {selectedAddress.complement}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground mt-1">
                          {selectedAddress.neighborhood} - {selectedAddress.city}/{selectedAddress.state}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          CEP: {selectedAddress.cep}
                        </p>
                        {selectedAddress.is_default && (
                          <Badge variant="outline" className="mt-2">
                            Padrão
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            )}

            {/* Seção Frete */}
            {order.shipping_method && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Truck className="h-5 w-5 text-primary" />
                        <p className="font-semibold text-lg">{order.shipping_company_name || order.shipping_method}</p>
                        <Badge variant="outline">{order.shipping_method}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Prazo: {order.shipping_delivery_time ? formatDeliveryTime(order.shipping_delivery_time) : 'A calcular'}
                      </p>
                      {deliveryDate && (
                        <p className="text-sm font-medium text-primary mt-1">
                          Data prevista: {formatDeliveryDate(deliveryDate)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        {formatCurrency(totalShipping)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Botões */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <Button
                variant="outline"
                onClick={handleRequestChange}
                className="flex-1"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Solicitar Alteração
              </Button>
              <Button
                onClick={handleGoToPayment}
                className="flex-1"
              >
                Ir para pagamento
              </Button>
            </div>
          </div>
        )}

        {/* Etapa 2: Pagamento */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pagamento</CardTitle>
                <CardDescription>Escolha a forma de pagamento</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Mensagem de Segurança */}
                <div className="flex items-center gap-2 mb-6 p-3 bg-muted/50 rounded-lg">
                  <Lock className="h-4 w-4 text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Seus dados estão protegidos e seguros
                  </p>
                </div>

                <PaymentForm
                  orderId={parseInt(orderId)}
                  total={totalWithShipping}
                  customer={{
                    name: order.client_name,
                    email: order.client_email || '',
                    document: order.client_cpf,
                    phone: order.client_whatsapp,
                  }}
                  onSuccess={handlePaymentSuccess}
                />
              </CardContent>
            </Card>

            {/* Botões */}
            {!isCompleted && (
              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  className="flex-1"
                >
                  Voltar
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Etapa 3: Concluído */}
        {currentStep === 3 && (
          <Card>
            <CardContent className="pt-12 pb-12">
              <div className="flex flex-col items-center text-center space-y-4">
                {paymentStatus === 'paid' ? (
                  <>
                    <CheckCircle2 className="h-16 w-16 text-green-600" />
                    <h2 className="text-2xl font-bold text-green-600">Pagamento Aprovado!</h2>
                    <p className="text-muted-foreground max-w-md">
                      Sua transação foi processada com sucesso. Você receberá uma confirmação por e-mail em breve.
                    </p>
                  </>
                ) : paymentStatus === 'failed' ? (
                  <>
                    <XCircle className="h-16 w-16 text-destructive" />
                    <h2 className="text-2xl font-bold text-destructive">Pagamento Recusado</h2>
                    <p className="text-muted-foreground max-w-md">
                      Não foi possível processar seu pagamento. Por favor, tente novamente ou entre em contato conosco.
                    </p>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-16 w-16 text-primary animate-spin" />
                    <h2 className="text-2xl font-bold">Processando Pagamento</h2>
                    <p className="text-muted-foreground max-w-md">
                      Aguarde enquanto processamos seu pagamento. Você será notificado em breve.
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Rodapé */}
      <footer className="border-t bg-white py-6 mt-auto">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <p className="text-sm text-muted-foreground">
            CNPJ: 42.480.518/0001-10 - S. D. Paineis Decorativos Ltda
          </p>
        </div>
      </footer>
    </div>
  )
}
