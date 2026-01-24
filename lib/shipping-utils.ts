// Funções utilitárias para cálculo de frete e compartilhamento

/**
 * Calcula data estimada de entrega somando dias úteis
 * Exclui sábados e domingos do cálculo
 */
export function calculateDeliveryDate(
  businessDays: number,
  startDate?: Date
): Date {
  const start = startDate || new Date()
  const result = new Date(start)
  let daysToAdd = businessDays

  // Começar do próximo dia útil se hoje for sábado ou domingo
  while (result.getDay() === 0 || result.getDay() === 6) {
    result.setDate(result.getDate() + 1)
  }

  // Adicionar dias úteis
  while (daysToAdd > 0) {
    result.setDate(result.getDate() + 1)
    const dayOfWeek = result.getDay() // 0 = domingo, 6 = sábado
    
    // Contar apenas dias úteis (segunda a sexta)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysToAdd--
    }
  }

  return result
}

/**
 * Formata data para exibição em português
 */
export function formatDeliveryDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Gera link do WhatsApp com texto formatado das opções de frete
 */
export interface ShippingOptionForShare {
  name: string
  company: {
    name: string
  }
  price: string
  delivery_time: number
  delivery_range?: {
    min: number
    max: number
  }
}

export function generateWhatsAppShareLink(
  options: ShippingOptionForShare[],
  cepDestino: string
): string {
  let message = '*Opções de Frete*\n\n'
  message += `CEP de destino: ${cepDestino}\n\n`

  options.forEach((option, index) => {
    message += `*${option.name}* - ${option.company.name}\n`
    message += `Preço: ${option.price}\n`
    
    if (option.delivery_range && option.delivery_range.min !== option.delivery_range.max) {
      message += `Prazo: ${option.delivery_time} dias úteis (${option.delivery_range.min} a ${option.delivery_range.max} dias)\n`
    } else {
      message += `Prazo: ${option.delivery_time} dias úteis\n`
    }
    
    // Calcular e adicionar data estimada
    const deliveryDate = calculateDeliveryDate(option.delivery_time)
    const deliveryDateFormatted = formatDeliveryDate(deliveryDate)
    message += `Entrega estimada: ${deliveryDateFormatted}\n`
    
    if (index < options.length - 1) {
      message += '\n'
    }
  })

  const encodedMessage = encodeURIComponent(message)
  return `https://wa.me/?text=${encodedMessage}`
}
