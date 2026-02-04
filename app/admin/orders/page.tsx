"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { toast } from "@/lib/toast"
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
  MoreHorizontal,
  Tag,
  Banknote,
  IdCard,
  Send,
} from "lucide-react"
import { ordersApi, blingApi } from "@/lib/api"
import { cn, formatCurrency, formatDateTime, formatCPF } from "@/lib/utils"
import { PaymentLinkModal } from "@/components/orders/PaymentLinkModal"
import { OrderModal } from "@/components/orders/OrderModal"
import { Badge } from "@/components/ui/badge"
import { OrderStatusModal } from "@/components/orders/OrderStatusModal"
import { OrderDetailsModal } from "@/components/orders/OrderDetailsModal"
import { CancelOrderModal } from "@/components/orders/CancelOrderModal"
import { STATUS_LABELS, ORDER_STATUS_CONFIG } from "@/components/orders/order-status-config"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [startDate, setStartDate] = useState<Date | undefined>(() => {
    const date = new Date()
    date.setDate(date.getDate() - 6) // 7 dias atrás (hoje + 6 dias anteriores)
    return date
  })
  const [endDate, setEndDate] = useState<Date | undefined>(() => new Date())
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
  const [tagsModal, setTagsModal] = useState<{
    open: boolean
    orderId: number | null
    tags: string
  }>({ open: false, orderId: null, tags: "" })
  const [actionsOpenOrderId, setActionsOpenOrderId] = useState<number | null>(null)
  const [blingSyncingOrderId, setBlingSyncingOrderId] = useState<number | null>(null)
  const [blingErrorModal, setBlingErrorModal] = useState<{ open: boolean; message: string }>({ open: false, message: '' })
  const [cancelModal, setCancelModal] = useState<{
    open: boolean
    orderId: number | null
  }>({ open: false, orderId: null })

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
      if (process.env.NODE_ENV === 'development') {
        console.error("Erro ao carregar pedidos:", error)
      }
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
    let link: string | null = null
    if (order.payment_link_token && typeof window !== "undefined" && window.location?.origin) {
      link = `${window.location.origin}/checkout/${order.id}?token=${order.payment_link_token}`
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
      toast.success("Link de pagamento copiado para a área de transferência.")
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Erro ao copiar link de pagamento:", error)
      }
    }
  }

  const handleRefreshOrders = () => {
    loadOrders()
  }

  const handleApprovePaymentManually = async (orderId: number) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/approve-payment`, { method: "POST", credentials: "include" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Erro ao aprovar pagamento")
      }
      toast.success("Pagamento aprovado manualmente.")
      loadOrders()
    } catch (err: any) {
      toast.error(err.message || "Erro ao aprovar pagamento")
    }
  }

  const handleSyncToBling = async (orderId: number) => {
    setBlingSyncingOrderId(orderId)
    try {
      const res = await blingApi.syncOrder(orderId)
      toast.success(res.message ?? "Pedido enviado ao Bling com sucesso.")
      loadOrders()
    } catch (err: any) {
      const message = err.message ?? "Erro ao enviar pedido ao Bling."
      toast.error("Falha ao enviar ao Bling. Ver detalhes no modal.")
      setBlingErrorModal({ open: true, message })
    } finally {
      setBlingSyncingOrderId(null)
    }
  }

  const handleCopyBlingError = async () => {
    if (!blingErrorModal.message) return
    try {
      await navigator.clipboard.writeText(blingErrorModal.message)
      toast.success("Mensagem copiada para a área de transferência.")
    } catch {
      toast.error("Não foi possível copiar.")
    }
  }

  const handleOpenTagsModal = (order: any) => {
    const tagsStr = order.tags ? (Array.isArray(order.tags) ? order.tags.join(", ") : String(order.tags)) : ""
    setTagsModal({ open: true, orderId: order.id, tags: tagsStr })
  }

  const handleSaveTags = async () => {
    if (tagsModal.orderId == null) return
    try {
      const tagsArray = tagsModal.tags.split(",").map((t) => t.trim()).filter(Boolean)
      const res = await fetch(`/api/orders/${tagsModal.orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: tagsArray }),
        credentials: "include",
      })
      if (!res.ok) throw new Error("Erro ao salvar tags")
      toast.success("Tags salvas.")
      setTagsModal((prev) => ({ ...prev, open: false }))
      loadOrders()
    } catch (err: any) {
      toast.error("Erro ao salvar tags")
    }
  }

  const getPaymentMethodLabel = (order: any) => {
    if (order.payment_status !== "paid") return null
    const method = order.payment_method || ""
    const installments = order.installments
    if (method === "pix_manual") return "Pix Manual"
    if (method === "pix") return "Pix"
    if (method === "credit_card") {
      if (installments === 1) return "Cartão à vista"
      return `Cartão em ${installments}x`
    }
    return method ? String(method) : null
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
      <div className="bg-white p-4 rounded-lg border">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por ID, nome ou CPF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-9">
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
              <Button variant="outline" size="sm" className="h-9 min-w-[120px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "dd/MM/yyyy") : "Data inicial"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <DatePicker
                date={startDate}
                onDateChange={setStartDate}
                disablePastDates={false}
              />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 min-w-[120px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "dd/MM/yyyy") : "Data final"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <DatePicker
                date={endDate}
                onDateChange={setEndDate}
                disablePastDates={false}
              />
            </PopoverContent>
          </Popover>
          <Button size="sm" className="h-9" onClick={handleSearch}>Buscar</Button>
        </div>
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
                  <TableHead>Status Envio</TableHead>
                  <TableHead>Status Pagamento</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Frete</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Bling</TableHead>
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
                        <div className="mt-1 flex flex-col gap-0.5">
                          <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <IdCard className="h-3 w-3 shrink-0" />
                            <span>{formatCPF(order.client_cpf)}</span>
                          </div>
                          {order.client_whatsapp && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline w-fit"
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
                                "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0 rounded-full border",
                                config.className
                              )}
                            >
                              {Icon && <Icon className="h-2.5 w-2.5" />}
                              {config.label}
                            </Badge>
                          )
                        })()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {order.payment_status && (
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                "inline-flex w-fit items-center gap-0.5 text-[10px] px-1.5 py-0 rounded-full border",
                                order.payment_status === "paid" &&
                                  "bg-emerald-50 text-emerald-800 border-emerald-200",
                                order.payment_status === "pending" &&
                                  "bg-amber-50 text-amber-800 border-amber-200",
                                order.payment_status === "failed" &&
                                  "bg-rose-50 text-rose-800 border-rose-200"
                              )}
                            >
                              {order.payment_status === "paid" && <CheckCircle2 className="h-2.5 w-2.5" />}
                              {order.payment_status === "pending" && <Clock className="h-2.5 w-2.5" />}
                              {order.payment_status === "failed" && <XCircle className="h-2.5 w-2.5" />}
                              {order.payment_status === "paid" && "Aprovado"}
                              {order.payment_status === "pending" && "Pendente"}
                              {order.payment_status === "failed" && "Recusado"}
                            </Badge>
                            {order.payment_status === "paid" && getPaymentMethodLabel(order) && (
                              <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0 rounded-full border border-muted bg-white text-muted-foreground">
                                {getPaymentMethodLabel(order)}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {formatCurrency(parseFloat(order.total))}
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
                            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0 rounded-full bg-amber-50 text-amber-800 border-amber-200"
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
                    <TableCell>
                      <div className="flex flex-wrap gap-1 items-center">
                        {order.tags && (Array.isArray(order.tags) ? order.tags : String(order.tags).split(",").map((t: string) => t.trim()).filter(Boolean)).length > 0
                          ? (Array.isArray(order.tags) ? order.tags : String(order.tags).split(",").map((t: string) => t.trim()).filter(Boolean)).map((tag: string, i: number) => (
                              <Badge
                                key={i}
                                className="text-[10px] px-1.5 py-0 rounded-md bg-blue-600 text-white border-0"
                              >
                                {tag}
                              </Badge>
                            ))
                          : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleOpenTagsModal(order)}
                            >
                              +Adicionar
                            </Button>
                          )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {order.bling_sync_status === "synced" && (
                          <Badge
                            variant="outline"
                            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0 rounded-full bg-emerald-50 text-emerald-800 border-emerald-200"
                          >
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Enviado
                          </Badge>
                        )}
                        {order.bling_sync_status === "error" && (
                          <Badge
                            variant="outline"
                            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0 rounded-full bg-rose-50 text-rose-800 border-rose-200"
                            title={order.bling_sync_error ?? undefined}
                          >
                            <XCircle className="h-2.5 w-2.5" />
                            Erro
                          </Badge>
                        )}
                        {blingSyncingOrderId === order.id ? (
                          <Badge
                            variant="outline"
                            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0 rounded-full bg-blue-50 text-blue-800 border-blue-200"
                          >
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            Enviando...
                          </Badge>
                        ) : (order.bling_sync_status === "pending" || order.bling_sync_status == null) && (
                          <Badge
                            variant="outline"
                            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0 rounded-full bg-muted text-muted-foreground border-muted"
                          >
                            <Clock className="h-2.5 w-2.5" />
                            Pendente
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(order.created_at)}
                    </TableCell>
                    <TableCell>
                    <Popover open={actionsOpenOrderId === order.id} onOpenChange={(open) => setActionsOpenOrderId(open ? order.id : null)}>
                      <PopoverTrigger asChild>
                        <Button size="sm" className="h-8 bg-primary text-primary-foreground hover:bg-primary/90">
                          <MoreHorizontal className="h-5 w-5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-1" align="end">
                        <div className="flex flex-col gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="justify-start gap-2"
                            onClick={() => { setActionsOpenOrderId(null); setDetailsModal({ open: true, orderId: order.id }) }}
                          >
                            <Eye className="h-4 w-4" />
                            Visualizar Pedido
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="justify-start gap-2"
                            onClick={() => { setActionsOpenOrderId(null); router.push(`/admin/orders/${order.id}`) }}
                          >
                            <Pencil className="h-4 w-4" />
                            Editar Pedido
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="justify-start gap-2"
                            disabled={order.status === "enviado"}
                            onClick={() => { setActionsOpenOrderId(null); setStatusModal({ open: true, order }) }}
                          >
                            <RefreshCw className="h-4 w-4" />
                            Mudar Status
                          </Button>
                          {order.payment_status !== "paid" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="justify-start gap-2"
                              onClick={() => { setActionsOpenOrderId(null); handleApprovePaymentManually(order.id) }}
                            >
                              <Banknote className="h-4 w-4" />
                              Aprovar Pagamento
                            </Button>
                          )}
                          {order.payment_link_token ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="justify-start gap-2"
                                onClick={() => { setActionsOpenOrderId(null); handleCopyPaymentLink(order) }}
                              >
                                <Copy className="h-4 w-4" />
                                Copiar Link
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="justify-start gap-2"
                                onClick={() => { setActionsOpenOrderId(null); handleOpenPaymentLink(order) }}
                              >
                                <Link2 className="h-4 w-4" />
                                Gerenciar Link
                              </Button>
                            </>
                          ) : (!order.payment_status || order.payment_status !== "paid") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="justify-start gap-2"
                              onClick={() => { setActionsOpenOrderId(null); handleOpenPaymentLink(order) }}
                            >
                              <Link2 className="h-4 w-4" />
                              Gerar Link de Pagamento
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="justify-start gap-2"
                            onClick={() => { setActionsOpenOrderId(null); handleOpenTagsModal(order) }}
                          >
                            <Tag className="h-4 w-4" />
                            Adicionar Tags
                          </Button>
                          {order.payment_status === "paid" && order.bling_sync_status !== "synced" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="justify-start gap-2"
                              disabled={blingSyncingOrderId === order.id}
                              onClick={() => { setActionsOpenOrderId(null); handleSyncToBling(order.id) }}
                            >
                              {blingSyncingOrderId === order.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4" />
                              )}
                              Enviar ao Bling
                            </Button>
                          )}
                          {order.status !== "enviado" && order.status !== "cancelados" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => { setActionsOpenOrderId(null); setCancelModal({ open: true, orderId: order.id }) }}
                            >
                              <XCircle className="h-4 w-4" />
                              Cancelar Pedido
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
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

      {/* Modal de Tags */}
      <Dialog open={tagsModal.open} onOpenChange={(open) => setTagsModal((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Tags</DialogTitle>
            <DialogDescription>
              Digite as tags separadas por vírgula. Elas serão exibidas na listagem do pedido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Ex: urgente, presente, natal"
              value={tagsModal.tags}
              onChange={(e) => setTagsModal((prev) => ({ ...prev, tags: e.target.value }))}
            />
            {tagsModal.tags.trim() && (
              <div className="flex flex-wrap gap-1.5">
                {tagsModal.tags.split(",").map((t) => t.trim()).filter(Boolean).map((tag, i) => (
                  <Badge key={i} className="text-xs px-2 py-0.5 rounded-md bg-blue-600 text-white border-0">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagsModal((prev) => ({ ...prev, open: false }))}>
              Cancelar
            </Button>
            <Button onClick={handleSaveTags}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Modal de erro ao enviar pedido ao Bling */}
      <Dialog open={blingErrorModal.open} onOpenChange={(open) => setBlingErrorModal((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Erro ao enviar pedido ao Bling</DialogTitle>
            <DialogDescription>
              A mensagem abaixo contém os detalhes retornados pelo Bling. Você pode copiá-la para enviar ao suporte.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <pre className="text-sm text-foreground whitespace-pre-wrap break-words rounded-md bg-muted p-3 max-h-64 overflow-y-auto">
              {blingErrorModal.message}
            </pre>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyBlingError}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar
              </Button>
              <Button size="sm" onClick={() => setBlingErrorModal({ open: false, message: '' })}>
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Cancelamento de Pedido */}
      <CancelOrderModal
        open={cancelModal.open}
        onOpenChange={(open) =>
          setCancelModal((prev) => ({ ...prev, open }))
        }
        orderId={cancelModal.orderId}
        onSuccess={handleRefreshOrders}
      />
    </div>
  )
}
