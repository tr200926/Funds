import type { Database } from '@/lib/database.types'

export type AdAccountRow = Database['public']['Tables']['ad_accounts']['Row']
export type PlatformRow = Database['public']['Tables']['platforms']['Row']

export type AdAccountWithPlatform = AdAccountRow & {
  platforms: Pick<PlatformRow, 'display_name' | 'icon_url'> | null
}
