"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertCircle, Loader2, XCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/lib/toast"

interface CancelOrderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: number | null
  onSuccess?: () => void
}

export function CancelOrderModal({
  open,
  onOpenChange,
  orderId,
  onSuccess,
}: CancelOrderModalProps) {
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [orderData, setOrderData] = useState<{
    id: number
    client_name: string
    total: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && orderId) {
      loadOrderData()
    } else {
      setOrderData(null)
      setError(null)
    }
  }, [open, orderId])

  const loadOrderData = async () => {
    if (!orderId) return

    try {
      setLoadingData(true)
      const response = await fetch(`/api/orders/${orderId}`, {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Erro ao carregar dados do pedido")
      }

      const data = await response.json()
      setOrderData({
        id: data.id,
        client_name: data.client_name,
        total: parseFloat(data.total || 0),
      })
    } catch (err: any) {
      setError(err.message || "Erro ao carregar dados do pedido")
    } finally {
      setLoadingData(false)
    }
  }

  const handleConfirm = async () => {
    if (!orderId) return

    setError(null)
    setLoading(true)

    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        credentials: "include",
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Erro ao cancelar pedido")
      }

      toast.success("Pedido cancelado com sucesso.")
      
      if (onSuccess) {
        onSuccess()
      }
      
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Erro ao cancelar pedido")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            Cancelar Pedido
          </DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. O status de envio e pagamento serão alterados para "Cancelado".
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error && !orderData ? (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        ) : orderData ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-md border border-destructive/20">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-sm">
                  Atenção: Esta ação é irreversível
                </p>
                <p className="text-xs mt-1">
                  Ao confirmar, o pedido será cancelado e não poderá ser revertido.
                </p>
              </div>
            </div>

            <div className="space-y-3 p-4 bg-muted/50 rounded-md">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Pedido:</span>
                <span className="font-medium">#{orderData.id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Cliente:</span>
                <span className="font-medium">{orderData.client_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Valor Total:</span>
                <span className="font-medium">{formatCurrency(orderData.total)}</span>
              </div>
            </div>

            <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-sm font-medium text-amber-900">
                Impactos do cancelamento:
              </p>
              <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
                <li>Status de envio será alterado para "Cancelados"</li>
                <li>Status de pagamento será alterado para "Cancelado"</li>
                <li>Uma observação será adicionada ao pedido com a data do cancelamento</li>
              </ul>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Não, manter pedido
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading || loadingData || !orderData}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cancelando...
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 mr-2" />
                Sim, cancelar pedido
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
