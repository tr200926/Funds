'use client'

import type { ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'

import { cn } from '@/lib/utils'

interface ChartWrapperProps {
  children: ReactNode
  height?: number
  className?: string
}

export function ChartWrapper({
  children,
  height = 300,
  className,
}: ChartWrapperProps) {
  return (
    <div
      className={cn('w-full', className)}
      style={{ height }}
      data-slot="chart-wrapper"
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}
