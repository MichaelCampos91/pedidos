"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, Edit2, Save, X } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/lib/toast"
import type { IntegrationEnvironment } from "@/lib/integrations-types"

interface InstallmentRate {
  id: number
  installments: number
  rate_percentage: number
  source: 'manual' | 'pagarme'
  environment: IntegrationEnvironment | null
}

interface InstallmentRatesTableProps {
  rates: InstallmentRate[]
  environment: IntegrationEnvironment
  onSave: (rates: InstallmentRate[]) => Promise<void>
  onImport?: () => Promise<void>
}

export function InstallmentRatesTable({
  rates,
  environment,
  onSave,
  onImport,
}: InstallmentRatesTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)

  // Função helper para garantir que rate_percentage seja sempre um número
  const ensureNumber = (value: any): number => {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const parsed = parseFloat(value)
      return isNaN(parsed) ? 0 : parsed
    }
    return 0
  }

  const handleEdit = (rate: InstallmentRate) => {
    setEditingId(rate.id)
    const ratePercentage = ensureNumber(rate.rate_percentage)
    setEditValue(ratePercentage.toString())
  }

  const handleSave = async (rateId: number) => {
    setLoading(true)
    try {
      const newRate = parseFloat(editValue)
      if (isNaN(newRate) || newRate < 0) {
        toast.error('Valor inválido. Digite um número maior ou igual a zero.')
        setLoading(false)
        return
      }

      const updatedRates = rates.map((r) =>
        r.id === rateId
          ? { ...r, rate_percentage: newRate, source: 'manual' as const }
          : r
      )

      await onSave(updatedRates)
      setEditingId(null)
    } catch (error) {
      console.error('Erro ao salvar taxa:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditValue('')
  }

  const handleImport = async () => {
    if (!onImport) return
    setImporting(true)
    try {
      await onImport()
    } catch (error) {
      console.error('Erro ao importar taxas:', error)
    } finally {
      setImporting(false)
    }
  }

  // Calcular preview para um valor de exemplo (R$ 1000)
  const exampleValue = 1000

  return (
    <div className="space-y-4">
      {onImport && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importando...
              </>
            ) : (
              'Importar do Pagar.me'
            )}
          </Button>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Parcelas</TableHead>
              <TableHead>Taxa (%)</TableHead>
              <TableHead>Valor Total</TableHead>
              <TableHead>Valor da Parcela</TableHead>
              <TableHead>Fonte</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.map((rate) => {
              // Garantir que rate_percentage seja sempre um número
              const ratePercentage = ensureNumber(rate.rate_percentage)
              const installments = ensureNumber(rate.installments)
              
              const totalWithInterest = exampleValue * (1 + ratePercentage / 100)
              const installmentValue = totalWithInterest / installments
              const isEditing = editingId === rate.id

              return (
                <TableRow key={rate.id}>
                  <TableCell className="font-medium">
                    {installments}x
                    {ratePercentage === 0 && (
                      <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200">
                        Sem juros
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-24"
                      />
                    ) : (
                      ratePercentage.toFixed(2)
                    )}
                  </TableCell>
                  <TableCell>{formatCurrency(totalWithInterest)}</TableCell>
                  <TableCell>{formatCurrency(installmentValue)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {rate.source === 'manual' ? 'Manual' : 'Pagar.me'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancel}
                          disabled={loading}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSave(rate.id)}
                          disabled={loading}
                        >
                          {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(rate)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        * Valores calculados com base em um pedido de exemplo de R$ {formatCurrency(exampleValue)}
      </p>
    </div>
  )
}
