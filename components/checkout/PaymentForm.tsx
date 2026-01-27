"use client"

import { useState, useEffect } from "react"
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
  const [isCardFormValid, setIsCardFormValid] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({
    card_number: '',
    card_holder_name: '',
    card_expiration_date: '',
    card_cvv: '',
  })
  const [publicKey, setPublicKey] = useState<string | null>(null)

  // Log do customer recebido como prop
  useEffect(() => {
    console.log('[PaymentForm] Customer recebido como prop:', {
      orderId,
      customer: {
        name: customer.name,
        email: customer.email,
        hasDocument: !!customer.document,
        documentPreview: customer.document ? `${customer.document.substring(0, 3)}***` : 'N/A',
        phone: customer.phone || 'N/A',
        hasPhone: !!customer.phone,
        phoneLength: customer.phone?.length || 0,
      },
    })
  }, [orderId, customer])

  // Validar formulário de cartão em tempo real
  useEffect(() => {
    const cardNumber = cardData.card_number.replace(/\s/g, '')
    const isValidCardNumber = cardNumber.length >= 13 && cardNumber.length <= 19
    const isValidHolderName = cardData.card_holder_name.trim().length >= 3
    const isValidExpiration = /^\d{2}\/\d{2}$/.test(cardData.card_expiration_date)
    const isValidCvv = /^\d{3,4}$/.test(cardData.card_cvv)

    // Validar número do cartão
    let cardNumberError = ''
    if (cardData.card_number && !isValidCardNumber) {
      cardNumberError = cardNumber.length < 13 ? 'Número do cartão deve ter pelo menos 13 dígitos' : 'Número do cartão inválido'
    }

    // Validar nome
    let holderNameError = ''
    if (cardData.card_holder_name && !isValidHolderName) {
      holderNameError = 'Nome deve ter pelo menos 3 caracteres'
    }

    // Validar validade
    let expirationError = ''
    if (cardData.card_expiration_date && !isValidExpiration) {
      expirationError = 'Formato inválido. Use MM/AA'
    } else if (cardData.card_expiration_date && isValidExpiration) {
      const [month, year] = cardData.card_expiration_date.split('/')
      const monthNum = parseInt(month)
      const yearNum = parseInt('20' + year)
      const now = new Date()
      const expirationDate = new Date(yearNum, monthNum - 1)
      if (monthNum < 1 || monthNum > 12) {
        expirationError = 'Mês inválido'
      } else if (expirationDate < now) {
        expirationError = 'Cartão expirado'
      }
    }

    // Validar CVV
    let cvvError = ''
    if (cardData.card_cvv && !isValidCvv) {
      cvvError = 'CVV deve ter 3 ou 4 dígitos'
    }

    setFieldErrors({
      card_number: cardNumberError,
      card_holder_name: holderNameError,
      card_expiration_date: expirationError,
      card_cvv: cvvError,
    })

    setIsCardFormValid(
      isValidCardNumber &&
      isValidHolderName &&
      isValidExpiration &&
      isValidCvv &&
      !cardNumberError &&
      !holderNameError &&
      !expirationError &&
      !cvvError
    )
  }, [cardData])

  // Detectar ambiente: localhost = sandbox, produção = production
  const detectEnvironment = (): 'sandbox' | 'production' => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
        return 'sandbox'
      }
    }
    return 'production'
  }

  // Obter public key quando o método de pagamento for cartão (opcional - pode ser buscada no momento do pagamento)
  useEffect(() => {
    if (paymentMethod !== 'credit_card' || publicKey) {
      return
    }

    const fetchPublicKey = async () => {
      try {
        const environment = detectEnvironment()
        console.log('[PaymentForm] Buscando public key para ambiente:', environment)
        const response = await fetch(`/api/pagarme/public-key?environment=${environment}`)
        
        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
          console.warn('[PaymentForm] Erro ao obter public key (será buscada no momento do pagamento):', error)
          return
        }

        const data = await response.json()
        const maskedKey = data.publicKey ? `${data.publicKey.substring(0, 8)}...` : 'não encontrada'
        console.log('[PaymentForm] Public key obtida:', { 
          hasKey: !!data.publicKey, 
          keyPreview: maskedKey,
          environment: data.environment 
        })
        setPublicKey(data.publicKey)
      } catch (error) {
        console.warn('[PaymentForm] Erro ao buscar public key (será buscada no momento do pagamento):', error)
      }
    }

    fetchPublicKey()
  }, [paymentMethod, publicKey])

  const handlePixPayment = async () => {
    setLoading(true)
    const environment = detectEnvironment() // Mover para fora do try para estar disponível no catch
    try {
      // Log do customer sendo enviado para API (PIX)
      const customerData = {
        name: customer.name,
        email: customer.email,
        document: customer.document,
        phone: customer.phone,
      }
      console.log('[PaymentForm PIX] Enviando customer para API:', {
        orderId,
        environment,
        customer: {
          name: customerData.name,
          email: customerData.email,
          hasDocument: !!customerData.document,
          documentPreview: customerData.document ? `${customerData.document.substring(0, 3)}***` : 'N/A',
          phone: customerData.phone || 'N/A',
          hasPhone: !!customerData.phone,
          phoneLength: customerData.phone?.length || 0,
        },
      })
      
      const response = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          payment_method: 'pix',
          environment,
          customer: customerData,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
        const errorMessage = error.error || error.message || 'Erro ao processar pagamento'
        console.error('[PaymentForm PIX] Erro na API:', {
          status: response.status,
          statusText: response.statusText,
          error,
          environment,
        })
        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log('[PaymentForm PIX] Resposta recebida:', {
        hasTransaction: !!data.transaction,
        transactionId: data.transaction?.id,
        status: data.transaction?.status,
        hasPixQrCode: !!data.transaction?.pix_qr_code,
      })

      if (!data.transaction || !data.transaction.pix_qr_code) {
        console.error('[PaymentForm PIX] QR Code não encontrado na resposta:', data)
        throw new Error('QR Code não foi gerado. Verifique a configuração do Pagar.me e se o token está correto para o ambiente ' + environment + '.')
      }
      setPixData(data.transaction)
      onSuccess(data.transaction)
    } catch (error: any) {
      console.error('[PaymentForm PIX] Erro completo:', {
        message: error.message,
        stack: error.stack,
        environment,
      })
      const userMessage = error.message || 'Erro ao processar pagamento Pix. Verifique o console para mais detalhes.'
      alert(userMessage)
    } finally {
      setLoading(false)
    }
  }

  // Função auxiliar para mascarar dados sensíveis nos logs
  const maskSensitiveData = (value: string, showLast: number = 4): string => {
    if (!value || value.length <= showLast) return '***'
    return `${'*'.repeat(value.length - showLast)}${value.substring(value.length - showLast)}`
  }

  const handleCreditCardPayment = async () => {
    if (!isCardFormValid) {
      console.log('[PaymentForm Credit Card] Formulário inválido, abortando')
      return
    }

    console.log('[PaymentForm Credit Card] Iniciando processo de tokenização')
    setLoading(true)
    
    try {
      const environment = detectEnvironment()
      console.log('[PaymentForm Credit Card] Ambiente detectado:', environment)

      // Preparar dados do cartão para tokenização
      const cardNumber = cardData.card_number.replace(/\s/g, '')
      const [month, year] = cardData.card_expiration_date.split('/')
      const expMonth = parseInt(month)
      const expYear = parseInt('20' + year)

      console.log('[PaymentForm Credit Card] Dados do cartão preparados:', {
        cardNumberMasked: maskSensitiveData(cardNumber, 4),
        holderName: cardData.card_holder_name,
        expMonth,
        expYear,
        cvvMasked: maskSensitiveData(cardData.card_cvv, 0),
        installments: cardData.installments,
      })

      // Obter public key se não tiver (fallback)
      let publicKeyToUse = publicKey
      if (!publicKeyToUse) {
        console.log('[PaymentForm Credit Card] Public key não encontrada no estado, buscando...')
        try {
          const keyResponse = await fetch(`/api/pagarme/public-key?environment=${environment}`)
          if (keyResponse.ok) {
            const keyData = await keyResponse.json()
            publicKeyToUse = keyData.publicKey
            setPublicKey(keyData.publicKey)
            console.log('[PaymentForm Credit Card] Public key obtida:', {
              hasKey: !!publicKeyToUse,
              keyPreview: publicKeyToUse ? maskSensitiveData(publicKeyToUse, 8) : 'não encontrada',
            })
          } else {
            const error = await keyResponse.json().catch(() => ({ error: 'Erro desconhecido' }))
            console.error('[PaymentForm Credit Card] Erro ao buscar public key:', error)
            throw new Error(error.error || 'Public key do Pagar.me não configurada. Por favor, configure nas integrações.')
          }
        } catch (error: any) {
          console.error('[PaymentForm Credit Card] Erro ao buscar public key:', error)
          throw new Error('Public key do Pagar.me não configurada. Por favor, configure nas integrações.')
        }
      } else {
        console.log('[PaymentForm Credit Card] Public key já disponível:', {
          keyPreview: maskSensitiveData(publicKeyToUse, 8),
        })
      }

      if (!publicKeyToUse) {
        throw new Error('Public key do Pagar.me não configurada. Por favor, configure nas integrações.')
      }

      // Tokenizar cartão usando API REST do Pagar.me diretamente
      const tokenUrl = `https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(publicKeyToUse)}`
      console.log('[PaymentForm Credit Card] Enviando requisição de tokenização:', {
        url: 'https://api.pagar.me/core/v5/tokens',
        hasAppId: true,
        appIdPreview: maskSensitiveData(publicKeyToUse, 8),
      })

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'card',
          card: {
            number: cardNumber,
            holder_name: cardData.card_holder_name,
            exp_month: expMonth,
            exp_year: expYear,
            cvv: cardData.card_cvv,
          },
        }),
      })

      console.log('[PaymentForm Credit Card] Resposta da API de tokenização recebida:', {
        status: tokenResponse.status,
        ok: tokenResponse.ok,
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({ message: 'Erro desconhecido' }))
        console.error('[PaymentForm Credit Card] Erro na tokenização:', {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: errorData,
        })
        throw new Error(errorData.message || errorData.error || 'Erro ao tokenizar cartão. Verifique os dados e tente novamente.')
      }

      const tokenData = await tokenResponse.json()
      console.log('[PaymentForm Credit Card] Token recebido:', {
        hasToken: !!tokenData.id,
        tokenPreview: tokenData.id ? maskSensitiveData(tokenData.id, 8) : 'não encontrado',
        tokenType: tokenData.type,
      })

      if (!tokenData || !tokenData.id) {
        console.error('[PaymentForm Credit Card] Token não encontrado na resposta:', tokenData)
        throw new Error('Falha ao tokenizar cartão. Token não foi gerado. Verifique os dados e tente novamente.')
      }

      const cardToken = tokenData.id

      // Log do customer sendo enviado para API (Cartão)
      const customerData = {
        name: customer.name,
        email: customer.email,
        document: customer.document,
        phone: customer.phone,
      }
      console.log('[PaymentForm Credit Card] Enviando customer para API:', {
        orderId,
        environment,
        customer: {
          name: customerData.name,
          email: customerData.email,
          hasDocument: !!customerData.document,
          documentPreview: customerData.document ? `${customerData.document.substring(0, 3)}***` : 'N/A',
          phone: customerData.phone || 'N/A',
          hasPhone: !!customerData.phone,
          phoneLength: customerData.phone?.length || 0,
        },
      })

      // Enviar token ao backend
      console.log('[PaymentForm Credit Card] Enviando token ao backend:', {
        orderId,
        hasToken: !!cardToken,
        tokenPreview: maskSensitiveData(cardToken, 8),
        installments: cardData.installments,
      })

      const response = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          payment_method: 'credit_card',
          environment,
          customer: customerData,
          credit_card: {
            card_token: cardToken,
            installments: cardData.installments,
          },
        }),
      })

      console.log('[PaymentForm Credit Card] Resposta do backend recebida:', {
        status: response.status,
        ok: response.ok,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
        console.error('[PaymentForm Credit Card] Erro no backend:', {
          status: response.status,
          error,
        })
        throw new Error(error.error || 'Erro ao processar pagamento')
      }

      const data = await response.json()
      console.log('[PaymentForm Credit Card] Pagamento processado com sucesso:', {
        hasTransaction: !!data.transaction,
        transactionId: data.transaction?.id,
        status: data.transaction?.status,
      })

      onSuccess(data.transaction)
    } catch (error: any) {
      console.error('[PaymentForm Credit Card] Erro completo:', {
        message: error.message,
        stack: error.stack,
      })
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
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setPaymentMethod(null)
                  setPixData(null)
                }}
              >
                Voltar
              </Button>
              <Button
                className="flex-1"
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
            </div>
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
              onChange={(e) => {
                let value = e.target.value.replace(/\D/g, '')
                // Adicionar espaços a cada 4 dígitos
                value = value.replace(/(\d{4})(?=\d)/g, '$1 ')
                setCardData({ ...cardData, card_number: value })
              }}
              maxLength={19}
              className={fieldErrors.card_number ? 'border-destructive' : ''}
            />
            {fieldErrors.card_number && (
              <p className="text-sm text-destructive">{fieldErrors.card_number}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="card_holder_name">Nome no Cartão</Label>
            <Input
              id="card_holder_name"
              placeholder="NOME COMPLETO"
              value={cardData.card_holder_name}
              onChange={(e) =>
                setCardData({ ...cardData, card_holder_name: e.target.value.toUpperCase() })
              }
              className={fieldErrors.card_holder_name ? 'border-destructive' : ''}
            />
            {fieldErrors.card_holder_name && (
              <p className="text-sm text-destructive">{fieldErrors.card_holder_name}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="card_expiration_date">Validade</Label>
              <Input
                id="card_expiration_date"
                placeholder="MM/AA"
                value={cardData.card_expiration_date}
                onChange={(e) => {
                  let value = e.target.value.replace(/\D/g, '')
                  if (value.length >= 2) {
                    value = value.substring(0, 2) + '/' + value.substring(2, 4)
                  }
                  setCardData({ ...cardData, card_expiration_date: value })
                }}
                maxLength={5}
                className={fieldErrors.card_expiration_date ? 'border-destructive' : ''}
              />
              {fieldErrors.card_expiration_date && (
                <p className="text-sm text-destructive">{fieldErrors.card_expiration_date}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="card_cvv">CVV</Label>
              <Input
                id="card_cvv"
                placeholder="123"
                type="password"
                value={cardData.card_cvv}
                onChange={(e) =>
                  setCardData({ ...cardData, card_cvv: e.target.value.replace(/\D/g, '') })
                }
                maxLength={4}
                className={fieldErrors.card_cvv ? 'border-destructive' : ''}
              />
              {fieldErrors.card_cvv && (
                <p className="text-sm text-destructive">{fieldErrors.card_cvv}</p>
              )}
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

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
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
            <Button
              className="flex-1"
              size="lg"
              onClick={handleCreditCardPayment}
              disabled={loading || !isCardFormValid}
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
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
