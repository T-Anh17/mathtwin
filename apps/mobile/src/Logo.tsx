import React from 'react';
interface LogoProps { size?: number; ink?: string; amber?: string; paper?: string }
export function Logo({ size = 40, ink = 'var(--primary)', amber = 'var(--brand-amber)', paper = 'var(--surface)' }: LogoProps) {
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <path d="M14 30 C 20 14, 28 14, 34 30" stroke={ink} strokeWidth="3.2" fill="none" strokeLinecap="round"/>
    <path d="M14 30 L 34 30" stroke={amber} strokeWidth="3.2" strokeLinecap="round"/>
    <circle cx="14" cy="30" r="7" fill={ink}/><circle cx="34" cy="30" r="7" fill={paper} stroke={ink} strokeWidth="3.2"/>
    <circle cx="34" cy="30" r="2.6" fill={amber}/>
  </svg>;
}
