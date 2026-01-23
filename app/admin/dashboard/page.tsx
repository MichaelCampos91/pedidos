"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/DatePicker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { CalendarIcon, ShoppingCart, DollarSign, Clock, Loader2 } from "lucide-react"
import { metricsApi } from "@/lib/api"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"

const STATUS_LABELS: Record<string, string> = {
  aguardando_pagamento: "Aguardando Pagamento",
  aguardando_producao: "Aguardando Produção",
  em_producao: "Em Produção",
  aguardando_envio: "Aguardando Envio",
  enviado: "Enviado",
  nao_pagos: "Não Pagos",
  cancelados: "Cancelados"
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()

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
                    className="h-2 rounded-full bg-primary transition-all"
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
    </div>
  )
}
