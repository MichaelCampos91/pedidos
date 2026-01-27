import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { query } from '@/lib/database'
import { setSetting } from '@/lib/settings'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    // Buscar configurações de pagamento
    const paymentSettingsResult = await query(
      `SELECT * FROM payment_settings ORDER BY payment_method, setting_type`
    )

    // Buscar prazo de produção
    const productionDaysResult = await query(
      `SELECT value FROM system_settings WHERE key = 'production_days'`
    )
    const productionDays = productionDaysResult.rows.length > 0
      ? parseInt(productionDaysResult.rows[0].value) || 0
      : 0

    return NextResponse.json({
      paymentSettings: paymentSettingsResult.rows,
      productionDays,
    })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('[Payment Settings API] Erro:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar configurações de pagamento' },
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
    const { pixDiscount, productionDays } = body

    // Atualizar desconto PIX
    if (pixDiscount !== undefined) {
      const { active, discount_type, discount_value } = pixDiscount

      // Buscar configuração existente
      const existingResult = await query(
        `SELECT * FROM payment_settings 
         WHERE payment_method = 'pix' AND setting_type = 'discount' 
         LIMIT 1`
      )

      if (existingResult.rows.length > 0) {
        // Atualizar existente
        await query(
          `UPDATE payment_settings SET
            active = $1,
            discount_type = $2,
            discount_value = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE payment_method = 'pix' AND setting_type = 'discount'`,
          [active, discount_type || null, discount_value || null]
        )
      } else {
        // Criar novo
        await query(
          `INSERT INTO payment_settings (payment_method, setting_type, active, discount_type, discount_value)
           VALUES ('pix', 'discount', $1, $2, $3)`,
          [active, discount_type || null, discount_value || null]
        )
      }
    }

    // Atualizar prazo de produção
    if (productionDays !== undefined) {
      await setSetting('production_days', productionDays.toString(), 'Dias úteis a adicionar ao prazo de entrega do frete')
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('[Payment Settings API] Erro:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao salvar configurações de pagamento' },
      { status: 500 }
    )
  }
}
