'use client'

import { HandleSSOCallback } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useFinalizeNavigate } from './useFinalize'

export function SSOCallback() {
  const router = useRouter()
  const navigate = useFinalizeNavigate()
  return (
    <HandleSSOCallback
      navigateToApp={navigate}
      navigateToSignIn={() => router.push('/sign-in')}
      navigateToSignUp={() => router.push('/sign-up')}
    />
  )
}
