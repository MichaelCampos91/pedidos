import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { query } from '@/lib/database'
import { getActiveEnvironment } from '@/lib/settings'
import type { IntegrationEnvironment } from '@/lib/integrations-types'

export const dynamic = 'force-dynamic'

async function resolveEnvironment(request: NextRequest): Promise<IntegrationEnvironment> {
  const url = new URL(request.url)
  const envParam = url.searchParams.get('environment')
  if (envParam === 'sandbox' || envParam === 'production') {
    return envParam as IntegrationEnvironment
  }
  const active = await getActiveEnvironment('melhor_envio')
  return active || 'production'
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const environment = await resolveEnvironment(request)

    const result = await query(
      `SELECT id, environment, name, company_id, company_name, active, created_at, updated_at
       FROM shipping_modalities
       WHERE environment = $1
       ORDER BY company_name ASC NULLS LAST, name ASC`,
      [environment]
    )

    return NextResponse.json({ modalities: result.rows })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('[Shipping Modalities API] GET error:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar modalidades' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const { id, active, environment: envBody } = body

    if (id === undefined || id === null) {
      return NextResponse.json(
        { error: 'Campo id é obrigatório' },
        { status: 400 }
      )
    }
    if (typeof active !== 'boolean') {
      return NextResponse.json(
        { error: 'Campo active deve ser true ou false' },
        { status: 400 }
      )
    }

    const environment: IntegrationEnvironment =
      envBody === 'sandbox' || envBody === 'production'
        ? envBody
        : (await getActiveEnvironment('melhor_envio')) || 'production'

    await query(
      `UPDATE shipping_modalities SET active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND environment = $3`,
      [active, id, environment]
    )

    const result = await query(
      `SELECT id, environment, name, company_id, company_name, active, created_at, updated_at
       FROM shipping_modalities WHERE id = $1 AND environment = $2`,
      [id, environment]
    )

    const modality = result.rows[0] || null
    return NextResponse.json({ modality, success: true })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('[Shipping Modalities API] PATCH error:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao atualizar modalidade' },
      { status: 500 }
    )
  }
}
