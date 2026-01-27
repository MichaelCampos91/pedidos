import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  }
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  }
  return phone
}

export function formatDate(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleDateString('pt-BR')
}

export function formatDateTime(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleString('pt-BR')
}

export function formatCPF(cpf: string): string {
  const cleaned = cpf.replace(/\D/g, '')
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  return cpf
}

export function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, '')
  if (cleaned.length === 14) {
    return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }
  return cnpj
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

export function validateCPF(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '')
  if (cleaned.length !== 11) return false
  
  if (/^(\d)\1{10}$/.test(cleaned)) return false
  
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned.charAt(i)) * (10 - i)
  }
  let digit = 11 - (sum % 11)
  if (digit >= 10) digit = 0
  if (digit !== parseInt(cleaned.charAt(9))) return false
  
  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleaned.charAt(i)) * (11 - i)
  }
  digit = 11 - (sum % 11)
  if (digit >= 10) digit = 0
  if (digit !== parseInt(cleaned.charAt(10))) return false
  
  return true
}

/**
 * Aplica máscara de telefone brasileiro com código do país
 * Formato: +55 (99) 99999-9999 ou +55 (99) 9999-9999
 */
export function maskPhone(value: string): string {
  if (!value) return ''
  
  const cleaned = value.replace(/\D/g, '')
  // Remove código do país se presente
  const phone = cleaned.startsWith('55') ? cleaned.slice(2) : cleaned
  
  if (phone.length === 0) {
    return '+55 ('
  } else if (phone.length <= 2) {
    return `+55 (${phone}`
  } else if (phone.length <= 6) {
    return `+55 (${phone.slice(0, 2)}) ${phone.slice(2)}`
  } else if (phone.length <= 10) {
    // Telefone fixo: +55 (99) 9999-9999
    return `+55 (${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6, 10)}`
  } else {
    // Celular: +55 (99) 99999-9999
    return `+55 (${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7, 11)}`
  }
}

/**
 * Remove máscara de telefone, retornando apenas números
 */
export function unmaskPhone(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Aplica máscara de CEP
 * Formato: 99999-999
 */
export function maskCEP(value: string): string {
  if (!value) return ''
  
  const cleaned = value.replace(/\D/g, '')
  if (cleaned.length <= 5) {
    return cleaned
  }
  return `${cleaned.slice(0, 5)}-${cleaned.slice(5, 8)}`
}

/**
 * Remove máscara de CEP, retornando apenas números
 */
export function unmaskCEP(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Capitaliza primeira letra de cada palavra
 * Exemplo: "michael campos" -> "Michael Campos"
 */
export function capitalizeName(value: string): string {
  if (!value) return ''
  
  return value
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim()
}

/**
 * Converte string para maiúsculas
 */
export function toUpperCase(value: string): string {
  return value.toUpperCase()
}
