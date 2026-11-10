# Additional plugins in equicord-v25-78

ArabicUI, BetterMicrophone, BetterScreenshare, Questify, PhilsPluginLibrary, FakeDeafen, and the Text component were adapted from Vencord Arabic at commit `1f6086929da6c066124b0a4f2c2b7c66d7c06323`: https://github.com/viciouscal/Vencord/tree/1f6086929da6c066124b0a4f2c2b7c66d7c06323. Original notices and translation licenses are retained. Compatibility changes include modal typings, developer references, and the channel-tabs import. Mc5mr distributes this customized build.

Bookmarks and Performance are adapted from reqon's GPL-3.0-or-later plugins:
https://github.com/reqonpublishes/vencord-custom-plugins/tree/1f7b95444018907324580a72437220faffadad75

The upstream copyright and license headers are retained. The full GPL license is included as LICENSE in this package.

Local changes: Bookmarks registers its mouse listeners only while enabled and removes them on stop. Performance cancels pending scroll work on stop, checks the selected channel before resuming, and is optional rather than enabled by default. Formatting was adapted to the host project.

These two additions were checked with TypeScript and the production build. Discord's live webpack patches still require verification in the installed client. They do not represent all plugins available on GitHub.

QuickRestart: adapted by Mc5mr from the same pinned reqon repository (plugins/quickRestart), retaining original authorship and GPL-3.0-or-later. This reduced variant exposes manual reload and native restart only; it does not intercept shortcuts, resync sessions, or restart other plugins.
