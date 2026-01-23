"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, CreditCard, QrCode } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

interface PaymentFormProps {
  orderId: number
  total: number
  customer: {
    name: string
    email: string
    document: string
    phone: string
  }
  onSuccess: (transaction: any) => void
}

export function PaymentForm({ orderId, total, customer, onSuccess }: PaymentFormProps) {
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit_card' | null>(null)
  const [loading, setLoading] = useState(false)
  const [pixData, setPixData] = useState<any>(null)
  const [cardData, setCardData] = useState({
    card_number: '',
    card_holder_name: '',
    card_expiration_date: '',
    card_cvv: '',
    installments: 1,
  })

  const handlePixPayment = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          payment_method: 'pix',
          customer: {
            name: customer.name,
            email: customer.email,
            document: customer.document,
            phone: customer.phone,
          },
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao processar pagamento')
      }

      const data = await response.json()
      setPixData(data.transaction)
      onSuccess(data.transaction)
    } catch (error: any) {
      alert(error.message || 'Erro ao processar pagamento Pix')
    } finally {
      setLoading(false)
    }
  }

  const handleCreditCardPayment = async () => {
    if (!cardData.card_number || !cardData.card_holder_name || !cardData.card_expiration_date || !cardData.card_cvv) {
      alert('Preencha todos os dados do cartão')
      return
    }

    setLoading(true)
    try {
      // Nota: Em produção, os dados do cartão devem ser tokenizados no frontend
      // usando a biblioteca do Pagar.me antes de enviar ao backend
      alert('Integração de cartão requer tokenização. Implementação completa requer biblioteca Pagar.me JS.')
      
      // Por enquanto, apenas simular
      const response = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          payment_method: 'credit_card',
          customer: {
            name: customer.name,
            email: customer.email,
            document: customer.document,
            phone: customer.phone,
          },
          credit_card: {
            installments: cardData.installments,
            // Em produção, usar card_token ao invés de dados do cartão
          },
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao processar pagamento')
      }

      const data = await response.json()
      onSuccess(data.transaction)
    } catch (error: any) {
      alert(error.message || 'Erro ao processar pagamento com cartão')
    } finally {
      setLoading(false)
    }
  }

  if (pixData && pixData.pix_qr_code) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4 text-center">
            <QrCode className="h-16 w-16 mx-auto text-primary" />
            <div>
              <p className="font-medium mb-2">Escaneie o QR Code para pagar</p>
              <div className="bg-white p-4 rounded border inline-block">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixData.pix_qr_code)}`}
                  alt="QR Code Pix"
                  className="w-48 h-48"
                />
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Ou copie o código Pix:
              </p>
              <div className="bg-muted p-3 rounded text-sm font-mono break-all">
                {pixData.pix_qr_code}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                O pedido será processado automaticamente após a confirmação do pagamento
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!paymentMethod) {
    return (
      <div className="space-y-4">
        <Card className="cursor-pointer hover:border-primary" onClick={() => setPaymentMethod('pix')}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <QrCode className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-medium">Pix</p>
                  <p className="text-sm text-muted-foreground">Pagamento instantâneo</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">{formatCurrency(total)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary" onClick={() => setPaymentMethod('credit_card')}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <CreditCard className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-medium">Cartão de Crédito</p>
                  <p className="text-sm text-muted-foreground">Parcelamento disponível</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">{formatCurrency(total)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (paymentMethod === 'pix') {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="text-center">
              <p className="font-medium mb-2">Pagamento via Pix</p>
              <p className="text-sm text-muted-foreground">
                Total: {formatCurrency(total)}
              </p>
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={handlePixPayment}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <QrCode className="mr-2 h-4 w-4" />
                  Gerar QR Code Pix
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setPaymentMethod(null)
                setPixData(null)
              }}
            >
              Voltar
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="text-center">
            <p className="font-medium mb-2">Pagamento via Cartão</p>
            <p className="text-sm text-muted-foreground">
              Total: {formatCurrency(total)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="card_number">Número do Cartão</Label>
            <Input
              id="card_number"
              placeholder="0000 0000 0000 0000"
              value={cardData.card_number}
              onChange={(e) =>
                setCardData({ ...cardData, card_number: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="card_holder_name">Nome no Cartão</Label>
            <Input
              id="card_holder_name"
              placeholder="NOME COMPLETO"
              value={cardData.card_holder_name}
              onChange={(e) =>
                setCardData({ ...cardData, card_holder_name: e.target.value })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="card_expiration_date">Validade</Label>
              <Input
                id="card_expiration_date"
                placeholder="MM/AA"
                value={cardData.card_expiration_date}
                onChange={(e) =>
                  setCardData({ ...cardData, card_expiration_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card_cvv">CVV</Label>
              <Input
                id="card_cvv"
                placeholder="123"
                type="password"
                value={cardData.card_cvv}
                onChange={(e) =>
                  setCardData({ ...cardData, card_cvv: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="installments">Parcelas</Label>
            <select
              id="installments"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={cardData.installments}
              onChange={(e) =>
                setCardData({ ...cardData, installments: parseInt(e.target.value) })
              }
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                <option key={num} value={num}>
                  {num}x {formatCurrency(total / num)}
                </option>
              ))}
            </select>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleCreditCardPayment}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Pagar {formatCurrency(total)}
              </>
            )}
          </Button>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setPaymentMethod(null)
              setCardData({
                card_number: '',
                card_holder_name: '',
                card_expiration_date: '',
                card_cvv: '',
                installments: 1,
              })
            }}
          >
            Voltar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
