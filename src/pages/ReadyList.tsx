import { useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, ErrorBox, Loading } from '../components/ui'
import { draftBody, draftProblem, folderId, folderLabel, itemsIn, type ItemDraft, type ReadyItem, type ReadyList as List } from '../lib/readyList'
import { admin, supabaseUrl } from '../lib/supabase'
import { useLoad } from '../lib/useLoad'
import { letterOf, pictureUrl } from '../lib/readyPicture'
import { removePicture, savePicture } from '../lib/readyPictureSend'

// Business types › one business › Ready list (V21, ctl-6): what a new business of each kind is offered to tick
// (setup and Add items). Add, change, take off; each change is saved with a reason. Businesses keep what they took.
// ITEM-PHOTO: each row shows its picture or a letter tile; Add / Change / Remove picture (with a reason). Shared by all stores
// of the kind: owners pick it in their snap mode, never set on their items by itself. Stores that picked one keep it.

/** A row's picture, or its letter tile when it has none or the picture fails to load. */
function ReadyPic({ name, src }: { name: string; src: string | null }) {
  const [failed, setFailed] = useState(false)
  return src && !failed
    ? <img className="ready-pic" src={src} alt={name} onError={() => setFailed(true)} />
    : <span className="ready-pic ready-pic-letter" role="img" aria-label={`${name}: no picture`}>{letterOf(name)}</span>
}

type Pending = { title: string; body: string; danger?: boolean; action?: string; run: (reason: string) => Promise<unknown> }

export function ReadyList({ kinds, canEdit }: { kinds: { key: string; name: string }[]; canEdit: boolean }) {
  const [kind, setKind] = useState(kinds[0]?.key ?? '')
  const list = useLoad(() => admin<List>('ready_list', { template: kind }), `ready:${kind}`)
  const [folder, setFolder] = useState('')
  const [draft, setDraft] = useState<ItemDraft | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  // ITEM-PHOTO: the item whose picture is being added or changed, and the picked file (asked for the reason next).
  const filePick = useRef<HTMLInputElement>(null)
  const [pictureFor, setPictureFor] = useState<ReadyItem | null>(null)
  const pickPicture = (item: ReadyItem) => { setPictureFor(item); filePick.current?.click() }
  const pictureChosen = (file: File | undefined) => {
    const item = pictureFor
    if (filePick.current) filePick.current.value = ''
    if (!file || !item) return
    setPending({ title: item.picture ? `Change the picture of “${item.name}”?` : `Add this picture to “${item.name}”?`,
      body: 'Every business of this kind can pick it for this item. It is never put on their items by itself.',
      run: (reason) => savePicture(kind, item.id, file, reason).then(after) })
  }
  const pickKind = (key: string) => { setKind(key); setFolder(''); setDraft(null) }

  const data = list.data
  const folders = data?.folders ?? []
  const shownFolder = folder || (folders[0] ? folderId(folders[0]) : '')
  const items = data ? itemsIn(data, shownFolder) : []
  const problem = draft && data ? draftProblem(draft, data) : null
  const blank = (): ItemDraft => ({ folder: shownFolder, name: '', unit: data?.units.includes('piece') ? 'piece' : (data?.units[0] ?? ''), hsn: '', common: false })
  const edit = (item: ReadyItem) => setDraft({ id: item.id, folder: folderId({ kind: item.kind, key: item.categoryKey }), name: item.name, unit: item.unit, hsn: item.hsn ?? '', common: item.common })
  const after = () => { setDraft(null); list.reload() }

  return (
    <section className="ready-list">
      <h3>Ready list</h3>
      <p className="muted">What a new business of this kind is offered to tick at setup and on Add items. Businesses keep the items they already took.</p>
      {kinds.length > 1 && (
        <div className="chips" role="tablist" aria-label="Kinds">
          {kinds.map((k) => <button key={k.key} type="button" role="tab" aria-selected={k.key === kind} className={`chip${k.key === kind ? ' is-on' : ''}`} onClick={() => pickKind(k.key)}>{k.name}</button>)}
        </div>
      )}
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {!data && !list.error && <Loading />}
      {data && (
        <>
          <div className="plan-form">
            <label className="field"><span>Folder</span>
              <select value={shownFolder} onChange={(event) => { setFolder(event.target.value); setDraft(null) }}>
                {folders.map((f) => <option key={folderId(f)} value={folderId(f)}>{folderLabel(f)} ({itemsIn(data, folderId(f)).length})</option>)}
              </select></label>
            {canEdit && <div className="dialog-actions"><button type="button" className="button small" onClick={() => setDraft(blank())}>+ Add an item</button></div>}
          </div>
          {draft && (
            <div className="plan-form">
              <h4 className="span-2">{draft.id ? 'Change this item' : 'New item'}</h4>
              <label className="field"><span>Name</span><input maxLength={160} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label className="field"><span>Folder</span>
                <select value={draft.folder} onChange={(event) => setDraft({ ...draft, folder: event.target.value })}>
                  {folders.map((f) => <option key={folderId(f)} value={folderId(f)}>{folderLabel(f)}</option>)}
                </select></label>
              <label className="field"><span>Unit</span>
                <select value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })}>
                  {data.units.map((u) => <option key={u} value={u}>{u}</option>)}
                </select></label>
              <label className="field"><span>HSN / SAC (optional)</span><input inputMode="numeric" maxLength={8} value={draft.hsn} onChange={(event) => setDraft({ ...draft, hsn: event.target.value })} /></label>
              <label className="field inline"><input type="checkbox" checked={draft.common} onChange={(event) => setDraft({ ...draft, common: event.target.checked })} /><span>Shown first (most shops sell it)</span></label>
              {problem && draft.name.trim() !== '' && <p className="tone-critical span-2">{problem}</p>}
              <div className="dialog-actions span-2">
                <button type="button" className="button" onClick={() => setDraft(null)}>Cancel</button>
                <button type="button" className="button primary" disabled={Boolean(problem)}
                  onClick={() => setPending({ title: draft.id ? 'Save this item?' : 'Add this item?', body: `New businesses of this kind will be offered “${draft.name.trim()}” (${draft.unit}).`,
                    run: (reason) => admin('save_ready_item', { ...draftBody(draft, kind), reason }).then(after) })}>
                  {draft.id ? 'Save…' : 'Add…'}
                </button>
              </div>
            </div>
          )}
          <ul className="list">
            {items.length === 0 && <li className="muted">No ready items in this folder.</li>}
            {items.map((item) => (
              <li key={item.id}>
                <ReadyPic key={item.tile ?? item.picture ?? ''} name={item.name} src={pictureUrl(item.tile ?? item.picture, supabaseUrl)} />{' '}
                <b>{item.name}</b> <span className="sub">{item.unit}{item.hsn ? ` · HSN ${item.hsn}` : ''}</span>{item.common && <> <Badge tone="good">Shown first</Badge></>}
                {canEdit && (
                  <>{' '}
                    <button type="button" className="button small" onClick={() => edit(item)}>Change</button>{' '}
                    <button type="button" className="button small" onClick={() => pickPicture(item)}>{item.picture ? 'Change picture' : 'Add picture'}</button>{' '}
                    {item.picture && <><button type="button" className="button small" onClick={() => setPending({ title: `Remove the picture of “${item.name}”?`, danger: true, action: 'Remove picture',
                      body: 'New picks will show its first letter. Stores that already picked it keep showing it.',
                      run: (reason) => removePicture(kind, item.id, reason).then(after) })}>Remove picture</button>{' '}</>}
                    <button type="button" className="button small" onClick={() => setPending({ title: 'Take this item off the list?', danger: true,
                      body: `New businesses will no longer be offered “${item.name}”. Businesses that already have it keep it.`,
                      run: (reason) => admin('remove_ready_item', { template: kind, id: item.id, reason }).then(after) })}>Take off</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {canEdit && <input ref={filePick} type="file" accept="image/*" hidden aria-label="Picture file" onChange={(event) => pictureChosen(event.target.files?.[0])} />}
      {pending && (
        <ConfirmDialog title={pending.title} action={pending.action ?? (pending.danger ? 'Take off' : 'Save')} danger={pending.danger} onDone={async (reason) => { await pending.run(reason) }} onClose={() => setPending(null)}>
          <p>{pending.body}</p>
        </ConfirmDialog>
      )}
    </section>
  )
}
