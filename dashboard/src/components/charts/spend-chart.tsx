'use client'

import { useCallback, useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { Tables } from '@/lib/database.types'
import { formatCairoDate, formatCurrency, parseNumeric } from '@/lib/format'

import { ChartWrapper } from './chart-wrapper'

type SpendRecord = Tables<'spend_records'>

interface SpendChartProps {
  data: SpendRecord[]
  currency?: string
  height?: number
}

export function SpendChart({ data, currency = 'EGP', height = 300 }: SpendChartProps) {
  const chartData = useMemo(() => {
    return [...data]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((record) => ({
        date: record.date,
        displayDate: formatCairoDate(record.date, {
          month: 'short',
          day: 'numeric',
        }),
        dailySpend: parseNumeric(record.daily_spend),
      }))
  }, [data])

  const tooltipFormatter = useCallback(
    (value: number | string | (number | string)[] | undefined) => [
      formatCurrency(String(value ?? 0), currency),
      'Daily Spend',
    ],
    [currency]
  )

  const tooltipLabelFormatter = useCallback((label: unknown) => {
    if (typeof label === 'string' || typeof label === 'number') {
      return String(label)
    }
    return ''
  }, [])

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No spend data available
      </div>
    )
  }

  return (
    <ChartWrapper height={height}>
      <AreaChart data={chartData} margin={{ top: 16, right: 16, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="displayDate" tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis
          tickFormatter={(value) => formatCurrency(String(value), currency)}
          tickLine={false}
          axisLine={false}
          width={90}
        />
        <Tooltip formatter={tooltipFormatter} labelFormatter={tooltipLabelFormatter} />
        <Area
          type="monotone"
          dataKey="dailySpend"
          stroke="#2563eb"
          fill="#3b82f6"
          fillOpacity={0.1}
          strokeWidth={2}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ChartWrapper>
  )
}
