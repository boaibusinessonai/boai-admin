// ITEM-PHOTO: sending a ready item's picture (made small by readyPicture.ts) through the Edge Function `photos`.
import { shrinkPicture } from './readyPicture'
import { readyPictureCall } from './supabase'

/** Adds or changes a ready item's picture, with the reason. */
export async function savePicture(template: string, id: string, file: Blob, reason: string) {
  const made = await shrinkPicture(file)
  return await readyPictureCall({ action: 'ready_add', template, id, reason, ...made })
}

/** Takes a ready item's picture off, with the reason (stores that picked it keep showing it). */
export async function removePicture(template: string, id: string, reason: string) {
  await readyPictureCall({ action: 'ready_remove', template, id, reason })
}
