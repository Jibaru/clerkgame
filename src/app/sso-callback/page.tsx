import { Suspense } from 'react'
import { SSOCallback } from '@/components/auth/SSOCallback'

export default function SSOCallbackPage() {
  return (
    <main className="flex min-h-full items-center justify-center bg-clerk-ink text-sm text-clerk-gray">
      <Suspense>
        <SSOCallback />
      </Suspense>
      Signing you in…
    </main>
  )
}
