"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/DatePicker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Collapsible, CollapsibleContent, CollapsibleHeader } from "@/components/ui/collapsible"
import { FolderTree, Package, Users, ShoppingCart, Loader2, Download, TestTube } from "lucide-react"
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
  const [importFilters, setImportFilters] = useState<{
    email: boolean
    documento: boolean
    endereco: boolean
  }>({
    email: false,
    documento: false,
    endereco: false,
  })
  const [importResult, setImportResult] = useState<{
    importedCount: number
    updatedCount: number
    skippedCount: number
    errors?: string[]
  } | null>(null)
  const [importJobStatus, setImportJobStatus] = useState<{
    status: 'idle' | 'running' | 'completed' | 'failed'
    progressPercent: number
  } | null>(null)
  const [isBackgroundImport, setIsBackgroundImport] = useState(false)

  // Estados para modal de teste
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testContacts, setTestContacts] = useState<BlingContactForImport[]>([])
  const [fetchingTestContacts, setFetchingTestContacts] = useState(false)
  const [importingTestContacts, setImportingTestContacts] = useState(false)
  const [testImportResult, setTestImportResult] = useState<{
    importedCount: number
    updatedCount: number
    skippedCount: number
    errors?: string[]
  } | null>(null)
  const [openCollapsibles, setOpenCollapsibles] = useState<Set<number>>(new Set())

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

  // Polling de status da importação em segundo plano
  useEffect(() => {
    if (!isBackgroundImport && importJobStatus?.status !== 'running') {
      return
    }

    const pollStatus = async () => {
      try {
        const status = await blingApi.getContactsImportStatus()
        setImportJobStatus({
          status: status.status,
          progressPercent: status.progressPercent,
        })

        // Se a importação terminou, parar polling após alguns segundos
        if (status.status === 'completed' || status.status === 'failed') {
          setTimeout(() => {
            setIsBackgroundImport(false)
            setImportJobStatus(null)
            if (status.status === 'completed') {
              toast.success(`Importação concluída: ${status.importedCount} importado(s), ${status.updatedCount} atualizado(s), ${status.skippedCount} ignorado(s).`)
            } else if (status.errorMessage) {
              toast.error(`Importação falhou: ${status.errorMessage}`)
            }
          }, 2000)
        }
      } catch (err: any) {
        console.warn('Erro ao buscar status da importação:', err)
        // Não parar o polling em caso de erro, a importação pode continuar
      }
    }

    // Polling a cada 2 segundos
    const intervalId = setInterval(pollStatus, 2000)
    
    // Primeira chamada imediata
    pollStatus()

    return () => clearInterval(intervalId)
  }, [isBackgroundImport, importJobStatus?.status])

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

  // Validar se um contato atende os filtros (apenas documento no frontend, pois email/endereço não estão disponíveis na listagem)
  const contactMatchesFilters = (contact: BlingContactForImport): boolean => {
    // Se nenhum filtro está selecionado, aceitar todos
    if (!importFilters.email && !importFilters.documento && !importFilters.endereco) {
      return true
    }

    // Validar apenas documento no frontend (email e endereço serão validados no backend após buscar detalhes)
    if (importFilters.documento) {
      const cleanDoc = contact.numeroDocumento.replace(/\D/g, '')
      if (cleanDoc.length !== 11 && cleanDoc.length !== 14) {
        return false
      }
    }

    // Se apenas email ou endereço estão selecionados, aceitar todos no preview (validação será no backend)
    // Se documento está selecionado junto com outros, já filtramos por documento acima
    return true
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

  // Obter contatos filtrados baseado nos filtros selecionados
  const getFilteredContacts = (): BlingContactForImport[] => {
    return allContacts.filter(contactMatchesFilters)
  }

  const handleOpenImportModal = async () => {
    setImportModalOpen(true)
    setFetchingContacts(true)
    setAllContacts([])
    setImportFilters({ email: false, documento: false, endereco: false })
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
    setIsBackgroundImport(false)
    setImportJobStatus({ status: 'running', progressPercent: 0 })
    
    try {
      // Iniciar importação (não aguardar conclusão)
      blingApi.confirmContactsImport(contactsToImport, importFilters)
        .then((result) => {
          setImportResult(result)
          if (!result.success) {
            toast.error("Erro ao importar contatos.")
            setIsBackgroundImport(false)
            setImportJobStatus(null)
          }
        })
        .catch((err: any) => {
          toast.error(err?.message ?? "Erro ao importar contatos.")
          setIsBackgroundImport(false)
          setImportJobStatus(null)
        })
        .finally(() => {
          setImportingContacts(false)
        })

      // Fechar modal após 3 segundos e iniciar modo background
      setTimeout(() => {
        setIsBackgroundImport(true)
        setImportModalOpen(false)
        setAllContacts([])
        setImportResult(null)
        toast.info("Importação continuará em segundo plano. Você pode acompanhar o progresso abaixo.")
      }, 3000)
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao iniciar importação.")
      setImportingContacts(false)
      setIsBackgroundImport(false)
      setImportJobStatus(null)
    }
  }

  const handleCloseImportModal = () => {
    if (!importingContacts) {
      setImportModalOpen(false)
      setAllContacts([])
      setImportResult(null)
      setImportFilters({ email: false, documento: false, endereco: false })
    }
  }

  const handleOpenTestModal = async () => {
    setTestModalOpen(true)
    setFetchingTestContacts(true)
    setTestContacts([])
    setTestImportResult(null)
    setOpenCollapsibles(new Set())
    
    try {
      const result = await blingApi.testContactsImport()
      console.log('[Test Import] JSON completo retornado pela API:', JSON.stringify(result, null, 2))
      console.log('[Test Import] Contatos recebidos:', JSON.stringify(result.contacts || [], null, 2))
      setTestContacts(result.contacts || [])
      // Abrir todos os collapses por padrão
      if (result.contacts && result.contacts.length > 0) {
        setOpenCollapsibles(new Set(result.contacts.map(c => c.id)))
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao buscar contatos do Bling para teste.")
      setTestModalOpen(false)
    } finally {
      setFetchingTestContacts(false)
    }
  }

  const handleConfirmTestImport = async () => {
    if (testContacts.length === 0) {
      toast.error("Nenhum contato para importar.")
      return
    }

    setImportingTestContacts(true)
    setTestImportResult(null)
    
    try {
      const result = await blingApi.confirmContactsImport(testContacts)
      setTestImportResult(result)
      
      if (result.success) {
        const message = `${result.importedCount} importado(s), ${result.updatedCount} atualizado(s), ${result.skippedCount} ignorado(s).`
        toast.success(message)
        
        // Fechar modal após 3 segundos
        setTimeout(() => {
          setTestModalOpen(false)
          setTestContacts([])
          setTestImportResult(null)
          setOpenCollapsibles(new Set())
        }, 3000)
      } else {
        toast.error("Erro ao importar contatos.")
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao importar contatos.")
    } finally {
      setImportingTestContacts(false)
    }
  }

  const handleCloseTestModal = () => {
    if (!importingTestContacts) {
      setTestModalOpen(false)
      setTestContacts([])
      setTestImportResult(null)
      setOpenCollapsibles(new Set())
    }
  }

  const toggleCollapsible = (contactId: number) => {
    setOpenCollapsibles(prev => {
      const newSet = new Set(prev)
      if (newSet.has(contactId)) {
        newSet.delete(contactId)
      } else {
        newSet.add(contactId)
      }
      return newSet
    })
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

      {loadingStatus ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
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

          <hr className="my-4" />

          {/* Botões de importação */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Button
                variant="default"
                onClick={handleOpenImportModal}
                disabled={syncing !== null || importJobStatus?.status === 'running'}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Importar contatos do Bling
              </Button>
              {importJobStatus?.status === 'running' && (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  Importação em andamento... ({importJobStatus.progressPercent}%)
                </p>
              )}
            </div>
            <Button
              variant="default"
              onClick={handleOpenTestModal}
              disabled={syncing !== null}
              className="flex-1"
            >
              <TestTube className="h-4 w-4 mr-2" />
              Testar importação de clientes
            </Button>
          </div>
        </>
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
                <Label className="text-sm font-semibold">Importar apenas contatos com:</Label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importFilters.email}
                      onChange={(e) => setImportFilters(prev => ({ ...prev, email: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Email</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importFilters.documento}
                      onChange={(e) => setImportFilters(prev => ({ ...prev, documento: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">
                      Documento ({allContacts.filter(c => {
                        const doc = c.numeroDocumento.replace(/\D/g, '')
                        return doc.length === 11 || doc.length === 14
                      }).length})
                    </span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importFilters.endereco}
                      onChange={(e) => setImportFilters(prev => ({ ...prev, endereco: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Endereço</span>
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
      {/* Modal de teste */}
      <Dialog open={testModalOpen} onOpenChange={handleCloseTestModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Testar importação de clientes</DialogTitle>
            <DialogDescription>
              {fetchingTestContacts
                ? "Buscando 5 contatos no Bling..."
                : testContacts.length > 0
                ? `Foram encontrados ${testContacts.length} contato(s) para teste. Revise os detalhes abaixo antes de importar.`
                : "Nenhum contato encontrado."}
            </DialogDescription>
          </DialogHeader>

          {fetchingTestContacts ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : testImportResult ? (
            <div className="space-y-4 py-4">
              <div className="p-4 rounded-md bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
                <p className="font-semibold">Importação concluída!</p>
                <p className="text-sm mt-1">
                  {testImportResult.importedCount} importado(s), {testImportResult.updatedCount} atualizado(s), {testImportResult.skippedCount} ignorado(s).
                </p>
                {testImportResult.errors && testImportResult.errors.length > 0 && (
                  <div className="mt-3 text-xs">
                    <p className="font-semibold">Erros encontrados:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      {testImportResult.errors.map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : testContacts.length > 0 ? (
            <div className="space-y-3 py-4">
              {/* Seção de debug: JSON completo */}
              <Collapsible>
                <CollapsibleHeader isOpen={false} className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">🔍 Debug: JSON completo retornado pelo Bling</span>
                  </div>
                </CollapsibleHeader>
                <CollapsibleContent className="px-4 pb-4 pt-2 bg-yellow-50/50 dark:bg-yellow-950/50">
                  <pre className="text-xs overflow-auto max-h-96 p-3 bg-white dark:bg-gray-900 border rounded-md">
                    {JSON.stringify(testContacts, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>

              {testContacts.map((contact) => {
                const formatted = formatContactForDisplay(contact)
                const cleanDoc = contact.numeroDocumento.replace(/\D/g, '')
                const formattedDoc = cleanDoc.length === 11 
                  ? formatCPF(cleanDoc) 
                  : cleanDoc.length === 14 
                  ? formatCNPJ(cleanDoc) 
                  : contact.numeroDocumento
                const isOpen = openCollapsibles.has(contact.id)

                return (
                  <Collapsible
                    key={contact.id}
                    open={isOpen}
                    onOpenChange={() => toggleCollapsible(contact.id)}
                  >
                    <CollapsibleHeader isOpen={isOpen} className="bg-muted/50">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex-1">
                          <p className="font-medium">{formatted.nome}</p>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            <span>{formattedDoc || "Sem documento"}</span>
                            {formatted.email && <span>• {formatted.email}</span>}
                          </div>
                        </div>
                      </div>
                    </CollapsibleHeader>
                    <CollapsibleContent className="px-4 pb-4 pt-2 bg-muted/20">
                      <div className="space-y-4">
                        {/* Dados gerais */}
                        <div>
                          <h4 className="font-semibold text-sm mb-2">Dados gerais</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Nome:</span>
                              <span className="ml-2">{formatted.nome}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Documento:</span>
                              <span className="ml-2">{formattedDoc || "—"}</span>
                            </div>
                            {formatted.email && (
                              <div>
                                <span className="text-muted-foreground">Email:</span>
                                <span className="ml-2">{formatted.email}</span>
                              </div>
                            )}
                            {formatted.celular && (
                              <div>
                                <span className="text-muted-foreground">Celular:</span>
                                <span className="ml-2">{formatted.celular}</span>
                              </div>
                            )}
                            {formatted.telefone && (
                              <div>
                                <span className="text-muted-foreground">Telefone:</span>
                                <span className="ml-2">{formatted.telefone}</span>
                              </div>
                            )}
                            <div>
                              <span className="text-muted-foreground">ID Bling:</span>
                              <span className="ml-2 font-mono text-xs">{contact.id}</span>
                            </div>
                          </div>
                        </div>

                        {/* Endereço */}
                        <div>
                          <h4 className="font-semibold text-sm mb-2">Endereço</h4>
                          {contact.endereco ? (
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {contact.endereco.endereco && (
                                <div>
                                  <span className="text-muted-foreground">Rua:</span>
                                  <span className="ml-2">{contact.endereco.endereco}</span>
                                </div>
                              )}
                              {contact.endereco.numero && (
                                <div>
                                  <span className="text-muted-foreground">Número:</span>
                                  <span className="ml-2">{contact.endereco.numero}</span>
                                </div>
                              )}
                              {contact.endereco.complemento && (
                                <div>
                                  <span className="text-muted-foreground">Complemento:</span>
                                  <span className="ml-2">{contact.endereco.complemento}</span>
                                </div>
                              )}
                              {contact.endereco.bairro && (
                                <div>
                                  <span className="text-muted-foreground">Bairro:</span>
                                  <span className="ml-2">{contact.endereco.bairro}</span>
                                </div>
                              )}
                              {contact.endereco.municipio && (
                                <div>
                                  <span className="text-muted-foreground">Cidade:</span>
                                  <span className="ml-2">{contact.endereco.municipio}</span>
                                </div>
                              )}
                              {contact.endereco.uf && (
                                <div>
                                  <span className="text-muted-foreground">UF:</span>
                                  <span className="ml-2">{contact.endereco.uf}</span>
                                </div>
                              )}
                              {contact.endereco.cep && (
                                <div>
                                  <span className="text-muted-foreground">CEP:</span>
                                  <span className="ml-2">{maskCEP(contact.endereco.cep)}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">Sem endereço cadastrado</p>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
          ) : null}

          <DialogFooter>
            {!testImportResult && (
              <>
                <Button
                  variant="outline"
                  onClick={handleCloseTestModal}
                  disabled={importingTestContacts}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmTestImport}
                  disabled={importingTestContacts || testContacts.length === 0}
                >
                  {importingTestContacts ? (
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
            {testImportResult && (
              <Button onClick={handleCloseTestModal}>
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
              <Label className="text-sm font-semibold">Importar apenas contatos com:</Label>
              <div className="space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importFilters.email}
                    onChange={(e) => setImportFilters(prev => ({ ...prev, email: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Email</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importFilters.documento}
                    onChange={(e) => setImportFilters(prev => ({ ...prev, documento: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">
                    Documento ({allContacts.filter(c => {
                      const doc = c.numeroDocumento.replace(/\D/g, '')
                      return doc.length === 11 || doc.length === 14
                    }).length})
                  </span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importFilters.endereco}
                    onChange={(e) => setImportFilters(prev => ({ ...prev, endereco: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Endereço</span>
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
    {/* Modal de teste - compartilhado com asSection */}
    <Dialog open={testModalOpen} onOpenChange={handleCloseTestModal}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Testar importação de clientes</DialogTitle>
          <DialogDescription>
            {fetchingTestContacts
              ? "Buscando 5 contatos no Bling..."
              : testContacts.length > 0
              ? `Foram encontrados ${testContacts.length} contato(s) para teste. Revise os detalhes abaixo antes de importar.`
              : "Nenhum contato encontrado."}
          </DialogDescription>
        </DialogHeader>

        {fetchingTestContacts ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : testImportResult ? (
          <div className="space-y-4 py-4">
            <div className="p-4 rounded-md bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
              <p className="font-semibold">Importação concluída!</p>
              <p className="text-sm mt-1">
                {testImportResult.importedCount} importado(s), {testImportResult.updatedCount} atualizado(s), {testImportResult.skippedCount} ignorado(s).
              </p>
              {testImportResult.errors && testImportResult.errors.length > 0 && (
                <div className="mt-3 text-xs">
                  <p className="font-semibold">Erros encontrados:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    {testImportResult.errors.map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : testContacts.length > 0 ? (
          <div className="space-y-3 py-4">
            {/* Seção de debug: JSON completo */}
            <Collapsible>
              <CollapsibleHeader isOpen={false} className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">🔍 Debug: JSON completo retornado pelo Bling</span>
                </div>
              </CollapsibleHeader>
              <CollapsibleContent className="px-4 pb-4 pt-2 bg-yellow-50/50 dark:bg-yellow-950/50">
                <pre className="text-xs overflow-auto max-h-96 p-3 bg-white dark:bg-gray-900 border rounded-md">
                  {JSON.stringify(testContacts, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>

            {testContacts.map((contact) => {
              const formatted = formatContactForDisplay(contact)
              const cleanDoc = contact.numeroDocumento.replace(/\D/g, '')
              const formattedDoc = cleanDoc.length === 11 
                ? formatCPF(cleanDoc) 
                : cleanDoc.length === 14 
                ? formatCNPJ(cleanDoc) 
                : contact.numeroDocumento
              const isOpen = openCollapsibles.has(contact.id)

              return (
                <Collapsible
                  key={contact.id}
                  open={isOpen}
                  onOpenChange={() => toggleCollapsible(contact.id)}
                >
                  <CollapsibleHeader isOpen={isOpen} className="bg-muted/50">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex-1">
                        <p className="font-medium">{formatted.nome}</p>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span>{formattedDoc || "Sem documento"}</span>
                          {formatted.email && <span>• {formatted.email}</span>}
                        </div>
                      </div>
                    </div>
                  </CollapsibleHeader>
                  <CollapsibleContent className="px-4 pb-4 pt-2 bg-muted/20">
                    <div className="space-y-4">
                      {/* Dados gerais */}
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Dados gerais</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Nome:</span>
                            <span className="ml-2">{formatted.nome}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Documento:</span>
                            <span className="ml-2">{formattedDoc || "—"}</span>
                          </div>
                          {formatted.email && (
                            <div>
                              <span className="text-muted-foreground">Email:</span>
                              <span className="ml-2">{formatted.email}</span>
                            </div>
                          )}
                          {formatted.celular && (
                            <div>
                              <span className="text-muted-foreground">Celular:</span>
                              <span className="ml-2">{formatted.celular}</span>
                            </div>
                          )}
                          {formatted.telefone && (
                            <div>
                              <span className="text-muted-foreground">Telefone:</span>
                              <span className="ml-2">{formatted.telefone}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-muted-foreground">ID Bling:</span>
                            <span className="ml-2 font-mono text-xs">{contact.id}</span>
                          </div>
                        </div>
                      </div>

                      {/* Endereço */}
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Endereço</h4>
                        {contact.endereco ? (
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {contact.endereco.endereco && (
                              <div>
                                <span className="text-muted-foreground">Rua:</span>
                                <span className="ml-2">{contact.endereco.endereco}</span>
                              </div>
                            )}
                            {contact.endereco.numero && (
                              <div>
                                <span className="text-muted-foreground">Número:</span>
                                <span className="ml-2">{contact.endereco.numero}</span>
                              </div>
                            )}
                            {contact.endereco.complemento && (
                              <div>
                                <span className="text-muted-foreground">Complemento:</span>
                                <span className="ml-2">{contact.endereco.complemento}</span>
                              </div>
                            )}
                            {contact.endereco.bairro && (
                              <div>
                                <span className="text-muted-foreground">Bairro:</span>
                                <span className="ml-2">{contact.endereco.bairro}</span>
                              </div>
                            )}
                            {contact.endereco.municipio && (
                              <div>
                                <span className="text-muted-foreground">Cidade:</span>
                                <span className="ml-2">{contact.endereco.municipio}</span>
                              </div>
                            )}
                            {contact.endereco.uf && (
                              <div>
                                <span className="text-muted-foreground">UF:</span>
                                <span className="ml-2">{contact.endereco.uf}</span>
                              </div>
                            )}
                            {contact.endereco.cep && (
                              <div>
                                <span className="text-muted-foreground">CEP:</span>
                                <span className="ml-2">{maskCEP(contact.endereco.cep)}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Sem endereço cadastrado</p>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        ) : null}

        <DialogFooter>
          {!testImportResult && (
            <>
              <Button
                variant="outline"
                onClick={handleCloseTestModal}
                disabled={importingTestContacts}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmTestImport}
                disabled={importingTestContacts || testContacts.length === 0}
              >
                {importingTestContacts ? (
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
          {testImportResult && (
            <Button onClick={handleCloseTestModal}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
