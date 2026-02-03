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
      {/* Linha 1: ícones e traços */}
      <div className="flex items-center">
        {steps.map((step, index) => {
          const stepNumber = index + 1
          const isActive = currentStep === stepNumber
          const isCompleted = currentStep > stepNumber
          const Icon = step.icon ?? FileText

          return (
            <React.Fragment key={step.id || index}>
              <div className="flex flex-col items-center flex-1 min-w-0 shrink-0">
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
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 transition-colors shrink-0",
                    isCompleted ? "bg-primary" : "bg-muted"
                  )}
                  style={{
                    flex: "1 1 0%",
                    minWidth: "1rem",
                  }}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* Linha 2: títulos e descrições (mesma estrutura da linha 1 para alinhar com os ícones) */}
      <div className="flex items-start mt-2">
        {steps.map((step, index) => {
          const stepNumber = index + 1
          const isActive = currentStep === stepNumber

          return (
            <React.Fragment key={step.id ?? index}>
              <div className="flex-1 min-w-0 text-center px-1">
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
              {index < steps.length - 1 && (
                <div
                  style={{ flex: "1 1 0%", minWidth: "1rem" }}
                  aria-hidden="true"
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
