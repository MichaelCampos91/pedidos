"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2 } from "lucide-react"

interface RuleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule?: any
  onSave: (rule: any) => Promise<void>
}

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]

export function RuleModal({ open, onOpenChange, rule, onSave }: RuleModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    rule_type: 'discount',
    condition_type: 'all',
    condition_value: {},
    discount_type: 'percentage',
    discount_value: '',
    shipping_methods: null,
    production_days: '',
    priority: '0',
    active: true,
  })

  useEffect(() => {
    if (rule) {
      setFormData({
        rule_type: rule.rule_type || 'discount',
        condition_type: rule.condition_type || 'all',
        condition_value: rule.condition_value || {},
        discount_type: rule.discount_type || 'percentage',
        discount_value: rule.discount_value?.toString() || '',
        shipping_methods: rule.shipping_methods || null,
        production_days: rule.production_days?.toString() || '',
        priority: rule.priority?.toString() || '0',
        active: rule.active !== undefined ? rule.active : true,
      })
    } else {
      setFormData({
        rule_type: 'discount',
        condition_type: 'all',
        condition_value: {},
        discount_type: 'percentage',
        discount_value: '',
        shipping_methods: null,
        production_days: '',
        priority: '0',
        active: true,
      })
    }
  }, [rule, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const ruleData = {
        ...(rule ? { id: rule.id } : {}),
        rule_type: formData.rule_type,
        condition_type: formData.condition_type,
        condition_value: formData.condition_value,
        discount_type: formData.discount_type,
        discount_value: formData.discount_value ? parseFloat(formData.discount_value) : null,
        shipping_methods: formData.shipping_methods,
        production_days: formData.production_days ? parseInt(formData.production_days) : null,
        priority: parseInt(formData.priority) || 0,
        active: formData.active,
      }

      await onSave(ruleData)
      onOpenChange(false)
    } catch (error) {
      console.error('Erro ao salvar regra:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateConditionValue = (key: string, value: any) => {
    setFormData({
      ...formData,
      condition_value: {
        ...formData.condition_value,
        [key]: value,
      },
    })
  }

  const selectedStates = formData.condition_value?.states || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? 'Editar Regra' : 'Nova Regra de Frete'}</DialogTitle>
          <DialogDescription>
            Configure as condições e valores para aplicar regras de frete
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rule_type">Tipo de Regra</Label>
            <Select
              value={formData.rule_type}
              onValueChange={(value) => setFormData({ ...formData, rule_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free_shipping">Frete Grátis</SelectItem>
                <SelectItem value="discount">Desconto</SelectItem>
                <SelectItem value="surcharge">Acréscimo</SelectItem>
                <SelectItem value="production_days">Prazo de Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="condition_type">Condição</Label>
            <Select
              value={formData.condition_type}
              onValueChange={(value) => setFormData({ ...formData, condition_type: value, condition_value: {} })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Para Todos</SelectItem>
                <SelectItem value="min_value">Por Valor Mínimo</SelectItem>
                <SelectItem value="states">Por Estados</SelectItem>
                <SelectItem value="shipping_methods">Por Modalidade de Frete</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.condition_type === 'min_value' && (
            <div className="space-y-2">
              <Label htmlFor="min_value">Valor Mínimo (R$)</Label>
              <Input
                id="min_value"
                type="number"
                step="0.01"
                value={formData.condition_value?.min_value || ''}
                onChange={(e) => updateConditionValue('min_value', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
          )}

          {formData.condition_type === 'states' && (
            <div className="space-y-2">
              <Label>Estados</Label>
              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto border rounded-md p-2">
                {BRAZILIAN_STATES.map((state) => (
                  <label key={state} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedStates.includes(state)}
                      onChange={(e) => {
                        const newStates = e.target.checked
                          ? [...selectedStates, state]
                          : selectedStates.filter((s) => s !== state)
                        updateConditionValue('states', newStates)
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{state}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {(formData.rule_type === 'discount' || formData.rule_type === 'surcharge') && (
            <>
              <div className="space-y-2">
                <Label htmlFor="discount_type">Tipo</Label>
                <Select
                  value={formData.discount_type}
                  onValueChange={(value) => setFormData({ ...formData, discount_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Porcentagem</SelectItem>
                    <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="discount_value">
                  {formData.discount_type === 'percentage' ? 'Porcentagem (%)' : 'Valor (R$)'}
                </Label>
                <Input
                  id="discount_value"
                  type="number"
                  step={formData.discount_type === 'percentage' ? '0.01' : '0.01'}
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                  placeholder={formData.discount_type === 'percentage' ? '0.00' : '0.00'}
                  required
                />
              </div>
            </>
          )}

          {formData.rule_type === 'production_days' && (
            <div className="space-y-2">
              <Label htmlFor="production_days">Dias Úteis a Adicionar</Label>
              <Input
                id="production_days"
                type="number"
                min="0"
                value={formData.production_days}
                onChange={(e) => setFormData({ ...formData, production_days: e.target.value })}
                placeholder="0"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="priority">Prioridade</Label>
            <Input
              id="priority"
              type="number"
              min="0"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              Menor número = maior prioridade. Regras são aplicadas em ordem de prioridade.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="active"
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              className="rounded"
            />
            <Label htmlFor="active" className="cursor-pointer">
              Regra ativa
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
