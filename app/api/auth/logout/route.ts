import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Marca a rota como dinâmica porque usa cookies para autenticação
export const dynamic = 'force-dynamic'

export async function POST() {
  const cookieStore = cookies()
  cookieStore.delete('auth_token')
  
  return NextResponse.json({ success: true })
}
