"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, MapPin, Search } from "lucide-react"
import { cepApi } from "@/lib/api"
import { cn } from "@/lib/utils"

interface AddressFormData {
  cep: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  is_default: boolean
}

interface AddressFormProps {
  clientId: number
  onSave: (address: AddressFormData) => Promise<void>
  onCancel?: () => void
  className?: string
}

export function AddressForm({
  clientId,
  onSave,
  onCancel,
  className,
}: AddressFormProps) {
  const [formData, setFormData] = useState<AddressFormData>({
    cep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    is_default: false,
  })
  const [loading, setLoading] = useState(false)
  const [searchingCep, setSearchingCep] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCepSearch = async () => {
    const cleanCep = formData.cep.replace(/\D/g, "")
    if (cleanCep.length !== 8) {
      setError("CEP inválido. Digite 8 dígitos.")
      return
    }

    setSearchingCep(true)
    setError(null)

    try {
      const cepData = await cepApi.search(formData.cep)
      setFormData((prev) => ({
        ...prev,
        street: cepData.street || "",
        neighborhood: cepData.neighborhood || "",
        city: cepData.city || "",
        state: cepData.state || "",
      }))
    } catch (error: any) {
      setError(error.message || "Erro ao buscar CEP")
    } finally {
      setSearchingCep(false)
    }
  }

  const handleInputChange = (
    field: keyof AddressFormData,
    value: string | boolean
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleSave = async () => {
    setError(null)

    // Validações
    if (!formData.cep || !formData.street || !formData.number || !formData.city || !formData.state) {
      setError("Preencha todos os campos obrigatórios")
      return
    }

    const cleanCep = formData.cep.replace(/\D/g, "")
    if (cleanCep.length !== 8) {
      setError("CEP inválido")
      return
    }

    setLoading(true)
    try {
      await onSave({
        ...formData,
        cep: cleanCep,
      })
      // Reset form após salvar
      setFormData({
        cep: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
        is_default: false,
      })
    } catch (error: any) {
      setError(error.message || "Erro ao salvar endereço")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="cep">CEP *</Label>
          <div className="relative">
            <Input
              id="cep"
              value={formData.cep}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "")
                const formatted = value.replace(/(\d{5})(\d)/, "$1-$2")
                handleInputChange("cep", formatted)
              }}
              placeholder="00000-000"
              maxLength={9}
              disabled={loading || searchingCep}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCepSearch}
              disabled={loading || searchingCep || !formData.cep}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
            >
              {searchingCep ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="number">Número *</Label>
          <Input
            id="number"
            value={formData.number}
            onChange={(e) => handleInputChange("number", e.target.value)}
            placeholder="123"
            required
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="street">Rua *</Label>
        <Input
          id="street"
          value={formData.street}
          onChange={(e) => handleInputChange("street", e.target.value)}
          placeholder="Rua, Avenida, etc."
          required
          disabled={loading}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="complement">Complemento</Label>
          <Input
            id="complement"
            value={formData.complement}
            onChange={(e) => handleInputChange("complement", e.target.value)}
            placeholder="Apartamento, bloco, etc."
            disabled={loading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="neighborhood">Bairro</Label>
          <Input
            id="neighborhood"
            value={formData.neighborhood}
            onChange={(e) => handleInputChange("neighborhood", e.target.value)}
            placeholder="Bairro"
            disabled={loading}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="city">Cidade *</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => handleInputChange("city", e.target.value)}
            placeholder="Cidade"
            required
            disabled={loading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">Estado *</Label>
          <Input
            id="state"
            value={formData.state}
            onChange={(e) =>
              handleInputChange("state", e.target.value.toUpperCase())
            }
            placeholder="SP"
            maxLength={2}
            required
            disabled={loading}
          />
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="is_default"
          checked={formData.is_default}
          onChange={(e) => handleInputChange("is_default", e.target.checked)}
          disabled={loading}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <Label htmlFor="is_default" className="cursor-pointer">
          Tornar este endereço padrão
        </Label>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" onClick={handleSave} disabled={loading} className="flex-1">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <MapPin className="mr-2 h-4 w-4" />
              Salvar Endereço
            </>
          )}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </Button>
        )}
      </div>
    </div>
  )
}
