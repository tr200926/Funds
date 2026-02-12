'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import { NAV_ITEMS } from './sidebar'

interface MobileNavProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Targetspro</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4 py-4">
          {NAV_ITEMS.map((item) => (
            <Button
              key={item.href}
              variant="ghost"
              className={cn(
                'justify-start gap-3 text-base',
                pathname?.startsWith(item.href) && 'bg-primary/10 text-primary'
              )}
              asChild
              onClick={() => onOpenChange(false)}
            >
              <Link href={item.href}>
                <item.icon className="mr-2 inline-block h-4 w-4" />
                {item.label}
              </Link>
            </Button>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
