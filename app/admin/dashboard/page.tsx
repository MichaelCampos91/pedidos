"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/DatePicker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { CalendarIcon, ShoppingCart, DollarSign, Clock, Loader2, CreditCard, Smartphone, Banknote, AlertCircle, TrendingUp, CheckCircle, Users, Timer, Truck, Wallet, Package, MapPin, BarChart3, XCircle, PackageCheck } from "lucide-react"
import { metricsApi } from "@/lib/api"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

const STATUS_LABELS: Record<string, string> = {
  aguardando_pagamento: "Aguardando Pagamento",
  aguardando_producao: "Aguardando Produção",
  em_producao: "Em Produção",
  aguardando_envio: "Aguardando Envio",
  enviado: "Enviado",
  nao_pagos: "Não Pagos",
  cancelados: "Cancelados"
}

const STATUS_BAR_COLORS: Record<string, string> = {
  aguardando_pagamento: "bg-amber-500",
  aguardando_producao: "bg-blue-500",
  em_producao: "bg-indigo-500",
  aguardando_envio: "bg-cyan-500",
  enviado: "bg-emerald-500",
  nao_pagos: "bg-rose-500",
  cancelados: "bg-gray-500"
}

function getPaymentMethodLabel(method: string): string {
  if (method === "pix_manual") return "Pix Manual"
  if (method === "pix") return "Pix"
  if (method === "credit_card") return "Cartão"
  return method || "Outro"
}

function getPaymentMethodIcon(method: string) {
  if (method === "pix_manual" || method === "pix") return Smartphone
  if (method === "credit_card") return CreditCard
  return Banknote
}

function getPaymentMethodColor(method: string): string {
  if (method === "pix_manual" || method === "pix") return "text-emerald-600 bg-emerald-50 border-emerald-200"
  if (method === "credit_card") return "text-blue-600 bg-blue-50 border-blue-200"
  return "text-muted-foreground bg-muted border-muted"
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<Date | undefined>(() => {
    const date = new Date()
    date.setDate(date.getDate() - 6) // 7 dias atrás (hoje + 6 dias anteriores)
    return date
  })
  const [endDate, setEndDate] = useState<Date | undefined>(() => new Date())

  const loadMetrics = async () => {
    setLoading(true)
    setError(null)
    try {
      const params: any = {}
      if (startDate && endDate) {
        params.start_date = format(startDate, "yyyy-MM-dd")
        params.end_date = format(endDate, "yyyy-MM-dd")
      }
      const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
      if (tz) params.timezone = tz
      const data = await metricsApi.orders(params)
      setMetrics(data)
    } catch (err) {
      console.error("Erro ao carregar métricas:", err)
      setError("Falha ao carregar métricas. Verifique se está logado e tente novamente.")
      setMetrics(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMetrics()
  }, [startDate, endDate])

  if (loading && !metrics && !error) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadMetrics()}
              className="shrink-0"
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">Visão geral do sistema</p>
        </div>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
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
              <Button variant="outline">
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
          {(startDate || endDate) && (
            <Button variant="ghost" onClick={() => {
              setStartDate(undefined)
              setEndDate(undefined)
            }}>
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Cards de métricas - 2 colunas mobile, 4 desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Pedidos</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {startDate && endDate ? "No período selecionado" : "Total geral"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturamento</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics?.revenue || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {startDate && endDate ? "No período selecionado" : "Total geral"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aguardando Pagamento</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.awaiting_payment || 0}</div>
            <p className="text-xs text-muted-foreground">Pedidos pendentes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics?.average_order_value ?? 0)}</div>
            <p className="text-xs text-muted-foreground">Por pedido pago</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pedidos Pagos</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.paid_count ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {metrics?.total ? `${((metrics.conversion_rate ?? 0) * 100).toFixed(1)}% conversão` : "Conversão"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Novos Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.new_clients_count ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {startDate && endDate ? "No período" : "Total"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo até Pagamento</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.avg_hours_to_payment != null
                ? metrics.avg_hours_to_payment < 24
                  ? `${metrics.avg_hours_to_payment.toFixed(1)} h`
                  : `${(metrics.avg_hours_to_payment / 24).toFixed(1)} dias`
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground">Média (pedidos pagos)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Frete</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics?.shipping_total ?? 0)}</div>
            <p className="text-xs text-muted-foreground">Total · Média {formatCurrency(metrics?.shipping_avg ?? 0)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">À Vista / Parcelado</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{formatCurrency(metrics?.revenue_avista ?? 0)}</div>
            <p className="text-xs text-muted-foreground">Parcelado {formatCurrency(metrics?.revenue_parcelado ?? 0)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status Diferentes</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.by_status?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Tipos de status</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cancelados</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.by_status?.find((s: any) => s.status === 'cancelados')?.count ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">Pedidos cancelados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enviados</CardTitle>
            <PackageCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.by_status?.find((s: any) => s.status === 'enviado')?.count ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">Pedidos enviados</p>
          </CardContent>
        </Card>
      </div>

      {/* Distribuição por Status, Forma de Pagamento, Top Produtos, Vendas por estado - grade 2/4 colunas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Distribuição por status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Distribuição por Status</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">Quantidade de pedidos por status</p>
            <div className="space-y-4">
              {metrics?.by_status?.map((item: any) => (
                <div key={item.status} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{STATUS_LABELS[item.status] || item.status}</span>
                    <span className="text-muted-foreground">{item.count} pedidos</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className={cn("h-2 rounded-full transition-all", STATUS_BAR_COLORS[item.status] || "bg-primary")}
                      style={{
                        width: `${metrics.total > 0 ? (item.count / metrics.total) * 100 : 0}%`
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Distribuição por forma de pagamento */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Forma de Pagamento</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">Pedidos pagos no período, por método</p>
            {metrics?.by_payment_method && metrics.by_payment_method.length > 0 ? (
              <div className="space-y-4">
                {metrics.by_payment_method.map((item: any) => {
                  const Icon = getPaymentMethodIcon(item.method)
                  return (
                    <div key={item.method} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className={cn("inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium", getPaymentMethodColor(item.method))}>
                          <Icon className="h-3.5 w-3.5" />
                          {getPaymentMethodLabel(item.method)}
                        </span>
                        <span className="text-muted-foreground">{item.count} pedidos · {formatCurrency(item.total || 0)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className={cn("h-2 rounded-full transition-all", item.method === "pix" || item.method === "pix_manual" ? "bg-emerald-500" : item.method === "credit_card" ? "bg-blue-500" : "bg-primary")}
                          style={{
                            width: `${metrics.total > 0 ? (item.count / metrics.total) * 100 : 0}%`
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">
                {startDate && endDate ? "Nenhum pedido pago no período." : "Nenhum pedido pago."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Top produtos no período */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Produtos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">Mais vendidos por quantidade</p>
            {metrics?.top_products && metrics.top_products.length > 0 ? (
              <div className="space-y-4">
                {metrics.top_products.map((item: any, idx: number) => (
                  <div key={item.product_id ?? item.title ?? idx} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate pr-2">{item.title}</span>
                      <span className="text-muted-foreground shrink-0">{item.quantity} un. · {formatCurrency(item.revenue ?? 0)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{
                          width: `${metrics.top_products[0].quantity > 0 ? (item.quantity / metrics.top_products[0].quantity) * 100 : 0}%`
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">Nenhum produto vendido no período.</p>
            )}
          </CardContent>
        </Card>

        {/* Vendas por estado */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Distribuição por estados</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">Pedidos por UF (endereço de entrega)</p>
            {metrics?.by_state && metrics.by_state.length > 0 ? (
              <div className="space-y-4">
                {metrics.by_state.map((item: any) => (
                  <div key={item.state} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.state}</span>
                      <span className="text-muted-foreground">{item.count} pedidos · {formatCurrency(item.total ?? 0)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{
                          width: `${metrics.by_state[0].count > 0 ? (item.count / metrics.by_state[0].count) * 100 : 0}%`
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">Nenhuma venda por estado no período.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
