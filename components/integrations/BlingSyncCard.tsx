"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/DatePicker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FolderTree, Package, Users, ShoppingCart, Loader2, Download } from "lucide-react"
import { formatDateTime, formatCPF, formatCNPJ, maskPhone, maskCEP, capitalizeName } from "@/lib/utils"
import { toast } from "@/lib/toast"
import { blingApi } from "@/lib/api"

type SyncType = "categories" | "products" | "contacts" | "orders"

const SYNC_CONFIG: { key: SyncType; label: string; icon: React.ReactNode }[] = [
  { key: "categories", label: "Sincronizar Categorias", icon: <FolderTree className="h-4 w-4 mr-2" /> },
  { key: "products", label: "Sincronizar Produtos", icon: <Package className="h-4 w-4 mr-2" /> },
  { key: "contacts", label: "Sincronizar Clientes", icon: <Users className="h-4 w-4 mr-2" /> },
  { key: "orders", label: "Sincronizar Pedidos", icon: <ShoppingCart className="h-4 w-4 mr-2" /> },
]

type BlingContactForImport = {
  id: number
  nome: string
  numeroDocumento: string
  email?: string | null
  celular?: string | null
  telefone?: string | null
  endereco?: {
    endereco?: string
    numero?: string
    complemento?: string
    bairro?: string
    municipio?: string
    uf?: string
    cep?: string
  } | null
}

interface BlingSyncCardProps {
  /** Quando true, renderiza apenas o conteúdo (sem Card), para uso dentro de seções (ex.: aba Bling). */
  asSection?: boolean
}

export function BlingSyncCard({ asSection = false }: BlingSyncCardProps) {
  const [sinceDate, setSinceDate] = useState<Date | undefined>(() => new Date())
  const [status, setStatus] = useState<Record<SyncType, string | null>>({
    categories: null,
    products: null,
    contacts: null,
    orders: null,
  })
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [syncing, setSyncing] = useState<SyncType | null>(null)
  
  // Estados para importação de contatos
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [fetchingContacts, setFetchingContacts] = useState(false)
  const [importingContacts, setImportingContacts] = useState(false)
  const [allContacts, setAllContacts] = useState<BlingContactForImport[]>([])
  const [importFilter, setImportFilter] = useState<'all' | 'withDocument'>('all')
  const [importResult, setImportResult] = useState<{
    importedCount: number
    updatedCount: number
    skippedCount: number
    errors?: string[]
  } | null>(null)

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

  // Filtrar contatos por documento válido
  const filterContactsByDocument = (contacts: BlingContactForImport[]): BlingContactForImport[] => {
    return contacts.filter(contact => {
      const cleanDoc = contact.numeroDocumento.replace(/\D/g, '')
      return cleanDoc.length === 11 || cleanDoc.length === 14
    })
  }

  // Formatar contato para exibição no preview
  const formatContactForDisplay = (contact: BlingContactForImport) => {
    const cleanDoc = contact.numeroDocumento.replace(/\D/g, '')
    const formattedDoc = cleanDoc.length === 11 
      ? formatCPF(cleanDoc) 
      : cleanDoc.length === 14 
      ? formatCNPJ(cleanDoc) 
      : contact.numeroDocumento
    
    return {
      ...contact,
      nome: capitalizeName(contact.nome || ''),
      numeroDocumento: formattedDoc,
      celular: contact.celular ? maskPhone(contact.celular) : null,
      telefone: contact.telefone ? maskPhone(contact.telefone) : null,
      email: contact.email ? contact.email.trim().toLowerCase() : null,
      endereco: contact.endereco ? {
        ...contact.endereco,
        cep: contact.endereco.cep ? maskCEP(contact.endereco.cep) : undefined
      } : null
    }
  }

  // Obter contatos filtrados baseado no filtro selecionado
  const getFilteredContacts = (): BlingContactForImport[] => {
    if (importFilter === 'withDocument') {
      return filterContactsByDocument(allContacts)
    }
    return allContacts
  }

  const handleOpenImportModal = async () => {
    setImportModalOpen(true)
    setFetchingContacts(true)
    setAllContacts([])
    setImportFilter('all')
    setImportResult(null)
    
    try {
      const result = await blingApi.fetchContactsForImport()
      setAllContacts(result.contacts || [])
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao buscar contatos do Bling.")
      setImportModalOpen(false)
    } finally {
      setFetchingContacts(false)
    }
  }

  const handleConfirmImport = async () => {
    const contactsToImport = getFilteredContacts()
    
    if (contactsToImport.length === 0) {
      toast.error("Nenhum contato para importar.")
      return
    }

    setImportingContacts(true)
    setImportResult(null)
    
    try {
      const result = await blingApi.confirmContactsImport(contactsToImport)
      setImportResult(result)
      
      if (result.success) {
        const message = `${result.importedCount} importado(s), ${result.updatedCount} atualizado(s), ${result.skippedCount} ignorado(s).`
        toast.success(message)
        
        // Fechar modal após 3 segundos
        setTimeout(() => {
          setImportModalOpen(false)
          setAllContacts([])
          setImportResult(null)
        }, 3000)
      } else {
        toast.error("Erro ao importar contatos.")
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao importar contatos.")
    } finally {
      setImportingContacts(false)
    }
  }

  const handleCloseImportModal = () => {
    if (!importingContacts) {
      setImportModalOpen(false)
      setAllContacts([])
      setImportResult(null)
      setImportFilter('all')
    }
  }

  const syncContent = (
    <div className="space-y-4">
      <div className={asSection ? "space-y-2 w-fit" : "space-y-2"}>
        <Label>Sincronizar registros a partir de</Label>
        <DatePicker
          date={sinceDate}
          onDateChange={setSinceDate}
          placeholder="Selecione a data"
          disablePastDates={false}
        />
      </div>

      {/* Botão de importar contatos */}
      <div className={asSection ? "pt-2" : "border-t pt-4"}>
        <Button
          variant="outline"
          onClick={handleOpenImportModal}
          disabled={syncing !== null}
          className="w-full justify-start"
        >
          <Download className="h-4 w-4 mr-2" />
          Importar contatos do Bling
        </Button>
        <p className="text-xs text-muted-foreground mt-1">
          Busque e importe todos os contatos do Bling para o sistema
        </p>
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
    </div>
  )

  if (asSection) {
    return (
      <>
        <div className="p-4 border rounded-lg">
          {syncContent}
        </div>
        {/* Modal de importação */}
        <Dialog open={importModalOpen} onOpenChange={handleCloseImportModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar Contatos do Bling</DialogTitle>
            <DialogDescription>
              {fetchingContacts
                ? "Buscando contatos no Bling..."
                : allContacts.length > 0
                ? `Foram encontrados ${allContacts.length} contatos no Bling. Selecione quais deseja importar.`
                : "Nenhum contato encontrado."}
            </DialogDescription>
          </DialogHeader>

          {fetchingContacts ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : importResult ? (
            <div className="space-y-4 py-4">
              <div className="p-4 rounded-md bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
                <p className="font-semibold">Importação concluída!</p>
                <p className="text-sm mt-1">
                  {importResult.importedCount} importado(s), {importResult.updatedCount} atualizado(s), {importResult.skippedCount} ignorado(s).
                </p>
                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="mt-3 text-xs">
                    <p className="font-semibold">Erros encontrados:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      {importResult.errors.slice(0, 5).map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                      {importResult.errors.length > 5 && (
                        <li>... e mais {importResult.errors.length - 5} erro(s)</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : allContacts.length > 0 ? (
            <div className="space-y-4 py-4">
              {/* Filtros */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Filtrar contatos:</Label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importFilter"
                      value="all"
                      checked={importFilter === 'all'}
                      onChange={(e) => setImportFilter(e.target.value as 'all' | 'withDocument')}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Todos os contatos ({allContacts.length})</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importFilter"
                      value="withDocument"
                      checked={importFilter === 'withDocument'}
                      onChange={(e) => setImportFilter(e.target.value as 'all' | 'withDocument')}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">
                      Apenas contatos com documento preenchido ({filterContactsByDocument(allContacts).length})
                    </span>
                  </label>
                </div>
              </div>

              {/* Preview */}
              {(() => {
                const filteredContacts = getFilteredContacts()
                const formattedContacts = filteredContacts.slice(0, 10).map(formatContactForDisplay)
                
                return (
                  <div className="max-h-60 overflow-y-auto border rounded-md p-4">
                    <p className="text-sm font-semibold mb-2">
                      Preview dos primeiros contatos ({filteredContacts.length} selecionado(s)):
                    </p>
                    <ul className="space-y-2 text-sm">
                      {formattedContacts.map((contact) => (
                        <li key={contact.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                          <div className="flex-1">
                            <span className="font-medium">{contact.nome}</span>
                            {contact.email && (
                              <span className="text-muted-foreground text-xs block">{contact.email}</span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-muted-foreground text-xs block">
                              {contact.numeroDocumento || "Sem documento"}
                            </span>
                            {(contact.celular || contact.telefone) && (
                              <span className="text-muted-foreground text-xs block">
                                {contact.celular || contact.telefone}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                      {filteredContacts.length > 10 && (
                        <li className="text-xs text-muted-foreground italic pt-2">
                          ... e mais {filteredContacts.length - 10} contato(s)
                        </li>
                      )}
                    </ul>
                  </div>
                )
              })()}
            </div>
          ) : null}

          <DialogFooter>
            {!importResult && (
              <>
                <Button
                  variant="outline"
                  onClick={handleCloseImportModal}
                  disabled={importingContacts}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmImport}
                  disabled={importingContacts || getFilteredContacts().length === 0}
                >
                  {importingContacts ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    "Importar"
                  )}
                </Button>
              </>
            )}
            {importResult && (
              <Button onClick={handleCloseImportModal}>
                Fechar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
    )
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Sincronização Bling</CardTitle>
        <CardDescription>
          Envie dados do sistema para o Bling. Apenas registros criados a partir da data informada serão enviados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {syncContent}
      </CardContent>
    </Card>
    {/* Modal de importação - compartilhado com asSection */}
    <Dialog open={importModalOpen} onOpenChange={handleCloseImportModal}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Contatos do Bling</DialogTitle>
          <DialogDescription>
            {fetchingContacts
              ? "Buscando contatos no Bling..."
              : allContacts.length > 0
              ? `Foram encontrados ${allContacts.length} contatos no Bling. Selecione quais deseja importar.`
              : "Nenhum contato encontrado."}
          </DialogDescription>
        </DialogHeader>

        {fetchingContacts ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : importResult ? (
          <div className="space-y-4 py-4">
            <div className="p-4 rounded-md bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
              <p className="font-semibold">Importação concluída!</p>
              <p className="text-sm mt-1">
                {importResult.importedCount} importado(s), {importResult.updatedCount} atualizado(s), {importResult.skippedCount} ignorado(s).
              </p>
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="mt-3 text-xs">
                  <p className="font-semibold">Erros encontrados:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    {importResult.errors.slice(0, 5).map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                    {importResult.errors.length > 5 && (
                      <li>... e mais {importResult.errors.length - 5} erro(s)</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : allContacts.length > 0 ? (
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Filtrar contatos:</Label>
              <div className="space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="importFilter"
                    value="all"
                    checked={importFilter === 'all'}
                    onChange={(e) => setImportFilter(e.target.value as 'all' | 'withDocument')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Todos os contatos ({allContacts.length})</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="importFilter"
                    value="withDocument"
                    checked={importFilter === 'withDocument'}
                    onChange={(e) => setImportFilter(e.target.value as 'all' | 'withDocument')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">
                    Apenas contatos com documento preenchido ({filterContactsByDocument(allContacts).length})
                  </span>
                </label>
              </div>
            </div>
            {(() => {
              const filteredContacts = getFilteredContacts()
              const formattedContacts = filteredContacts.slice(0, 10).map(formatContactForDisplay)
              return (
                <div className="max-h-60 overflow-y-auto border rounded-md p-4">
                  <p className="text-sm font-semibold mb-2">
                    Preview dos primeiros contatos ({filteredContacts.length} selecionado(s)):
                  </p>
                  <ul className="space-y-2 text-sm">
                    {formattedContacts.map((contact) => (
                      <li key={contact.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                        <div className="flex-1">
                          <span className="font-medium">{contact.nome}</span>
                          {contact.email && (
                            <span className="text-muted-foreground text-xs block">{contact.email}</span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-muted-foreground text-xs block">
                            {contact.numeroDocumento || "Sem documento"}
                          </span>
                          {(contact.celular || contact.telefone) && (
                            <span className="text-muted-foreground text-xs block">
                              {contact.celular || contact.telefone}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                    {filteredContacts.length > 10 && (
                      <li className="text-xs text-muted-foreground italic pt-2">
                        ... e mais {filteredContacts.length - 10} contato(s)
                      </li>
                    )}
                  </ul>
                </div>
              )
            })()}
          </div>
        ) : null}

        <DialogFooter>
          {!importResult && (
            <>
              <Button
                variant="outline"
                onClick={handleCloseImportModal}
                disabled={importingContacts}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={importingContacts || getFilteredContacts().length === 0}
              >
                {importingContacts ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  "Importar"
                )}
              </Button>
            </>
          )}
          {importResult && (
            <Button onClick={handleCloseImportModal}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
