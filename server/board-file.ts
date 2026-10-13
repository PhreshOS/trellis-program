/** One drawn element as Excalidraw versions it: the higher version wins, and a tie goes to the lower nonce. */
export type Element = Readonly<{ id: string, version: number, versionNonce: number }> & Record<string, unknown>

/** A picture placed on a board, kept inside its file as Excalidraw keeps it. */
export type BoardFile = Readonly<{ id: string, mimeType: string, dataURL: string, created: number }> & Record<string, unknown>

/** What changed on a board: the elements as they are now, and any pictures they newly show. */
export type Changes = Readonly<{ elements: readonly Element[], files: readonly BoardFile[] }>

const nonce = () => Math.floor(Math.random() * 2 ** 31)

/**
 * One board as the Trellis Server holds it: its elements and pictures, and what its file held when it
 * was last read or written. Knowing that, a change someone else wrote into the file, by hand or by an
 * agent, is told apart from the Server's own writing, and wins even when its writer kept the versions
 * as they were.
 */
export default class BoardDocument {
    public readonly elements = new Map<string, Element>()
    public readonly files = new Map<string, BoardFile>()

    /** Each element as the file last held it, by its identity, and the file's whole text. */
    private written = new Map<string, string>()
    private writtenText: string | null = null

    /** Reads a board from its file's text; an empty or missing file is an empty board. */
    public static read(text: string | null) {
        const document = new BoardDocument()
        if (text !== null) {
            const parsed = parse(text)
            if (parsed) {
                for (const element of parsed.elements) document.elements.set(element.id, element)
                for (const file of parsed.files) document.files.set(file.id, file)
                document.remember(text, parsed.elements)
            }
        }
        return document
    }

    /** Whether anything is drawn: a board with nothing on it is let go without asking. */
    public get drawn() {
        return [...this.elements.values()].some(element => !element.isDeleted)
    }

    /** A change from a window or an agent: the newer of each element is kept. Returns what changed. */
    public merge(incoming: readonly Element[], files: readonly BoardFile[] = []): Changes {
        const changed: Element[] = []
        for (const element of incoming) {
            if (!isElement(element)) continue
            const current = this.elements.get(element.id)
            const newer = !current
                || element.version > current.version
                || (element.version === current.version && element.versionNonce < current.versionNonce)
            if (!newer) continue
            this.elements.set(element.id, element)
            changed.push(element)
        }
        return { elements: changed, files: this.add(files) }
    }

    /**
     * The file as someone else wrote it. What differs from what the file last held is their change:
     * an element they edited or added is taken, raised above every version seen here so every window
     * takes it too; one they removed is deleted. `null` when the text is the Server's own writing, or
     * cannot be read yet, as while it is still being written.
     */
    public mergeFile(text: string): Changes | null {
        if (text === this.writtenText) return null
        const parsed = parse(text)
        if (!parsed) return null
        const changed: Element[] = []
        const seen = new Set<string>()
        for (const element of parsed.elements) {
            seen.add(element.id)
            if (JSON.stringify(element) === this.written.get(element.id)) continue
            const current = this.elements.get(element.id)
            const taken = { ...element, version: Math.max(element.version, current?.version ?? 0) + 1, versionNonce: nonce() }
            this.elements.set(element.id, taken)
            changed.push(taken)
        }
        for (const id of this.written.keys()) {
            const current = this.elements.get(id)
            if (seen.has(id) || !current || current.isDeleted) continue
            const removed = { ...current, isDeleted: true, version: current.version + 1, versionNonce: nonce() }
            this.elements.set(id, removed)
            changed.push(removed)
        }
        this.remember(text, parsed.elements)
        return { elements: changed, files: this.add(parsed.files) }
    }

    /** The board as an Excalidraw file, with the pictures it shows; remembered as what the file holds. */
    public text() {
        const elements = [...this.elements.values()]
        const shown = new Set(elements.filter(element => !element.isDeleted && typeof element.fileId === "string").map(element => element.fileId as string))
        const files = Object.fromEntries([...this.files].filter(([id]) => shown.has(id)))
        const text = JSON.stringify({ type: "excalidraw", version: 2, source: "phreshos-board", elements, appState: {}, files }, null, 2)
        this.remember(text, elements)
        return text
    }

    private add(files: readonly BoardFile[]) {
        const added: BoardFile[] = []
        for (const file of files) {
            if (!isFile(file) || this.files.has(file.id)) continue
            this.files.set(file.id, file)
            added.push(file)
        }
        return added
    }

    private remember(text: string, elements: readonly Element[]) {
        this.writtenText = text
        this.written = new Map(elements.map(element => [element.id, JSON.stringify(element)]))
    }
}

/**
 * An Excalidraw file's elements and pictures, or `null` when the text is no such file. An element
 * written by hand may leave out its versions: it starts at the first.
 */
function parse(text: string): { elements: Element[], files: BoardFile[] } | null {
    let data: unknown
    try { data = JSON.parse(text) }
    catch { return null }
    if (!data || typeof data !== "object") return null
    const { elements, files } = data as { elements?: unknown, files?: unknown }
    if (elements !== undefined && !Array.isArray(elements)) return null
    return {
        elements: (elements ?? []).filter((element): element is Record<string, unknown> => !!element && typeof element === "object" && typeof (element as { id?: unknown }).id === "string")
            .map(element => ({ ...element, version: typeof element.version === "number" ? element.version : 1, versionNonce: typeof element.versionNonce === "number" ? element.versionNonce : 0 }) as Element),
        files: files && typeof files === "object" ? Object.values(files).filter(isFile) : []
    }
}

function isElement(value: unknown): value is Element {
    const element = value as Partial<Element> | null
    return !!element && typeof element.id === "string" && typeof element.version === "number" && typeof element.versionNonce === "number"
}

function isFile(value: unknown): value is BoardFile {
    const file = value as Partial<BoardFile> | null
    return !!file && typeof file.id === "string" && typeof file.dataURL === "string" && typeof file.mimeType === "string"
}
