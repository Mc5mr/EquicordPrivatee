# Additional plugins in equicord-v25-78

Bookmarks and Performance are adapted from reqon's GPL-3.0-or-later plugins:
https://github.com/reqonpublishes/vencord-custom-plugins/tree/1f7b95444018907324580a72437220faffadad75

The upstream copyright and license headers are retained. The full GPL license is included as LICENSE in this package.

Local changes: Bookmarks registers its mouse listeners only while enabled and removes them on stop. Performance cancels pending scroll work on stop, checks the selected channel before resuming, and is optional rather than enabled by default. Formatting was adapted to the host project.

These two additions were checked with TypeScript and the production build. Discord's live webpack patches still require verification in the installed client. They do not represent all plugins available on GitHub.

QuickRestart: adapted by Mc5mr from the same pinned reqon repository (plugins/quickRestart), retaining original authorship and GPL-3.0-or-later. This reduced variant exposes manual reload and native restart only; it does not intercept shortcuts, resync sessions, or restart other plugins.
