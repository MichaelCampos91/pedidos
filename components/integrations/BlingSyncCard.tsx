"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/DatePicker"
import { FolderTree, Package, Users, ShoppingCart, Loader2 } from "lucide-react"
import { formatDateTime } from "@/lib/utils"
import { toast } from "@/lib/toast"
import { blingApi } from "@/lib/api"

type SyncType = "categories" | "products" | "contacts" | "orders"

const SYNC_CONFIG: { key: SyncType; label: string; icon: React.ReactNode }[] = [
  { key: "categories", label: "Sincronizar Categorias", icon: <FolderTree className="h-4 w-4 mr-2" /> },
  { key: "products", label: "Sincronizar Produtos", icon: <Package className="h-4 w-4 mr-2" /> },
  { key: "contacts", label: "Sincronizar Clientes", icon: <Users className="h-4 w-4 mr-2" /> },
  { key: "orders", label: "Sincronizar Pedidos", icon: <ShoppingCart className="h-4 w-4 mr-2" /> },
]

export function BlingSyncCard() {
  const [sinceDate, setSinceDate] = useState<Date | undefined>(() => new Date())
  const [status, setStatus] = useState<Record<SyncType, string | null>>({
    categories: null,
    products: null,
    contacts: null,
    orders: null,
  })
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [syncing, setSyncing] = useState<SyncType | null>(null)

  const loadStatus = async () => {
    setLoadingStatus(true)
    try {
      const data = await blingApi.getSyncStatus()
      setStatus({
        categories: data.categories ?? null,
        products: data.products ?? null,
        contacts: data.contacts ?? null,
        orders: data.orders ?? null,
      })
    } catch {
      setStatus({ categories: null, products: null, contacts: null, orders: null })
    } finally {
      setLoadingStatus(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const getSinceDateStr = (): string => {
    if (!sinceDate) return new Date().toISOString().slice(0, 10)
    const y = sinceDate.getFullYear()
    const m = String(sinceDate.getMonth() + 1).padStart(2, "0")
    const d = String(sinceDate.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }

  const handleSync = async (type: SyncType) => {
    if (syncing) return
    const since = getSinceDateStr()
    setSyncing(type)
    try {
      let result: { success: boolean; syncedCount?: number; error?: string }
      if (type === "categories") result = await blingApi.syncCategories(since)
      else if (type === "products") result = await blingApi.syncProducts(since)
      else if (type === "contacts") result = await blingApi.syncContacts(since)
      else result = await blingApi.syncOrders(since)

      if (result.success) {
        toast.success(
          result.syncedCount !== undefined
            ? `${SYNC_CONFIG.find((c) => c.key === type)?.label ?? type}: ${result.syncedCount} registro(s) sincronizado(s).`
            : "Sincronização concluída."
        )
        await loadStatus()
      } else {
        toast.error(result.error ?? "Erro ao sincronizar.")
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao sincronizar.")
    } finally {
      setSyncing(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sincronização Bling</CardTitle>
        <CardDescription>
          Envie dados do sistema para o Bling. Apenas registros criados a partir da data informada serão enviados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Sincronizar registros a partir de</Label>
          <DatePicker
            date={sinceDate}
            onDateChange={setSinceDate}
            placeholder="Selecione a data"
            disablePastDates={false}
          />
        </div>

        {loadingStatus ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {SYNC_CONFIG.map(({ key, label, icon }) => {
              const isSyncing = syncing === key
              const lastAt = status[key]
              return (
                <div key={key} className="flex flex-col gap-1">
                  <Button
                    variant="outline"
                    onClick={() => handleSync(key)}
                    disabled={!!syncing}
                    className="justify-start"
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sincronizando...
                      </>
                    ) : (
                      <>
                        {icon}
                        {label}
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {lastAt
                      ? `Última sincronização: ${formatDateTime(lastAt)}`
                      : "Nunca sincronizado"}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
