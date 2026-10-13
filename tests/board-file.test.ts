import { expect, test } from "vitest"
import BoardDocument, { type Element } from "../server/board-file"

const rectangle = (id: string, version = 1, more: Record<string, unknown> = {}) => ({ id, type: "rectangle", x: 0, y: 0, width: 10, height: 10, version, versionNonce: 5, ...more }) as Element
const file = (elements: unknown[], files: Record<string, unknown> = {}) => JSON.stringify({ type: "excalidraw", version: 2, elements, files })

test("a window's change keeps the newer of each element", () => {
    const board = BoardDocument.read(file([rectangle("a", 2)]))
    expect(board.merge([rectangle("a", 1, { x: 9 }), rectangle("b")]).elements.map(element => element.id)).toEqual(["b"])
    expect(board.merge([rectangle("a", 3, { x: 9 })]).elements).toHaveLength(1)
    expect(board.elements.get("a")?.x).toBe(9)
})

test("the Server's own writing is not someone else's change", () => {
    const board = BoardDocument.read(null)
    board.merge([rectangle("a")])
    expect(board.mergeFile(board.text())).toBeNull()
})

test("an edit written into the file by hand wins, even with the version kept as it was", () => {
    const board = BoardDocument.read(null)
    board.merge([rectangle("a", 4)])
    const written = board.text()
    const edited = JSON.parse(written)
    edited.elements[0].x = 120
    const changes = board.mergeFile(JSON.stringify(edited))!
    expect(changes.elements).toHaveLength(1)
    expect(changes.elements[0]).toMatchObject({ id: "a", x: 120 })
    // Raised above every version seen, so every window takes it.
    expect(changes.elements[0]!.version).toBeGreaterThan(4)
})

test("an element added by hand needs only an identity; one removed from the file is deleted", () => {
    const board = BoardDocument.read(null)
    board.merge([rectangle("a"), rectangle("b")])
    board.text()
    const changes = board.mergeFile(file([rectangle("a"), { id: "c", type: "text", text: "Hello", x: 0, y: 0 }]))!
    expect(changes.elements.map(element => [element.id, element.isDeleted ?? false])).toEqual([["c", false], ["b", true]])
    expect(board.drawn).toBe(true)
})

test("text that is not yet a whole file is waited out", () => {
    const board = BoardDocument.read(null)
    expect(board.mergeFile('{"elements": [')).toBeNull()
})

test("pictures travel with the elements that show them, and only those are written", () => {
    const board = BoardDocument.read(null)
    const picture = { id: "p", mimeType: "image/png", dataURL: "data:image/png;base64,AA==", created: 1 }
    const unused = { ...picture, id: "q" }
    expect(board.merge([rectangle("i", 1, { type: "image", fileId: "p" })], [picture, unused]).files.map(added => added.id)).toEqual(["p", "q"])
    expect(Object.keys(JSON.parse(board.text()).files)).toEqual(["p"])
})
