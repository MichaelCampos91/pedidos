import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { query } from '@/lib/database'
import type { ShippingRule } from '@/lib/shipping-rules'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const result = await query(
      `SELECT * FROM shipping_rules ORDER BY priority ASC, created_at ASC`
    )

    const rules = result.rows.map(row => ({
      ...row,
      condition_value: row.condition_value ? (typeof row.condition_value === 'string' ? JSON.parse(row.condition_value) : row.condition_value) : null,
      shipping_methods: row.shipping_methods ? (typeof row.shipping_methods === 'string' ? JSON.parse(row.shipping_methods) : row.shipping_methods) : null,
    }))

    return NextResponse.json({ rules })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('[Shipping Rules API] Erro:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar regras de frete' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const {
      rule_type,
      condition_type,
      condition_value,
      discount_type,
      discount_value,
      shipping_methods,
      production_days,
      priority,
      active,
    } = body

    // Validações
    if (!rule_type || !condition_type) {
      return NextResponse.json(
        { error: 'rule_type e condition_type são obrigatórios' },
        { status: 400 }
      )
    }

    // Rejeitar regras do tipo 'discount' (removido, será implementado no futuro)
    if (rule_type === 'discount') {
      return NextResponse.json(
        { error: 'Regras de desconto no frete foram removidas e serão implementadas no futuro' },
        { status: 400 }
      )
    }

    if (rule_type === 'free_shipping' && condition_type === 'all') {
      // Frete grátis para todos - validar que não há conflito
    }

    const result = await query(
      `INSERT INTO shipping_rules (
        rule_type, condition_type, condition_value, discount_type, 
        discount_value, shipping_methods, production_days, priority, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        rule_type,
        condition_type,
        condition_value ? JSON.stringify(condition_value) : null,
        discount_type || null,
        discount_value || null,
        shipping_methods ? JSON.stringify(shipping_methods) : null,
        production_days || null,
        priority || 0,
        active !== undefined ? active : true,
      ]
    )

    const rule = result.rows[0]
    rule.condition_value = rule.condition_value ? (typeof rule.condition_value === 'string' ? JSON.parse(rule.condition_value) : rule.condition_value) : null
    rule.shipping_methods = rule.shipping_methods ? (typeof rule.shipping_methods === 'string' ? JSON.parse(rule.shipping_methods) : rule.shipping_methods) : null

    return NextResponse.json({ rule }, { status: 201 })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('[Shipping Rules API] Erro:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao criar regra de frete' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const body = await request.json()
    const {
      id,
      rule_type,
      condition_type,
      condition_value,
      discount_type,
      discount_value,
      shipping_methods,
      production_days,
      priority,
      active,
    } = body

    if (!id) {
      return NextResponse.json(
        { error: 'id é obrigatório' },
        { status: 400 }
      )
    }

    // Rejeitar atualização para regras do tipo 'discount' (removido, será implementado no futuro)
    if (rule_type === 'discount') {
      return NextResponse.json(
        { error: 'Regras de desconto no frete foram removidas e serão implementadas no futuro' },
        { status: 400 }
      )
    }

    const result = await query(
      `UPDATE shipping_rules SET
        rule_type = $1,
        condition_type = $2,
        condition_value = $3,
        discount_type = $4,
        discount_value = $5,
        shipping_methods = $6,
        production_days = $7,
        priority = $8,
        active = $9,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
      RETURNING *`,
      [
        rule_type,
        condition_type,
        condition_value ? JSON.stringify(condition_value) : null,
        discount_type || null,
        discount_value || null,
        shipping_methods ? JSON.stringify(shipping_methods) : null,
        production_days || null,
        priority || 0,
        active !== undefined ? active : true,
        id,
      ]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Regra não encontrada' },
        { status: 404 }
      )
    }

    const rule = result.rows[0]
    rule.condition_value = rule.condition_value ? (typeof rule.condition_value === 'string' ? JSON.parse(rule.condition_value) : rule.condition_value) : null
    rule.shipping_methods = rule.shipping_methods ? (typeof rule.shipping_methods === 'string' ? JSON.parse(rule.shipping_methods) : rule.shipping_methods) : null

    return NextResponse.json({ rule })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('[Shipping Rules API] Erro:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao atualizar regra de frete' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'id é obrigatório' },
        { status: 400 }
      )
    }

    await query('DELETE FROM shipping_rules WHERE id = $1', [id])

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('[Shipping Rules API] Erro:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao deletar regra de frete' },
      { status: 500 }
    )
  }
}
