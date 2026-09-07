import type { SVGProps } from 'react'

const paths = {
  code: 'm8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 14',
  plus: 'M12 5v14M5 12h14',
  link: 'm10 13 4-2M9 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  video: 'M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm2 4 6-4v12l-6-4',
  videoOff: 'm2 2 20 20M9 6h5a2 2 0 0 1 2 2v4l6-6v12l-6-4M6 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8',
  micOff: 'm2 2 20 20M9 9v3a3 3 0 0 0 5 2M9 5a3 3 0 0 1 6 0v4m4 1v2a7 7 0 0 1-1 3M5 10v2a7 7 0 0 0 10 6m-3 1v3m-4 0h8',
  pen: 'm16 3 5 5M4 20l4-1L21 6a2 2 0 0 0-3-3L5 16l-1 4Z',
  play: 'm8 5 11 7-11 7V5Z',
  pause: 'M8 5v14M16 5v14',
  reset: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  copy: 'M9 9h12v12H9V9Zm6-4V3H3v12h2',
  download: 'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',
  screen: 'M3 3h18v14H3V3Zm5 18h8m-4-4v4m-4-11 4-4 4 4m-4-4v8',
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l2-5a8.5 8.5 0 1 1 16-3.5ZM8 10h8m-8 4h5',
  sparkles: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm8-2v4m-2-2h4',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  alert: 'm12 3 10 18H2L12 3Zm0 6v5m0 3h.01',
  loader: 'M21 12a9 9 0 1 1-6.2-8.55',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-5v5l3 2',
  leave: 'M9 5H3v14h6m5-12 5 5-5 5m-6-5h11',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15m-9 4v7m4-7v7',
} as const

export type IconName = keyof typeof paths

export function Icon({ name, className = '', ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={'icon ' + className} {...props}><path d={paths[name]} /></svg>
}
