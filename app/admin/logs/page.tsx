"use client"

import { useState, useEffect, useCallback } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Info,
  AlertTriangle,
  XCircle,
} from "lucide-react"
import { logsApi } from "@/lib/api"
import { cn } from "@/lib/utils"

const LEVEL_COLORS: Record<string, { bg: string; text: string; icon: any }> = {
  info: {
    bg: "bg-green-100 text-green-800",
    text: "text-green-800",
    icon: Info,
  },
  warning: {
    bg: "bg-yellow-100 text-yellow-800",
    text: "text-yellow-800",
    icon: AlertTriangle,
  },
  error: {
    bg: "bg-red-100 text-red-800",
    text: "text-red-800",
    icon: XCircle,
  },
}

const CATEGORY_LABELS: Record<string, string> = {
  payment: "Pagamento",
  order: "Pedido",
  auth: "Autenticação",
  error: "Erro",
  integration: "Integração",
  system: "Sistema",
  bling: "Bling",
}

// Componente para renderizar detalhes de logs de pagamento
function PaymentLogDetails({ metadata }: { metadata: any }) {
  try {
    const getStatusBadge = (status: string) => {
      const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
        paid: { bg: "bg-emerald-100 text-emerald-800", text: "text-emerald-800", label: "Pago" },
        pending: { bg: "bg-amber-100 text-amber-800", text: "text-amber-800", label: "Pendente" },
        failed: { bg: "bg-red-100 text-red-800", text: "text-red-800", label: "Falhou" },
        refused: { bg: "bg-red-100 text-red-800", text: "text-red-800", label: "Recusado" },
      }
      const config = statusConfig[status] || { bg: "bg-gray-100 text-gray-800", text: "text-gray-800", label: status }
      return (
        <Badge className={cn("flex items-center gap-1", config.bg)}>
          {config.label}
        </Badge>
      )
    }

    const formatAddress = (address: any) => {
      if (!address) return "Não disponível"
      const parts = [
        address.street,
        address.number,
        address.complement,
        address.neighborhood,
        address.city,
        address.state,
        address.zip_code,
      ].filter(Boolean)
      return parts.join(", ") || "Não disponível"
    }

    return (
      <div className="space-y-4">
        {/* Situação e IDs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Situação</p>
            {metadata.status ? getStatusBadge(metadata.status) : <span className="text-sm">Não disponível</span>}
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">IDs</p>
            <div className="space-y-1 text-sm">
              {metadata.transaction_id && (
                <div>Transação: <span className="font-mono text-xs">{metadata.transaction_id}</span></div>
              )}
              {metadata.charge_id && (
                <div>Cobrança: <span className="font-mono text-xs">{metadata.charge_id}</span></div>
              )}
              {metadata.payment_id && (
                <div>Pagamento: <span className="font-mono text-xs">#{metadata.payment_id}</span></div>
              )}
            </div>
          </div>
        </div>

        {/* Dados do Cliente */}
        {metadata.customer && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Dados do Cliente</p>
            <div className="bg-muted/50 p-3 rounded space-y-1 text-sm">
              {metadata.customer.name && <div><strong>Nome:</strong> {metadata.customer.name}</div>}
              {metadata.customer.email && <div><strong>Email:</strong> {metadata.customer.email}</div>}
              {metadata.customer.document && <div><strong>Documento:</strong> {metadata.customer.document}</div>}
              {metadata.customer.address && (
                <div>
                  <strong>Endereço:</strong> {formatAddress(metadata.customer.address)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dados do Pagamento */}
        {metadata.payment && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Dados do Pagamento</p>
            <div className="bg-muted/50 p-3 rounded space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                {metadata.payment.method && (
                  <div><strong>Forma:</strong> {metadata.payment.method === 'credit_card' ? 'Cartão de Crédito' : metadata.payment.method === 'pix' ? 'PIX' : metadata.payment.method}</div>
                )}
                {metadata.payment.installments && (
                  <div><strong>Parcelas:</strong> {metadata.payment.installments}x</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {metadata.payment.amount && (
                  <div>
                    <strong>Valor:</strong> R$ {parseFloat(metadata.payment.amount).toFixed(2).replace('.', ',')}
                  </div>
                )}
                {metadata.payment.amount_charged && (
                  <div>
                    <strong>Valor Cobrado:</strong> R$ {parseFloat(metadata.payment.amount_charged).toFixed(2).replace('.', ',')}
                    {metadata.payment.amount_source && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({metadata.payment.amount_source === 'pagarme' ? 'do Pagar.me' : 'calculado'})
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Dados do Cartão */}
              {metadata.payment.card && (
                <div className="mt-2 pt-2 border-t">
                  <p className="text-xs font-semibold mb-1">Cartão</p>
                  <div className="grid grid-cols-2 gap-2">
                    {metadata.payment.card.last_four_digits && (
                      <div><strong>Final:</strong> ****{metadata.payment.card.last_four_digits}</div>
                    )}
                    {metadata.payment.card.brand && (
                      <div><strong>Bandeira:</strong> {metadata.payment.card.brand}</div>
                    )}
                    {metadata.payment.card.holder_name && (
                      <div><strong>Titular:</strong> {metadata.payment.card.holder_name}</div>
                    )}
                    {metadata.payment.card.expiration_date && (
                      <div><strong>Validade:</strong> {metadata.payment.card.expiration_date}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Endereço de Cobrança */}
              {metadata.payment.billing_address && (
                <div className="mt-2 pt-2 border-t">
                  <p className="text-xs font-semibold mb-1">Endereço de Cobrança</p>
                  <div>{formatAddress(metadata.payment.billing_address)}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timestamps */}
        {metadata.timestamps && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Timestamps</p>
            <div className="bg-muted/50 p-3 rounded space-y-1 text-sm">
              {metadata.timestamps.created_at && (
                <div>
                  <strong>Criado em:</strong> {format(new Date(metadata.timestamps.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                </div>
              )}
              {metadata.timestamps.paid_at && (
                <div>
                  <strong>Pago em:</strong> {format(new Date(metadata.timestamps.paid_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Motivo de Recusa/Erro */}
        {metadata.refusal_reason && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Motivo da Recusa/Erro</p>
            <div className="bg-red-50 border border-red-200 p-3 rounded text-sm text-red-800">
              {metadata.refusal_reason}
            </div>
          </div>
        )}

        {/* Fallback: JSON completo se houver outros campos */}
        {metadata.error && (
          <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-sm text-yellow-800">
            <strong>Aviso:</strong> {metadata.error}
            {metadata.error_message && <div className="mt-1 text-xs">{metadata.error_message}</div>}
          </div>
        )}
      </div>
    )
  } catch (error) {
    // Fallback para JSON formatado se houver erro na renderização
    return (
      <div>
        <p className="text-sm text-muted-foreground mb-2">Não foi possível exibir os detalhes formatados:</p>
        <pre className="text-xs bg-background p-3 rounded border overflow-x-auto">
          {formatMetadata(metadata)}
        </pre>
      </div>
    )
  }
}

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(false)
  const [search, setSearch] = useState("")
  const [levelFilter, setLevelFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set())
  const [lastLogId, setLastLogId] = useState<number | null>(null)
  const [searchDebounce, setSearchDebounce] = useState("")
  const [pagination, setPagination] = useState({
    current_page: 1,
    per_page: 50,
    total: 0,
    last_page: 1,
    from: 0,
    to: 0,
  })

  // Debounce para busca
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounce(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const loadLogs = useCallback(async (isPolling = false) => {
    if (isPolling) {
      setPolling(true)
    } else {
      setLoading(true)
    }

    try {
      const params: any = {
        page: pagination.current_page,
        per_page: pagination.per_page,
      }

      if (levelFilter !== "all") {
        params.level = levelFilter
      }

      if (categoryFilter !== "all") {
        params.category = categoryFilter
      }

      if (searchDebounce) {
        params.search = searchDebounce
      }

      // Para polling, buscar apenas logs novos
      if (isPolling && lastLogId) {
        params.last_id = lastLogId
      }

      const data = await logsApi.list(params)

      if (isPolling && lastLogId) {
        // Adicionar novos logs no topo
        if (data.data.length > 0) {
          setLogs((prev) => [...data.data, ...prev])
          setLastLogId(data.data[0].id)
        }
      } else {
        // Carregar página completa
        setLogs(data.data)
        setPagination(data.pagination)
        if (data.data.length > 0) {
          setLastLogId(data.data[0].id)
        }
      }
    } catch (error: any) {
      console.error("Erro ao carregar logs:", error)
    } finally {
      setLoading(false)
      setPolling(false)
    }
  }, [pagination.current_page, pagination.per_page, levelFilter, categoryFilter, searchDebounce, lastLogId])

  // Carregar logs iniciais
  useEffect(() => {
    setPagination((prev) => ({ ...prev, current_page: 1 }))
  }, [levelFilter, categoryFilter, searchDebounce])

  useEffect(() => {
    loadLogs(false)
  }, [pagination.current_page, levelFilter, categoryFilter, searchDebounce])

  // Polling a cada 10 segundos (apenas se não houver filtros ativos e estiver na primeira página)
  useEffect(() => {
    const shouldPoll = 
      !loading && 
      lastLogId && 
      pagination.current_page === 1 && 
      levelFilter === "all" && 
      categoryFilter === "all" && 
      !searchDebounce

    if (!shouldPoll) return

    const interval = setInterval(() => {
      loadLogs(true)
    }, 10000)

    return () => clearInterval(interval)
  }, [loading, lastLogId, pagination.current_page, levelFilter, categoryFilter, searchDebounce, loadLogs])

  const toggleExpand = (logId: number) => {
    setExpandedLogs((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(logId)) {
        newSet.delete(logId)
      } else {
        newSet.add(logId)
      }
      return newSet
    })
  }

  const formatMetadata = (metadata: any): string => {
    if (!metadata) return "N/A"
    try {
      return JSON.stringify(metadata, null, 2)
    } catch {
      return String(metadata)
    }
  }

  const getLevelBadge = (level: string) => {
    const config = LEVEL_COLORS[level] || LEVEL_COLORS.info
    const Icon = config.icon
    return (
      <Badge className={cn("flex items-center gap-1", config.bg)}>
        <Icon className="h-3 w-3" />
        {level.toUpperCase()}
      </Badge>
    )
  }

  const getCategoryBadge = (category: string | null) => {
    if (!category) return <Badge variant="outline">-</Badge>
    return (
      <Badge variant="outline">
        {CATEGORY_LABELS[category] || category}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Logs do Sistema</h2>
          <p className="text-muted-foreground">Monitore eventos e erros do sistema em tempo real</p>
        </div>
        <div className="flex items-center gap-2">
          {polling && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Atualizando...</span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadLogs(false)}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Filtre os logs por nível, categoria ou busca</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nível</label>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os níveis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Categoria</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="payment">Pagamento</SelectItem>
                  <SelectItem value="order">Pedido</SelectItem>
                  <SelectItem value="auth">Autenticação</SelectItem>
                  <SelectItem value="error">Erro</SelectItem>
                  <SelectItem value="integration">Integração</SelectItem>
                  <SelectItem value="system">Sistema</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar em mensagens..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {(levelFilter !== "all" || categoryFilter !== "all" || search) && (
            <div className="mt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLevelFilter("all")
                  setCategoryFilter("all")
                  setSearch("")
                }}
              >
                Limpar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela de logs */}
      <Card>
        <CardContent className="p-0">
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mb-4" />
              <p>Nenhum log encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Data/Hora</TableHead>
                    <TableHead className="w-[100px]">Nível</TableHead>
                    <TableHead className="w-[120px]">Categoria</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead className="w-[100px]">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const isExpanded = expandedLogs.has(log.id)
                    const isError = log.level === "error"

                    return (
                      <>
                        <TableRow
                          key={log.id}
                          className={cn(
                            isError && "bg-red-50 hover:bg-red-100",
                            isExpanded && "bg-muted/50"
                          )}
                        >
                          <TableCell className="font-mono text-xs">
                            {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                          </TableCell>
                          <TableCell>{getLevelBadge(log.level)}</TableCell>
                          <TableCell>{getCategoryBadge(log.category)}</TableCell>
                          <TableCell>
                            <div className="max-w-md">
                              <p className={cn("text-sm", isError && "font-semibold")}>
                                {log.message}
                              </p>
                              {log.metadata && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {log.metadata.order_id && (
                                    <span>Pedido: #{log.metadata.order_id} </span>
                                  )}
                                  {log.metadata.transaction_id && (
                                    <span>Transação: {log.metadata.transaction_id.substring(0, 20)}... </span>
                                  )}
                                  {log.metadata.error_message && (
                                    <span className="text-red-600">
                                      Erro: {log.metadata.error_message}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {log.metadata && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleExpand(log.id)}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                        {/* Metadata expandido */}
                        {isExpanded && log.metadata && (
                          <TableRow key={`metadata-${log.id}`} className="bg-muted/30">
                            <TableCell colSpan={5} className="p-4">
                              {log.category === 'payment' ? (
                                <PaymentLogDetails metadata={log.metadata} />
                              ) : (
                                <div className="space-y-2">
                                  <p className="text-sm font-semibold">Detalhes:</p>
                                  <pre className="text-xs bg-background p-3 rounded border overflow-x-auto">
                                    {formatMetadata(log.metadata)}
                                  </pre>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {pagination.last_page > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Mostrando {pagination.from} a {pagination.to} de {pagination.total} registros
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPagination((prev) => ({ ...prev, current_page: prev.current_page - 1 }))
              }
              disabled={pagination.current_page === 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm">
                Página {pagination.current_page} de {pagination.last_page}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPagination((prev) => ({ ...prev, current_page: prev.current_page + 1 }))
              }
              disabled={pagination.current_page === pagination.last_page || loading}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
