"use client"

import React from "react"
import { Check, FileText, CreditCard, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Step {
  id: number
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

interface CheckoutStepsProps {
  currentStep: number
  steps: Step[]
}

export function CheckoutSteps({ currentStep, steps }: CheckoutStepsProps) {
  if (!steps || steps.length === 0) {
    return null
  }

  return (
    <div className="w-full">
      <div className="flex items-start">
        {steps.map((step, index) => {
          // Usar índice do array + 1 para comparação mais confiável
          const stepNumber = index + 1
          const isActive = currentStep === stepNumber
          const isCompleted = currentStep > stepNumber
          
          // Fallback para ícone padrão se inválido
          const Icon = (step.icon && typeof step.icon === 'function') ? step.icon : FileText

          return (
            <React.Fragment key={step.id || index}>
              <div className="flex flex-col items-center flex-1 min-w-0">
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors shrink-0",
                    isCompleted
                      ? "bg-primary border-primary text-primary-foreground"
                      : isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted bg-background text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <div className="mt-2 text-center w-full px-1">
                  <p
                    className={cn(
                      "text-sm font-medium break-words",
                      isActive ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {step.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 break-words">
                    {step.description}
                  </p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 mt-5 transition-colors shrink-0",
                    isCompleted ? "bg-primary" : "bg-muted"
                  )}
                  style={{ 
                    flex: '1 1 0%',
                    minWidth: '1rem'
                  }}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
