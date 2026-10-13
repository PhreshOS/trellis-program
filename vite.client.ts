import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import { defineConfig } from "vite"
import { resolve } from "node:path"
import { cpSync } from "node:fs"
import type { Plugin } from "vite"

/** Excalidraw's fonts, shipped with the Client: copied where Vite serves and builds public files. */
function excalidrawFonts(): Plugin {
    return {
        name: "excalidraw-fonts",
        buildStart() {
            cpSync(resolve(import.meta.dirname, "node_modules/@excalidraw/excalidraw/dist/prod/fonts"), resolve(import.meta.dirname, "client/public/fonts"), { recursive: true })
        }
    }
}

export default defineConfig({
    root: "client",
    plugins: [excalidrawFonts(), react(), babel({ presets: [reactCompilerPreset()] })],
    base: process.env.PHRESHOS_CLIENT_BASE ?? "./",
    resolve: {
        tsconfigPaths: true,
        // Linked SDKs must consume the Program's renderer instance.
        dedupe: ["react", "react-dom"]
    },
    server: {
        // The address `phresh dev` chose, so it and the System reach this server.
        host: process.env.PHRESHOS_CLIENT_HOST,
        port: Number(process.env.PHRESHOS_CLIENT_PORT ?? "5200"),
        strictPort: true
    },
    build: {
        emptyOutDir: true,
        outDir: resolve(import.meta.dirname, "dist/client")
    }
})
