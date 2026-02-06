"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/DatePicker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { CalendarIcon, ShoppingCart, DollarSign, Clock, Loader2, CreditCard, Smartphone, Banknote, AlertCircle, TrendingUp, CheckCircle, Users, Timer, Truck, Wallet, Package, MapPin, BarChart3, XCircle, PackageCheck } from "lucide-react"
import { metricsApi } from "@/lib/api"
import { formatCurrency } from "@/lib/utils"
import { format, parseISO, startOfMonth, startOfYear, subMonths, endOfMonth } from "date-fns" 
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

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

const STATUS_CHART_COLORS: Record<string, string> = {
  aguardando_pagamento: "#f59e0b",
  aguardando_producao: "#3b82f6",
  em_producao: "#6366f1",
  aguardando_envio: "#06b6d4",
  enviado: "#10b981",
  nao_pagos: "#f43f5e",
  cancelados: "#6b7280"
}

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  pix: "#10b981",
  pix_manual: "#10b981",
  credit_card: "#3b82f6",
  default: "#6b7280"
}

const BRAZILIAN_STATES: Record<string, string> = {
  'AC': 'Acre',
  'AL': 'Alagoas',
  'AP': 'Amapá',
  'AM': 'Amazonas',
  'BA': 'Bahia',
  'CE': 'Ceará',
  'DF': 'Distrito Federal',
  'ES': 'Espírito Santo',
  'GO': 'Goiás',
  'MA': 'Maranhão',
  'MT': 'Mato Grosso',
  'MS': 'Mato Grosso do Sul',
  'MG': 'Minas Gerais',
  'PA': 'Pará',
  'PB': 'Paraíba',
  'PR': 'Paraná',
  'PE': 'Pernambuco',
  'PI': 'Piauí',
  'RJ': 'Rio de Janeiro',
  'RN': 'Rio Grande do Norte',
  'RS': 'Rio Grande do Sul',
  'RO': 'Rondônia',
  'RR': 'Roraima',
  'SC': 'Santa Catarina',
  'SP': 'São Paulo',
  'SE': 'Sergipe',
  'TO': 'Tocantins'
}

type FilterType = 'period' | 'this_year' | 'this_month' | 'last_month' | 'last_n'

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

function getPaymentMethodChartColor(method: string): string {
  return PAYMENT_METHOD_COLORS[method] || PAYMENT_METHOD_COLORS.default
}

function getStateFullName(state: string): string {
  const fullName = BRAZILIAN_STATES[state.toUpperCase()] || state
  return `${state.toUpperCase()} - ${fullName}`
}

// Função para capitalizar título (primeira letra maiúscula de cada palavra)
function capitalizeTitle(title: string): string {
  return title
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

// Função para truncar texto
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

// Função para formatar data conforme agrupamento
function formatDateByGroup(date: string, groupBy: string): string {
  try {
    const parsed = parseISO(date)
    switch (groupBy) {
      case 'day':
        return format(parsed, "dd/MM", { locale: ptBR })
      case 'week':
        return format(parsed, "dd/MM", { locale: ptBR })
      case 'month':
        return format(parsed, "MMM", { locale: ptBR })
      case 'year':
        return format(parsed, "yyyy", { locale: ptBR })
      default:
        return format(parsed, "dd/MM", { locale: ptBR })
    }
  } catch {
    return date
  }
}

// Função para calcular datas baseadas no filtro
function getDatesFromFilter(filterType: FilterType, lastN?: number, unit?: 'days' | 'months'): { startDate: Date, endDate: Date } {
  const today = new Date()
  const endDate = new Date(today)
  
  switch (filterType) {
    case 'this_month':
      return {
        startDate: startOfMonth(today),
        endDate: today
      }
    case 'this_year':
      return {
        startDate: startOfYear(today),
        endDate: today
      }
    case 'last_month':
      const lastMonthStart = startOfMonth(subMonths(today, 1))
      const lastMonthEnd = endOfMonth(subMonths(today, 1))
      return {
        startDate: lastMonthStart,
        endDate: lastMonthEnd
      }
    case 'last_n':
      const start = new Date(today)
      if (unit === 'days') {
        start.setDate(start.getDate() - (lastN || 7))
      } else {
        start.setMonth(start.getMonth() - (lastN || 1))
      }
      return { startDate: start, endDate: today }
    default:
      return { startDate: today, endDate: today }
  }
}

// Função para obter texto do botão de filtro
function getFilterButtonText(filterType: FilterType, lastN?: number, unit?: 'days' | 'months'): string {
  switch (filterType) {
    case 'period': return 'Período Personalizado'
    case 'this_year': return 'Este Ano'
    case 'this_month': return 'Este Mês'
    case 'last_month': return 'Mês Passado'
    case 'last_n': return `Últimos ${lastN} ${unit === 'days' ? 'Dias' : 'Meses'}`
    default: return 'Selecione um período'
  }
}

// Função para calcular agrupamento automático baseado no período
function getAutoGroupBy(startDate: Date, endDate: Date): 'day' | 'week' | 'month' | 'year' {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays <= 7) return 'day'
  if (diffDays <= 30) return 'day'
  if (diffDays <= 90) return 'week'
  if (diffDays <= 365) return 'month'
  return 'year'
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<FilterType>('this_month')
  const [lastNValue, setLastNValue] = useState<number>(7)
  const [lastNUnit, setLastNUnit] = useState<'days' | 'months'>('days')
  const [startDate, setStartDate] = useState<Date | undefined>(() => {
    const dates = getDatesFromFilter('this_month')
    return dates.startDate
  })
  const [endDate, setEndDate] = useState<Date | undefined>(() => {
    const dates = getDatesFromFilter('this_month')
    return dates.endDate
  })
  const [revenueEvolution, setRevenueEvolution] = useState<Array<{ date: string; revenue: number }>>([])
  const [revenueEvolutionLoading, setRevenueEvolutionLoading] = useState(false)
  const [revenueMonthly, setRevenueMonthly] = useState<Array<{ month: number; month_name: string; revenue: number }>>([])
  const [revenueMonthlyLoading, setRevenueMonthlyLoading] = useState(false)
  const [topClients, setTopClients] = useState<Array<{ client_id: number; client_name: string; order_count: number; total_revenue: number }>>([])
  const [topClientsLoading, setTopClientsLoading] = useState(false)

  // Atualizar datas quando o filtro muda
  useEffect(() => {
    if (filterType !== 'period') {
      const dates = getDatesFromFilter(filterType, lastNValue, lastNUnit)
      setStartDate(dates.startDate)
      setEndDate(dates.endDate)
    }
  }, [filterType, lastNValue, lastNUnit])

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

  const loadRevenueEvolution = async () => {
    if (!startDate || !endDate) return
    
    setRevenueEvolutionLoading(true)
    try {
      const groupBy = getAutoGroupBy(startDate, endDate)
      const params: any = {
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(endDate, "yyyy-MM-dd"),
        group_by: groupBy
      }
      const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
      if (tz) params.timezone = tz
      const data = await metricsApi.revenueEvolution(params)
      setRevenueEvolution(data)
    } catch (err) {
      console.error("Erro ao carregar evolução de faturamento:", err)
    } finally {
      setRevenueEvolutionLoading(false)
    }
  }

  const loadRevenueMonthly = async () => {
    setRevenueMonthlyLoading(true)
    try {
      const data = await metricsApi.revenueMonthly()
      setRevenueMonthly(data)
    } catch (err) {
      console.error("Erro ao carregar faturamento mensal:", err)
    } finally {
      setRevenueMonthlyLoading(false)
    }
  }

  const loadTopClients = async () => {
    setTopClientsLoading(true)
    try {
      const params: any = {}
      if (startDate && endDate) {
        params.start_date = format(startDate, "yyyy-MM-dd")
        params.end_date = format(endDate, "yyyy-MM-dd")
      }
      const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
      if (tz) params.timezone = tz
      params.limit = 10
      const data = await metricsApi.topClients(params)
      setTopClients(data)
    } catch (err) {
      console.error("Erro ao carregar top clientes:", err)
    } finally {
      setTopClientsLoading(false)
    }
  }

  useEffect(() => {
    loadMetrics()
    loadTopClients()
  }, [startDate, endDate])

  useEffect(() => {
    loadRevenueEvolution()
  }, [startDate, endDate])

  useEffect(() => {
    loadRevenueMonthly()
  }, [])

  if (loading && !metrics && !error) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const currentMonth = new Date().getMonth() + 1

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
        <div className="flex gap-2 flex-wrap">
          <Select value={filterType} onValueChange={(value: FilterType) => setFilterType(value)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue>
                {getFilterButtonText(filterType, lastNValue, lastNUnit)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">Este Mês</SelectItem>
              <SelectItem value="this_year">Este Ano</SelectItem>
              <SelectItem value="last_month">Mês Passado</SelectItem>
              <SelectItem value="last_n">Últimos N dias/meses</SelectItem>
              <SelectItem value="period">Período Personalizado</SelectItem>
            </SelectContent>
          </Select>
          
          {filterType === 'last_n' && (
            <>
              <Input
                type="number"
                min="1"
                value={lastNValue}
                onChange={(e) => setLastNValue(parseInt(e.target.value) || 7)}
                className="w-20"
              />
              <Select value={lastNUnit} onValueChange={(value: 'days' | 'months') => setLastNUnit(value)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">Dias</SelectItem>
                  <SelectItem value="months">Meses</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          
          {filterType === 'period' && (
            <>
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
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="charts" className="w-full">
        <TabsList>
          <TabsTrigger value="charts">Gráficos</TabsTrigger>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
        </TabsList>

        <TabsContent value="charts" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Card: Faturamento Mensal (largura total) */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Faturamento Mensal</CardTitle>
                <CardDescription>Faturamento por mês do ano atual</CardDescription>
              </CardHeader>
              <CardContent>
                {revenueMonthlyLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : revenueMonthly.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={revenueMonthly}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="month_name" 
                        className="text-xs"
                        tick={{ fill: 'currentColor' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'currentColor' }}
                        tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px'
                        }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Bar 
                        dataKey="revenue" 
                        fill="#3b82f6"
                        radius={[4, 4, 0, 0]}
                      >
                        {revenueMonthly.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.month === currentMonth ? "#10b981" : "#3b82f6"} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Nenhum dado disponível.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Linha 2: Distribuição por Forma de Pagamento e Evolução de Faturamento */}
            <Card>
              <CardHeader>
                <CardTitle>Forma de Pagamento</CardTitle>
                <CardDescription>Distribuição por método de pagamento</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {metrics?.by_payment_method && metrics.by_payment_method.length > 0 ? (
                  <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <Pie
                        data={metrics.by_payment_method.map((item: { method: string; count: number; total: number }) => ({
                          name: getPaymentMethodLabel(item.method),
                          value: item.total,
                          count: item.count
                        }))}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent, cx, cy, midAngle, innerRadius, outerRadius }) => {
                          const RADIAN = Math.PI / 180
                          const radius = innerRadius + (outerRadius - innerRadius) * 0.5
                          const x = cx + radius * Math.cos(-midAngle * RADIAN)
                          const y = cy + radius * Math.sin(-midAngle * RADIAN)
                          const percentValue = (percent * 100).toFixed(0)
                          
                          // Só mostrar label se a fatia for grande o suficiente (>5%)
                          if (percent < 0.05) return null
                          
                          return (
                            <g>
                              <text 
                                x={x} 
                                y={y - 6} 
                                fill="white" 
                                textAnchor="middle" 
                                dominantBaseline="central"
                                style={{ 
                                  fontSize: '11px', 
                                  fontWeight: '600',
                                  textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                }}
                              >
                                {name}
                              </text>
                              <text 
                                x={x} 
                                y={y + 6} 
                                fill="white" 
                                textAnchor="middle" 
                                dominantBaseline="central"
                                style={{ 
                                  fontSize: '10px', 
                                  fontWeight: '500',
                                  textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                                }}
                              >
                                {percentValue}%
                              </text>
                            </g>
                          )
                        }}
                        outerRadius={110}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {metrics.by_payment_method.map((item: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={getPaymentMethodChartColor(item.method)} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '12px'
                        }}
                        formatter={(value: number, name: string, props: any) => [
                          `${formatCurrency(value)} (${props.payload.count} pedidos)`,
                          name
                        ]}
                      />
                      <Legend 
                        wrapperStyle={{ fontSize: '10px', paddingBottom: '16px' }} 
                        iconType="square"
                        formatter={(value) => <span style={{ fontSize: '11px', fontWeight: '500' }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    {startDate && endDate ? "Nenhum pedido pago no período." : "Nenhum pedido pago."}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Evolução de Faturamento</CardTitle>
              </CardHeader>
              <CardContent>
                {revenueEvolutionLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : revenueEvolution.length > 0 && startDate && endDate ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={revenueEvolution.map(item => {
                      const groupBy = getAutoGroupBy(startDate, endDate)
                      return {
                        ...item,
                        dateFormatted: formatDateByGroup(item.date, groupBy)
                      }
                    })}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="dateFormatted" 
                        className="text-xs"
                        tick={{ fill: 'currentColor' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'currentColor' }}
                        tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px'
                        }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="#3b82f6" 
                        fillOpacity={1} 
                        fill="url(#colorRevenue)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    {startDate && endDate ? "Nenhum dado disponível para o período selecionado." : "Selecione um período para visualizar a evolução."}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Linha 3: Top Produtos, Top Estados, Top Clientes */}
            <Card>
              <CardHeader>
                <CardTitle>Top Produtos</CardTitle>
                <CardDescription>Ranking dos 10 produtos mais vendidos</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics?.top_products && metrics.top_products.length > 0 ? (
                  <div className="overflow-x-auto overflow-y-auto max-h-[300px]">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-background z-10">
                        <tr className="border-b">
                          <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-3">Posição</th>
                          <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-3">Produto</th>
                          <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-3">Quantidade</th>
                          <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-3 pr-4">Faturamento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.top_products.slice(0, 10).map((item: any, idx: number) => {
                          const position = idx + 1
                          return (
                            <tr key={item.product_id ?? item.title ?? idx} className="border-b hover:bg-muted/50 transition-colors">
                              <td className="py-3">
                                <span className="text-xs font-medium text-muted-foreground">{position}º</span>
                              </td>
                              <td className="py-3">
                                <span className="text-xs font-light" title={item.title}>
                                  {truncateText(capitalizeTitle(item.title || 'Sem título'), 30)}
                                </span>
                              </td>
                              <td className="py-3 text-right text-xs">{item.quantity} un.</td>
                              <td className="py-3 text-right text-xs font-medium pr-4">{formatCurrency(item.revenue ?? 0)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">Nenhum produto vendido no período.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Estados</CardTitle>
                <CardDescription>Ranking dos estados com mais pedidos</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics?.by_state && metrics.by_state.length > 0 ? (
                  <div className="overflow-x-auto overflow-y-auto max-h-[300px]">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-background z-10">
                        <tr className="border-b">
                          <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-3">Posição</th>
                          <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-3">Estado</th>
                          <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-3">Pedidos</th>
                          <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-3 pr-4">Faturamento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.by_state.slice(0, 10).map((item: any, idx: number) => {
                          const position = idx + 1
                          return (
                            <tr key={item.state} className="border-b hover:bg-muted/50 transition-colors">
                              <td className="py-3">
                                <span className="text-xs font-medium text-muted-foreground">{position}º</span>
                              </td>
                              <td className="py-3">
                                <span className="text-xs font-light">{getStateFullName(item.state)}</span>
                              </td>
                              <td className="py-3 text-right text-xs">{item.count}</td>
                              <td className="py-3 text-right text-xs font-medium pr-4">{formatCurrency(item.total ?? 0)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">Nenhuma venda por estado no período.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Clientes</CardTitle>
                <CardDescription>Ranking dos 10 clientes com maior faturamento</CardDescription>
              </CardHeader>
              <CardContent>
                {topClientsLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : topClients.length > 0 ? (
                  <div className="overflow-x-auto overflow-y-auto max-h-[300px]">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-background z-10">
                        <tr className="border-b">
                          <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-3">Posição</th>
                          <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-3">Cliente</th>
                          <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-3">Pedidos</th>
                          <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-3 pr-4">Faturamento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topClients.map((item, idx: number) => {
                          const position = idx + 1
                          return (
                            <tr key={item.client_id} className="border-b hover:bg-muted/50 transition-colors">
                              <td className="py-3">
                                <span className="text-xs font-medium text-muted-foreground">{position}º</span>
                              </td>
                              <td className="py-3">
                                <span className="text-xs font-light" title={item.client_name}>
                                  {truncateText(item.client_name, 30)}
                                </span>
                              </td>
                              <td className="py-3 text-right text-xs">{item.order_count}</td>
                              <td className="py-3 text-right text-xs font-medium pr-4">{formatCurrency(item.total_revenue)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">Nenhum cliente encontrado no período.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-6">
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
