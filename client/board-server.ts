import { context, system } from "@phreshos/client"
import { parseRelativeValue, type Process, type Value } from "@phreshos/core"

/** The one Server every Trellis window and agent uses: in the Process named "board", with no window. */
export const boardServer = { name: "board", server: true, client: false } as const

/** One board open in a window, as the Server lists it: a file, or a draft not saved yet. */
export type TabEntry = Readonly<{ tab: string, window: string, board: string, title: string, draft: boolean }>

let shared: Promise<Process> | undefined
const followers = new Set<(payload: unknown) => void>()
const tabFollowers = new Set<(tabs: readonly TabEntry[]) => void>()

/** The shared Server; a window that finds it gone starts it again. */
function server() {
    shared ??= (async () => {
        const process = await (await context.program()).findOrCreateProcess(boardServer)
        await process.server.waitReady()
        process.server.subscribe("changed", payload => { for (const follow of followers) follow(payload) })
        process.server.subscribe("tabs.changed", payload => { for (const follow of tabFollowers) follow(payload as readonly TabEntry[]) })
        return process
    })().catch(error => { shared = undefined; throw error })
    return shared
}

/** Asks the shared Server; when its Process has ended since, starts it again and asks once more. */
export async function ask<Result>(event: string, payload?: unknown): Promise<Result> {
    for (let attempt = 0; ; attempt++) {
        const process = await server()
        try {
            return await process.server.ask<Result>(event, payload)
        }
        catch (error) {
            const ended = await process.exited().catch(() => true)
            if (attempt > 0 || !ended) throw error
            shared = undefined
        }
    }
}

/** Hears every change the shared Server announces, on any board. */
export function followChanges(follow: (payload: unknown) => void) {
    followers.add(follow)
    void server().catch(() => undefined)
    return () => { followers.delete(follow) }
}

/** This window's own identity, which the Server knows it by. */
export const windowIdentity = context.process().then(process => process.identity)

/** Hears the tabs of every window, in their order, each time they change. */
export function followTabs(follow: (tabs: readonly TabEntry[]) => void) {
    tabFollowers.add(follow)
    void server().catch(() => undefined)
    return () => { tabFollowers.delete(follow) }
}

/** One tab, as a window uses it. */
export function tab(identity: string) {
    return {
        close: () => ask<void>("tab.close", { tab: identity }),
        move: (index: number) => ask<void>("tab.move", { tab: identity, index })
    }
}

/** Whether a board is a draft, and whether anything is drawn on it: what closing it would lose. */
export function boardState(board: string) {
    return ask<Readonly<{ draft: boolean, drawn: boolean }>>("board.state", { board })
}

/** Saves a board to a file; from then on, every tab showing it shows that file. */
export function saveBoard(board: string, file: string) {
    return ask<readonly TabEntry[]>("board.save", { board, file })
}

/** An Excalidraw file, as the picker filters and names it. */
export const boardType = "application/vnd.excalidraw+json"

/** How long a person may take to choose, before this window stops waiting. */
const choosing = 30 * 60_000

/**
 * Where a picker window stands: over this window, in its middle. This window's place may be in pixels
 * or in views, such as "200% - 340" two views down; either way the way to its middle is added in pixels.
 * A size given in views leaves the picker at this window's corner, still over it.
 */
async function overThisWindow(width: number, height: number) {
    const [position, size] = await Promise.all([context.window.position(), context.window.size()])
    const x = shifted(position.x, typeof size.width === "number" ? (size.width - width) / 2 : 0)
    const y = shifted(position.y, typeof size.height === "number" ? (size.height - height) / 2 : 0)
    return x === null || y === null ? undefined : { x, y }
}

/** A position value moved on by some pixels, in the same form it came in. */
function shifted(value: Value, by: number): Value | null {
    const parsed = parseRelativeValue(value)
    if (!parsed) return null
    const pixels = Math.round(parsed.pixels + by)
    if (parsed.relative === 0) return pixels
    const share = `${parsed.relative * 100}%`
    return pixels === 0 ? share : `${share} ${pixels < 0 ? "-" : "+"} ${Math.abs(pixels)}`
}

/** The file picker another Program offers, the "file-picker-v1" Service, whoever provides it. */
const filePicker = system.service({ name: "file-picker-v1", endpoint: "server" })

/** The file picker, once something holds it; a System where nothing does within a few seconds has none. */
async function picker() {
    await filePicker.waitReady(5_000).catch(() => { throw new Error("No Program on this System offers a file picker") })
    return filePicker
}

/** The person chooses a board file to open; null when they cancel. */
export async function chooseBoard() {
    const answer = await (await picker()).timeout(choosing).ask<Readonly<{ paths: readonly string[] }> | null>("open", { types: [boardType], position: await overThisWindow(720, 460) })
    return answer?.paths[0] ?? null
}

/** The person chooses where to save a board, starting from its name; null when they cancel. */
export async function chooseSavePlace(title: string) {
    const answer = await (await picker()).timeout(choosing).ask<Readonly<{ path: string }> | null>("save", { name: `${title}.excalidraw`, type: boardType, position: await overThisWindow(720, 460) })
    return answer?.path ?? null
}
