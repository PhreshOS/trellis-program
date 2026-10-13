import { randomUUID } from "node:crypto"
import { watch, type FSWatcher } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname } from "node:path"
import { context } from "@phreshos/server"
import BoardDocument, { type BoardFile, type Element } from "./board-file"
import Tabs, { draftPrefix, type TabEntry, type Windows } from "./tabs"

/**
 * A board is its file, an `.excalidraw` file the person chose, or a draft no file holds yet. The
 * Trellis keeps nothing of its own: a draft lives here, in memory, until it is saved or its last tab
 * closes.
 */
type Read = Readonly<{ board: string }>

/** A change from one window or agent: the elements and pictures it changed, and who sent it, so it does not hear its own. */
type Change = Readonly<{ board: string, from: string, elements: readonly Element[], files?: readonly BoardFile[] }>

/** A board being shown: its document, the write waiting to happen, and the watch on its file. */
type Held = { readonly document: BoardDocument, saving: ReturnType<typeof setTimeout> | null, watcher: FSWatcher | null }

const program = await context.program()
const self = await context.process()

const isDraft = (board: string) => board.startsWith(draftPrefix)

/** A new draft, and the first title no open draft has: "Untitled", then "Untitled 2", and on. */
function newDraft() {
    const titles = new Set(tabs.list().filter(tab => tab.draft).map(tab => tab.title))
    let title = "Untitled"
    for (let number = 2; titles.has(title); number++) title = `Untitled ${number}`
    return { board: `${draftPrefix}${randomUUID()}`, title }
}

/**
 * Every board some window or agent has open, by its file. This one Server holds them, so every window
 * and agent on the same file sees one board; the file stays what the board is, and what someone else
 * writes into it shows on every window at once.
 */
const boards = new Map<string, Promise<Held>>()

function boardAt(path: string) {
    let held = boards.get(path)
    if (!held) {
        held = (async () => {
            if (isDraft(path)) return { document: BoardDocument.read(null), saving: null, watcher: null }
            // No such file yet: the board starts empty, and is written on its first change.
            const text = await readFile(path, "utf8").catch(() => null)
            return hold(path, BoardDocument.read(text))
        })()
        boards.set(path, held)
    }
    return held
}

/** Holds a board at its file, and follows what anyone else writes into that file. */
function hold(path: string, document: BoardDocument): Held {
    const held: Held = { document, saving: null, watcher: null }
    let reading: ReturnType<typeof setTimeout> | null = null
    // The folder is followed, not the file: an editor that replaces the file keeps being heard.
    try {
        held.watcher = watch(dirname(path), (_event, name) => {
            if (name !== basename(path)) return
            if (reading) clearTimeout(reading)
            reading = setTimeout(() => void readFile(path, "utf8").then(text => {
                const changes = document.mergeFile(text)
                if (changes && (changes.elements.length || changes.files.length)) announce(path, "file", changes.elements, changes.files)
            }, () => undefined), 60)
        })
    }
    catch { /* A folder that does not exist yet is followed from the first write on. */ }
    return held
}

/** What changed on a board, to every window and agent that follows it. */
function announce(board: string, from: string, elements: readonly Element[], files: readonly BoardFile[]) {
    void context.publish("changed", { board, from, elements, files })
}

/** The board as an Excalidraw file, so any Excalidraw opens it. */
async function write(path: string, held: Held) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, held.document.text())
    held.watcher ??= hold(path, held.document).watcher
}

// A file is saved a moment after the last change, so a drawing hand does not write on every step; a
// draft is written nowhere until the person saves it.
function save(path: string, held: Held) {
    if (isDraft(path)) return
    if (held.saving) clearTimeout(held.saving)
    held.saving = setTimeout(() => {
        held.saving = null
        void write(path, held)
    }, 400)
}

/** A board no tab shows any more is let go: a file is written if a change waits, then read afresh next time. */
async function release(path: string) {
    const held = await boards.get(path)
    boards.delete(path)
    if (!held) return
    held.watcher?.close()
    if (held.saving) {
        clearTimeout(held.saving)
        await write(path, held).catch(() => undefined)
        held.watcher?.close()
    }
}

// A window is any other Process of this Program; it has ended once its Process has.
const windows: Windows = {
    followEnds(ended) { program.subscribe("processExit", event => ended(event.process.identity)) },
    async exists(window) { return await program.findProcess(window) !== null },
    async close(window) { await (await program.findProcess(window))?.exit() }
}

const tabs = new Tabs(windows)
tabs.subscribe(() => {
    // A board no tab shows any more is let go; a draft so let go is one the person chose not to save.
    for (const board of [...boards.keys()]) if (!tabs.list().some(tab => tab.board === board)) void release(board)
    void context.publish("tabs.changed", tabs.list())
})

/** The file a window was opened on, if it was opened on one. */
function fileOf(opened: Readonly<{ uri: string }> | null) {
    return opened?.uri.startsWith("file:") ? decodeURIComponent(new URL(opened.uri).pathname) : null
}

// Every window opens with a tab: the file it was opened on, or a new draft. The Server opens it, so
// windows that opened while no Server ran get theirs when it starts.
const firstTab = async (window: Readonly<{ identity: string, opened: Readonly<{ uri: string }> | null }>) => {
    if (window.identity === self.identity || tabs.list().some(tab => tab.window === window.identity)) return
    const file = fileOf(window.opened)
    if (file) await tabs.create(window.identity, file)
    else { const draft = newDraft(); await tabs.create(window.identity, draft.board, draft.title) }
}
program.subscribe("processCreate", window => void firstTab(window).catch(() => undefined))
for (const window of await program.processes()) await firstTab(window).catch(() => undefined)

context.answer("tabs.list", () => tabs.list())

// A tab for a file the person chose, or for a new draft.
context.answer<Readonly<{ window: string, board?: string }>, TabEntry>("tab.create", async ({ payload }) => {
    if (typeof payload?.window !== "string") throw new Error("A tab opens in a window")
    if (typeof payload.board === "string" && !isDraft(payload.board)) return await tabs.create(payload.window, payload.board)
    const draft = newDraft()
    return await tabs.create(payload.window, draft.board, draft.title)
})

context.answer<Readonly<{ tab: string }>, void>("tab.close", ({ payload }) => tabs.close(String(payload?.tab)))

context.answer<Readonly<{ tab: string, index: number }>, void>("tab.move", ({ payload }) => {
    if (!Number.isInteger(payload?.index) || payload.index < 0) throw new Error("A tab moves to a place counted from 0")
    tabs.move(String(payload.tab), payload.index)
})

// Whether a board is a draft, and whether anything is drawn on it: what closing it would lose.
context.answer<Read, Readonly<{ draft: boolean, drawn: boolean }>>("board.state", async ({ payload }) => {
    return { draft: isDraft(payload.board), drawn: (await boardAt(payload.board)).document.drawn }
})

/**
 * A board saved to a file the person chose: written there at once, and from then on it is that file,
 * in every tab that shows it, saved as it changes.
 */
context.answer<Readonly<{ board: string, file: string }>, TabEntry[]>("board.save", async ({ payload }) => {
    if (typeof payload?.file !== "string" || !payload.file.startsWith("/")) throw new Error("A board is saved to an absolute path")
    const from = await boardAt(payload.board)
    if (payload.file !== payload.board) {
        // The board is that file from now on: its old place lets it go, without writing there again.
        if (from.saving) clearTimeout(from.saving)
        from.watcher?.close()
        boards.delete(payload.board)
        await (await boards.get(payload.file))?.watcher?.close()
        const held: Held = { document: from.document, saving: null, watcher: null }
        boards.set(payload.file, Promise.resolve(held))
        await write(payload.file, held)
        tabs.rebind(payload.board, payload.file)
    }
    else await write(payload.file, from)
    return [...tabs.list()]
})

// A board as it is now: every element, deleted ones too, so a window can tell what went, and its pictures.
context.answer<Read, Readonly<{ board: string, elements: readonly Element[], files: readonly BoardFile[] }>>("read", async ({ payload }) => {
    const { document } = await boardAt(payload.board)
    return { board: payload.board, elements: [...document.elements.values()], files: [...document.files.values()] }
})

context.answer<Change, number>("change", async ({ payload: change }) => {
    const path = change.board
    const held = await boardAt(path)
    const changed = held.document.merge(change.elements ?? [], change.files ?? [])
    if (!changed.elements.length && !changed.files.length) return 0
    announce(path, change.from, changed.elements, changed.files)
    save(path, held)
    return changed.elements.length
})
