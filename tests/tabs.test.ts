import { expect, test, vi } from "vitest"
import Tabs, { titleOf, type Windows } from "../server/tabs"

/** Windows that end only when the test says so, and that remember being closed. */
function fakeWindows(open: Set<string>) {
    let ended: (window: string) => void = () => undefined
    const closed: string[] = []
    const windows: Windows = {
        followEnds(follow) { ended = follow },
        async exists(window) { return open.has(window) },
        async close(window) { closed.push(window); open.delete(window); ended(window) }
    }
    return { windows, closed, end(window: string) { open.delete(window); ended(window) } }
}

test("a board's tab is named after its file", () => {
    expect(titleOf("/data/Board 2.excalidraw")).toBe("Board 2")
    expect(titleOf("/home/me/plans.excalidraw")).toBe("plans")
})

test("a tab moves among its own window's tabs, and every window hears the new order", async () => {
    const tabs = new Tabs(fakeWindows(new Set(["a", "b"])).windows)
    // Two windows' tabs, opened in turns, so each window's lie between the other's.
    const opened: string[] = []
    for (const window of ["a", "b", "a", "b", "a"]) opened.push((await tabs.create(window, `/boards/${opened.length}.excalidraw`)).tab)
    const [a0, b0, a1, b1, a2] = opened
    const order = (window: string) => tabs.list().filter(tab => tab.window === window).map(tab => tab.tab)
    const changes = vi.fn()
    tabs.subscribe(changes)

    tabs.move(a2!, 0)
    expect(order("a")).toEqual([a2, a0, a1])
    expect(order("b")).toEqual([b0, b1])
    expect(changes).toHaveBeenCalledOnce()

    // Already there, or past the last when it is last: nothing moves.
    tabs.move(a2!, 0)
    tabs.move(a1!, 99)
    expect(changes).toHaveBeenCalledOnce()
    tabs.move(a0!, 99)
    expect(order("a")).toEqual([a2, a1, a0])
})

test("closing a window's last tab closes the window, and a window's end closes its tabs", async () => {
    const { windows, closed, end } = fakeWindows(new Set(["a", "b"]))
    const tabs = new Tabs(windows)
    const first = await tabs.create("a", "/boards/one.excalidraw")
    const second = await tabs.create("a", "/boards/two.excalidraw")
    await tabs.create("b", "/boards/one.excalidraw")

    tabs.close(first.tab)
    expect(closed).toEqual([])
    tabs.close(second.tab)
    await vi.waitFor(() => expect(closed).toEqual(["a"]))

    end("b")
    expect(tabs.list()).toEqual([])
})

test("a tab for a window that already ended opens nothing", async () => {
    const tabs = new Tabs(fakeWindows(new Set()).windows)
    await tabs.create("gone", "/boards/one.excalidraw")
    expect(tabs.list()).toEqual([])
})
