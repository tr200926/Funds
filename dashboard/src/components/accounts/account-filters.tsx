'use client'

import type { Table } from '@tanstack/react-table'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { AdAccountWithPlatform } from './types'

interface AccountFiltersProps {
  table: Table<AdAccountWithPlatform>
}

const platformOptions = [
  { label: 'All Platforms', value: 'all' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'TikTok', value: 'tiktok' },
]

const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' },
  { label: 'Disabled', value: 'disabled' },
]

export function AccountFilters({ table }: AccountFiltersProps) {
  const businessManagersSet = new Set<string>()
  table.getPreFilteredRowModel().flatRows.forEach((row) => {
    const value = row.getValue('business_manager') as string | null
    if (value) {
      businessManagersSet.add(value)
    }
  })
  const businessManagers = Array.from(businessManagersSet).sort((a, b) =>
    a.localeCompare(b)
  )

  const activeFilters = table.getState().columnFilters.length

  const setFilterValue = (columnId: string, value: string) => {
    table.getColumn(columnId)?.setFilterValue(value === 'all' ? undefined : value)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={(table.getColumn('platform_id')?.getFilterValue() as string) ?? 'all'}
        onValueChange={(value) => setFilterValue('platform_id', value)}
      >
        <SelectTrigger className="min-w-44">
          <SelectValue placeholder="Platform" />
        </SelectTrigger>
        <SelectContent>
          {platformOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={(table.getColumn('status')?.getFilterValue() as string) ?? 'all'}
        onValueChange={(value) => setFilterValue('status', value)}
      >
        <SelectTrigger className="min-w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={
          (table.getColumn('business_manager')?.getFilterValue() as string) ??
          'all'
        }
        onValueChange={(value) => setFilterValue('business_manager', value)}
      >
        <SelectTrigger className="min-w-48">
          <SelectValue placeholder="Business Manager" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Business Managers</SelectItem>
          {businessManagers.map((manager) => (
            <SelectItem key={manager} value={manager}>
              {manager}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        className="ml-auto flex items-center gap-2"
        disabled={activeFilters === 0}
        onClick={() => table.resetColumnFilters()}
      >
        Clear Filters
        {activeFilters > 0 && (
          <Badge variant="secondary" className="ml-1">
            {activeFilters}
          </Badge>
        )}
      </Button>
    </div>
  )
}
