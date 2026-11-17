'use client'

import { useSignIn } from '@clerk/nextjs'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { FieldError, GlobalErrors, ProviderIcon, styles as s } from './FormBits'
import { useFinalizeNavigate } from './useFinalize'

type Step = 'start' | 'code'

/** Custom sign-in on Clerk Core 3's signal-based useSignIn: email code, passkeys and OAuth. */
export function SignInForm() {
  const { signIn, errors, fetchStatus } = useSignIn()
  const navigate = useFinalizeNavigate()
  const [step, setStep] = useState<Step>('start')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const busy = fetchStatus === 'fetching'

  async function sendCode(event: FormEvent) {
    event.preventDefault()
    const created = await signIn.create({ identifier: email })
    if (created.error) return
    const sent = await signIn.emailCode.sendCode({ emailAddress: email })
    if (!sent.error) setStep('code')
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    const verified = await signIn.emailCode.verifyCode({ code })
    if (verified.error) return
    if (signIn.status === 'complete') await signIn.finalize({ navigate })
  }

  async function withPasskey() {
    const result = await signIn.passkey({ flow: 'discoverable' })
    if (result.error) return
    if (signIn.status === 'complete') await signIn.finalize({ navigate })
  }

  async function withProvider(provider: 'github' | 'google') {
    await signIn.sso({
      strategy: `oauth_${provider}`,
      redirectUrl: window.location.search ? `/${window.location.search}` : '/',
      redirectCallbackUrl: '/sso-callback',
    })
  }

  if (step === 'code') {
    return (
      <form onSubmit={verifyCode} className="flex flex-col gap-4">
        <div className={s.field}>
          <label htmlFor="code" className={s.label}>
            Code from your email
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={s.otp}
            aria-invalid={Boolean(errors.fields.code)}
          />
          <FieldError error={errors.fields.code} />
        </div>
        <p className="text-xs text-gray-500">
          Sent to <span className="text-gray-300">{email}</span>
        </p>
        <button type="submit" className={s.primary} disabled={busy}>
          {busy ? 'Verifying…' : 'Continue'}
        </button>
        <GlobalErrors errors={errors.global} />
        <button
          type="button"
          className={s.link}
          onClick={async () => {
            await signIn.reset()
            setCode('')
            setStep('start')
          }}
        >
          ← Use another email
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={sendCode} className="flex flex-col gap-4">
      <div className="grid gap-2">
        <button type="button" className={s.secondary} disabled={busy} onClick={() => withProvider('github')}>
          <ProviderIcon provider="github" /> Continue with GitHub
        </button>
        <button type="button" className={s.secondary} disabled={busy} onClick={() => withProvider('google')}>
          <ProviderIcon provider="google" /> Continue with Google
        </button>
      </div>
      <p className={s.divider}>or</p>
      <div className={s.field}>
        <label htmlFor="identifier" className={s.label}>
          Email
        </label>
        <input
          id="identifier"
          name="identifier"
          type="email"
          autoComplete="email webauthn"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={s.input}
          aria-invalid={Boolean(errors.fields.identifier)}
        />
        <FieldError error={errors.fields.identifier} />
      </div>
      <button type="submit" className={s.primary} disabled={busy}>
        {busy ? 'Sending…' : 'Continue with email'}
      </button>
      <button type="button" className={s.link} disabled={busy} onClick={withPasskey}>
        Use a passkey
      </button>
      <GlobalErrors errors={errors.global} />
      <p className="text-center text-sm text-gray-400">
        No account?{' '}
        <Link href="/sign-up" className={s.link}>
          Sign up
        </Link>
      </p>
    </form>
  )
}
