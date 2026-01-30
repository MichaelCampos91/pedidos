import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { query } from '@/lib/database'
import { getActiveEnvironment } from '@/lib/settings'
import { getShippingServices } from '@/lib/melhor-envio'
import type { IntegrationEnvironment } from '@/lib/integrations-types'

export const dynamic = 'force-dynamic'

function normalizeService(service: any): { id: number; name: string; company_id: number | null; company_name: string | null } {
  const id = typeof service.id === 'number' ? service.id : parseInt(service.id, 10)
  const name = service.name != null ? String(service.name) : ''
  let company_id: number | null = null
  let company_name: string | null = null
  if (service.company && typeof service.company === 'object') {
    company_id = typeof service.company.id === 'number' ? service.company.id : (service.company.id != null ? parseInt(service.company.id, 10) : null)
    company_name = service.company.name != null ? String(service.company.name) : null
  } else if (service.company_id != null || service.company_name != null) {
    company_id = service.company_id != null ? (typeof service.company_id === 'number' ? service.company_id : parseInt(service.company_id, 10)) : null
    company_name = service.company_name != null ? String(service.company_name) : null
  }
  return { id, name, company_id, company_name }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    let environment: IntegrationEnvironment = 'production'
    try {
      const body = await request.json().catch(() => ({}))
      if (body.environment === 'sandbox' || body.environment === 'production') {
        environment = body.environment
      } else {
        const active = await getActiveEnvironment('melhor_envio')
        if (active) environment = active
      }
    } catch {
      const active = await getActiveEnvironment('melhor_envio')
      if (active) environment = active
    }

    const services = await getShippingServices(environment)
    if (!Array.isArray(services)) {
      return NextResponse.json(
        { error: 'Resposta inválida da API do Melhor Envio' },
        { status: 502 }
      )
    }

    for (const svc of services) {
      const { id, name, company_id, company_name } = normalizeService(svc)
      await query(
        `INSERT INTO shipping_modalities (id, environment, name, company_id, company_name, active, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
         ON CONFLICT (id, environment) DO UPDATE SET
           name = EXCLUDED.name,
           company_id = EXCLUDED.company_id,
           company_name = EXCLUDED.company_name,
           updated_at = CURRENT_TIMESTAMP`,
        [id, environment, name, company_id, company_name]
      )
    }

    const result = await query(
      `SELECT id, environment, name, company_id, company_name, active, created_at, updated_at
       FROM shipping_modalities WHERE environment = $1 ORDER BY company_name ASC NULLS LAST, name ASC`,
      [environment]
    )

    return NextResponse.json({ modalities: result.rows, success: true })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('[Shipping Modalities Sync API] error:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao sincronizar modalidades' },
      { status: 500 }
    )
  }
}
