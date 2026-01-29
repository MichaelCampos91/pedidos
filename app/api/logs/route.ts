import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/database'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const per_page = parseInt(searchParams.get('per_page') || '50')
    const level = searchParams.get('level')
    const category = searchParams.get('category')
    const search = searchParams.get('search')
    const start_date = searchParams.get('start_date')
    const end_date = searchParams.get('end_date')
    const last_id = searchParams.get('last_id') // Para polling de novos logs

    const offset = (page - 1) * per_page

    // Construir query com filtros
    let whereConditions: string[] = []
    const queryParams: any[] = []
    let paramIndex = 1

    if (level) {
      whereConditions.push(`level = $${paramIndex}`)
      queryParams.push(level)
      paramIndex++
    }

    if (category) {
      whereConditions.push(`category = $${paramIndex}`)
      queryParams.push(category)
      paramIndex++
    }

    if (search) {
      whereConditions.push(`message ILIKE $${paramIndex}`)
      queryParams.push(`%${search}%`)
      paramIndex++
    }

    if (start_date) {
      whereConditions.push(`created_at >= $${paramIndex}`)
      queryParams.push(start_date)
      paramIndex++
    }

    if (end_date) {
      whereConditions.push(`created_at <= $${paramIndex}`)
      queryParams.push(end_date + ' 23:59:59')
      paramIndex++
    }

    // Para polling: buscar apenas logs novos
    if (last_id) {
      whereConditions.push(`id > $${paramIndex}`)
      queryParams.push(parseInt(last_id))
      paramIndex++
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : ''

    // Query para contar total
    const countQuery = `SELECT COUNT(*) as total FROM system_logs ${whereClause}`
    const countResult = await query(countQuery, queryParams)
    const total = parseInt(countResult.rows[0].total)

    // Query para buscar logs
    const logsQuery = `
      SELECT id, level, category, message, metadata, created_at
      FROM system_logs
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    queryParams.push(per_page)
    queryParams.push(offset)

    const logsResult = await query(logsQuery, queryParams)

    // Parsear metadata JSON
    const logs = logsResult.rows.map(row => ({
      id: row.id,
      level: row.level,
      category: row.category,
      message: row.message,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
      created_at: row.created_at,
    }))

    const last_page = Math.ceil(total / per_page)

    return NextResponse.json({
      data: logs,
      pagination: {
        current_page: page,
        per_page,
        total,
        last_page,
        from: offset + 1,
        to: Math.min(offset + per_page, total),
      },
    })
  } catch (error: any) {
    console.error('[Logs API] Erro ao buscar logs:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar logs' },
      { status: 500 }
    )
  }
}
