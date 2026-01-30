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
import { Input } from "@/components/ui/input"
import { Copy, Check, Loader2, RefreshCw, AlertCircle } from "lucide-react"
import { formatDateTime } from "@/lib/utils"

interface PaymentLinkModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: number
  existingLink?: string | null
  expiresAt?: string | null
  onGenerateNew?: () => void
}

export function PaymentLinkModal({
  open,
  onOpenChange,
  orderId,
  existingLink,
  expiresAt,
  onGenerateNew,
}: PaymentLinkModalProps) {
  const [link, setLink] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      const initial = existingLink ?? null
      setLink(initial && !String(initial).includes('undefined') ? initial : null)
    }
  }, [open, existingLink])

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/orders/${orderId}/generate-payment-link`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Erro ao gerar link')
      }

      const data = await response.json()
      setLink(data.payment_link)
      
      if (onGenerateNew) {
        onGenerateNew()
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar link de pagamento')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!link) return

    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Erro ao copiar:', err)
      }
    }
  }

  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Link de Pagamento</DialogTitle>
          <DialogDescription>
            Compartilhe este link com o cliente para que ele possa realizar o pagamento do pedido #{orderId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {link ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Link de Pagamento</label>
                <div className="flex gap-2">
                  <Input
                    value={link}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    onClick={handleCopy}
                    variant="outline"
                    size="icon"
                    disabled={!link}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {expiresAt && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">Expira em:</span> {formatDateTime(expiresAt)}
                  </p>
                  {isExpired && (
                    <p className="text-sm text-destructive">
                      Este link expirou. Gere um novo link.
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleGenerate}
                  disabled={loading}
                  variant="outline"
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Gerar Novo Link
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-4">
                Nenhum link de pagamento foi gerado ainda.
              </p>
              <Button
                onClick={handleGenerate}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Gerar Link de Pagamento
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
