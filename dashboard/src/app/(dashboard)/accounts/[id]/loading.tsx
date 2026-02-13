import { Skeleton } from '@/components/ui/skeleton'

export default function AccountDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-28" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-32" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-[260px] w-full" />
          </div>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-72" />
        {Array.from({ length: 4 }).map((_, row) => (
          <div key={row} className="flex items-center gap-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-32" />
          </div>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-60" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-20 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
