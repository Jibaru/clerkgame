import type { CSSProperties, ReactNode } from 'react'

/** Shared racing-UI primitives: slanted panels, chunky buttons, tinted icons. */

export function Panel({
  children,
  className = '',
  tone,
  style,
}: {
  children: ReactNode
  className?: string
  tone?: 'lime' | 'purple'
  style?: CSSProperties
}) {
  return (
    <div
      className={`panel ${tone === 'lime' ? 'panel-lime' : tone === 'purple' ? 'panel-purple' : ''} ${className}`}
      style={style}
    >
      <div className="unskew">{children}</div>
    </div>
  )
}

export function RaceButton({
  children,
  tone = 'lime',
  className = '',
  ...rest
}: { children: ReactNode; tone?: 'lime' | 'purple' | 'ghost'; className?: string } & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'children'
>) {
  return (
    <button type="button" className={`btn-race btn-${tone} ${className}`} {...rest}>
      <span>{children}</span>
    </button>
  )
}

export type IconName = 'cookie' | 'key-lock' | 'finger-print' | 'focused-lightning' | 'robot-antennas'

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <span
      aria-hidden
      className={`icon-mask ${className}`}
      style={{ '--icon': `url(/icons/ui/${name}.svg)` } as CSSProperties}
    />
  )
}

export function Checker({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`checker ${className}`} />
}

export function Title({ className = '' }: { className?: string }) {
  return (
    <h1 className={`racing-title ${className}`}>
      Clerk Van <span className="accent">Run</span>
    </h1>
  )
}
