'use client'

export const styles = {
  field: 'flex flex-col gap-1.5',
  label: 'text-xs font-medium text-gray-300',
  input:
    'h-10 w-full rounded-md bg-black/40 px-3 text-sm text-white ring-1 ring-white/15 ring-inset placeholder:text-gray-500 focus:ring-2 focus:ring-clerk-purple focus:outline-none aria-[invalid=true]:ring-red-500',
  otp: 'h-12 w-full rounded-md bg-black/40 text-center font-mono text-xl tracking-[0.5em] text-white ring-1 ring-white/15 ring-inset focus:ring-2 focus:ring-clerk-purple focus:outline-none',
  error: 'text-xs text-red-400',
  primary:
    'btn-race btn-purple inline-flex h-11 w-full items-center justify-center text-lg [&>span]:flex [&>span]:items-center [&>span]:gap-2',
  secondary:
    'btn-race btn-ghost inline-flex h-11 w-full items-center justify-center text-base [&>span]:flex [&>span]:items-center [&>span]:gap-2',
  link: 'text-sm text-purple-300 hover:underline disabled:opacity-50',
  divider:
    'flex items-center gap-3 text-xs text-gray-500 before:h-px before:flex-1 before:bg-white/10 after:h-px after:flex-1 after:bg-white/10',
} as const

export function FieldError({
  error,
}: {
  error: { message: string; longMessage?: string } | null | undefined
}) {
  if (!error) return null
  return <p className={styles.error}>{error.longMessage ?? error.message}</p>
}

export function GlobalErrors({ errors }: { errors: { message: string }[] | null | undefined }) {
  if (!errors?.length) return null
  return (
    <ul className={`${styles.error} flex flex-col gap-1`}>
      {errors.map((e) => (
        <li key={e.message}>{e.message}</li>
      ))}
    </ul>
  )
}

export function ProviderIcon({ provider }: { provider: 'github' | 'google' }) {
  if (provider === 'github') {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
        <path d="M8 .2a8 8 0 0 0-2.5 15.6c.4 0 .5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.3 1.9.9 2.4.7 0-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4a3 3 0 0 1 .8-2.1c-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.6 7.6 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3.1-1.9 3.8-3.6 4 .3.2.5.7.5 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 .2Z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path
        fill="#4285F4"
        d="M15.7 8.2c0-.6-.1-1.1-.2-1.6H8v3h4.3a3.7 3.7 0 0 1-1.6 2.4v2h2.6c1.5-1.4 2.4-3.4 2.4-5.8Z"
      />
      <path fill="#34A853" d="M8 16c2.2 0 4-.7 5.3-1.9l-2.6-2a4.8 4.8 0 0 1-7.2-2.5H.8v2.1A8 8 0 0 0 8 16Z" />
      <path fill="#FBBC05" d="M3.5 9.5a4.8 4.8 0 0 1 0-3.1V4.3H.8a8 8 0 0 0 0 7.2l2.7-2Z" />
      <path
        fill="#EA4335"
        d="M8 3.2c1.2 0 2.3.4 3.1 1.2l2.3-2.3A8 8 0 0 0 .8 4.3l2.7 2.1A4.8 4.8 0 0 1 8 3.2Z"
      />
    </svg>
  )
}
