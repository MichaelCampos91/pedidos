// Funções utilitárias do Melhor Envio que podem ser usadas no cliente
// (não importam banco de dados ou outras dependências do servidor)

export function formatShippingPrice(price: string): string {
  const value = parseFloat(price)
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
