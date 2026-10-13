import { useEffect, useRef, useState } from "react"
import { useResolvedDesktopPreferences } from "@phreshos/react"
import { CaptureUpdateAction, Excalidraw, restoreElements } from "@excalidraw/excalidraw"
import type { BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import "@excalidraw/excalidraw/index.css"
import { ask, followChanges } from "./board-server"

type Element = Readonly<{ id: string, version: number, versionNonce: number }> & Record<string, unknown>

type Change = Readonly<{ board: string, from: string, elements: readonly Element[], files?: readonly BinaryFileData[] }>

/** This window, so it can tell its own changes from those of another window or an agent. */
const me = crypto.randomUUID()

/**
 * One board, drawn and edited here. The one Trellis Server owns every board; what this window changes
 * goes there, and what any other window or agent changes on the same board comes back.
 */
export default function Board({ board, onRead }: Readonly<{ board: string, onRead: () => void }>) {
    const theme = useResolvedDesktopPreferences().theme
    const [initial, setInitial] = useState<Readonly<{ elements: readonly Element[], files: readonly BinaryFileData[] }> | null>(null)
    const api = useRef<ExcalidrawImperativeAPI | null>(null)

    // Each element's version as the Server last has it from here, so only what changed since is sent;
    // and the pictures it already has.
    const sent = useRef(new Map<string, number>())
    const sentFiles = useRef(new Set<string>())
    const pending = useRef(0)

    useEffect(() => {
        void ask<Readonly<{ board: string, elements: readonly Element[], files: readonly BinaryFileData[] }>>("read", { board }).then(({ elements, files }) => {
            for (const element of elements) sent.current.set(element.id, element.version)
            for (const file of files) sentFiles.current.add(file.id)
            setInitial({ elements: complete(elements), files })
            onRead()
        })
    }, [board])

    useEffect(() => followChanges(payload => {
        const change = payload as Change
        if (change.board !== board || change.from === me || !api.current) return
        if (change.files?.length) {
            for (const file of change.files) sentFiles.current.add(file.id)
            api.current.addFiles([...change.files])
        }
        const local = new Map(api.current.getSceneElementsIncludingDeleted().map(element => [element.id, element as unknown as Element]))
        for (const element of complete(change.elements)) {
            const current = local.get(element.id)
            if (!current || element.version > current.version || (element.version === current.version && element.versionNonce < current.versionNonce)) local.set(element.id, element)
            sent.current.set(element.id, element.version)
        }
        // Another's change is not this window's to undo.
        api.current.updateScene({ elements: [...local.values()] as never, captureUpdate: CaptureUpdateAction.NEVER })
    }), [board])

    useEffect(() => () => cancelAnimationFrame(pending.current), [])

    function changed(elements: readonly unknown[], _state: unknown, files: BinaryFiles) {
        // At most one send each frame, of the elements whose version moved since the last, and the
        // pictures the Server does not have yet.
        if (pending.current) return
        pending.current = requestAnimationFrame(() => {
            pending.current = 0
            const all = (api.current?.getSceneElementsIncludingDeleted() ?? elements) as unknown as readonly Element[]
            const moved = all.filter(element => sent.current.get(element.id) !== element.version)
            const added = Object.values(api.current?.getFiles() ?? files).filter(file => !sentFiles.current.has(file.id))
            if (!moved.length && !added.length) return
            for (const element of moved) sent.current.set(element.id, element.version)
            for (const file of added) sentFiles.current.add(file.id)
            void ask("change", { board, from: me, elements: moved, files: added } satisfies Change)
        })
    }

    if (!initial) return null

    return <Excalidraw
        excalidrawAPI={instance => { api.current = instance }}
        // Its own background unpainted: the window's well shows through, in the Appearance's color.
        // Opened on what is drawn, wherever on the board it is.
        initialData={{ elements: initial.elements as never, files: Object.fromEntries(initial.files.map(file => [file.id, file])), appState: { viewBackgroundColor: "transparent" }, scrollToContent: true }}
        theme={theme}
        onChange={changed}
    />
}

/**
 * Elements as Excalidraw draws them: one written by hand or by an agent may give only what it means,
 * such as its type and place, and the rest is filled in. Versions stay as the Server set them.
 */
function complete(elements: readonly Element[]): readonly Element[] {
    // A text given without its measures is measured here, so all of it shows.
    const restored = restoreElements(elements as never, null, { refreshDimensions: true, repairBindings: true }) as unknown as Element[]
    const versions = new Map(elements.map(element => [element.id, element]))
    return restored.map(element => {
        const given = versions.get(element.id)
        return given ? { ...element, version: given.version, versionNonce: given.versionNonce } : element
    })
}
