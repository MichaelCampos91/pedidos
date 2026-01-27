"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RuleModal } from "./RuleModal"
import { Truck, Plus, Edit, Trash2, Loader2, Gift, Percent, Clock } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/lib/toast"

export function ShippingRulesSection() {
  const [loading, setLoading] = useState(false)
  const [rules, setRules] = useState<any[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<any>(null)
  const [newRuleType, setNewRuleType] = useState<'free_shipping' | 'discount' | 'surcharge' | undefined>(undefined)

  useEffect(() => {
    loadRules()
  }, [])

  const loadRules = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/settings/shipping-rules', {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Erro ao carregar regras')
      }

      const data = await response.json()
      setRules(data.rules || [])
    } catch (error) {
      console.error('Erro ao carregar regras:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveRule = async (ruleData: any) => {
    try {
      const method = ruleData.id ? 'PUT' : 'POST'
      const response = await fetch('/api/settings/shipping-rules', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleData),
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Erro ao salvar regra')
      }

      await loadRules()
      toast.success(ruleData.id ? 'Regra atualizada com sucesso!' : 'Regra criada com sucesso!')
    } catch (error: any) {
      console.error('Erro ao salvar regra:', error)
      toast.error(error.message || 'Erro ao salvar regra')
      throw error
    }
  }

  const handleDeleteRule = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar esta regra?')) {
      return
    }

    try {
      const response = await fetch(`/api/settings/shipping-rules?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Erro ao deletar regra')
      }

      await loadRules()
      toast.success('Regra deletada com sucesso!')
    } catch (error: any) {
      console.error('Erro ao deletar regra:', error)
      toast.error(error.message || 'Erro ao deletar regra')
    }
  }

  const handleEdit = (rule: any) => {
    setEditingRule(rule)
    setNewRuleType(undefined)
    setModalOpen(true)
  }

  const handleNew = (ruleType?: 'free_shipping' | 'discount' | 'surcharge') => {
    setEditingRule(null)
    setNewRuleType(ruleType)
    setModalOpen(true)
  }

  const handleModalClose = (open: boolean) => {
    setModalOpen(open)
    if (!open) {
      setEditingRule(null)
      setNewRuleType(undefined)
    }
  }

  const getRuleTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      free_shipping: 'Frete Grátis',
      discount: 'Desconto',
      surcharge: 'Acréscimo',
      production_days: 'Prazo de Produção',
    }
    return labels[type] || type
  }

  const getConditionLabel = (rule: any) => {
    const conditionValue = rule.condition_value || {}
    const conditions: string[] = []

    // Se condition_type é 'all' e não há condições específicas, retornar "Para todos"
    if (rule.condition_type === 'all' && 
        !conditionValue.min_value && 
        (!conditionValue.states || conditionValue.states.length === 0) &&
        (!conditionValue.shipping_methods || conditionValue.shipping_methods.length === 0) &&
        (!rule.shipping_methods || rule.shipping_methods.length === 0)) {
      return 'Para todos'
    }

    // Verificar valor mínimo
    if (conditionValue.min_value !== undefined && conditionValue.min_value !== null) {
      conditions.push(`Valor mínimo: ${formatCurrency(conditionValue.min_value)}`)
    }

    // Verificar estados
    if (conditionValue.states && Array.isArray(conditionValue.states) && conditionValue.states.length > 0) {
      conditions.push(`Estados: ${conditionValue.states.join(', ')}`)
    }

    // Verificar modalidades de frete
    const shippingMethods = conditionValue.shipping_methods || rule.shipping_methods
    if (shippingMethods && Array.isArray(shippingMethods) && shippingMethods.length > 0) {
      conditions.push(`Modalidades: ${shippingMethods.length} selecionada(s)`)
    }

    // Se não há condições específicas, usar fallback baseado em condition_type
    if (conditions.length === 0) {
      switch (rule.condition_type) {
        case 'all':
          return 'Para todos'
        case 'min_value':
          return `Valor mínimo: ${formatCurrency(conditionValue.min_value || 0)}`
        case 'states':
          const states = conditionValue.states || []
          return `Estados: ${states.join(', ')}`
        case 'shipping_methods':
          return 'Modalidades específicas'
        default:
          return rule.condition_type || 'Sem condições'
      }
    }

    // Retornar todas as condições separadas por " • "
    return conditions.join(' • ')
  }

  const getDiscountLabel = (rule: any) => {
    if (rule.rule_type === 'free_shipping') {
      return 'Frete grátis'
    }
    if (rule.rule_type === 'production_days') {
      return `${rule.production_days || 0} dias úteis`
    }
    if (rule.discount_type === 'percentage') {
      return `${rule.discount_value}%`
    }
    if (rule.discount_type === 'fixed') {
      return formatCurrency(rule.discount_value || 0)
    }
    return '-'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const freeShippingRules = rules.filter((r) => r.rule_type === 'free_shipping')
  const discountRules = rules.filter((r) => r.rule_type === 'discount' || r.rule_type === 'surcharge')
  const productionRules = rules.filter((r) => r.rule_type === 'production_days')

  return (
    <div className="space-y-6">
      {/* Frete Grátis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-green-600" />
            Frete Grátis
          </CardTitle>
          <CardDescription>
            Configure regras para oferecer frete grátis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {freeShippingRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma regra de frete grátis configurada
            </p>
          ) : (
            <div className="space-y-2">
              {freeShippingRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={rule.active ? 'default' : 'outline'}>
                        {rule.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <span className="font-medium">{getRuleTypeLabel(rule.rule_type)}</span>
                      <span className="text-sm text-muted-foreground">
                        ({getConditionLabel(rule)})
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Prioridade: {rule.priority}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(rule)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteRule(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button onClick={() => handleNew('free_shipping')} variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Nova Regra de Frete Grátis
          </Button>
        </CardContent>
      </Card>

      {/* Desconto/Acréscimo - OCULTO */}
      <Card className="hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-blue-600" />
            Desconto/Acréscimo no Frete
          </CardTitle>
          <CardDescription>
            Configure descontos ou acréscimos no valor do frete
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {discountRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma regra de desconto/acréscimo configurada
            </p>
          ) : (
            <div className="space-y-2">
              {discountRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={rule.active ? 'default' : 'outline'}>
                        {rule.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <span className="font-medium">{getRuleTypeLabel(rule.rule_type)}</span>
                      <span className="text-sm text-muted-foreground">
                        {getDiscountLabel(rule)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {getConditionLabel(rule)} • Prioridade: {rule.priority}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(rule)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteRule(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button onClick={() => handleNew()} variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Nova Regra de Desconto/Acréscimo
          </Button>
        </CardContent>
      </Card>

      {/* Prazo de Produção */}
      {productionRules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-600" />
              Prazo de Produção
            </CardTitle>
            <CardDescription>
              Regras de prazo de produção configuradas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {productionRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={rule.active ? 'default' : 'outline'}>
                        {rule.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <span className="font-medium">
                        {rule.production_days || 0} dias úteis
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {getConditionLabel(rule)} • Prioridade: {rule.priority}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(rule)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteRule(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <RuleModal
        open={modalOpen}
        onOpenChange={handleModalClose}
        rule={editingRule}
        onSave={handleSaveRule}
        defaultRuleType={newRuleType}
      />
    </div>
  )
}
