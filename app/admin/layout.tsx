"use client"

import { useState, useEffect, useRef } from "react"
import { ProtectedRoute, useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { LogOut, ShoppingCart, Users, Package, BarChart3, Truck, Settings, Braces, FileText, ChevronDown } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  const produtosRef = useRef<HTMLDivElement>(null)
  const configRef = useRef<HTMLDivElement>(null)

  const handleLogout = async () => {
    await logout()
    router.push("/login")
  }

  const isActive = (path: string) => pathname === path
  const isActiveWithChildren = (path: string) => pathname === path || (pathname?.startsWith(path + '/') ?? false)
  const navLinkClass = (active: boolean) =>
    `rounded-none border-b-2 ${active ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-primary'}`

  // Fechar submenu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (produtosRef.current && !produtosRef.current.contains(event.target as Node)) {
        if (configRef.current && !configRef.current.contains(event.target as Node)) {
          setOpenSubmenu(null)
        }
      }
    }

    if (openSubmenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openSubmenu])

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin/dashboard" className="flex items-center">
                <img
                  src="/logo.png"
                  alt="Cenario Logo"
                  className="h-10 w-auto object-contain"
                />
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">{user?.email}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </Button>
            </div>
          </div>
        </header>

        {/* Navigation */}
        <nav className="fixed top-[65px] left-0 right-0 z-40 bg-white border-b">
          <div className="container mx-auto px-4 pt-3">
            <div className="flex gap-4 relative">
              <Link href="/admin/dashboard">
                <Button variant="ghost" className={navLinkClass(isActive('/admin/dashboard'))}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <Link href="/admin/shipping">
                <Button variant="ghost" className={navLinkClass(isActive('/admin/shipping'))}>
                  <Truck className="h-4 w-4 mr-2" />
                  Frete
                </Button>
              </Link>
              <Link href="/admin/clients">
                <Button variant="ghost" className={navLinkClass(isActive('/admin/clients') || isActiveWithChildren('/admin/clients'))}>
                  <Users className="h-4 w-4 mr-2" />
                  Clientes
                </Button>
              </Link>
              <Link href="/admin/orders">
                <Button variant="ghost" className={navLinkClass(isActive('/admin/orders') || isActiveWithChildren('/admin/orders'))}>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Pedidos
                </Button>
              </Link>
              
              {/* Produtos com submenu */}
              <div className="relative" ref={produtosRef}>
                <Button 
                  variant="ghost" 
                  className={navLinkClass(isActive('/admin/products') || isActive('/admin/products/categories') || isActiveWithChildren('/admin/products'))}
                  onClick={(e) => {
                    e.preventDefault()
                    setOpenSubmenu(openSubmenu === 'produtos' ? null : 'produtos')
                  }}
                >
                  <Package className="h-4 w-4 mr-2" />
                  Produtos
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
                {openSubmenu === 'produtos' && (
                  <div className="absolute top-full left-0 mt-1 bg-white border rounded-md shadow-lg min-w-[200px] z-50">
                    <Link href="/admin/products/categories" onClick={() => setOpenSubmenu(null)}>
                      <Button 
                        variant="ghost" 
                        className={`w-full justify-start rounded-none ${isActive('/admin/products/categories') || isActiveWithChildren('/admin/products/categories') ? 'bg-muted' : ''}`}
                      >
                        Categorias
                      </Button>
                    </Link>
                    <Link href="/admin/products" onClick={() => setOpenSubmenu(null)}>
                      <Button 
                        variant="ghost" 
                        className={`w-full justify-start rounded-none ${isActive('/admin/products') && !isActive('/admin/products/categories') ? 'bg-muted' : ''}`}
                      >
                        Produtos
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              {/* Configurações com submenu */}
              <div className="relative" ref={configRef}>
                <Button 
                  variant="ghost" 
                  className={navLinkClass(isActive('/admin/settings') || isActive('/admin/integrations') || isActive('/admin/logs') || isActiveWithChildren('/admin/settings') || isActiveWithChildren('/admin/integrations') || isActiveWithChildren('/admin/logs'))}
                  onClick={(e) => {
                    e.preventDefault()
                    setOpenSubmenu(openSubmenu === 'configuracoes' ? null : 'configuracoes')
                  }}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Configurações
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
                {openSubmenu === 'configuracoes' && (
                  <div className="absolute top-full left-0 mt-1 bg-white border rounded-md shadow-lg min-w-[220px] z-50">
                    <Link href="/admin/settings" onClick={() => setOpenSubmenu(null)}>
                      <Button 
                        variant="ghost" 
                        className={`w-full justify-start rounded-none ${isActive('/admin/settings') || isActiveWithChildren('/admin/settings') ? 'bg-muted' : ''}`}
                      >
                        Configurações Gerais
                      </Button>
                    </Link>
                    <Link href="/admin/integrations" onClick={() => setOpenSubmenu(null)}>
                      <Button 
                        variant="ghost" 
                        className={`w-full justify-start rounded-none ${isActive('/admin/integrations') || isActiveWithChildren('/admin/integrations') ? 'bg-muted' : ''}`}
                      >
                        Integrações
                      </Button>
                    </Link>
                    <Link href="/admin/logs" onClick={() => setOpenSubmenu(null)}>
                      <Button 
                        variant="ghost" 
                        className={`w-full justify-start rounded-none ${isActive('/admin/logs') || isActiveWithChildren('/admin/logs') ? 'bg-muted' : ''}`}
                      >
                        Logs
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </nav>

        {/* Content */}
        <main className="container mx-auto px-4 py-8 pt-[140px]">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  )
}
