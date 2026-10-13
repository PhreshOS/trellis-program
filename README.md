# Trellis

A board to sketch on, for people and agents alike, drawn with
[Excalidraw](https://github.com/excalidraw/excalidraw).

A board is an `.excalidraw` file the person keeps wherever they like. Trellis keeps
no copy of its own: it shows what the file holds, writes back what is drawn a
moment later, and shows at once what anyone else writes into the file, a person
in another editor or an agent. Any Excalidraw opens the same file.

- **Windows and tabs:** each window holds tabs, one board each. The tabs and
  their order belong to the Trellis Server, so every window and agent sees the
  same; "+" opens a new draft.
- **Drafts:** a new board is a draft until the person saves it, choosing where
  through the file picker another Program offers (`file-picker-v1`). Closing a
  draft with something on it asks first.
- **Together:** every window and agent on the same file sees one board; each
  change reaches the others as it happens.
- **Pictures** are kept inside the file, as Excalidraw keeps them.

[`agent.md`](agent.md) is the contract for agents.

## Structure

- `server/main.ts`: the one Trellis Server, the Process named `board`: tabs, open
  boards, saving, and following each open file.
- `server/board-file.ts`: one board as a document: merging a window's change, and
  telling someone else's writing from Trellis's own.
- `server/tabs.ts`: the tabs of every window, in order.
- `client/`: the window: its tabs in the title row, and the board.

## Development

```sh
bun install
bun run dev
```
