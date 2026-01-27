"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, CreditCard, QrCode, Copy, Check, Clock, AlertCircle, CheckCircle2, XCircle, MessageCircle, Percent, Gift } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/lib/toast"

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
  
  // Estados para PIX melhorado
  const [countdown, setCountdown] = useState(600) // 10 minutos em segundos
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'failed' | 'expired'>('pending')
  const [isChecking, setIsChecking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pixTransactionId, setPixTransactionId] = useState<string | null>(null)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Estados para desconto PIX e juros
  const [pixDiscount, setPixDiscount] = useState<{ discount: number; finalValue: number } | null>(null)
  const [installmentRates, setInstallmentRates] = useState<Array<{ installments: number; rate: number; totalWithInterest: number; installmentValue: number; hasInterest: boolean }>>([])


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
  const [activeEnvironment, setActiveEnvironment] = useState<'sandbox' | 'production'>('production')

  // Carregar desconto PIX e taxas de parcelamento
  useEffect(() => {
    const loadPaymentSettings = async () => {
      try {
        // Buscar desconto PIX
        const pixResponse = await fetch('/api/settings/payment', {
          credentials: 'include',
        })
        if (pixResponse.ok) {
          const pixData = await pixResponse.json()
          const pixSetting = pixData.paymentSettings?.find(
            (s: any) => s.payment_method === 'pix' && s.setting_type === 'discount' && s.active
          )
          
          if (pixSetting && pixSetting.discount_value) {
            const discountValue = parseFloat(pixSetting.discount_value)
            let discount = 0
            if (pixSetting.discount_type === 'percentage') {
              discount = (total * discountValue) / 100
            } else {
              discount = discountValue
            }
            setPixDiscount({
              discount,
              finalValue: Math.max(0, total - discount),
            })
          }
        }

        // Buscar taxas de parcelamento
        const ratesResponse = await fetch(`/api/settings/installment-rates?environment=${activeEnvironment}`, {
          credentials: 'include',
        })
        if (ratesResponse.ok) {
          const ratesData = await ratesResponse.json()
          const rates = ratesData.rates || []
          
          const calculatedRates = Array.from({ length: 12 }, (_, i) => {
            const installments = i + 1
            const rateData = rates.find((r: any) => r.installments === installments)
            const rate = rateData ? parseFloat(rateData.rate_percentage) : 0
            const totalWithInterest = total * (1 + rate / 100)
            const installmentValue = totalWithInterest / installments
            
            return {
              installments,
              rate,
              totalWithInterest,
              installmentValue,
              hasInterest: rate > 0,
            }
          })
          
          setInstallmentRates(calculatedRates)
        }
      } catch (error) {
        console.error('Erro ao carregar configurações de pagamento:', error)
      }
    }

    loadPaymentSettings()
  }, [total, activeEnvironment])

  // Buscar ambiente ativo ao montar componente
  useEffect(() => {
    const fetchActiveEnvironment = async () => {
      try {
        const response = await fetch('/api/integrations/active-environment?provider=pagarme', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          setActiveEnvironment(data.environment || 'production')
        } else {
          // Fallback: detecção automática
          if (typeof window !== 'undefined') {
            const hostname = window.location.hostname
            if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
              setActiveEnvironment('sandbox')
            }
          }
        }
      } catch (error) {
        console.warn('[PaymentForm] Erro ao buscar ambiente ativo, usando produção:', error)
        // Fallback: detecção automática
        if (typeof window !== 'undefined') {
          const hostname = window.location.hostname
          if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
            setActiveEnvironment('sandbox')
          }
        }
      }
    }

    fetchActiveEnvironment()
  }, [])

  const isSandbox = activeEnvironment === 'sandbox'

  // Função para abrir WhatsApp
  const openWhatsApp = (message: string) => {
    const phoneNumber = "5518997264861" // (18) 99726-4861
    const encodedMessage = encodeURIComponent(message)
    const url = `https://wa.me/${phoneNumber}?text=${encodedMessage}`
    window.open(url, '_blank')
  }

  // Formatar tempo em MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // Copiar código PIX
  const handleCopyPixCode = async () => {
    if (!pixData?.pix_qr_code) return
    
    try {
      await navigator.clipboard.writeText(pixData.pix_qr_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      // Fallback para navegadores antigos
      const textArea = document.createElement('textarea')
      textArea.value = pixData.pix_qr_code
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Verificar status do pagamento via polling
  const checkPaymentStatus = useCallback(async () => {
    if (!pixTransactionId) return
    
    setIsChecking(true)
    try {
      const response = await fetch(`/api/payment/status?transaction_id=${pixTransactionId}&environment=${activeEnvironment}`)
      
      if (!response.ok) {
        // Silenciar erro, continuar polling
        return
      }
      
      const data = await response.json()
      
      if (data.success && data.status) {
        if (data.status === 'paid') {
          setPaymentStatus('paid')
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current)
            countdownIntervalRef.current = null
          }
          // Limpar localStorage
          if (typeof window !== 'undefined') {
            localStorage.removeItem(`pix_countdown_${orderId}_${pixTransactionId}`)
          }
          onSuccess(data.transaction)
        } else if (data.status === 'failed') {
          setPaymentStatus('failed')
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
        }
      }
    } catch (error) {
      // Silenciar erro, continuar polling
      if (process.env.NODE_ENV === 'development') {
        console.warn('[PaymentForm] Erro no polling:', error)
      }
    } finally {
      setIsChecking(false)
    }
  }, [pixTransactionId, orderId, onSuccess])

  // Obter public key quando o método de pagamento for cartão (opcional - pode ser buscada no momento do pagamento)
  useEffect(() => {
    if (paymentMethod !== 'credit_card' || publicKey) {
      return
    }

    const fetchPublicKey = async () => {
      try {
        const response = await fetch(`/api/pagarme/public-key?environment=${activeEnvironment}`)
        
        if (!response.ok) {
          return
        }

        const data = await response.json()
        setPublicKey(data.publicKey)
      } catch (error) {
        // Silently fail - will be fetched at payment time
      }
    }

    fetchPublicKey()
  }, [paymentMethod, publicKey])

  // Recuperar dados do PIX do localStorage ao montar componente
  useEffect(() => {
    if (typeof window === 'undefined' || pixData) return

    // Tentar encontrar qualquer QR code salvo para este pedido
    const keys = Object.keys(localStorage)
    const pixKey = keys.find(key => key.startsWith(`pix_countdown_${orderId}_`))
    
    if (pixKey) {
      try {
        const saved = localStorage.getItem(pixKey)
        if (saved) {
          const { transactionId, expiresAt, pix_qr_code, pix_expiration_date } = JSON.parse(saved)
          const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
          
          if (remaining > 0 && pix_qr_code) {
            // Recuperar transactionId e dados do PIX
            setPixTransactionId(transactionId)
            setPixData({
              id: transactionId,
              pix_qr_code,
              pix_expiration_date,
              status: 'pending',
            })
            setCountdown(remaining)
            setPaymentStatus('pending')
          } else {
            // Expirou, limpar
            localStorage.removeItem(pixKey)
            setPaymentStatus('expired')
          }
        }
      } catch (error) {
        // Se erro ao parsear, limpar
        localStorage.removeItem(pixKey)
      }
    }
  }, [orderId, pixData])

  // Recuperar cronômetro quando pixTransactionId muda
  useEffect(() => {
    if (!pixTransactionId || typeof window === 'undefined') return

    const storageKey = `pix_countdown_${orderId}_${pixTransactionId}`
    const saved = localStorage.getItem(storageKey)
    
    if (saved) {
      try {
        const { expiresAt } = JSON.parse(saved)
        const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
        setCountdown(remaining)
        
        // Se expirou, limpar e resetar
        if (remaining <= 0) {
          localStorage.removeItem(storageKey)
          setPaymentStatus('expired')
          return
        }
      } catch (error) {
        // Se erro ao parsear, resetar
        localStorage.removeItem(storageKey)
        setCountdown(600) // Resetar para 10 minutos
      }
    } else {
      // Se não há dados salvos mas temos transactionId, resetar countdown
      setCountdown(600)
    }
  }, [pixTransactionId, orderId])

  // Cronômetro regressivo
  useEffect(() => {
    if (!pixData || !pixTransactionId || countdown <= 0 || paymentStatus !== 'pending') {
      return
    }

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setPaymentStatus('expired')
          const storageKey = `pix_countdown_${orderId}_${pixTransactionId}`
          localStorage.removeItem(storageKey)
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    countdownIntervalRef.current = interval

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
    }
  }, [pixData, pixTransactionId, orderId, paymentStatus, countdown])

  // Polling de status a cada 5 segundos
  useEffect(() => {
    if (!pixTransactionId || paymentStatus !== 'pending' || countdown <= 0) {
      return
    }

    // Primeira verificação imediata
    checkPaymentStatus()

    const interval = setInterval(() => {
      checkPaymentStatus()
    }, 5000) // 5 segundos

    pollingIntervalRef.current = interval

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [pixTransactionId, paymentStatus, countdown, checkPaymentStatus])

  const handlePixPayment = async () => {
    setLoading(true)
    try {
      const customerData = {
        name: customer.name,
        email: customer.email,
        document: customer.document,
        phone: customer.phone,
      }
      
      const finalAmount = pixDiscount && pixDiscount.discount > 0 ? pixDiscount.finalValue : total

      const response = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          payment_method: 'pix',
          environment: activeEnvironment,
          customer: customerData,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
        let errorMessage = error.error || error.message || 'Erro ao processar pagamento'
        
        // Melhorar mensagens de erro específicas
        if (response.status === 400) {
          errorMessage = error.error || 'Dados inválidos. Verifique as informações do cliente e tente novamente.'
        } else if (response.status === 401) {
          errorMessage = 'Token do Pagar.me inválido. Verifique a configuração nas integrações.'
        } else if (response.status === 404) {
          errorMessage = 'Recurso não encontrado. Verifique se o pedido existe.'
        } else if (response.status === 500) {
          errorMessage = error.error || 'Erro interno do servidor. Tente novamente mais tarde.'
        }
        
        if (process.env.NODE_ENV === 'development') {
          console.error('[PaymentForm PIX] Erro na API:', {
            status: response.status,
            errorMessage,
            errorDetails: error,
          })
        }
        throw new Error(errorMessage)
      }

      const data = await response.json()

      // Validar estrutura de resposta antes de acessar pix_qr_code
      if (!data || !data.success) {
        const errorMsg = data?.error || 'Erro desconhecido ao processar pagamento PIX'
        throw new Error(errorMsg)
      }

      if (!data.transaction) {
        throw new Error('Resposta inválida do servidor: dados da transação não encontrados.')
      }

      if (!data.transaction.pix_qr_code) {
        const errorDetails = data.error || data.details || ''
        const errorMsg = errorDetails 
          ? `QR Code não foi gerado: ${errorDetails}`
          : 'QR Code não foi gerado. Verifique a configuração do Pagar.me e se o token está correto para o ambiente ' + environment + '.'
        throw new Error(errorMsg)
      }

      // Salvar dados do PIX e iniciar cronômetro
      const transactionId = data.transaction.id
      setPixTransactionId(transactionId)
      setPixData(data.transaction)
      setPaymentStatus('pending')
      setCountdown(600) // 10 minutos

      // Salvar timestamp e dados no localStorage para persistência
      if (typeof window !== 'undefined') {
        const storageKey = `pix_countdown_${orderId}_${transactionId}`
        const expiresAt = Date.now() + (10 * 60 * 1000) // 10 minutos
        localStorage.setItem(storageKey, JSON.stringify({
          timestamp: Date.now(),
          expiresAt,
          transactionId,
          pix_qr_code: data.transaction.pix_qr_code,
          pix_expiration_date: data.transaction.pix_expiration_date,
        }))
      }

      // Não chamar onSuccess imediatamente - aguardar confirmação via polling
    } catch (error: any) {
      // Melhorar tratamento de erros para o usuário
      let errorMessage = 'Erro ao processar pagamento Pix.'
      
      if (error.message) {
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.error('[PaymentForm PIX] Erro:', {
          message: errorMessage,
          error: error,
          stack: error.stack,
        })
      }
      
      // Exibir erro de forma mais amigável
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }


  const handleCreditCardPayment = async () => {
    if (!isCardFormValid) {
      return
    }

    setLoading(true)
    
    try {
      // Preparar dados do cartão para tokenização
      const cardNumber = cardData.card_number.replace(/\s/g, '')
      const [month, year] = cardData.card_expiration_date.split('/')
      const expMonth = parseInt(month)
      const expYear = parseInt('20' + year)

      // Obter public key se não tiver (fallback)
      let publicKeyToUse = publicKey
      if (!publicKeyToUse) {
        try {
          const keyResponse = await fetch(`/api/pagarme/public-key?environment=${activeEnvironment}`)
          if (keyResponse.ok) {
            const keyData = await keyResponse.json()
            publicKeyToUse = keyData.publicKey
            setPublicKey(keyData.publicKey)
          } else {
            const error = await keyResponse.json().catch(() => ({ error: 'Erro desconhecido' }))
            throw new Error(error.error || 'Public key do Pagar.me não configurada. Por favor, configure nas integrações.')
          }
        } catch (error: any) {
          throw new Error('Public key do Pagar.me não configurada. Por favor, configure nas integrações.')
        }
      }

      if (!publicKeyToUse) {
        throw new Error('Public key do Pagar.me não configurada. Por favor, configure nas integrações.')
      }

      // Tokenizar cartão usando API REST do Pagar.me diretamente
      const tokenUrl = `https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(publicKeyToUse)}`

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

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({ message: 'Erro desconhecido' }))
        throw new Error(errorData.message || errorData.error || 'Erro ao tokenizar cartão. Verifique os dados e tente novamente.')
      }

      const tokenData = await tokenResponse.json()

      if (!tokenData || !tokenData.id) {
        throw new Error('Falha ao tokenizar cartão. Token não foi gerado. Verifique os dados e tente novamente.')
      }

      const cardToken = tokenData.id

      const customerData = {
        name: customer.name,
        email: customer.email,
        document: customer.document,
        phone: customer.phone,
      }

      const selectedRate = installmentRates.find(r => r.installments === cardData.installments)
      const finalAmount = selectedRate && selectedRate.hasInterest ? selectedRate.totalWithInterest : total

      const response = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          payment_method: 'credit_card',
          environment: activeEnvironment,
          customer: customerData,
          credit_card: {
            card_token: cardToken,
            installments: cardData.installments,
          },
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
        if (process.env.NODE_ENV === 'development') {
          console.error('[PaymentForm Credit Card] Erro no backend:', error)
        }
        throw new Error(error.error || 'Erro ao processar pagamento')
      }

      const data = await response.json()
      onSuccess(data.transaction)
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[PaymentForm Credit Card] Erro:', error.message)
      }
      toast.error(error.message || 'Erro ao processar pagamento com cartão')
    } finally {
      setLoading(false)
    }
  }

  // Renderizar QR code ou status final do pagamento
  if (pixData && (pixData.pix_qr_code || paymentStatus === 'paid' || paymentStatus === 'failed' || paymentStatus === 'expired')) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4 text-center">
            {/* Ícone baseado no status */}
            {paymentStatus === 'paid' ? (
              <CheckCircle2 className="h-16 w-16 mx-auto text-green-600" />
            ) : paymentStatus === 'failed' ? (
              <XCircle className="h-16 w-16 mx-auto text-destructive" />
            ) : paymentStatus === 'expired' ? (
              <AlertCircle className="h-16 w-16 mx-auto text-destructive" />
            ) : (
              <QrCode className="h-16 w-16 mx-auto text-primary" />
            )}

            {/* Título baseado no status */}
            {paymentStatus === 'paid' ? (
              <h2 className="text-2xl font-bold text-green-600 mb-2">Pagamento Confirmado!</h2>
            ) : paymentStatus === 'failed' ? (
              <h2 className="text-2xl font-bold text-destructive mb-2">Pagamento Recusado</h2>
            ) : paymentStatus === 'expired' ? (
              <h2 className="text-2xl font-bold text-destructive mb-2">QR Code Expirado</h2>
            ) : (
              <p className="font-medium mb-2 text-lg">Escaneie o QR Code para pagar</p>
            )}

            {/* QR Code ou Placeholder */}
            {paymentStatus === 'pending' && (
              <div className="bg-white p-4 rounded border inline-block">
                {isSandbox ? (
                  <div className="w-48 h-48 flex items-center justify-center border-2 border-dashed border-muted-foreground/30">
                    <p className="text-sm text-muted-foreground px-4 text-center">
                      O QRCODE apareceria aqui
                    </p>
                  </div>
                ) : (
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixData.pix_qr_code)}`}
                    alt="QR Code Pix"
                    className="w-48 h-48"
                  />
                )}
              </div>
            )}

            {/* Cronômetro */}
            {paymentStatus === 'pending' && countdown > 0 && (
              <div className="flex items-center justify-center gap-2 text-lg font-semibold">
                <Clock className="h-5 w-5 text-primary" />
                <span>Tempo restante: {formatTime(countdown)}</span>
              </div>
            )}

            {/* Status de expiração */}
            {paymentStatus === 'expired' && (
              <p className="text-muted-foreground">
                O QR Code expirou. Por favor, gere um novo código para continuar o pagamento.
              </p>
            )}

            {/* Código PIX copiável */}
            {paymentStatus === 'pending' && (
              <>
                <p className="text-sm text-muted-foreground mt-4">
                  Ou copie o código Pix:
                </p>
                <div className="bg-muted p-3 rounded-lg flex items-center gap-2 max-w-full">
                  <div className="flex-1 text-sm font-mono break-all text-left">
                    {pixData.pix_qr_code}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyPixCode}
                    className="shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copiar
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}

            {/* Feedback de status */}
            {paymentStatus === 'pending' && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                {isChecking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verificando pagamento...</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4" />
                    <span>Aguardando pagamento...</span>
                  </>
                )}
              </div>
            )}

            {paymentStatus === 'paid' && (
              <p className="text-muted-foreground">
                Sua transação foi processada com sucesso. Você receberá uma confirmação por e-mail em breve.
              </p>
            )}

            {paymentStatus === 'failed' && (
              <>
                <p className="text-muted-foreground mb-4">
                  Não foi possível processar seu pagamento. Por favor, tente novamente ou entre em contato conosco.
                </p>
                <Button
                  onClick={() => openWhatsApp("Olá, preciso de ajuda com o pagamento do pedido.")}
                  variant="default"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Fale Conosco
                </Button>
              </>
            )}

            {paymentStatus === 'expired' && (
              <p className="text-xs text-muted-foreground mt-2">
                O QR Code PIX expira após 10 minutos. Gere um novo código para continuar.
              </p>
            )}
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
                  <div className="flex items-center gap-2">
                    <p className="font-medium">Pix</p>
                    {pixDiscount && pixDiscount.discount > 0 && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <Gift className="h-3 w-3 mr-1" />
                        Desconto {formatCurrency(pixDiscount.discount)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">Pagamento instantâneo</p>
                </div>
              </div>
              <div className="text-right">
                {pixDiscount && pixDiscount.discount > 0 ? (
                  <div>
                    <p className="text-sm text-muted-foreground line-through">{formatCurrency(total)}</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(pixDiscount.finalValue)}</p>
                  </div>
                ) : (
                  <p className="text-lg font-bold">{formatCurrency(total)}</p>
                )}
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
              <div className="flex items-center justify-center gap-2 mb-2">
                <p className="font-medium">Pagamento via Pix</p>
                {pixDiscount && pixDiscount.discount > 0 && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <Gift className="h-3 w-3 mr-1" />
                    Desconto {formatCurrency(pixDiscount.discount)}
                  </Badge>
                )}
              </div>
              {pixDiscount && pixDiscount.discount > 0 ? (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground line-through">
                    Total: {formatCurrency(total)}
                  </p>
                  <p className="text-lg font-bold text-green-600">
                    Total com desconto: {formatCurrency(pixDiscount.finalValue)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Total: {formatCurrency(total)}
                </p>
              )}
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
              {installmentRates.map((rate) => (
                <option key={rate.installments} value={rate.installments}>
                  {rate.installments}x {formatCurrency(rate.installmentValue)}
                  {rate.hasInterest && ` (Total: ${formatCurrency(rate.totalWithInterest)})`}
                  {!rate.hasInterest && ' - Sem juros'}
                </option>
              ))}
            </select>
            {installmentRates.length > 0 && (
              <div className="mt-2">
                {(() => {
                  const selectedRate = installmentRates.find(r => r.installments === cardData.installments)
                  if (!selectedRate) return null
                  
                  if (selectedRate.hasInterest) {
                    return (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center justify-between text-sm">
                          <span>Valor original:</span>
                          <span>{formatCurrency(total)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-orange-600">
                          <span>Juros ({selectedRate.rate.toFixed(2)}%):</span>
                          <span>+{formatCurrency(selectedRate.totalWithInterest - total)}</span>
                        </div>
                        <div className="flex items-center justify-between font-bold border-t pt-1 mt-1">
                          <span>Total com juros:</span>
                          <span>{formatCurrency(selectedRate.totalWithInterest)}</span>
                        </div>
                      </div>
                    )
                  } else {
                    return (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <Check className="h-3 w-3 mr-1" />
                        Sem juros
                      </Badge>
                    )
                  }
                })()}
              </div>
            )}
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
                  {(() => {
                    const selectedRate = installmentRates.find(r => r.installments === cardData.installments)
                    const finalAmount = selectedRate && selectedRate.hasInterest ? selectedRate.totalWithInterest : total
                    return `Pagar ${formatCurrency(finalAmount)}`
                  })()}
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
