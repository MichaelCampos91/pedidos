import type { ComponentType } from "react"
import { Clock, Truck, CheckCircle2, AlertCircle, XCircle, Wrench } from "lucide-react"

export const STATUS_LABELS: Record<string, string> = {
  aguardando_pagamento: "Aguardando Pagamento",
  aguardando_producao: "Aguardando Produção",
  em_producao: "Em Produção",
  aguardando_envio: "Aguardando Envio",
  enviado: "Enviado",
  nao_pagos: "Não Pagos",
  cancelados: "Cancelados",
}

export const ORDER_STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon?: ComponentType<any> }
> = {
  aguardando_pagamento: {
    label: STATUS_LABELS.aguardando_pagamento,
    className: "bg-amber-50 text-amber-800 border-amber-200",
    icon: Clock,
  },
  aguardando_producao: {
    label: STATUS_LABELS.aguardando_producao,
    className: "bg-blue-50 text-blue-800 border-blue-200",
    icon: Clock,
  },
  em_producao: {
    label: STATUS_LABELS.em_producao,
    className: "bg-indigo-50 text-indigo-800 border-indigo-200",
    icon: Wrench,
  },
  aguardando_envio: {
    label: STATUS_LABELS.aguardando_envio,
    className: "bg-sky-50 text-sky-800 border-sky-200",
    icon: Truck,
  },
  enviado: {
    label: STATUS_LABELS.enviado,
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    icon: CheckCircle2,
  },
  nao_pagos: {
    label: STATUS_LABELS.nao_pagos,
    className: "bg-rose-50 text-rose-800 border-rose-200",
    icon: AlertCircle,
  },
  cancelados: {
    label: STATUS_LABELS.cancelados,
    className: "bg-slate-100 text-slate-700 border-slate-300",
    icon: XCircle,
  },
}

