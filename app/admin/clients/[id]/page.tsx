"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Save, Plus, Trash2 } from "lucide-react"
import { clientsApi, cepApi } from "@/lib/api"
import { formatCPF, formatCNPJ, formatPhone, maskPhone, maskCEP, unmaskPhone, unmaskCEP } from "@/lib/utils"
import { toast } from "@/lib/toast"

export default function ClientFormPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const isNew = id === 'new'

  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(!isNew)
  const [formData, setFormData] = useState({
    cpf: '',
    cnpj: '',
    name: '',
    email: '',
    phone: '',
    whatsapp: '',
    bling_contact_id: '',
    addresses: [] as any[]
  })

  useEffect(() => {
    if (!isNew) {
      loadClient()
    }
  }, [id])

  const loadClient = async () => {
    try {
      setLoadingData(true)
      const client = await clientsApi.get(parseInt(id))
      setFormData({
        cpf: client.cpf ? formatCPF(client.cpf) : '',
        cnpj: client.cnpj ? formatCNPJ(client.cnpj) : '',
        name: client.name || '',
        email: client.email || '',
        phone: client.phone ? maskPhone(client.phone) : '',
        whatsapp: client.whatsapp ? maskPhone(client.whatsapp) : '',
        bling_contact_id: client.bling_contact_id != null ? String(client.bling_contact_id) : '',
        addresses: client.addresses || []
      })
    } catch (error) {
      console.error('Erro ao carregar cliente:', error)
    } finally {
      setLoadingData(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Preparar dados para envio: trim no nome; CPF/CNPJ/CEP sem máscara; phone/whatsapp com máscara; bling_contact_id normalizado
      const blingIdTrimmed = formData.bling_contact_id?.trim() ?? ''
      const blingContactIdValue = blingIdTrimmed === '' ? null : (Number(blingIdTrimmed) || null)
      const dataToSend = {
        ...formData,
        name: formData.name.trim(),
        cpf: formData.cpf.replace(/\D/g, ''),
        cnpj: formData.cnpj ? formData.cnpj.replace(/\D/g, '') : '',
        phone: formData.phone ? formData.phone.trim() : '',
        whatsapp: formData.whatsapp ? formData.whatsapp.trim() : '',
        bling_contact_id: blingContactIdValue,
        addresses: formData.addresses.map(addr => ({
          ...addr,
          cep: addr.cep ? unmaskCEP(addr.cep) : ''
        }))
      }

      if (isNew) {
        await clientsApi.create(dataToSend)
      } else {
        await clientsApi.update(parseInt(id), dataToSend)
      }
      toast.success(isNew ? 'Cliente cadastrado com sucesso.' : 'Cliente atualizado com sucesso.')
      router.push('/admin/clients')
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar cliente')
      setLoading(false)
    }
  }

  const handleCepSearch = async (index: number) => {
    const address = formData.addresses[index]
    const cleanCep = unmaskCEP(address.cep)
    if (!cleanCep || cleanCep.length !== 8) {
      toast.warning('CEP inválido')
      return
    }

    try {
      const cepData = await cepApi.search(cleanCep)
      const newAddresses = [...formData.addresses]
      newAddresses[index] = {
        ...newAddresses[index],
        street: cepData.street || '',
        neighborhood: cepData.neighborhood || '',
        city: cepData.city || '',
        state: cepData.state || ''
      }
      setFormData({ ...formData, addresses: newAddresses })
    } catch (error: any) {
      toast.error(error.message || 'Erro ao buscar CEP')
    }
  }

  const addAddress = () => {
    setFormData({
      ...formData,
      addresses: [...formData.addresses, {
        cep: '',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
        is_default: formData.addresses.length === 0
      }]
    })
  }

  const removeAddress = (index: number) => {
    const newAddresses = formData.addresses.filter((_, i) => i !== index)
    setFormData({ ...formData, addresses: newAddresses })
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{isNew ? 'Novo Cliente' : 'Editar Cliente'}</h2>
        <p className="text-muted-foreground">
          {isNew ? 'Cadastre um novo cliente no sistema' : 'Edite as informações do cliente'}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Dados do Cliente</CardTitle>
            <CardDescription>Informações básicas do cliente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF *</Label>
                <Input
                  id="cpf"
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: formatCPF(e.target.value) })}
                  placeholder="000.000.000-00"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  value={formData.cnpj}
                  onChange={(e) => setFormData({ ...formData, cnpj: formatCNPJ(e.target.value) })}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: maskPhone(e.target.value) })}
                  placeholder="+55 (00) 0000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp *</Label>
                <Input
                  id="whatsapp"
                  value={formData.whatsapp}
                  onChange={(e) => setFormData({ ...formData, whatsapp: maskPhone(e.target.value) })}
                  placeholder="+55 (00) 99999-9999"
                  required
                />
              </div>
              {!isNew && (
                <div className="space-y-2">
                  <Label htmlFor="bling_contact_id">ID Contato Bling</Label>
                  <Input
                    id="bling_contact_id"
                    type="text"
                    inputMode="numeric"
                    value={formData.bling_contact_id}
                    onChange={(e) => setFormData({ ...formData, bling_contact_id: e.target.value.replace(/\D/g, '') })}
                    placeholder="Ex.: 123456"
                  />
                  <p className="text-xs text-muted-foreground">ID do contato no Bling (opcional)</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Endereços</CardTitle>
                <CardDescription>Endereços de entrega do cliente</CardDescription>
              </div>
              <Button type="button" variant="outline" onClick={addAddress}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Endereço
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {formData.addresses.map((address, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Endereço {index + 1}</Label>
                  {formData.addresses.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAddress(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <div className="flex gap-2">
                      <Input
                        value={address.cep}
                        onChange={async (e) => {
                          const newAddresses = [...formData.addresses]
                          newAddresses[index].cep = maskCEP(e.target.value)
                          setFormData({ ...formData, addresses: newAddresses })
                          const cleanCep = unmaskCEP(newAddresses[index].cep)
                          if (cleanCep.length === 8) {
                            try {
                              const cepData = await cepApi.search(cleanCep)
                              const updated = [...formData.addresses]
                              updated[index] = {
                                ...updated[index],
                                cep: newAddresses[index].cep,
                                street: cepData.street || updated[index].street,
                                neighborhood: cepData.neighborhood || updated[index].neighborhood,
                                city: cepData.city || updated[index].city,
                                state: cepData.state || updated[index].state,
                              }
                              setFormData({ ...formData, addresses: updated })
                            } catch (err: any) {
                              toast.error(err.message || 'Erro ao buscar CEP')
                            }
                          }
                        }}
                        placeholder="00000-000"
                        maxLength={9}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleCepSearch(index)}
                      >
                        Buscar
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Rua</Label>
                    <Input
                      value={address.street}
                      onChange={(e) => {
                        const newAddresses = [...formData.addresses]
                        newAddresses[index].street = e.target.value
                        setFormData({ ...formData, addresses: newAddresses })
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Número</Label>
                    <Input
                      value={address.number}
                      onChange={(e) => {
                        const newAddresses = [...formData.addresses]
                        newAddresses[index].number = e.target.value
                        setFormData({ ...formData, addresses: newAddresses })
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Bairro</Label>
                    <Input
                      value={address.neighborhood}
                      onChange={(e) => {
                        const newAddresses = [...formData.addresses]
                        newAddresses[index].neighborhood = e.target.value
                        setFormData({ ...formData, addresses: newAddresses })
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input
                      value={address.city}
                      onChange={(e) => {
                        const newAddresses = [...formData.addresses]
                        newAddresses[index].city = e.target.value
                        setFormData({ ...formData, addresses: newAddresses })
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>UF</Label>
                    <Input
                      value={address.state}
                      onChange={(e) => {
                        const newAddresses = [...formData.addresses]
                        newAddresses[index].state = e.target.value.toUpperCase().substring(0, 2)
                        setFormData({ ...formData, addresses: newAddresses })
                      }}
                      maxLength={2}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-3">
                    <Label>Complemento</Label>
                    <Input
                      value={address.complement}
                      onChange={(e) => {
                        const newAddresses = [...formData.addresses]
                        newAddresses[index].complement = e.target.value
                        setFormData({ ...formData, addresses: newAddresses })
                      }}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-3">
                    <Label>
                      <input
                        type="checkbox"
                        checked={address.is_default}
                        onChange={(e) => {
                          const newAddresses = formData.addresses.map((addr, i) => ({
                            ...addr,
                            is_default: i === index ? e.target.checked : false
                          }))
                          setFormData({ ...formData, addresses: newAddresses })
                        }}
                        className="mr-2"
                      />
                      Endereço padrão
                    </Label>
                  </div>
                </div>
              </div>
            ))}
            {formData.addresses.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum endereço cadastrado. Clique em "Adicionar Endereço" para adicionar.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-4 mt-6">
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar
              </>
            )}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  )
}
