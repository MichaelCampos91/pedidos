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
import { Search, Plus, Edit, CalendarIcon, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from "lucide-react"
import { ordersApi } from "@/lib/api"
import { formatCurrency, formatDateTime, formatCPF } from "@/lib/utils"

const STATUS_LABELS: Record<string, string> = {
  aguardando_pagamento: "Aguardando Pagamento",
  aguardando_producao: "Aguardando Produção",
  em_producao: "Em Produção",
  aguardando_envio: "Aguardando Envio",
  enviado: "Enviado",
  nao_pagos: "Não Pagos",
  cancelados: "Cancelados"
}

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
        <Button onClick={() => router.push('/admin/orders/new')}>
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
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </TableCell>
                    <TableCell>{formatCurrency(parseFloat(order.total))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(order.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/admin/orders/${order.id}`)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Ver/Editar
                      </Button>
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
    </div>
  )
}
