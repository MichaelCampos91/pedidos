"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Truck, RefreshCw, Loader2 } from "lucide-react"
import { toast } from "@/lib/toast"
import type { IntegrationEnvironment } from "@/lib/integrations-types"

interface Modality {
  id: number
  environment: string
  name: string | null
  company_id: number | null
  company_name: string | null
  active: boolean
  created_at?: string
  updated_at?: string
}

export function ActiveModalitiesSection() {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [modalities, setModalities] = useState<Modality[]>([])
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [environment, setEnvironment] = useState<IntegrationEnvironment | null>(null)

  const loadModalities = async () => {
    setLoading(true)
    try {
      const envRes = await fetch('/api/integrations/active-environment?provider=melhor_envio', { credentials: 'include' })
      let env: IntegrationEnvironment = 'production'
      if (envRes.ok) {
        const envData = await envRes.json()
        if (envData.environment) {
          env = envData.environment
          setEnvironment(env)
        }
      }
      const response = await fetch(`/api/settings/shipping-modalities?environment=${env}`, { credentials: 'include' })
      if (!response.ok) {
        throw new Error('Erro ao carregar modalidades')
      }
      const data = await response.json()
      setModalities(data.modalities || [])
    } catch (error: any) {
      console.error('Erro ao carregar modalidades:', error)
      toast.error(error.message || 'Erro ao carregar modalidades')
      setModalities([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadModalities()
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const response = await fetch('/api/settings/shipping-modalities/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(environment ? { environment } : {}),
        credentials: 'include',
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || 'Erro ao sincronizar')
      }
      const data = await response.json()
      setModalities(data.modalities || [])
      toast.success('Modalidades sincronizadas com sucesso.')
    } catch (error: any) {
      toast.error(error.message || 'Erro ao sincronizar modalidades')
    } finally {
      setSyncing(false)
    }
  }

  const handleToggle = async (id: number, active: boolean) => {
    setTogglingId(id)
    try {
      const response = await fetch('/api/settings/shipping-modalities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, active, environment }),
        credentials: 'include',
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || 'Erro ao atualizar')
      }
      setModalities(prev =>
        prev.map(m => (m.id === id ? { ...m, active } : m))
      )
      toast.success(active ? 'Modalidade ativada.' : 'Modalidade desativada.')
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar modalidade')
    } finally {
      setTogglingId(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Modalidades Ativas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Modalidades Ativas
            </CardTitle>
            <CardDescription>
              Gerencie as modalidades de frete ativas.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sincronizar
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {modalities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nenhuma modalidade carregada. Clique em &quot;Sincronizar&quot; para buscar as modalidades do Melhor Envio.
          </p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {modalities.map((mod) => (
              <div
                key={`${mod.id}-${mod.environment}`}
                className="p-4 border rounded-lg flex items-center justify-between gap-4 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Truck className="h-5 w-5 text-primary shrink-0" />
                  <h3 className="font-semibold truncate">
                    {mod.company_name || 'Transportadora'}
                  </h3>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {mod.name || `#${mod.id}`}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {mod.active ? 'Ativa' : 'Inativa'}
                  </span>
                  <Switch
                    checked={mod.active}
                    onCheckedChange={(checked) => handleToggle(mod.id, checked)}
                    disabled={togglingId === mod.id}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
