'use client'

import { useSignUp } from '@clerk/nextjs'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { FieldError, GlobalErrors, ProviderIcon, styles as s } from './FormBits'
import { useFinalizeNavigate } from './useFinalize'

type Step = 'start' | 'code'

export function SignUpForm() {
  const { signUp, errors, fetchStatus } = useSignUp()
  const navigate = useFinalizeNavigate()
  const [step, setStep] = useState<Step>('start')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const busy = fetchStatus === 'fetching'

  async function sendCode(event: FormEvent) {
    event.preventDefault()
    const created = await signUp.create({ emailAddress: email, username: username || undefined })
    if (created.error) return
    const sent = await signUp.verifications.sendEmailCode()
    if (!sent.error) setStep('code')
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    const verified = await signUp.verifications.verifyEmailCode({ code })
    if (verified.error) return
    if (signUp.status === 'complete') await signUp.finalize({ navigate })
  }

  async function withProvider(provider: 'github' | 'google') {
    await signUp.sso({
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
          {busy ? 'Verifying…' : 'Create account'}
        </button>
        <GlobalErrors errors={errors.global} />
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
        <label htmlFor="emailAddress" className={s.label}>
          Email
        </label>
        <input
          id="emailAddress"
          name="emailAddress"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={s.input}
          aria-invalid={Boolean(errors.fields.emailAddress)}
        />
        <FieldError error={errors.fields.emailAddress} />
      </div>
      <div className={s.field}>
        <label htmlFor="username" className={s.label}>
          Driver name on the leaderboard <span className="text-gray-500">(optional)</span>
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          maxLength={40}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={s.input}
          aria-invalid={Boolean(errors.fields.username)}
        />
        <FieldError error={errors.fields.username} />
      </div>
      {/* Clerk's bot detection renders its widget here when the instance requires it. */}
      <div id="clerk-captcha" className="empty:hidden" />
      <button type="submit" className={s.primary} disabled={busy}>
        {busy ? 'Sending…' : 'Continue with email'}
      </button>
      <FieldError error={errors.fields.captcha} />
      <GlobalErrors errors={errors.global} />
      <p className="text-center text-sm text-gray-400">
        Already racing?{' '}
        <Link href="/sign-in" className={s.link}>
          Sign in
        </Link>
      </p>
    </form>
  )
}
