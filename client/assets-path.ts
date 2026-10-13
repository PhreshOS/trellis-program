// Excalidraw loads its fonts from here: shipped with this Client, never from a CDN. Imported first,
// so it is set before the library reads it.
(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = new URL("./", document.baseURI).href
