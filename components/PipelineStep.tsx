// components/PipelineStep.tsx
import { CheckCircle, Circle, Loader } from "lucide-react"

export function PipelineStep({
  step,
  title,
  status,
  isActive,
}: {
  step: number
  title: string
  status: "complete" | "current" | "upcoming"
  isActive: boolean
}) {
  const Icon = {
    complete: <CheckCircle className="text-green-500" />,
    current: <Loader className="animate-spin text-blue-500" />,
    upcoming: <Circle className="text-gray-300" />,
  }[status]

  return (
    <div className="flex items-start space-x-3">
      <div>{Icon}</div>
      <div>
        <div className={`font-medium ${isActive ? "text-blue-600" : "text-gray-700"}`}>{title}</div>
      </div>
    </div>
  )
}
