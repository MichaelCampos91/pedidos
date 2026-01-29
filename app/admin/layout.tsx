"use client"

import { ProtectedRoute, useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { LogOut, ShoppingCart, Users, Package, BarChart3, Truck, Settings, Braces, FileText } from "lucide-react"
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

  const handleLogout = async () => {
    await logout()
    router.push("/login")
  }

  const isActive = (path: string) => pathname === path

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <header className="bg-white border-b">
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
        <nav className="bg-white border-b">
          <div className="container mx-auto px-4">
            <div className="flex gap-4">
              <Link href="/admin/dashboard">
                <Button 
                  variant="ghost" 
                  className={`rounded-none border-b-2 ${isActive('/admin/dashboard') ? 'border-primary' : 'border-transparent'} hover:border-primary`}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <Link href="/admin/logs">
                <Button 
                  variant="ghost" 
                  className={`rounded-none border-b-2 ${isActive('/admin/logs') || pathname?.startsWith('/admin/logs/') ? 'border-primary' : 'border-transparent'} hover:border-primary`}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Logs
                </Button>
              </Link>
              <Link href="/admin/orders">
                <Button 
                  variant="ghost" 
                  className={`rounded-none border-b-2 ${isActive('/admin/orders') || pathname?.startsWith('/admin/orders/') ? 'border-primary' : 'border-transparent'} hover:border-primary`}
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Pedidos
                </Button>
              </Link>
              <Link href="/admin/clients">
                <Button 
                  variant="ghost" 
                  className={`rounded-none border-b-2 ${isActive('/admin/clients') || pathname?.startsWith('/admin/clients/') ? 'border-primary' : 'border-transparent'} hover:border-primary`}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Clientes
                </Button>
              </Link>
              <Link href="/admin/products">
                <Button 
                  variant="ghost" 
                  className={`rounded-none border-b-2 ${isActive('/admin/products') ? 'border-primary' : 'border-transparent'} hover:border-primary`}
                >
                  <Package className="h-4 w-4 mr-2" />
                  Produtos
                </Button>
              </Link>
              <Link href="/admin/shipping">
                <Button 
                  variant="ghost" 
                  className={`rounded-none border-b-2 ${isActive('/admin/shipping') ? 'border-primary' : 'border-transparent'} hover:border-primary`}
                >
                  <Truck className="h-4 w-4 mr-2" />
                  Frete
                </Button>
              </Link>
              <Link href="/admin/integrations">
                <Button 
                  variant="ghost" 
                  className={`rounded-none border-b-2 ${isActive('/admin/integrations') || pathname?.startsWith('/admin/integrations/') ? 'border-primary' : 'border-transparent'} hover:border-primary`}
                >
                  <Braces className="h-4 w-4 mr-2" />
                  Integrações
                </Button>
              </Link>
              <Link href="/admin/settings">
                <Button 
                  variant="ghost" 
                  className={`rounded-none border-b-2 ${isActive('/admin/settings') || pathname?.startsWith('/admin/settings/') ? 'border-primary' : 'border-transparent'} hover:border-primary`}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Configurações
                </Button>
              </Link>
            </div>
          </div>
        </nav>

        {/* Content */}
        <main className="container mx-auto px-4 py-8">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  )
}
