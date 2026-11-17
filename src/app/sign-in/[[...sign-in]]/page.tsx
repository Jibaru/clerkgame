import { Suspense } from 'react'
import { AuthShell } from '@/components/auth/AuthShell'
import { SignInForm } from '@/components/auth/SignInForm'

export const metadata = { title: 'Sign in · Clerk Van Run' }

export default function SignInPage() {
  return (
    <AuthShell title="Sign in" subtitle="Save your laps to the public leaderboard.">
      <Suspense>
        <SignInForm />
      </Suspense>
    </AuthShell>
  )
}
