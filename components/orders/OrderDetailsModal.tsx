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
import { ordersApi } from "@/lib/api"
import { cn, formatCurrency, formatDateTime, formatCPF } from "@/lib/utils"
import { Truck, MessageCircle } from "lucide-react"
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
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Cliente</h3>
              <div className="rounded-md border p-3 text-sm space-y-1">
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
            </div>

            {/* Itens */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Itens do pedido</h3>
              <div className="rounded-md border">
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
            </div>

            {/* Frete */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Frete</h3>
              <div className="rounded-md border p-3 text-sm space-y-1">
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
                    {order.shipping_tracking && (
                      <p className="text-xs text-muted-foreground">
                        Rastreamento:{" "}
                        <span className="font-medium break-all">
                          {order.shipping_tracking}
                        </span>
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma informação de frete cadastrada para este pedido.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

