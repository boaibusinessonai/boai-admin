// Admin › Business types › one business › Ready list › picture (ITEM-PHOTO, board ItemPhotos note "Admin": ready lists get a
// picture per common item, shared by all stores of that kind). Made small in the browser (picture: long side 800 px, tile:
// 160 px; WebP, else JPEG) and sent to the Edge Function `photos` with the reason; the database checks the admin, keeps the
// reason in the audit log and the file goes to the public bucket item-photos under ready-list/. Owners pick it in their snap
// mode (Pick a ready picture); it is never set on their items by itself. Never an AI picture.

export const PICTURE_SIDE = 800
export const TILE_SIDE = 160

/** The lasting public link of a path in item-photos (null for none). */
export function pictureUrl(path: string | undefined | null, base: string | undefined): string | null {
  if (!path || !base) return null
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/item-photos/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** The tile of a picture path: -t before the extension (as the database names it). */
export const tilePath = (path: string) => path.replace(/\.([a-z]+)$/, '-t.$1')

/** The first letter or digit of a name, upper case: the tile shown with no picture. */
export function letterOf(name: string): string {
  const found = /[\p{L}\p{N}]/u.exec(name)
  return found ? found[0].toLocaleUpperCase() : '?'
}

/** The size to draw at: the long side at most `side`, never larger than the picture. */
export function fitSide(width: number, height: number, side: number) {
  const scale = Math.min(1, side / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function draw(picture: ImageBitmap, side: number, mime: string, quality: number): string {
  const size = fitSide(picture.width, picture.height, side)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This picture could not be read. Try another one.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, size.width, size.height)
  context.drawImage(picture, 0, 0, size.width, size.height)
  return canvas.toDataURL(mime, quality)
}

/** One file → the picture and its tile to send (the same type). */
export async function shrinkPicture(file: Blob): Promise<{ data: string; tile: string; mime: 'image/webp' | 'image/jpeg' }> {
  const picture = await createImageBitmap(file).catch(() => { throw new Error('This picture could not be read. Try another one.') })
  try {
    let data = draw(picture, PICTURE_SIDE, 'image/webp', 0.8)
    const mime = data.startsWith('data:image/webp;') ? 'image/webp' : 'image/jpeg'
    if (mime === 'image/jpeg') data = draw(picture, PICTURE_SIDE, mime, 0.8)
    return { data, tile: draw(picture, TILE_SIDE, mime, 0.7), mime }
  } finally {
    picture.close()
  }
}

