import { basename, extname } from "node:path"
import { randomUUID } from "node:crypto"

/**
 * One board open in a window: the file it is drawn in, or a draft not saved to any file yet, and the
 * window it shows in.
 */
export type TabEntry = Readonly<{ tab: string, window: string, board: string, title: string, draft: boolean }>

/** A board that is no file yet, held only while some tab shows it. */
export const draftPrefix = "draft:"

/** What the tabs know of windows, from wherever windows live. */
export type Windows = Readonly<{
    /** Calls `ended` with each window that ends, from now on. */
    followEnds(ended: (window: string) => void): void
    /** Whether a window is still open. */
    exists(window: string): Promise<boolean>
    /** Closes a window. */
    close(window: string): Promise<void>
}>

/** A board's name: its file's, without the extension. */
export function titleOf(board: string) {
    return basename(board, extname(board))
}

/**
 * Every board open in every Trellis window, in each window's order. Each tab belongs to the window
 * that opened it and ends with it; a window that loses its last tab closes. Decided here once, so
 * every window and agent sees the same tabs in the same order.
 */
export default class Tabs {
    private readonly tabs = new Map<string, TabEntry>()
    private readonly listeners = new Set<() => void>()

    public constructor(private readonly windows: Windows) {
        windows.followEnds(window => this.windowEnded(window))
    }

    public subscribe(listener: () => void) {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }

    public list(): readonly TabEntry[] {
        return [...this.tabs.values()]
    }

    /** Opens a board in a window, as its last tab: a file, named after it, or a draft by its title. */
    public async create(window: string, board: string, title = titleOf(board)) {
        const entry: TabEntry = Object.freeze({ tab: randomUUID(), window, board, title, draft: board.startsWith(draftPrefix) })
        // A window that ended before its tab reached it opens nothing.
        if (!await this.windows.exists(window)) return entry
        this.tabs.set(entry.tab, entry)
        this.emit()
        return entry
    }

    public get(identity: string) {
        const entry = this.tabs.get(identity)
        if (!entry) throw new Error("This tab has closed, or never existed")
        return entry
    }

    /** Closes a tab; its board stays as it was last saved. A window left without tabs closes. */
    public close(identity: string) {
        const { window } = this.get(identity)
        this.tabs.delete(identity)
        this.emit()
        if (this.list().some(entry => entry.window === window)) return
        void this.windows.close(window).catch(() => undefined)
    }

    /**
     * Moves a tab to a place among its window's tabs, counted from 0; past the last, it goes last.
     * Every window and agent then lists them in that order.
     */
    public move(identity: string, index: number) {
        const { window } = this.get(identity)
        const order = [...this.tabs.keys()]
        const mine = order.filter(other => this.tabs.get(other)!.window === window)
        // Only the order within its window counts: already at that place, nothing moves.
        if (mine.indexOf(identity) === Math.min(index, mine.length - 1)) return
        const others = order.filter(other => other !== identity)
        const theirs = mine.filter(other => other !== identity)
        // It goes before the one now at its new place, or after its window's last tab.
        const before = theirs[index]
        const at = before !== undefined ? others.indexOf(before) : others.indexOf(theirs.at(-1)!) + 1
        const entries = [...others.slice(0, at), identity, ...others.slice(at)].map(other => this.tabs.get(other)!)
        this.tabs.clear()
        for (const entry of entries) this.tabs.set(entry.tab, entry)
        this.emit()
    }

    /** A board saved to a file: every tab showing it shows the file now, under its name. */
    public rebind(board: string, file: string) {
        let changed = false
        for (const [identity, entry] of this.tabs) if (entry.board === board) {
            this.tabs.set(identity, Object.freeze({ ...entry, board: file, title: titleOf(file), draft: false }))
            changed = true
        }
        if (changed) this.emit()
    }

    /** A window ended: its tabs go with it. */
    private windowEnded(window: string) {
        const before = this.tabs.size
        for (const [identity, entry] of this.tabs) if (entry.window === window) this.tabs.delete(identity)
        if (this.tabs.size !== before) this.emit()
    }

    private emit() {
        for (const listener of this.listeners) listener()
    }
}
