import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, authErrorResponse } from '@/lib/auth'
import { query } from '@/lib/database'

export const dynamic = 'force-dynamic'

/**
 * GET /api/bling/contacts/import/status
 * Retorna o status e progresso da última importação de contatos.
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get('auth_token')?.value
    await requireAuth(request, cookieToken)

    const lastJob = await query(
      `SELECT id, status, total_contacts, processed_contacts, imported_count, updated_count, skipped_count, started_at, finished_at, error_message
       FROM bling_contact_import_jobs 
       ORDER BY started_at DESC LIMIT 1`
    )

    if (lastJob.rows.length === 0) {
      return NextResponse.json({
        status: 'idle',
        progressPercent: 100,
        totalContacts: 0,
        processedContacts: 0,
        importedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
      })
    }

    const job = lastJob.rows[0] as {
      id: number
      status: string
      total_contacts: number
      processed_contacts: number
      imported_count: number
      updated_count: number
      skipped_count: number
      started_at: string
      finished_at: string | null
      error_message: string | null
    }

    // Calcular porcentagem de progresso
    const progressPercent = job.total_contacts > 0
      ? Math.round((job.processed_contacts / job.total_contacts) * 100)
      : 100

    // Se job está completo ou falhou há mais de 5 minutos, considerar idle
    const isOldJob = job.status === 'completed' || job.status === 'failed'
    const finishedAt = job.finished_at ? new Date(job.finished_at) : null
    const isStale = finishedAt && (Date.now() - finishedAt.getTime()) > 5 * 60 * 1000

    return NextResponse.json({
      status: isOldJob && isStale ? 'idle' : job.status,
      progressPercent: isOldJob && isStale ? 100 : progressPercent,
      totalContacts: job.total_contacts,
      processedContacts: job.processed_contacts,
      importedCount: job.imported_count,
      updatedCount: job.updated_count,
      skippedCount: job.skipped_count,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
      errorMessage: job.error_message,
    })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'message' in err) {
      const msg = (err as { message: string }).message
      if (msg === 'Token não fornecido' || msg === 'Token inválido ou expirado') {
        return authErrorResponse(msg, 401)
      }
    }
    const errorMessage = err instanceof Error ? err.message : 'Erro ao buscar status da importação.'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
