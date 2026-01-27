"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RuleModal } from "./RuleModal"
import { Truck, Plus, Edit, Trash2, Loader2 } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

export function ShippingRulesSection() {
  const [loading, setLoading] = useState(false)
  const [rules, setRules] = useState<any[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<any>(null)

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
    } catch (error) {
      console.error('Erro ao salvar regra:', error)
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
    } catch (error) {
      console.error('Erro ao deletar regra:', error)
      alert('Erro ao deletar regra')
    }
  }

  const handleEdit = (rule: any) => {
    setEditingRule(rule)
    setModalOpen(true)
  }

  const handleNew = () => {
    setEditingRule(null)
    setModalOpen(true)
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
    switch (rule.condition_type) {
      case 'all':
        return 'Para todos'
      case 'min_value':
        return `Valor mínimo: ${formatCurrency(rule.condition_value?.min_value || 0)}`
      case 'states':
        const states = rule.condition_value?.states || []
        return `Estados: ${states.join(', ')}`
      case 'shipping_methods':
        return 'Modalidades específicas'
      default:
        return rule.condition_type
    }
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
            <Truck className="h-5 w-5" />
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
          <Button onClick={handleNew} variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Nova Regra de Frete Grátis
          </Button>
        </CardContent>
      </Card>

      {/* Desconto/Acréscimo */}
      <Card>
        <CardHeader>
          <CardTitle>Desconto/Acréscimo no Frete</CardTitle>
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
          <Button onClick={handleNew} variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Nova Regra de Desconto/Acréscimo
          </Button>
        </CardContent>
      </Card>

      {/* Prazo de Produção */}
      {productionRules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Prazo de Produção</CardTitle>
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
        onOpenChange={setModalOpen}
        rule={editingRule}
        onSave={handleSaveRule}
      />
    </div>
  )
}
