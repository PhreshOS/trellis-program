# Trellis

Trellis draws on Excalidraw files: `.excalidraw` files the person keeps wherever
they like. A board is its file. Trellis keeps no copy of its own: what it shows is
what the file holds, and what is drawn is written back to the file a moment
later. Every window and agent on the same file sees one board.

## The simplest way: write the file

Write or edit the file itself, as JSON. While the file is open in Trellis, what
you write appears in every window at once; when it is not, Trellis reads it the
next time it opens.

```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [
    { "id": "box-1", "type": "rectangle", "x": 0, "y": 0, "width": 220, "height": 120 },
    { "id": "label-1", "type": "text", "x": 20, "y": 40, "text": "Hello", "fontSize": 28 },
    { "id": "arrow-1", "type": "arrow", "x": 220, "y": 60, "points": [[0, 0], [160, 0]] }
  ],
  "appState": {},
  "files": {}
}
```

- Each element needs a unique `id`, its `type`, and where it is (`x`, `y`, and
  `width` and `height` for shapes). Everything else is filled in with
  Excalidraw's defaults: colors, stroke, roughness, versions.
- Types: `rectangle`, `ellipse`, `diamond`, `text`, `arrow`, `line`, `freedraw`,
  `image`, `frame`. A `text` takes `text` and `fontSize`; an `arrow` or `line`
  takes `points`, relative to its `x` and `y`.
- To change an element, write it again with the same `id`. To remove one, leave
  it out of `elements`. What you write wins over what is on screen: versions do
  not need to be raised.
- Keep the elements Trellis wrote, with their fields, unless you mean to change
  them: read the file first, change what you mean to, write it back whole.
- Write the whole file at once. A half-written file is waited out.

## Open a file in a window

Show the person a board with the System's opening, which starts Trellis for this
type when it is the default, or asks the owner which Program opens it:

```json
{ "$domain": "system", "$operation": "open", "type": "application/vnd.excalidraw+json", "uri": "file:///Users/me/Boards/plan.excalidraw" }
```

## Through the Trellis Server

The one Trellis Server is the Process named `board`, Server only. Find or create
it, then ask it with `endpoint.ask`:

```json
{ "$domain": "process", "$operation": "findOrCreate", "program": "trellis", "launch": { "name": "board", "server": true, "client": false } }
{ "$domain": "endpoint", "$operation": "ask", "program": "trellis", "process": "board", "endpoint": "server", "event": "read", "input": { "board": "/Users/me/Boards/plan.excalidraw" } }
```

| Event | Input | Answer |
| --- | --- | --- |
| `read` | `{ "board": "/absolute/path.excalidraw" }` | `{ board, elements, files }`: every element, deleted ones too (`isDeleted`), and the pictures |
| `change` | `{ "board": path, "from": "your-name", "elements": [...], "files": [...] }` | How many elements changed |
| `tabs.list` | none | The boards open in windows: `{ tab, window, board, title, draft }` |

A `change` keeps the newer of each element by Excalidraw's rule: a higher
`version` wins, and a tie goes to the lower `versionNonce`. So raise `version`
on each element you change, or prefer writing the file, where you need not.
Each change is announced to every window and agent as the event `changed`:
`{ board, from, elements, files }`.

A board whose `board` starts with `draft:` is not saved anywhere yet: only the
person saves it, choosing where.
