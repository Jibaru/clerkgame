'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

type NavigateArgs = { decorateUrl: (url: string) => string }

/** Where to go after sign-in/sign-up: the `redirect_url` query param (same origin only) or home. */
export function useFinalizeNavigate() {
  const router = useRouter()
  const params = useSearchParams()
  const wanted = params.get('redirect_url')
  const destination = wanted?.startsWith('/') && !wanted.startsWith('//') ? wanted : '/'
  return useCallback(
    ({ decorateUrl }: NavigateArgs) => {
      const url = decorateUrl(destination)
      if (url.startsWith('http')) {
        window.location.href = url
        return
      }
      router.push(url)
    },
    [router, destination],
  )
}
