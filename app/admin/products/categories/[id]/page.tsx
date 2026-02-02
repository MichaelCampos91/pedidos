"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Save } from "lucide-react"
import { productCategoriesApi } from "@/lib/api"
import { toast } from "@/lib/toast"

export default function ProductCategoryFormPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const isNew = id === "new"

  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(!isNew)
  const [formData, setFormData] = useState({ name: "", description: "" })

  useEffect(() => {
    if (!isNew) {
      loadCategory()
    }
  }, [id])

  const loadCategory = async () => {
    try {
      setLoadingData(true)
      const cat = await productCategoriesApi.get(parseInt(id))
      setFormData({
        name: cat.name || "",
        description: cat.description || "",
      })
    } catch (error) {
      console.error("Erro ao carregar categoria:", error)
      toast.error("Erro ao carregar categoria")
    } finally {
      setLoadingData(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast.warning("Nome da categoria é obrigatório")
      return
    }
    setLoading(true)
    try {
      if (isNew) {
        await productCategoriesApi.create(formData)
        toast.success("Categoria criada com sucesso")
      } else {
        await productCategoriesApi.update(parseInt(id), formData)
        toast.success("Categoria atualizada com sucesso")
      }
      router.push("/admin/products/categories")
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar categoria")
      setLoading(false)
    }
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
        <h2 className="text-2xl font-bold">{isNew ? "Nova Categoria" : "Editar Categoria"}</h2>
        <p className="text-muted-foreground">
          {isNew ? "Cadastre uma nova categoria de produtos" : "Edite as informações da categoria"}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Dados da Categoria</CardTitle>
            <CardDescription>Nome e descrição da categoria</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="Ex.: Eletrônicos"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <textarea
                id="description"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Opcional"
              />
            </div>
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
