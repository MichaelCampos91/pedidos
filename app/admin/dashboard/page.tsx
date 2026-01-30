"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/DatePicker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { CalendarIcon, ShoppingCart, DollarSign, Clock, Loader2, CreditCard, Smartphone, Banknote } from "lucide-react"
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
  const [startDate, setStartDate] = useState<Date | undefined>(() => new Date())
  const [endDate, setEndDate] = useState<Date | undefined>(() => new Date())

  const loadMetrics = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (startDate && endDate) {
        params.start_date = format(startDate, "yyyy-MM-dd")
        params.end_date = format(endDate, "yyyy-MM-dd")
      }
      const data = await metricsApi.orders(params)
      setMetrics(data)
    } catch (error) {
      console.error("Erro ao carregar métricas:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMetrics()
  }, [startDate, endDate])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
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

      {/* Cards de métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <CardTitle className="text-sm font-medium">Status Diferentes</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.by_status?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Tipos de status</p>
          </CardContent>
        </Card>
      </div>

      {/* Distribuição por status */}
      <Card>
        <CardHeader>
          <CardTitle>Distribuição por Status</CardTitle>
          <CardDescription>Quantidade de pedidos por status</CardDescription>
        </CardHeader>
        <CardContent>
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
        <CardHeader>
          <CardTitle>Distribuição por Forma de Pagamento</CardTitle>
          <CardDescription>Pedidos pagos no período, por método</CardDescription>
        </CardHeader>
        <CardContent>
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
    </div>
  )
}
