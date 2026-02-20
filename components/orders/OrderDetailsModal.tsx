"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ordersApi } from "@/lib/api"
import { cn, formatCurrency, formatDateTime, formatCPF } from "@/lib/utils"
import { calculateDeliveryDate, formatDeliveryDate } from "@/lib/shipping-utils"
import { formatDeliveryTime } from "@/lib/melhor-envio-utils"
import { 
  Truck, 
  MessageCircle, 
  ChevronDown, 
  User, 
  FileText, 
  MapPin, 
  Calendar, 
  CreditCard, 
  DollarSign, 
  Clock, 
  CheckCircle2,
  XCircle
} from "lucide-react"
import { ORDER_STATUS_CONFIG } from "@/components/orders/order-status-config"

interface OrderDetailsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: number
}

export function OrderDetailsModal({
  open,
  onOpenChange,
  orderId,
}: OrderDetailsModalProps) {
  const [order, setOrder] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [openSections, setOpenSections] = useState({
    cliente: true,
    itens: true,
    frete: true,
    pagamento: true,
  })

  useEffect(() => {
    const load = async () => {
      if (!open || !orderId) return
      setLoading(true)
      try {
        const data = await ordersApi.get(orderId)
        setOrder(data)
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error("Erro ao carregar detalhes do pedido:", error)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [open, orderId])

  const handleWhatsappClick = () => {
    if (!order?.client_whatsapp) return
    const clean = String(order.client_whatsapp).replace(/\D/g, "")
    const phone = clean.length === 11 ? `55${clean}` : clean
    const msg = encodeURIComponent(
      `Olá, estamos entrando em contato sobre o seu pedido #${order.id}.`
    )
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank", "noopener,noreferrer")
  }

  const formatAddress = (address: any) => {
    if (!address) return null
    
    const parts = []
    if (address.street) {
      const streetLine = [address.street]
      if (address.number) streetLine.push(address.number)
      parts.push(streetLine.join(', '))
    }
    if (address.complement) parts.push(address.complement)
    if (address.neighborhood) parts.push(address.neighborhood)
    if (address.city && address.state) {
      parts.push(`${address.city} - ${address.state}`)
    }
    if (address.cep) {
      const cepFormatted = address.cep.replace(/(\d{5})(\d{3})/, '$1-$2')
      parts.push(`CEP: ${cepFormatted}`)
    }
    
    return parts
  }

  const getDeliveryInfo = (order: any) => {
    if (!order?.shipping_delivery_time) return null
    
    const deliveryDate = calculateDeliveryDate(order.shipping_delivery_time)
    const deliveryDateFormatted = formatDeliveryDate(deliveryDate)
    const deliveryTimeFormatted = formatDeliveryTime(order.shipping_delivery_time)
    
    return {
      days: order.shipping_delivery_time,
      date: deliveryDate,
      dateFormatted: deliveryDateFormatted,
      timeFormatted: deliveryTimeFormatted,
    }
  }

  const getPaymentDetails = (payment: any) => {
    const method = payment.method || ""
    const installments = payment.installments || 1
    
    let methodLabel = ""
    if (method === "pix_manual") methodLabel = "Pix Manual"
    else if (method === "pix") methodLabel = "Pix"
    else if (method === "credit_card") {
      methodLabel = installments === 1 ? "Cartão de Crédito à vista" : `Cartão de Crédito em ${installments}x`
    } else {
      methodLabel = method || "Não informado"
    }
    
    return {
      methodLabel,
      installments,
      isInstallment: installments > 1,
    }
  }

  const renderStatusBadge = () => {
    if (!order) return null
    const config =
      ORDER_STATUS_CONFIG[order.status] || {
        label: order.status,
        className: "",
      }
    const Icon = config.icon
    return (
      <Badge
        variant="outline"
        className={cn(
          "inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border",
          config.className
        )}
      >
        {Icon && <Icon className="h-3 w-3" />}
        {config.label}
      </Badge>
    )
  }

  if (!open) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pedido #{orderId}</DialogTitle>
          <DialogDescription>
            Visualize os principais detalhes do pedido, cliente, itens e frete.
          </DialogDescription>
        </DialogHeader>

        {loading || !order ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Carregando detalhes do pedido...
          </div>
        ) : (
          <div className="space-y-6">
            {/* Cabeçalho com status e totais */}
            <div className="flex flex-col gap-2 border rounded-md p-3 bg-muted/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Criado em {formatDateTime(order.created_at)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {renderStatusBadge()}
                    {order.payment_status && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border",
                          order.payment_status === "paid" &&
                            "bg-emerald-50 text-emerald-800 border-emerald-200",
                          order.payment_status === "pending" &&
                            "bg-amber-50 text-amber-800 border-amber-200",
                          order.payment_status === "failed" &&
                            "bg-rose-50 text-rose-800 border-rose-200"
                        )}
                      >
                        {order.payment_status === "paid" && "Pagamento Aprovado"}
                        {order.payment_status === "pending" && "Pagamento Pendente"}
                        {order.payment_status === "failed" && "Pagamento Recusado"}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total do pedido</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(parseFloat(order.total))}
                  </p>
                </div>
              </div>
            </div>

            {/* Cliente */}
            <Collapsible 
              open={openSections.cliente} 
              onOpenChange={(open) => setOpenSections(prev => ({...prev, cliente: open}))}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded-md transition-colors">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Cliente
                </h3>
                <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.cliente && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="rounded-md border p-3 text-sm space-y-1 mt-2">
                  <p className="font-medium">{order.client_name}</p>
                  <p className="text-muted-foreground">
                    CPF: {formatCPF(order.client_cpf)}
                  </p>
                  {order.client_email && (
                    <p className="text-muted-foreground text-xs">{order.client_email}</p>
                  )}
                  {order.client_whatsapp && (
                    <button
                      type="button"
                      onClick={handleWhatsappClick}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
                    >
                      <MessageCircle className="h-3 w-3" />
                      <span>{order.client_whatsapp}</span>
                    </button>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Itens */}
            <Collapsible 
              open={openSections.itens} 
              onOpenChange={(open) => setOpenSections(prev => ({...prev, itens: open}))}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded-md transition-colors">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Itens do pedido
                </h3>
                <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.itens && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="rounded-md border mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="w-[80px]">Qtd</TableHead>
                        <TableHead>Valor unit.</TableHead>
                        <TableHead>Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.items?.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.title}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>
                            {formatCurrency(parseFloat(item.price))}
                          </TableCell>
                          <TableCell>
                            {formatCurrency(
                              parseFloat(item.price) * Number(item.quantity || 1)
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Frete */}
            <Collapsible 
              open={openSections.frete} 
              onOpenChange={(open) => setOpenSections(prev => ({...prev, frete: open}))}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded-md transition-colors">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Frete
                </h3>
                <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.frete && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="rounded-md border p-3 text-sm space-y-3 mt-2">
                  {order.shipping_method ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-800 border-amber-200"
                          >
                            <Truck className="h-3 w-3" />
                            <span>
                              {order.shipping_method}
                              {order.shipping_company_name
                                ? ` - ${order.shipping_company_name}`
                                : ""}
                            </span>
                          </Badge>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Valor do frete</p>
                          <p className="font-medium">
                            {formatCurrency(parseFloat(order.total_shipping || 0))}
                          </p>
                        </div>
                      </div>
                      
                      {/* Endereço de entrega */}
                      {order.shipping_address && formatAddress(order.shipping_address) && (
                        <div className="space-y-1 pt-2 border-t">
                          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            Endereço de Entrega
                          </div>
                          <div className="pl-5 space-y-0.5">
                            {formatAddress(order.shipping_address)?.map((line, idx) => (
                              <p key={idx} className="text-xs">{line}</p>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Previsão de entrega */}
                      {getDeliveryInfo(order) && (
                        <div className="space-y-1 pt-2 border-t">
                          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            Previsão de Entrega
                          </div>
                          <div className="pl-5 space-y-0.5">
                            <p className="text-xs">
                              Prazo: {getDeliveryInfo(order)?.timeFormatted}
                            </p>
                            <p className="text-xs">
                              Data estimada: {getDeliveryInfo(order)?.dateFormatted}
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {order.shipping_tracking && (
                        <div className="pt-2 border-t">
                          <p className="text-xs text-muted-foreground">
                            Rastreamento:{" "}
                            <span className="font-medium break-all">
                              {order.shipping_tracking}
                            </span>
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma informação de frete cadastrada para este pedido.
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Pagamento */}
            <Collapsible 
              open={openSections.pagamento} 
              onOpenChange={(open) => setOpenSections(prev => ({...prev, pagamento: open}))}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded-md transition-colors">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Pagamento
                </h3>
                <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.pagamento && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="rounded-md border p-3 text-sm space-y-3 mt-2">
                  {order.payments && order.payments.length > 0 ? (
                    order.payments
                      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((payment: any, idx: number) => {
                        const paymentDetails = getPaymentDetails(payment)
                        const paymentAmount = parseFloat(payment.amount || 0)
                        const orderTotal = parseFloat(order.total || 0)
                        const interest = paymentAmount > orderTotal ? paymentAmount - orderTotal : 0
                        const discount = paymentAmount < orderTotal && payment.method === 'pix' ? orderTotal - paymentAmount : 0
                        
                        return (
                          <div key={payment.id || idx} className={idx > 0 ? "pt-3 border-t" : ""}>
                            <div className="space-y-2">
                              {/* Valor cobrado */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                                  <DollarSign className="h-3 w-3" />
                                  Valor cobrado
                                </div>
                                <p className="font-medium">
                                  {formatCurrency(paymentAmount)}
                                </p>
                              </div>
                              
                              {/* Forma de pagamento */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                                  <CreditCard className="h-3 w-3" />
                                  Forma de pagamento
                                </div>
                                <p className="text-xs">{paymentDetails.methodLabel}</p>
                              </div>
                              
                              {/* Parcelas */}
                              {paymentDetails.isInstallment && (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground">Parcelas</span>
                                  <p className="text-xs">
                                    {paymentDetails.installments}x de {formatCurrency(paymentAmount / paymentDetails.installments)}
                                  </p>
                                </div>
                              )}
                              
                              {/* Juros */}
                              {interest > 0 && (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground">Juros aplicados</span>
                                  <p className="text-xs font-medium text-amber-700">
                                    {formatCurrency(interest)}
                                  </p>
                                </div>
                              )}
                              
                              {/* Desconto */}
                              {discount > 0 && (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground">Desconto aplicado</span>
                                  <p className="text-xs font-medium text-emerald-700">
                                    {formatCurrency(discount)}
                                  </p>
                                </div>
                              )}
                              
                              {/* Status */}
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Status</span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-xs px-2 py-0.5",
                                    payment.status === "paid" &&
                                      "bg-emerald-50 text-emerald-800 border-emerald-200",
                                    payment.status === "pending" &&
                                      "bg-amber-50 text-amber-800 border-amber-200",
                                    payment.status === "failed" &&
                                      "bg-rose-50 text-rose-800 border-rose-200"
                                  )}
                                >
                                  {payment.status === "paid" && (
                                    <>
                                      <CheckCircle2 className="h-3 w-3 inline mr-1" />
                                      Aprovado
                                    </>
                                  )}
                                  {payment.status === "pending" && (
                                    <>
                                      <Clock className="h-3 w-3 inline mr-1" />
                                      Pendente
                                    </>
                                  )}
                                  {payment.status === "failed" && (
                                    <>
                                      <XCircle className="h-3 w-3 inline mr-1" />
                                      Recusado
                                    </>
                                  )}
                                </Badge>
                              </div>
                              
                              {/* Timestamps */}
                              <div className="space-y-1 pt-2 border-t">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  Criado em: {formatDateTime(payment.created_at)}
                                </div>
                                {payment.paid_at && (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground pl-5">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Pago em: {formatDateTime(payment.paid_at)}
                                  </div>
                                )}
                              </div>
                              
                              {/* ID da transação */}
                              {payment.pagarme_transaction_id && (
                                <div className="pt-2 border-t">
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="text-muted-foreground">Transação:</span>
                                    <span className="font-mono break-all text-xs">
                                      {payment.pagarme_transaction_id.length > 20 
                                        ? `${payment.pagarme_transaction_id.substring(0, 20)}...`
                                        : payment.pagarme_transaction_id}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhum pagamento registrado para este pedido.
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

