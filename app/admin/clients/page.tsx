"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, MessageCircle, Plus, Edit, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, ArrowUpDown, ArrowUp, ArrowDown, MoreHorizontal, Send } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { clientsApi, blingApi } from "@/lib/api"
import { formatPhone, formatCPF, formatDateTime } from "@/lib/utils"
import { toast } from "@/lib/toast"

export default function ClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<string>("created_at")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [actionsOpenClientId, setActionsOpenClientId] = useState<number | null>(null)
  const [blingSyncingClientId, setBlingSyncingClientId] = useState<number | null>(null)
  const [pagination, setPagination] = useState({
    current_page: 1,
    per_page: 20,
    total: 0,
    last_page: 1,
    from: 0,
    to: 0,
  })

  const loadClients = async () => {
    setLoading(true)
    try {
      const params: any = {
        page: pagination.current_page,
        per_page: pagination.per_page,
        sort: sortBy,
        order: sortOrder,
      }

      if (search) {
        params.search = search
      }

      const response = await clientsApi.list(params)
      setClients(response.data)
      setPagination({
        current_page: response.current_page,
        per_page: response.per_page,
        total: response.total,
        last_page: response.last_page,
        from: response.from,
        to: response.to,
      })
    } catch (error) {
      console.error("Erro ao carregar clientes:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClients()
  }, [pagination.current_page, sortBy, sortOrder])

  const handleSearch = () => {
    setPagination((prev) => ({ ...prev, current_page: 1 }))
    loadClients()
  }

  const handlePageChange = (page: number) => {
    setPagination((prev) => ({ ...prev, current_page: page }))
  }

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortBy(column)
      setSortOrder("asc")
    }
    setPagination((prev) => ({ ...prev, current_page: 1 }))
  }

  const getSortIcon = (column: string) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 text-muted-foreground" />
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="h-4 w-4 ml-1 text-primary" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1 text-primary" />
    )
  }

  const getPageNumbers = () => {
    const pages = []
    const maxVisible = 5
    let start = Math.max(1, pagination.current_page - Math.floor(maxVisible / 2))
    let end = Math.min(pagination.last_page, start + maxVisible - 1)
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1)
    }
    for (let i = start; i <= end; i++) {
      pages.push(i)
    }
    return pages
  }

  const handleSyncToBling = async (clientId: number) => {
    setBlingSyncingClientId(clientId)
    try {
      const res = await blingApi.syncClient(clientId)
      toast.success(res.message ?? "Cliente enviado ao Bling com sucesso.")
      loadClients() // Recarregar lista para atualizar bling_contact_id
    } catch (err: any) {
      const message = err.message ?? "Erro ao enviar cliente ao Bling."
      toast.error(message)
    } finally {
      setBlingSyncingClientId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Clientes</h2>
          <p className="text-muted-foreground">Gerencie todos os clientes cadastrados</p>
        </div>
        <Button onClick={() => router.push('/admin/clients/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Cliente
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg border space-y-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CPF, telefone ou WhatsApp..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9"
            />
          </div>
          <Button onClick={handleSearch}>Buscar</Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-lg border">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhum cliente encontrado</p>
          </div>
        ) : (
          <>
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-white">
                    <TableHead className="sticky top-0 z-10 bg-white">
                      <button
                        onClick={() => handleSort("name")}
                        className="flex items-center hover:text-primary transition-colors"
                      >
                        Nome
                        {getSortIcon("name")}
                      </button>
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-white">
                      <button
                        onClick={() => handleSort("cpf")}
                        className="flex items-center hover:text-primary transition-colors"
                      >
                        CPF
                        {getSortIcon("cpf")}
                      </button>
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-white">WhatsApp</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-white">Email</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-white">ID Bling</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-white">Endereços</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-white">
                      <button
                        onClick={() => handleSort("created_at")}
                        className="flex items-center hover:text-primary transition-colors"
                      >
                        Criado em
                        {getSortIcon("created_at")}
                      </button>
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-white">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell>{formatCPF(client.cpf) || "—"}</TableCell>
                    <TableCell>
                      <a
                        href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-green-600 hover:underline"
                      >
                        <MessageCircle className="h-4 w-4" />
                        {formatPhone(client.whatsapp)}
                      </a>
                    </TableCell>
                    <TableCell>{client.email || "—"}</TableCell>
                    <TableCell>
                      {client.bling_contact_id ? (
                        <span className="text-sm text-muted-foreground font-mono">
                          {client.bling_contact_id}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{client.addresses?.length || 0} endereço(s)</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(client.created_at)}
                    </TableCell>
                    <TableCell>
                      <Popover open={actionsOpenClientId === client.id} onOpenChange={(open) => setActionsOpenClientId(open ? client.id : null)}>
                        <PopoverTrigger asChild>
                          <Button size="sm" className="h-8 bg-primary text-primary-foreground hover:bg-primary/90">
                            <MoreHorizontal className="h-5 w-5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-1" align="end">
                          <div className="flex flex-col gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="justify-start gap-2"
                              onClick={() => { setActionsOpenClientId(null); router.push(`/admin/clients/${client.id}`) }}
                            >
                              <Edit className="h-4 w-4" />
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="justify-start gap-2"
                              disabled={blingSyncingClientId === client.id}
                              onClick={() => { setActionsOpenClientId(null); handleSyncToBling(client.id) }}
                            >
                              {blingSyncingClientId === client.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4" />
                              )}
                              Enviar ao Bling
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>

            {/* Paginação */}
            {pagination.last_page > 1 && (
              <div className="flex items-center justify-between p-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Mostrando {pagination.from} a {pagination.to} de {pagination.total} resultados
                </p>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(1)}
                    disabled={pagination.current_page === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.current_page - 1)}
                    disabled={pagination.current_page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {getPageNumbers().map((page) => (
                    <Button
                      key={page}
                      variant={page === pagination.current_page ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePageChange(page)}
                    >
                      {page}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.current_page + 1)}
                    disabled={pagination.current_page === pagination.last_page}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.last_page)}
                    disabled={pagination.current_page === pagination.last_page}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
