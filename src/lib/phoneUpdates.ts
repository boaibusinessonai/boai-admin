// Releases › Phone app updates (MOB-3): what the card shows from admin.phone_updates.

export type PhoneUpdate = { id: string; kind: 'quiet' | 'app'; version: string; build: number; note?: string; madeAt: string; sentAt?: string; sentBy?: string; size?: number; url?: string }
/** `download` (APKDL): this stage's newest app file, sent or still waiting; older Admin SQL leaves it out. */
export type AppFile = { id: string; version: string; build: number; url: string; sent: boolean }
export type PhoneUpdates = { app: PhoneUpdate | null; live: PhoneUpdate | null; waiting: PhoneUpdate[]; sent: PhoneUpdate[]; download?: AppFile | null }

/** What is on phones now: the live quiet update, else the APK's own version, else nothing sent yet. */
export function onPhones(data: PhoneUpdates): string | null {
  return data.live?.version ?? data.app?.version ?? null
}

export const kindLabel = (u: PhoneUpdate) => (u.kind === 'app' ? 'New app file' : 'Quiet update')

/** What Send does, in one line, for the confirm box. */
export function sendNote(u: PhoneUpdate): string {
  return u.kind === 'app'
    ? `Phones on an older app show "New version ${u.version} is ready [Update] [Later]"; the person taps Install once. Old versions keep working.`
    : `Phones on app build ${u.build} download ${u.version} quietly and switch to it the next time the app opens, then show "Updated to ${u.version}" once.`
}

/** "Back to this" only for a quiet update that was sent before and is not the live one, on the APK build phones have. */
export function canGoBack(u: PhoneUpdate, data: PhoneUpdates): boolean {
  return u.kind === 'quiet' && !!u.sentAt && u.id !== data.live?.id && u.build === data.app?.build
}

export const megabytes = (bytes?: number) => (bytes ? `${(bytes / 1e6).toFixed(1)} MB` : '')

/** The line under the Download button (APKDL): which file, and whether phones have it yet. */
export function downloadNote(f: AppFile): string {
  return `Newest app file on this stage: ${f.version}${f.sent ? ' (sent to phones)' : ' (not sent to phones yet)'}. Open this page on your Android phone and install it to test.`
}
