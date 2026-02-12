export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen bg-muted/20">
      <div className="hidden w-64 border-r bg-background p-6 lg:block">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-8 space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-16 items-center border-b bg-background px-4">
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        </div>
        <main className="flex flex-1 flex-col gap-6 bg-background p-6">
          <div className="h-40 w-full animate-pulse rounded-xl bg-muted" />
          <div className="h-64 w-full animate-pulse rounded-xl bg-muted" />
        </main>
      </div>
    </div>
  )
}
