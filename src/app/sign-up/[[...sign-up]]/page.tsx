import { Suspense } from 'react'
import { AuthShell } from '@/components/auth/AuthShell'
import { SignUpForm } from '@/components/auth/SignUpForm'

export const metadata = { title: 'Sign up · Clerk Van Run' }

export default function SignUpPage() {
  return (
    <AuthShell title="Create your driver" subtitle="One account, every lap on the board.">
      <Suspense>
        <SignUpForm />
      </Suspense>
    </AuthShell>
  )
}
