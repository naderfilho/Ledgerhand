import type { ImageResponse } from 'next/og'
import { CONTENT_TYPE, SIZE, ogImage } from '@/components/site/og-image'
import { PT } from '@/content/landing.pt'

export const alt = PT.hero.thesis
export const size = SIZE
export const contentType = CONTENT_TYPE

export default function OpenGraphImage(): ImageResponse {
  return ogImage('pt')
}
