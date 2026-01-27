"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Loader2, User, Search } from "lucide-react"
import { clientsApi } from "@/lib/api"
import { formatCPF } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface Client {
  id: number
  name: string
  cpf: string
  email?: string
  whatsapp?: string
}

interface ClientSearchProps {
  value?: number | null
  onSelect: (client: Client | null) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function ClientSearch({
  value,
  onSelect,
  placeholder = "Buscar cliente por nome ou CPF...",
  className,
  disabled = false,
}: ClientSearchProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [results, setResults] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Carregar cliente selecionado se value for fornecido
  useEffect(() => {
    if (value && !selectedClient) {
      loadClient(value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowResults(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const loadClient = async (clientId: number) => {
    try {
      const client = await clientsApi.get(clientId)
      setSelectedClient(client)
      setSearchTerm(`${client.name} - ${formatCPF(client.cpf)}`)
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Erro ao carregar cliente:", error)
      }
    }
  }

  const searchClients = async (term: string) => {
    if (!term || term.length < 2) {
      setResults([])
      setShowResults(false)
      return
    }

    setLoading(true)
    try {
      const response = await clientsApi.list({
        search: term,
        per_page: 10,
      })
      setResults(response.data)
      setShowResults(true)
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Erro ao buscar clientes:", error)
      }
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value
    setSearchTerm(term)

    // Limpar seleção se usuário apagar tudo
    if (!term) {
      setSelectedClient(null)
      onSelect(null)
      setResults([])
      setShowResults(false)
      return
    }

    // Debounce da busca
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      searchClients(term)
    }, 300)
  }

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client)
    setSearchTerm(`${client.name} - ${formatCPF(client.cpf)}`)
    setShowResults(false)
    onSelect(client)
    inputRef.current?.blur()
  }

  const handleInputFocus = () => {
    if (searchTerm && results.length > 0) {
      setShowResults(true)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowResults(false)
      inputRef.current?.blur()
    } else if (e.key === "ArrowDown" && results.length > 0) {
      e.preventDefault()
      // Focar no primeiro resultado (implementação básica)
      const firstResult = document.querySelector(
        '[data-client-result="0"]'
      ) as HTMLElement
      firstResult?.focus()
    }
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Dropdown de resultados */}
      {showResults && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
          {results.map((client, index) => (
            <button
              key={client.id}
              type="button"
              data-client-result={index}
              onClick={() => handleSelectClient(client)}
              className={cn(
                "w-full px-4 py-3 text-left hover:bg-accent hover:text-accent-foreground transition-colors",
                "flex items-center gap-3",
                selectedClient?.id === client.id && "bg-accent"
              )}
            >
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{client.name}</div>
                <div className="text-sm text-muted-foreground">
                  {formatCPF(client.cpf)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Mensagem quando não há resultados */}
      {showResults &&
        !loading &&
        searchTerm.length >= 2 &&
        results.length === 0 && (
          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg p-4 text-center text-sm text-muted-foreground">
            Nenhum cliente encontrado
          </div>
        )}
    </div>
  )
}
