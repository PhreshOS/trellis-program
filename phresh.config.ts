import { defineConfig } from "@phreshos/core"

export default defineConfig({
    identity: "trellis",
    name: "Trellis",
    description: "A board to sketch on, for people and agents alike.",
    version: "0.1.0",
    // Drawn from icon.svg: an easel, and on its board a drawn box like a planting bed, a sprout rising from it.
    icon: "icon.png",
    categories: ["Productivity"],
    keywords: ["board", "sketch", "diagram", "whiteboard"],
    agent: "agent.md",
    website: "https://github.com/PhreshOS/trellis-program",
    buildCommand: "vite-node scripts/build.ts",
    // An Excalidraw file opens on a board of its own.
    opens: ["application/vnd.excalidraw+json"],
    // Files are opened and saved where the person chooses, through the file picker another Program offers.
    permissions: { consumeServices: ["file-picker-v1"] },
    // One Server holds every board, in the Process named "board"; windows are Clients that reach it.
    server: {
        location: "dist/server",
        start: false,
        worker: "main.js",
        devCommand: "vite-node server/main.ts"
    },
    client: {
        location: "dist/client",
        title: "Trellis",
        // Trellis draws its own header: its tabs sit in the title row, beside the window buttons.
        header: false,
        size: { width: 1000, height: 680 },
        devCommand: "vite --config vite.client.ts"
    }
})
