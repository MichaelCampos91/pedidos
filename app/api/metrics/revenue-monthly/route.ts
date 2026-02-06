import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth, authErrorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())

    const currentDate = new Date()
    const currentYear = currentDate.getFullYear()
    const currentMonth = currentDate.getMonth() + 1 // 1-12

    // Buscar faturamento de todos os meses do ano
    const results = []
    
    for (let month = 1; month <= 12; month++) {
      const isFutureMonth = year === currentYear && month > currentMonth
      
      if (isFutureMonth) {
        // Meses futuros retornam 0
        results.push({
          month,
          month_name: MONTH_NAMES[month - 1],
          revenue: 0
        })
      } else {
        // Buscar faturamento do mês
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endDate = new Date(year, month, 0).toISOString().split('T')[0] // Último dia do mês

        const revenueResult = await query(
          `SELECT COALESCE(SUM(total), 0) as revenue
           FROM orders
           WHERE paid_at IS NOT NULL
           AND DATE(created_at) >= $1
           AND DATE(created_at) <= $2`,
          [startDate, endDate]
        )

        const revenue = parseFloat(revenueResult.rows[0]?.revenue || 0)
        
        results.push({
          month,
          month_name: MONTH_NAMES[month - 1],
          revenue
        })
      }
    }

    return NextResponse.json(results)
  } catch (error: any) {
    if (error.message === 'Token não fornecido' || error.message === 'Token inválido ou expirado') {
      return authErrorResponse(error.message, 401)
    }
    console.error('Erro ao buscar faturamento mensal:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar faturamento mensal' },
      { status: 500 }
    )
  }
}
