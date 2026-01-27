"use client"

import { toast as sonnerToast } from 'sonner'
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react'

export const toast = {
  success: (message: string, options?: any) => {
    sonnerToast.success(message, {
      icon: <CheckCircle2 className="h-5 w-5" />,
      duration: 3000,
      ...options,
    })
  },
  error: (message: string, options?: any) => {
    sonnerToast.error(message, {
      icon: <XCircle className="h-5 w-5" />,
      duration: 5000,
      ...options,
    })
  },
  warning: (message: string, options?: any) => {
    sonnerToast.warning(message, {
      icon: <AlertTriangle className="h-5 w-5" />,
      duration: 4000,
      ...options,
    })
  },
  info: (message: string, options?: any) => {
    sonnerToast.info(message, {
      icon: <Info className="h-5 w-5" />,
      duration: 3000,
      ...options,
    })
  },
}
