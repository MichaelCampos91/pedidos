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
    const message = error.message ?? error.error ?? 'Erro na requisição'
    throw new Error(message)
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

// Product categories
export const productCategoriesApi = {
  list: () => request<any[]>('/products/categories'),
  get: (id: number) => request<any>(`/products/categories/${id}`),
  create: (data: { name: string; description?: string }) =>
    request<{ success: boolean; id: number }>('/products/categories', { method: 'POST', body: data }),
  update: (id: number, data: { name: string; description?: string }) =>
    request<{ success: boolean }>(`/products/categories/${id}`, { method: 'PUT', body: data }),
  delete: (id: number) =>
    request<{ success: boolean }>(`/products/categories/${id}`, { method: 'DELETE' }),
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

// Bling
export const blingApi = {
  syncOrder: (orderId: number) =>
    request<{ success: boolean; blingId?: number | string; message?: string }>('/bling/sync-order', {
      method: 'POST',
      body: { orderId },
    }),
  syncClient: (clientId: number) =>
    request<{ success: boolean; blingContactId?: number; message?: string }>('/bling/sync-client', {
      method: 'POST',
      body: { clientId },
    }),
  getSyncStatus: () =>
    request<{ categories?: string | null; products?: string | null; contacts?: string | null; orders?: string | null }>('/bling/sync/status'),
  syncCategories: (sinceDate: string) =>
    request<{ success: boolean; syncedCount?: number; error?: string }>('/bling/sync/categories', {
      method: 'POST',
      body: { sinceDate },
    }),
  syncProducts: (sinceDate: string) =>
    request<{ success: boolean; syncedCount?: number; error?: string }>('/bling/sync/products', {
      method: 'POST',
      body: { sinceDate },
    }),
  syncContacts: (sinceDate: string) =>
    request<{ success: boolean; syncedCount?: number; error?: string }>('/bling/sync/contacts', {
      method: 'POST',
      body: { sinceDate },
    }),
  syncOrders: (sinceDate: string) =>
    request<{ success: boolean; syncedCount?: number; error?: string }>('/bling/sync/orders', {
      method: 'POST',
      body: { sinceDate },
    }),
  fetchContactsForImport: () =>
    request<{ success: boolean; count: number; contacts: Array<{
      id: number
      nome: string
      numeroDocumento: string
      email?: string | null
      celular?: string | null
      telefone?: string | null
      endereco?: {
        endereco?: string
        numero?: string
        complemento?: string
        bairro?: string
        municipio?: string
        uf?: string
        cep?: string
      } | null
    }> }>('/bling/contacts/import', { method: 'GET' }),
  testContactsImport: () =>
    request<{ success: boolean; count: number; contacts: Array<{
      id: number
      nome: string
      numeroDocumento: string
      email?: string | null
      celular?: string | null
      telefone?: string | null
      endereco?: {
        endereco?: string
        numero?: string
        complemento?: string
        bairro?: string
        municipio?: string
        uf?: string
        cep?: string
      } | null
    }> }>('/bling/contacts/import?limit=5', { method: 'GET' }),
  confirmContactsImport: (contacts: Array<{
    id: number
    nome: string
    numeroDocumento: string
    email?: string | null
    celular?: string | null
    telefone?: string | null
    endereco?: {
      endereco?: string
      numero?: string
      complemento?: string
      bairro?: string
      municipio?: string
      uf?: string
      cep?: string
    } | null
  }>, filters?: {
    email: boolean
    documento: boolean
    endereco: boolean
  }) =>
    request<{ success: boolean; importedCount: number; updatedCount: number; skippedCount: number; errors?: string[] }>('/bling/contacts/import', {
      method: 'POST',
      body: { contacts, filters: filters || { email: false, documento: false, endereco: false } },
    }),
  getContactsImportStatus: () =>
    request<{
      status: 'idle' | 'running' | 'completed' | 'failed'
      progressPercent: number
      totalContacts: number
      processedContacts: number
      importedCount: number
      updatedCount: number
      skippedCount: number
      startedAt?: string
      finishedAt?: string | null
      errorMessage?: string | null
    }>('/bling/contacts/import/status'),
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
      by_payment_method: { method: string; count: number; total: number }[]
      paid_count: number
      average_order_value: number
      conversion_rate: number
      new_clients_count: number
      avg_hours_to_payment: number | null
      shipping_total: number
      shipping_avg: number
      revenue_avista: number
      revenue_parcelado: number
      top_products: { product_id: number | null; title: string; quantity: number; revenue: number }[]
      by_state: { state: string; count: number; total: number }[]
    }>(`/metrics/orders?${query}`)
  },
  revenueEvolution: (params: { start_date: string; end_date: string; group_by: 'day' | 'week' | 'month' | 'year'; timezone?: string }) => {
    const query = new URLSearchParams(params as any).toString()
    return request<Array<{ date: string; revenue: number }>>(`/metrics/revenue-evolution?${query}`)
  },
  revenueMonthly: (params?: { year?: number }) => {
    const query = new URLSearchParams(params as any).toString()
    return request<Array<{ month: number; month_name: string; revenue: number }>>(`/metrics/revenue-monthly?${query}`)
  },
  topClients: (params: { start_date?: string; end_date?: string; timezone?: string; limit?: number } = {}) => {
    const query = new URLSearchParams(params as any).toString()
    return request<Array<{ client_id: number; client_name: string; order_count: number; total_revenue: number }>>(`/metrics/top-clients?${query}`)
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

// Logs
export const logsApi = {
  list: (params: Record<string, any> = {}) => {
    const query = new URLSearchParams(params).toString()
    return request<{
      data: Array<{
        id: number
        level: string
        category: string | null
        message: string
        metadata: any
        created_at: string
      }>
      pagination: {
        current_page: number
        per_page: number
        total: number
        last_page: number
        from: number
        to: number
      }
    }>(`/logs?${query}`)
  },
}
