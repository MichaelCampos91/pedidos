"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DatePicker } from "@/components/ui/DatePicker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Search,
  Plus,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Link2,
  Clock,
  Truck,
  CheckCircle2,
  XCircle,
  Eye,
  Pencil,
  Copy,
  RefreshCw,
  MessageCircle,
} from "lucide-react"
import { ordersApi } from "@/lib/api"
import { cn, formatCurrency, formatDateTime, formatCPF } from "@/lib/utils"
import { PaymentLinkModal } from "@/components/orders/PaymentLinkModal"
import { OrderModal } from "@/components/orders/OrderModal"
import { Badge } from "@/components/ui/badge"
import { OrderStatusModal } from "@/components/orders/OrderStatusModal"
import { OrderDetailsModal } from "@/components/orders/OrderDetailsModal"
import { STATUS_LABELS, ORDER_STATUS_CONFIG } from "@/components/orders/order-status-config"

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()
  const [pagination, setPagination] = useState({
    current_page: 1,
    per_page: 20,
    total: 0,
    last_page: 1,
    from: 0,
    to: 0,
  })
  const [paymentLinkModal, setPaymentLinkModal] = useState<{
    open: boolean
    orderId: number | null
    link: string | null
    expiresAt: string | null
  }>({
    open: false,
    orderId: null,
    link: null,
    expiresAt: null,
  })
  const [orderModal, setOrderModal] = useState<{
    open: boolean
    orderId: number | null
  }>({
    open: false,
    orderId: null,
  })
  const [statusModal, setStatusModal] = useState<{
    open: boolean
    order: any | null
  }>({
    open: false,
    order: null,
  })
  const [detailsModal, setDetailsModal] = useState<{
    open: boolean
    orderId: number | null
  }>({
    open: false,
    orderId: null,
  })

  const loadOrders = async () => {
    setLoading(true)
    try {
      const params: any = {
        page: pagination.current_page,
        per_page: pagination.per_page,
      }

      if (statusFilter !== "all") {
        params.status = statusFilter
      }

      if (startDate && endDate) {
        params.start_date = format(startDate, "yyyy-MM-dd")
        params.end_date = format(endDate, "yyyy-MM-dd")
      }

      if (search) {
        params.search = search
      }

      const response = await ordersApi.list(params)
      setOrders(response.data)
      setPagination({
        current_page: response.current_page,
        per_page: response.per_page,
        total: response.total,
        last_page: response.last_page,
        from: response.from,
        to: response.to,
      })
    } catch (error) {
      console.error("Erro ao carregar pedidos:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()
  }, [pagination.current_page, statusFilter])

  const handleSearch = () => {
    setPagination((prev) => ({ ...prev, current_page: 1 }))
    loadOrders()
  }

  const handlePageChange = (page: number) => {
    setPagination((prev) => ({ ...prev, current_page: page }))
  }

  const handleOpenPaymentLink = (order: any) => {
    // Construir link se existir token
    let link = null
    if (order.payment_link_token) {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
      link = `${baseUrl}/checkout/${order.id}?token=${order.payment_link_token}`
    }

    setPaymentLinkModal({
      open: true,
      orderId: order.id,
      link,
      expiresAt: order.payment_link_expires_at,
    })
  }

  const getPaymentLinkForOrder = (order: any) => {
    if (!order.payment_link_token) return null
    const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
    return `${baseUrl}/checkout/${order.id}?token=${order.payment_link_token}`
  }

  const handleCopyPaymentLink = async (order: any) => {
    const link = getPaymentLinkForOrder(order)
    if (!link) return

    try {
      await navigator.clipboard.writeText(link)
      // Idealmente usar um toast global aqui para feedback ("Link copiado!")
    } catch (error) {
      console.error("Erro ao copiar link de pagamento:", error)
    }
  }

  const handleRefreshOrders = () => {
    loadOrders()
  }

  const getPageNumbers = () => {
    const pages = []
    const maxVisible = 5
    let start = Math.max(1, pagination.current_page - Math.floor(maxVisible / 2))
    let end = Math.min(pagination.last_page, start + maxVisible - 1)
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1)
    }
    for (let i = start; i <= end; i++) {
      pages.push(i)
    }
    return pages
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Pedidos</h2>
          <p className="text-muted-foreground">Gerencie todos os pedidos</p>
        </div>
        <Button onClick={() => setOrderModal({ open: true, orderId: null })}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Pedido
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg border space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por ID, nome ou CPF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "dd/MM/yyyy") : "Data inicial"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <DatePicker
                date={startDate}
                onDateChange={setStartDate}
              />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "dd/MM/yyyy") : "Data final"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <DatePicker
                date={endDate}
                onDateChange={setEndDate}
              />
            </PopoverContent>
          </Popover>
        </div>
        <Button onClick={handleSearch}>Buscar</Button>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg border">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhum pedido encontrado</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Frete</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">#{order.id}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{order.client_name}</div>
                        <div className="text-sm text-muted-foreground">{formatCPF(order.client_cpf)}</div>
                      {order.client_whatsapp && (
                        <button
                          type="button"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
                          onClick={() => {
                            const clean = String(order.client_whatsapp).replace(/\D/g, "")
                            const phone = clean.length === 11 ? `55${clean}` : clean
                            const msg = encodeURIComponent(
                              `Olá, estamos entrando em contato sobre o seu pedido #${order.id}.`
                            )
                            window.open(
                              `https://wa.me/${phone}?text=${msg}`,
                              "_blank",
                              "noopener,noreferrer"
                            )
                          }}
                        >
                          <MessageCircle className="h-3 w-3" />
                          <span>{order.client_whatsapp}</span>
                        </button>
                      )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                      {(() => {
                        const config =
                          ORDER_STATUS_CONFIG[order.status] || {
                            label: STATUS_LABELS[order.status] || order.status,
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
                      })()}
                      </div>
                    </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div>{formatCurrency(parseFloat(order.total))}</div>
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
                          {order.payment_status === "paid" && (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          {order.payment_status === "pending" && <Clock className="h-3 w-3" />}
                          {order.payment_status === "failed" && <XCircle className="h-3 w-3" />}
                          {order.payment_status === "paid" && "Pagamento Aprovado"}
                          {order.payment_status === "pending" && "Pagamento Pendente"}
                          {order.payment_status === "failed" && "Pagamento Recusado"}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">
                        {formatCurrency(parseFloat(order.total_shipping || 0))}
                      </div>
                      {order.shipping_method && (
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
                      )}
                    </div>
                  </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(order.created_at)}
                    </TableCell>
                    <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDetailsModal({ open: true, orderId: order.id })}
                        title="Ver detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/admin/orders/${order.id}`)}
                        title="Editar pedido"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setStatusModal({ open: true, order })}
                        disabled={order.status === "enviado"}
                        title={
                          order.status === "enviado"
                            ? "Status não pode mais ser alterado"
                            : "Alterar status"
                        }
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      {order.payment_link_token ? (
                        <>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleCopyPaymentLink(order)}
                            title="Copiar link de pagamento"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenPaymentLink(order)}
                            title="Gerenciar link de pagamento"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleOpenPaymentLink(order)}
                          title="Gerar link de pagamento"
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Paginação */}
            {pagination.last_page > 1 && (
              <div className="flex items-center justify-between p-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Mostrando {pagination.from} a {pagination.to} de {pagination.total} resultados
                </p>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(1)}
                    disabled={pagination.current_page === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.current_page - 1)}
                    disabled={pagination.current_page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {getPageNumbers().map((page) => (
                    <Button
                      key={page}
                      variant={page === pagination.current_page ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePageChange(page)}
                    >
                      {page}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.current_page + 1)}
                    disabled={pagination.current_page === pagination.last_page}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.last_page)}
                    disabled={pagination.current_page === pagination.last_page}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de Link de Pagamento */}
      {paymentLinkModal.orderId && (
        <PaymentLinkModal
          open={paymentLinkModal.open}
          onOpenChange={(open) =>
            setPaymentLinkModal((prev) => ({ ...prev, open }))
          }
          orderId={paymentLinkModal.orderId}
          existingLink={paymentLinkModal.link}
          expiresAt={paymentLinkModal.expiresAt}
          onGenerateNew={handleRefreshOrders}
        />
      )}

      {/* Modal de Pedido */}
      <OrderModal
        open={orderModal.open}
        onOpenChange={(open) =>
          setOrderModal((prev) => ({ ...prev, open }))
        }
        orderId={orderModal.orderId}
        onSuccess={handleRefreshOrders}
      />

      {/* Modal de Alteração de Status */}
      {statusModal.order && (
        <OrderStatusModal
          open={statusModal.open}
          onOpenChange={(open) =>
            setStatusModal((prev) => ({ ...prev, open }))
          }
          orderId={statusModal.order.id}
          currentStatus={statusModal.order.status}
          currentTracking={statusModal.order.shipping_tracking}
          onSuccess={handleRefreshOrders}
        />
      )}

      {/* Modal de Detalhes do Pedido */}
      {detailsModal.orderId && (
        <OrderDetailsModal
          open={detailsModal.open}
          onOpenChange={(open) =>
            setDetailsModal((prev) => ({ ...prev, open }))
          }
          orderId={detailsModal.orderId}
        />
      )}
    </div>
  )
}
