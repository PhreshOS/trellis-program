# Security

Do not include credentials, personal information, or sensitive System data in public reports. Report
suspected vulnerabilities privately to the repository maintainer with the affected version, impact,
and a minimal reproduction.

Trellis reads and writes only the `.excalidraw` files a person opens or saves with it, and watches
the folders of those that are open. It asks for one permission, to use the `file-picker-v1` Service
that lets the person choose where a board is opened from or saved to. It keeps no data of its own.
