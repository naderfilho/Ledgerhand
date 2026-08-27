/**
 * ---------------------------------------------------------------------------
 * What an imported asset is, since Next will not say
 * ---------------------------------------------------------------------------
 * `import demo from './demo.svg'` is typed `any` by `next/image-types/global`,
 * so `demo.width` type-checks whether or not a width exists. On a page whose
 * largest element is that image, a missing width is not a detail: the layout
 * reflows under it the moment it loads, which is the whole argument moving down
 * the screen while somebody is reading it.
 *
 * So the value is checked at the boundary rather than asserted through it. If
 * the asset pipeline ever stops handing over dimensions, this throws at build
 * time instead of shipping a page that jumps.
 */
export interface StaticImage {
  readonly src: string
  readonly width: number
  readonly height: number
}

export function staticImage(imported: unknown, name: string): StaticImage {
  const image = imported as Partial<StaticImage> | null
  if (
    typeof image?.src !== 'string' ||
    typeof image.width !== 'number' ||
    typeof image.height !== 'number'
  ) {
    throw new Error(`the import of ${name} carried no src, width and height`)
  }
  return { src: image.src, width: image.width, height: image.height }
}
