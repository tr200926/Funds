import { redirect } from 'next/navigation'

import { PipelineTable } from '@/components/pipeline/pipeline-table'
import type { Tables } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'

type PipelineRun = Tables<'pipeline_runs'>

export default async function PipelineHealthPage() {
  const supabase = await createClient()
  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims()

  if (claimsError || !claimsData?.claims) {
    redirect('/login')
  }

  const { data, error } = await supabase
    .from('pipeline_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50)

  if (error) {
    throw error
  }

  const initialRuns = (data ?? []) as PipelineRun[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline Health</h1>
        <p className="text-sm text-muted-foreground">
          Monitor ingestion workflow reliability and get real-time updates as runs progress.
        </p>
      </div>
      <PipelineTable initialData={initialRuns} />
    </div>
  )
}
