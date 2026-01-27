"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ORDER_STATUS_CONFIG } from "@/components/orders/order-status-config"
import { cn } from "@/lib/utils"

interface OrderStatusModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: number
  currentStatus: string
  currentTracking?: string | null
  onSuccess?: () => void
}

export function OrderStatusModal({
  open,
  onOpenChange,
  orderId,
  currentStatus,
  currentTracking,
  onSuccess,
}: OrderStatusModalProps) {
  const [status, setStatus] = useState<string>(currentStatus)
  const [tracking, setTracking] = useState<string>(currentTracking || "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setError(null)

    if (status === "enviado" && !tracking.trim()) {
      setError("Informe o código ou link de rastreio para o status Enviado.")
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          shipping_tracking: tracking || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Erro ao atualizar status do pedido")
      }

      if (onSuccess) {
        onSuccess()
      }
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Erro ao atualizar status do pedido")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Alterar status do pedido #{orderId}</DialogTitle>
          <DialogDescription>
            Selecione o novo status do pedido. Para o status <strong>Enviado</strong>, é obrigatório informar o código ou link de rastreio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(ORDER_STATUS_CONFIG).map(([value, config]) => {
              const Icon = config.icon
              const selected = status === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={cn(
                    "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/60"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border",
                        config.className
                      )}
                    >
                      {Icon && <Icon className="h-3 w-3" />}
                      {config.label}
                    </Badge>
                  </div>
                </button>
              )
            })}
          </div>

          {status === "enviado" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Código ou link de rastreio
              </label>
              <Input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="Ex: PX123456789BR ou https://rastreamento.com/..."
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Salvando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

