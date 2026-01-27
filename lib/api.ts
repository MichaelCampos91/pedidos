const API_URL = '/api'

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: any
  headers?: Record<string, string>
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
  }

  if (body) {
    config.body = JSON.stringify(body)
  }

  const response = await fetch(`${API_URL}${endpoint}`, config)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
    throw new Error(error.error || 'Erro na requisição')
  }

  return response.json()
}

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    request<{ success: boolean; user: any; token: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  
  me: () => request<{ user: any }>('/auth/me'),
}

// Clients
export const clientsApi = {
  list: (params: Record<string, any> = {}) => {
    const query = new URLSearchParams(params).toString()
    return request<{
      data: any[]
      current_page: number
      per_page: number
      total: number
      last_page: number
      from: number
      to: number
    }>(`/clients?${query}`)
  },
  
  get: (id: number) => request<any>(`/clients/${id}`),
  
  create: (data: any) => 
    request<{ success: boolean; id: number }>('/clients', { method: 'POST', body: data }),
  
  update: (id: number, data: any) =>
    request<{ success: boolean }>(`/clients/${id}`, { method: 'PUT', body: data }),
  
  addAddress: (id: number, addressData: any) =>
    request<{ success: boolean; address: any }>(`/clients/${id}/addresses`, {
      method: 'POST',
      body: addressData,
    }),
}

// Products
export const productsApi = {
  list: () => request<any[]>('/products'),
  
  get: (id: number) => request<any>(`/products/${id}`),
  
  create: (data: any) =>
    request<{ success: boolean; id: number }>('/products', { method: 'POST', body: data }),
  
  update: (id: number, data: any) =>
    request<{ success: boolean }>(`/products/${id}`, { method: 'PUT', body: data }),
  
  delete: (id: number) =>
    request<{ success: boolean }>(`/products/${id}`, { method: 'DELETE' }),
}

// Orders
export const ordersApi = {
  list: (params: Record<string, any> = {}) => {
    const query = new URLSearchParams(params).toString()
    return request<{
      data: any[]
      current_page: number
      per_page: number
      total: number
      last_page: number
      from: number
      to: number
    }>(`/orders?${query}`)
  },
  
  get: (id: number) => request<any>(`/orders/${id}`),
  
  create: (data: any) =>
    request<{ success: boolean; id: number }>('/orders', { method: 'POST', body: data }),
  
  update: (id: number, data: any) =>
    request<{ success: boolean }>(`/orders/${id}`, { method: 'PUT', body: data }),
}

// Metrics
export const metricsApi = {
  orders: (params: Record<string, any> = {}) => {
    const query = new URLSearchParams(params).toString()
    return request<{
      total: number
      total_period: number
      revenue: number
      revenue_period: number
      awaiting_payment: number
      by_status: { status: string; count: number }[]
    }>(`/metrics/orders?${query}`)
  },
}

// Shipping
export const shippingApi = {
  quote: (data: any) =>
    request<{ success: boolean; options: any[] }>('/shipping/quote', {
      method: 'POST',
      body: data,
    }),
}

// CEP - ViaCEP
export const cepApi = {
  search: async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '')
    if (cleanCep.length !== 8) {
      throw new Error('CEP inválido')
    }
    
    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
    const data = await response.json()
    
    if (data.erro) {
      throw new Error('CEP não encontrado')
    }
    
    return {
      cep: data.cep,
      city: data.localidade,
      state: data.uf,
      neighborhood: data.bairro,
      street: data.logradouro,
    }
  },
}
