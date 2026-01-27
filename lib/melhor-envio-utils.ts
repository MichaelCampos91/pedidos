// Funções utilitárias do Melhor Envio que podem ser usadas no cliente
// (não importam banco de dados ou outras dependências do servidor)

export function formatShippingPrice(price: string | number | undefined | null): string {
  const value = typeof price === 'string' ? parseFloat(price) : (price || 0)
  
  // Se o valor é inválido (NaN ou não finito), retornar "Indisponível"
  if (isNaN(value) || !isFinite(value)) {
    return 'Indisponível'
  }
  
  // Se o valor é 0, retornar "R$ 0,00" (frete grátis)
  if (value === 0) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(0)
  }
  
  // Se o valor é negativo, retornar "Indisponível"
  if (value < 0) {
    return 'Indisponível'
  }
  
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDeliveryTime(days: number): string {
  if (days === 1) {
    return '1 dia útil'
  }
  return `${days} dias úteis`
}
