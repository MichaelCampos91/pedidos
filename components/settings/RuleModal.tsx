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
  defaultRuleType?: 'free_shipping' | 'surcharge' | 'production_days'
}

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]

export function RuleModal({ open, onOpenChange, rule, onSave, defaultRuleType }: RuleModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    rule_type: 'free_shipping',
    condition_type: 'all',
    condition_value: {},
    discount_type: 'percentage',
    discount_value: '',
    shipping_methods: null,
    production_days: '',
    priority: '0',
    active: true,
  })
  const [hasMinValue, setHasMinValue] = useState(false)
  const [hasStates, setHasStates] = useState(false)
  const [hasShippingMethods, setHasShippingMethods] = useState(false)

  useEffect(() => {
    if (rule) {
      const conditionValue = rule.condition_value || {}
      const hasMin = conditionValue.min_value !== undefined && conditionValue.min_value !== null
      const hasStatesArray = conditionValue.states !== undefined && Array.isArray(conditionValue.states) && conditionValue.states.length > 0
      const hasMethods = (conditionValue.shipping_methods !== undefined && conditionValue.shipping_methods !== null) || 
                         (rule.shipping_methods !== undefined && rule.shipping_methods !== null)
      
      setHasMinValue(hasMin)
      setHasStates(hasStatesArray)
      setHasShippingMethods(hasMethods)

      setFormData({
        rule_type: rule.rule_type || 'free_shipping',
        condition_type: rule.condition_type || 'all',
        condition_value: conditionValue,
        discount_type: rule.discount_type || 'percentage',
        discount_value: rule.discount_value?.toString() || '',
        shipping_methods: rule.shipping_methods || null,
        production_days: rule.production_days?.toString() || '',
        priority: rule.priority?.toString() || '0',
        active: rule.active !== undefined ? rule.active : true,
      })
    } else {
      // Se não há regra, usar defaultRuleType se fornecido, senão 'free_shipping'
      const initialRuleType = defaultRuleType || 'free_shipping'
      
      setHasMinValue(false)
      setHasStates(false)
      setHasShippingMethods(false)
      setFormData({
        rule_type: initialRuleType,
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
  }, [rule, open, defaultRuleType])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Determinar condition_type baseado nas condições selecionadas
      let conditionType = 'all'
      const hasAnyCondition = hasMinValue || hasStates || hasShippingMethods
      
      if (hasAnyCondition) {
        // Se tem múltiplas condições, usar 'all' mas com condition_value preenchido
        // Se tem apenas uma, manter compatibilidade com formato antigo
        if (hasMinValue && !hasStates && !hasShippingMethods) {
          conditionType = 'min_value'
        } else if (hasStates && !hasMinValue && !hasShippingMethods) {
          conditionType = 'states'
        } else if (hasShippingMethods && !hasMinValue && !hasStates) {
          conditionType = 'shipping_methods'
        } else {
          // Múltiplas condições - usar 'all' com condition_value completo
          conditionType = 'all'
        }
      }

      // Limpar condition_value de valores não selecionados
      const finalConditionValue: any = {}
      const conditionValue = (formData.condition_value || {}) as any
      if (hasMinValue && conditionValue.min_value !== undefined) {
        finalConditionValue.min_value = conditionValue.min_value
      }
      if (hasStates && conditionValue.states) {
        finalConditionValue.states = conditionValue.states
      }
      if (hasShippingMethods) {
        // shipping_methods pode estar em condition_value ou no campo separado
        if (conditionValue.shipping_methods) {
          finalConditionValue.shipping_methods = conditionValue.shipping_methods
        }
      }

      const ruleData = {
        ...(rule ? { id: rule.id } : {}),
        rule_type: formData.rule_type,
        condition_type: conditionType,
        condition_value: Object.keys(finalConditionValue).length > 0 ? finalConditionValue : null,
        discount_type: formData.discount_type,
        discount_value: formData.discount_value ? parseFloat(formData.discount_value) : null,
        shipping_methods: hasShippingMethods && formData.shipping_methods ? formData.shipping_methods : null,
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

  const conditionValue = (formData.condition_value || {}) as any
  const selectedStates = conditionValue.states || []

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
          {/* Mostrar seletor de tipo apenas quando não há tipo pré-definido ou quando está editando */}
          {!defaultRuleType && (
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
                  <SelectItem value="surcharge">Acréscimo</SelectItem>
                  <SelectItem value="production_days">Prazo de Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Mostrar tipo fixo quando for frete grátis pré-definido */}
          {defaultRuleType === 'free_shipping' && (
            <div className="space-y-2">
              <Label>Tipo de Regra</Label>
              <div className="p-3 bg-muted rounded-md">
                <span className="font-medium">Frete Grátis</span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Label>Condições (você pode selecionar múltiplas)</Label>
            <p className="text-xs text-muted-foreground">
              Selecione uma ou mais condições. Todas as condições selecionadas devem ser atendidas (lógica AND).
            </p>
            
            <div className="space-y-3 border rounded-md p-4">
              {/* Checkbox Valor Mínimo */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="condition_min_value"
                  checked={hasMinValue}
                  onChange={(e) => {
                    setHasMinValue(e.target.checked)
                    if (!e.target.checked) {
                      // Remover min_value do condition_value
                      const newConditionValue = { ...(formData.condition_value || {}) } as any
                      delete newConditionValue.min_value
                      setFormData({ ...formData, condition_value: newConditionValue })
                    } else {
                      // Inicializar com 0 se não existir
                      updateConditionValue('min_value', conditionValue.min_value || 0)
                    }
                  }}
                  className="rounded"
                />
                <Label htmlFor="condition_min_value" className="cursor-pointer font-normal">
                  Valor mínimo do pedido
                </Label>
              </div>
              
              {hasMinValue && (
                <div className="ml-6 space-y-2">
                  <Label htmlFor="min_value" className="text-sm">Valor Mínimo (R$)</Label>
                  <Input
                    id="min_value"
                    type="number"
                    step="0.01"
                    value={conditionValue.min_value || ''}
                    onChange={(e) => updateConditionValue('min_value', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                  />
                </div>
              )}

              {/* Checkbox Estados */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="condition_states"
                  checked={hasStates}
                  onChange={(e) => {
                    setHasStates(e.target.checked)
                    if (!e.target.checked) {
                      // Remover states do condition_value
                      const newConditionValue = { ...(formData.condition_value || {}) } as any
                      delete newConditionValue.states
                      setFormData({ ...formData, condition_value: newConditionValue })
                    } else {
                      // Inicializar com array vazio se não existir
                      if (!conditionValue.states) {
                        updateConditionValue('states', [])
                      }
                    }
                  }}
                  className="rounded"
                />
                <Label htmlFor="condition_states" className="cursor-pointer font-normal">
                  Estados específicos
                </Label>
              </div>
              
              {hasStates && (
                <div className="ml-6 space-y-2">
                  <Label className="text-sm">Estados</Label>
                  <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto border rounded-md p-2">
                    {BRAZILIAN_STATES.map((state) => (
                      <label key={state} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedStates.includes(state)}
                          onChange={(e) => {
                            const newStates = e.target.checked
                              ? [...selectedStates, state]
                              : selectedStates.filter((s: string) => s !== state)
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

              {/* Checkbox Modalidades de Frete */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="condition_shipping_methods"
                  checked={hasShippingMethods}
                  onChange={(e) => {
                    setHasShippingMethods(e.target.checked)
                    if (!e.target.checked) {
                      // Remover shipping_methods
                      const newConditionValue = { ...(formData.condition_value || {}) } as any
                      delete newConditionValue.shipping_methods
                      setFormData({ 
                        ...formData, 
                        condition_value: newConditionValue,
                        shipping_methods: null
                      })
                    }
                  }}
                  className="rounded"
                />
                <Label htmlFor="condition_shipping_methods" className="cursor-pointer font-normal">
                  Modalidades de frete específicas
                </Label>
              </div>
              
              {hasShippingMethods && (
                <div className="ml-6 space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    Nota: A seleção de modalidades específicas será implementada em uma versão futura.
                    Por enquanto, esta condição não será aplicada.
                  </Label>
                </div>
              )}
            </div>
          </div>

          {/* Mostrar campos de acréscimo apenas quando não for frete grátis */}
          {formData.rule_type === 'surcharge' && (
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
