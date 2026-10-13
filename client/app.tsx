import { useEffect, useRef, useState } from "react"
import { context } from "@phreshos/client"
import { usePresentationState, useWindowState } from "@phreshos/react"
import { AlertDialog, DocumentTabs, Surface, Window, useRequirement } from "@phreshos/react-ui"
import { FolderOpen, PenLine, Save } from "@phreshos/react-ui/icons"
import icon from "../icon.png"
import Board from "./board"
import { ask, boardState, chooseBoard, chooseSavePlace, followTabs, saveBoard, tab as tabOf, windowIdentity, type TabEntry } from "./board-server"

/** Where a window remembers the tab shown last, on whichever Desktop showed it. */
const shownTab = "tab.shown"

/** Unsaved drafts about to close, and what closes once the person decides. */
type Closing = Readonly<{ drafts: readonly TabEntry[], close: () => void }>

/**
 * A Trellis window. Its tabs are the boards open in it: "+" opens a new draft, "Open…" a board file the
 * person chooses, and closing the last tab closes the window. A draft is saved to a file the person
 * chooses; closing one with something drawn on it asks first. The tabs and their order are the Trellis
 * Server's, so every window and agent sees the same; which one is shown is this window's own.
 */
export default function App() {
    const [me, setMe] = useState<string | null>(null)
    const [tabs, setTabs] = useState<readonly TabEntry[] | null>(null)
    useEffect(() => { void windowIdentity.then(setMe) }, [])
    useEffect(() => followTabs(setTabs), [])
    useEffect(() => { void ask<readonly TabEntry[]>("tabs.list").then(listed => setTabs(current => current ?? listed)) }, [])

    const mine = tabs?.filter(tab => tab.window === me) ?? []
    const [chosen, setChosen] = useState<string | null>(null)

    // Which tab is shown is each Desktop's own, and is not followed between them. The last one shown
    // anywhere is remembered in this window's memory, so the window, loaded again, starts on it.
    const [remembered, setRemembered] = useState<string | null | undefined>(undefined)
    useEffect(() => { void context.memory.get<string>(shownTab).then(tab => setRemembered(tab ?? null), () => setRemembered(null)) }, [])
    const current = mine.find(tab => tab.tab === (chosen ?? remembered)) ?? mine.at(-1) ?? null
    // Written only once read, so a window loading does not overwrite what it is about to start from.
    useEffect(() => {
        if (current && remembered !== undefined) void context.memory.set(shownTab, current.tab).catch(() => undefined)
    }, [current?.tab, remembered])

    // A tab that appears in this window, opened here or by the Server, is shown at once.
    const known = useRef<ReadonlySet<string> | null>(null)
    useEffect(() => {
        if (tabs === null || me === null) return
        const added = known.current ? mine.filter(tab => !known.current!.has(tab.tab)) : []
        if (added.length > 0) setChosen(added.at(-1)!.tab)
        known.current = new Set(mine.map(tab => tab.tab))
    }, [tabs, me])

    const [closing, setClosing] = useState<Closing | null>(null)

    /** The drafts among these tabs that closing would lose: drawn on, and shown by no other tab. */
    async function unsaved(closed: readonly TabEntry[]) {
        const drafts = closed.filter(tab => tab.draft && !(tabs ?? []).some(other => other.board === tab.board && !closed.includes(other)))
        const states = await Promise.all(drafts.map(tab => boardState(tab.board)))
        return drafts.filter((_, index) => states[index]!.drawn)
    }

    /** Closes, once the person has decided about what closing would lose. */
    async function closeAsking(closed: readonly TabEntry[], close: () => void) {
        const drafts = await unsaved(closed)
        if (drafts.length) setClosing({ drafts, close })
        else close()
    }

    /** The person chooses where to save a board; it is that file from then on. */
    async function saveTab(tab: TabEntry) {
        const file = await chooseSavePlace(tab.title)
        if (file) await saveBoard(tab.board, file)
        return file !== null
    }

    async function openBoard() {
        const file = await chooseBoard()
        if (file && me) await ask<TabEntry>("tab.create", { window: me, board: file })
    }

    const closeWindow = () => void context.process().then(process => process.exit())

    const window = useWindowState(context.window)
    // Focused as the Desktop showing it decides; it may focus another Window than the System's front one.
    const drawing = usePresentationState(context.presentation)
    const toggleMaximize = async () => context.window.maximize(!await context.window.maximized())

    // The window appears once its tabs are known and its board has been read; boards read later, for
    // another tab, appear in place.
    const [read, setRead] = useState(false)
    const [arrived, setArrived] = useState(false)
    if (!arrived && tabs !== null && remembered !== undefined && read) setArrived(true)
    useRequirement(arrived)

    return <div className="board-window">
        <Window.Header
            active={drawing?.focused ?? true}
            beginMoveGesture={context.presentation.beginMoveGesture}
            maximized={window?.maximized ?? false}
            onMaximize={() => void toggleMaximize()}
        >
            <Window.Header.Identity icon={icon} />
            {/* The center holds the tabs only; the empty header around them still moves the window. */}
            <Window.Header.Center style={{ flex: "0 1 auto", minWidth: 0 }}>
                <DocumentTabs aria-label="Boards" size="small" value={current?.tab ?? null} onChange={setChosen} addLabel="New board"
                    onClose={identity => {
                        const tab = mine.find(item => item.tab === identity)
                        if (tab) void closeAsking([tab], () => void tabOf(identity).close().catch(() => undefined))
                    }}
                    onMove={(identity, index) => void tabOf(identity).move(index).catch(() => undefined)}
                    onAdd={() => { if (me) void ask<TabEntry>("tab.create", { window: me }).catch(() => undefined) }}>
                    {mine.map(tab => <DocumentTabs.Tab key={tab.tab} id={tab.tab} title={tab.title} icon={<PenLine size={13} />} />)}
                </DocumentTabs>
            </Window.Header.Center>
            <Window.Header.Actions>
                <Window.Header.Action iconOnly aria-label="Open a board" onPress={() => void openBoard().catch(() => undefined)}><FolderOpen /></Window.Header.Action>
                <Window.Header.Action iconOnly aria-label="Save this board" disabled={!current} onPress={() => { if (current) void saveTab(current).catch(() => undefined) }}><Save /></Window.Header.Action>
                <Window.Header.Minimize preventFocusOnPress={false} onPress={() => void context.window.minimize()} />
                <Window.Header.Maximize />
                <Window.Header.Close preventFocusOnPress={false} onPress={() => void closeAsking(mine, closeWindow)} />
            </Window.Header.Actions>
        </Window.Header>
        {/* A well recessed into the window, as the Terminal's screen; the board is drawn on it, unpainted. */}
        <Surface depth="recessed" className="board-canvas">
            {current && remembered !== undefined && <Board key={current.board} board={current.board} onRead={() => setRead(true)} />}
        </Surface>
        <AlertDialog open={closing !== null} onOpenChange={open => { if (!open) setClosing(null) }}>
            <AlertDialog.Backdrop>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>{closing?.drafts.length === 1 ? `Save “${closing.drafts[0]!.title}” before closing?` : `Close ${closing?.drafts.length} boards without saving?`}</AlertDialog.Title>
                        <AlertDialog.Description>{closing?.drafts.length === 1 ? "It is not saved to any file: closing it without saving loses what is drawn on it." : "They are not saved to any file: closing them loses what is drawn on them. Save each one first to keep it."}</AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Close>Cancel</AlertDialog.Close>
                        <AlertDialog.Close color="danger" onPress={() => closing?.close()}>Don’t save</AlertDialog.Close>
                        {closing?.drafts.length === 1 && <AlertDialog.Close color="primary" onPress={() => {
                            const { drafts: [draft], close } = closing
                            void saveTab(draft!).then(saved => { if (saved) close() }).catch(() => undefined)
                        }}>Save…</AlertDialog.Close>}
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Backdrop>
        </AlertDialog>
    </div>
}
