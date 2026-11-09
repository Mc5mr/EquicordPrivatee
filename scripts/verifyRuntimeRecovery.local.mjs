import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const me = "523157034141745153";
const friend = "111111111111111111";
const visitor = "222222222222222222";
const channel = (id, guild = "g") => ({ id, guild_id: guild, type: 2, name: id });

async function load(name, extension = "tsx", entry = "index", settingsWritable = true) {
    let selectedChannel = "a";
    let currentChannel = "a";
    const channelListeners = new Set();
    const timers = new Map();
    const timerDelays = new Map();
    const dialogs = [];
    let nextTimer = 0;
    const channels = new Map([channel("a"), channel("b"), channel("c")].map(value => [value.id, value]));
    const states = new Map([[me, { userId: me, channelId: "a" }], [friend, { userId: friend, channelId: "a", mute: false, deaf: false }]]);
    const joins = [];
    const changes = [];
    const downloads = [];
    const notices = [];
    const gatewayMessages = [];
    const localMessages = [];
    const localEvents = [];
    const modals = [];
    const menuPatches = new Set();
    const styleCalls = [];
    const serverElements = new Set();
    const engine = { connections: new Set(), connect(userId) {
        const applied = {};
        const connection = {
            userId, context: "default", destroyed: false, voiceBitrate: 64000, applied,
            destroy() { this.destroyed = true; engine.connections.delete(this); },
            conn: { setTransportOptions(options) { Object.assign(applied, options); } },
            getCodecOptions: () => ({ audioEncoder: { type: 120, name: "opus", channels: 1, freq: 48000, pacsize: 960, params: { fec: true } }, encryption: "keep", videoEncoder: { codec: "h264" } }),
            getConnectionTransportOptions: () => ({ encodingVoiceBitRate: 64000, encryption: "keep" }),
            setVoiceBitRate(value) { this.voiceBitrate = value; this.conn.setTransportOptions({ encodingVoiceBitRate: value }); }
        };
        this.connections.add(connection); return connection;
    } };
    let clockOffset = 0;
    class SessionDate extends Date { static now() { return Date.now() + clockOffset; } }
    let gatewayConnected = true;
    let socket = { isSessionEstablished: () => gatewayConnected, send: (op, data, ...rest) => { gatewayMessages.push({ op, data, rest }); } };
    let activeStream = { guildId: "g", channelId: "a", ownerId: me };
    let storedPictures = [];
    let permitted = true;
    const h = (type, props, ...children) => {
        const properties = { ...(props ?? {}) };
        if (children.length) properties.children = children.flat();
        const node = { type, props: properties };
        Object.defineProperty(node, "children", { get: () => properties.children == null ? [] : Array.isArray(properties.children) ? properties.children : [properties.children] });
        return node;
    };
    const stubs = {
        ReactDOM: { createPortal: node => node },
        addServerListElement: (_position, component) => serverElements.add(component), removeServerListElement: (_position, component) => serverElements.delete(component),
        React: { useState: initial => [initial, () => {}], useEffect: () => {}, useRef: () => ({ current: null }), useLayoutEffect: () => {}, useSyncExternalStore: (_subscribe, snapshot) => snapshot(), createElement: h, cloneElement: (node, props) => h(node.type, { ...node.props, ...props }), isValidElement: value => !!value?.props, Children: { toArray: value => value == null ? [] : Array.isArray(value) ? value : [value] } },
        Menu: new Proxy({}, { get: (_target, key) => key }),
        UserStore: { getCurrentUser: () => ({ id: me }), getUser: id => ({ id, username: id, avatar: null, getAvatarURL: () => `https://cdn.discordapp.com/avatars/${id}/test.png` }), emitChange: () => {} },
        UserProfileStore: { getUserProfile: () => ({ bio: "Visible biography", pronouns: "", banner: "test" }) },
        ContextMenuApi: { openContextMenu: (_event, render) => { modals.push(render()); }, closeContextMenu: () => {} },
        enableStyle: id => styleCalls.push({ enabled: true, id }), disableStyle: id => styleCalls.push({ enabled: false, id }),
        addGlobalContextMenuPatch: patch => menuPatches.add(patch), removeGlobalContextMenuPatch: patch => menuPatches.delete(patch),
        RelationshipStore: { isFriend: id => id === friend, getFriendIDs: () => [friend] },
        ChannelStore: { getChannel: id => channels.get(id), getChannelIds: () => [...channels.keys()] },
        SelectedChannelStore: { getVoiceChannelId: () => states.get(me)?.channelId, getChannelId: () => selectedChannel, getCurrentlySelectedChannelId: () => currentChannel, addChangeListener: listener => channelListeners.add(listener), removeChangeListener: listener => channelListeners.delete(listener) },
        PermissionStore: { can: () => permitted },
        PermissionsBits: { CONNECT: 1n, VIEW_CHANNEL: 2n, MOVE_MEMBERS: 4n, MUTE_MEMBERS: 8n, DEAFEN_MEMBERS: 16n, ADMINISTRATOR: 32n, MANAGE_GUILD: 64n, MANAGE_CHANNELS: 128n, MANAGE_THREADS: 256n, MANAGE_EVENTS: 512n, MANAGE_ROLES: 1024n, MANAGE_MESSAGES: 2048n, MODERATE_MEMBERS: 4096n, KICK_MEMBERS: 8192n, BAN_MEMBERS: 16384n },
        GuildChannelStore: { getChannels: () => ({ VOCAL: [...channels.values()].map(value => ({ channel: value })) }) },
        GuildStore: { getGuild: id => ({ id, name: id, ownerId: me, premiumTier: 0, features: new Set() }), getGuilds: () => ({}) },
        GuildMemberStore: { getMember: () => ({ roles: ["admin"] }) },
        GuildRoleStore: { getRole: () => ({ permissions: 0n }) }, SelectedGuildStore: { getGuildId: () => "g" }, Tooltip: "Tooltip",
        IconUtils: { getUserAvatarURL: user => user.getAvatarURL?.() ?? `avatar:${user.id}`, getDefaultAvatarURL: id => `default:${id}`, getUserBannerURL: ({ id, banner }) => `https://cdn.discordapp.com/banners/${id}/${banner}.png` },
        UsernameUtils: { getName: user => user.globalName || user.username, getGlobalName: user => user.globalName || user.username, getFormattedName: user => user.username, getUserTag: user => user.username },
        DisplayProfileUtils: { getDisplayProfile: userId => ({ userId, bio: "Real bio", getBannerURL: () => "real-banner" }) },
        VoiceStateStore: {
            getVoiceState: (guildId, id) => { const state = states.get(id); return channels.get(state?.channelId)?.guild_id === guildId ? state : undefined; },
            getVoiceStateForUser: id => states.get(id),
            getVoiceStatesForChannel: id => Object.fromEntries([...states].filter(([, value]) => value.channelId === id))
        },
        ApplicationStreamingStore: { getCurrentUserActiveStream: () => activeStream },
        MediaEngineStore: { getMediaEngine: () => engine, isMute: () => false, isDeaf: () => false, isVideoEnabled: () => false },
        DataStore: { get: async () => storedPictures, set: async () => {} },
        findByPropsLazy: prop => prop === "getSocket" ? { getSocket: () => socket } : ({ selectVoiceChannel: async id => {
            joins.push(id);
            states.set(me, { userId: me, channelId: id });
        } }),
        RestAPI: {
            post: async request => { changes.push(request); },
            del: async request => { changes.push({ ...request, method: "DELETE" }); },
            patch: async request => {
                changes.push(request);
                const id = request.url.split("/").pop();
                const current = states.get(id);
                if (current) states.set(id, { ...current, ...(request.body.channel_id !== undefined ? { channelId: request.body.channel_id } : {}), ...(request.body.mute !== undefined ? { mute: request.body.mute } : {}), ...(request.body.deaf !== undefined ? { deaf: request.body.deaf } : {}) });
            },
            get: async () => ({ body: [] })
        },
        Constants: { Endpoints: { GUILD: id => `/guilds/${id}`, GUILD_ROLES: id => `/guilds/${id}/roles`, GUILD_ROLE: (id, role) => `/guilds/${id}/roles/${role}`, GUILD_CHANNELS: id => `/guilds/${id}/channels`, GUILD_EMOJIS: id => `/guilds/${id}/emojis`, CHANNEL: id => `/channels/${id}`, GUILD_MEMBER: (guildId, userId) => `/guilds/${guildId}/members/${userId}`, MESSAGES: id => `/channels/${id}/messages`, MESSAGE: (id, message) => `/channels/${id}/messages/${message}`, STREAM_PREVIEW: key => `/streams/${key}/preview` } },
        sleep: async () => {},
        MessageActions: { startEditMessage: (channelId, messageId, content) => localEvents.push({ type: "MESSAGE_START_EDIT", channelId, messageId, content }), endEditMessage: channelId => localEvents.push({ type: "MESSAGE_END_EDIT", channelId }) },
        fetchUserProfile: async () => undefined,
        showToast: value => notices.push(value),
        Toasts: { Type: { FAILURE: "failure", SUCCESS: "success" } },
        saveFile: file => downloads.push(file),
        definePluginSettings: definition => {
            const store = Object.fromEntries(Object.entries(definition).map(([key, value]) => [key, value.default ?? value.options?.find(option => option.default)?.value]));
            const settings = settingsWritable ? store : new Proxy(store, { set() { throw Error("An object could not be cloned."); } });
            return { store: settings, use: () => settings };
        },
        NavigationRouter: { transitionTo: path => notices.push(path) },
        Alerts: { show: alert => notices.push(alert) },
        useStateFromStores: (_stores, get) => get(), Avatar: "Avatar", Checkbox: "Checkbox", TextArea: "TextArea", TextInput: "TextInput", Select: "Select", SearchableSelect: "SearchableSelect",
        HeaderBarButton: "HeaderBarButton", UserAreaButton: "UserAreaButton", Button: "Button", Heart: "Heart", Modal: "Modal", ConfirmModal: "ConfirmModal", openModal: (render, options) => { modals.push(render({ transitionState: 0, onClose: () => options?.onCloseCallback?.() })); }, closeModal: () => {},
        FluxDispatcher: { wait: callback => callback(), dispatch: event => localEvents.push(event) },
        sendBotMessage: (channelId, message) => { localMessages.push({ channelId, message }); return message; }
    };
    const modules = new Map([
        ["@utils/types", "export default x=>x; export const OptionType={STRING:1,SELECT:2,SLIDER:3,BOOLEAN:4,CUSTOM:5,NUMBER:6};"],
        ["@utils/constants", "export const Devs={Mc5mr:{name:'Mc5mr',id:523157034141745153n}};"],
        ["@api/ServerList", "export const {addServerListElement,removeServerListElement}=globalThis.__stubs; export const ServerListRenderPosition={Above:0};"],
        ["@api/ContextMenu", "export const {addGlobalContextMenuPatch,removeGlobalContextMenuPatch}=globalThis.__stubs;"],
        ["@api/Styles", "export const {enableStyle,disableStyle}=globalThis.__stubs;"],
        ["@api/Commands", "export const sendBotMessage=globalThis.__stubs.sendBotMessage;"],
        ["@api/HeaderBar", "export const HeaderBarButton=globalThis.__stubs.HeaderBarButton;"],
        ["@api/ChatButtons", "export const ChatBarButton='ChatBarButton';"],
        ["@api/UserArea", "export const UserAreaButton=globalThis.__stubs.UserAreaButton;"],
        ["@api/index", "export const DataStore=globalThis.__stubs.DataStore;"],
        ["@api/Settings", "export const definePluginSettings=globalThis.__stubs.definePluginSettings;"],
        ["@api/Badges", "export const BadgePosition={START:0};"],
        ["@plugins/_api/badges", "export default {getBadges: (...args) => globalThis.__stubs.ownBadges?.(...args) ?? []};"],
        ["@components/Button", "export const Button=globalThis.__stubs.Button;"],
        ["@components/FormSwitch", "export const FormSwitch='FormSwitch';"],
        ["@components/Heart", "export const Heart=globalThis.__stubs.Heart;"],
        ["@components/Icons", "export const UserIcon='UserIcon',TextIcon='TextIcon',TrashIcon='TrashIcon',PencilIcon='PencilIcon';"],
        ["@utils/css", "export const classNameFactory=prefix=>(...names)=>names.filter(name=>typeof name==='string').map(name=>prefix+name).join(' ');"],
        ["@utils/discord", "export const fetchUserProfile=(...args)=>globalThis.__stubs.fetchUserProfile(...args); export const openPrivateChannel=async()=>undefined;"],
        ["@utils/misc", 'export const sleep=globalThis.__stubs.sleep; export const classes=(...values)=>values.filter(Boolean).join(" ");'],
        ["@utils/clipboard", "export const copyToClipboard=()=>{};"],
        ["@utils/web", "export const saveFile=globalThis.__stubs.saveFile; export const chooseFile=async()=>null;"],
        ["@utils/modal", "export const openModal=()=>{}; export const ModalRoot='ModalRoot',ModalContent='ModalContent',ModalHeader='ModalHeader';"],
        ["@webpack", "export const findByPropsLazy=globalThis.__stubs.findByPropsLazy;"],
        ["@webpack/common", `const s=globalThis.__stubs; export const {${Object.keys(stubs).filter(key => !["findByPropsLazy", "sleep", "saveFile", "definePluginSettings", "Button", "Heart", "HeaderBarButton", "DataStore"].includes(key)).join(",")}}=s;`]
    ]);
    const bundle = await build({ entryPoints: [`${root}src/userplugins/${name}.discordDesktop/${entry}.${extension}`], bundle: true, write: false, format: "iife", globalName: "Subject", platform: "browser", jsxFactory: "h", jsxFragment: "Fragment", plugins: [{ name: "mock-discord", setup(builder) {
        builder.onLoad({ filter: /SilentMessageCore\.discordDesktop[\\/]index\.ts$/ }, async args => ({ contents: (await readFile(args.path, "utf8")).replace("export default definePlugin(", "const corePlugin = definePlugin(") + "\nexport default corePlugin; globalThis.__stubs.silentCore = corePlugin;", loader: "ts" }));
        builder.onResolve({ filter: /\.css(?:\?managed)?$/ }, () => ({ path: "style", namespace: "style" }));
        builder.onLoad({ filter: /.*/, namespace: "style" }, () => ({ contents: "export default '';", loader: "js" }));
        builder.onResolve({ filter: /^@/ }, args => modules.has(args.path) ? { path: args.path, namespace: "mock" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: modules.get(args.path), loader: "js" }));
    } }] });
    const context = { __stubs: stubs, h, Fragment: "Fragment", File, URL, Date: SessionDate, console, document: { body: {}, querySelectorAll: () => dialogs, createElement: () => ({ className: "", remove() {} }) }, MutationObserver: class { observe() {} disconnect() {} }, Vencord: { Plugins: { plugins: {} } }, setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, callback); timerDelays.set(id, delay); return id; }, clearTimeout: id => timers.delete(id) };
    vm.createContext(context);
    vm.runInContext(bundle.outputFiles[0].text, context);
    const plugin = context.Subject.default;
    const drain = async () => {
        const callbacks = [...timers.values()];
        timers.clear();
        for (const callback of callbacks) callback();
        for (let i = 0; i < 30; i++) await Promise.resolve();
    };
    return { dialogs, timerDelays, plugin, exports: context.Subject, stubs, serverElements, engine, states, channels, joins, changes, downloads, notices, timers, drain, gatewayMessages, localMessages, localEvents, modals, menuPatches, styleCalls, channelListeners, setSelectedChannel: id => { selectedChannel = currentChannel = id; channelListeners.forEach(listener => listener()); }, setCurrentChannel: id => { currentChannel = id; channelListeners.forEach(listener => listener()); }, advanceClock: ms => { clockOffset += ms; }, getSocket: () => socket, setGatewayConnected: value => { gatewayConnected = value; }, replaceSocket: () => { socket = { isSessionEstablished: () => gatewayConnected, send: (op, data, ...rest) => { gatewayMessages.push({ op, data, rest }); } }; }, setStream: stream => { activeStream = stream; }, setPictures: value => { storedPictures = value; }, deny: () => { permitted = false; } };
}

function item(nodes, id) {
    for (const node of nodes.flat()) {
        if (!node || typeof node !== "object") continue;
        if (node.props?.id === id) return node;
        const found = item(node.children ?? [], id);
        if (found) return found;
    }
}

function findButton(node, label) {
    if (!node || typeof node !== "object") return;
    if (node.type === "Button" && node.children.includes(label)) return node;
    for (const child of node.children ?? []) { const result = findButton(child, label); if (result) return result; }
}

const proof = await load("StreamProof");
proof.plugin.settings.store.automatic = true;
proof.plugin.start();
assert.equal(proof.styleCalls.at(-1).enabled, true);
proof.plugin.flux.STREAM_DELETE({ streamKey: `guild:g:a:${visitor}` });
assert.equal(proof.plugin.chatBarButton.render({ isMainChat: true }).props.tooltip.includes("ON"), true, "someone else's stream does not clear the mask");
proof.plugin.flux.STREAM_DELETE({ streamKey: `guild:g:a:${me}` });
assert.equal(proof.plugin.chatBarButton.render({ isMainChat: true }).props.tooltip.includes("ON"), false);
assert.equal(proof.styleCalls.at(-1).enabled, false, "ending your stream immediately removes the CSS mask");
proof.plugin.chatBarButton.render({ isMainChat: true }).props.onClick();
assert.equal(proof.styleCalls.at(-1).enabled, true, "manual toggle immediately applies CSS without a settings callback");
proof.plugin.flux.LOGOUT();
assert.equal(proof.styleCalls.at(-1).enabled, false);
proof.plugin.stop();
assert.equal(proof.styleCalls.at(-1).enabled, false, "disabling cleans up text blur");

const cloner = await load("ServerCloner");
const role = (id, name, position, managed = false) => ({ id, name, position, managed, permissions: "0", color: 0, hoist: false, mentionable: false });
const sourceRoles = [role("source", "@everyone", 0), role("source-role", "Team", 1)];
const targetRoles = [role("target", "@everyone", 0), role("admin", "Admin", 10), role("managed", "Bot", 3, true), role("extra", "Extra", 1)];
const sourceChannels = [{ id: "source-category", name: "Category", type: 4, position: 0, permission_overwrites: [{ id: "source-role", type: 0, allow: "2", deny: "0" }] }, { id: "source-voice", name: "Meeting", type: 2, position: 1, parent_id: "source-category", permission_overwrites: [{ id: "source", type: 0, allow: "0", deny: "2" }] }];
for (const value of sourceChannels) cloner.channels.set(value.id, { ...value, guild_id: "source" });
cloner.stubs.RestAPI.get = async request => ({ body: request.url === "/guilds/source/roles" ? sourceRoles : request.url === "/guilds/target/roles" ? targetRoles : request.url === "/guilds/source/channels" ? sourceChannels : [] });
let createdRoles = 0;
let createdChannels = 0;
cloner.stubs.RestAPI.post = async request => {
    cloner.changes.push({ ...request, method: "POST" });
    return { body: { id: request.url.endsWith("roles") ? `created-role-${++createdRoles}` : `created-channel-${++createdChannels}` } };
};
const cloneOptions = { roles: true, clearRoles: false, channels: true, clearChannels: false, permissions: true, settings: false, icon: false, emojis: false };
const cloneLogs = [];
cloner.plugin.start();
const clonerCoreBuild = await build({ entryPoints: [`${root}src/userplugins/ServerCloner.discordDesktop/clone.ts`], bundle: true, write: false, format: "iife", globalName: "ClonerCore", platform: "browser", plugins: [{ name: "clone-mocks", setup(builder) {
    builder.onResolve({ filter: /^@/ }, args => ({ path: args.path, namespace: "clone-mock" }));
    builder.onLoad({ filter: /.*/, namespace: "clone-mock" }, args => ({ contents: args.path === "@utils/misc" ? "export const sleep=async()=>{};" : `export const {${["ChannelStore", "Constants", "GuildMemberStore", "GuildStore", "IconUtils", "PermissionsBits", "PermissionStore", "RestAPI", "UserStore"].join(",")}}=globalThis.__stubs;`, loader: "js" }));
} }] });
const clonerContext = vm.createContext({ __stubs: cloner.stubs, URL, FileReader: undefined, fetch: undefined });
vm.runInContext(clonerCoreBuild.outputFiles[0].text, clonerContext);
const { cloneStructure, mapOverwrites, rolesToDelete } = clonerContext.ClonerCore;
assert.deepEqual([...rolesToDelete(targetRoles, "target", ["admin"], false)].map(value => value.id), ["extra"], "current roles and managed roles must be preserved");
assert.throws(() => mapOverwrites([{ id: "missing", type: 0, allow: "0", deny: "2" }], new Map(), new Set()), "missing role mapping must reject rather than weaken permissions");
await cloneStructure("source", "target", cloneOptions, { log: text => cloneLogs.push(text), cancelled: () => false });
const channelPosts = cloner.changes.filter(change => change.method === "POST" && change.url.endsWith("channels"));
assert.equal(channelPosts.length, 2);
assert.equal(channelPosts[1].body.parent_id, "created-channel-1", "parent category IDs must be remapped");
assert.equal(channelPosts[0].body.permission_overwrites.find(value => value.id === "created-role-1").allow, "0", "temporary privacy must remove role visibility grants");
assert.equal(channelPosts[0].body.permission_overwrites.find(value => value.id === "created-role-1").deny, "2", "temporary privacy must deny role visibility as well as everyone");
assert.ok(channelPosts[0].body.permission_overwrites.some(value => value.id === "target" && value.deny === "2"), "new channels must start with temporary @everyone visibility denial");
const restored = cloner.changes.filter(change => change.url === "/channels/created-channel-1" && change.body?.permission_overwrites);
assert.equal(restored[0].body.permission_overwrites.length, 1, "temporary mask must be removed after @everyone permissions are copied");
assert.equal(restored[0].body.permission_overwrites[0].id, "created-role-1", "final role IDs must be remapped");
assert.equal(restored[0].body.permission_overwrites[0].allow, "2", "final role visibility grant must be restored");
cloner.changes.length = 0;
await assert.rejects(cloneStructure("source", "source", cloneOptions, { log: () => {}, cancelled: () => false }));
assert.equal(cloner.changes.length, 0);

sourceRoles.push(role("source-bot-role", "Integration", 2, true));
sourceChannels[0].permission_overwrites.push({ id: "source-bot-role", type: 0, allow: "0", deny: "2" });
await cloneStructure("source", "target", cloneOptions, { log: text => cloneLogs.push(text), cancelled: () => false });
assert.ok(cloner.changes.some(change => change.method === "POST" && change.url.endsWith("roles") && change.body.name === "Integration"), "unmatched integration roles clone as normal roles instead of blocking every channel");
assert.ok(cloner.changes.some(change => change.method === "POST" && change.url.endsWith("channels") && change.body.permission_overwrites?.some(overwrite => overwrite.id === "created-role-3")), "integration role overwrites use the newly created target role");

const clonerWritesBeforeConfirm = cloner.changes.length;
const clonerUiUpdates = [];
cloner.stubs.GuildStore.getGuilds = () => ({ source: cloner.stubs.GuildStore.getGuild("source"), target: cloner.stubs.GuildStore.getGuild("target") });
cloner.stubs.React.useRef = value => ({ current: value });
function clonerPanel() {
    const values = ["source", "target", cloneOptions, false, []];
    let stateIndex = 0;
    cloner.stubs.React.useState = () => { const index = stateIndex++; return [values[index], value => clonerUiUpdates.push({ index, value })]; };
    cloner.plugin.settingsAboutComponent().props.onClick();
    const component = cloner.modals.at(-1).children[0];
    return component.type(component.props);
}
findButton(clonerPanel(), "Start cloning").props.onClick();
assert.equal(cloner.changes.length, clonerWritesBeforeConfirm, "cloning never writes before target confirmation");
cloner.modals.at(-1).props.onClose();
await cloner.drain();
assert.equal(cloner.changes.length, clonerWritesBeforeConfirm, "closing confirmation cancels without changing the server");
assert.ok(clonerUiUpdates.some(update => update.index === 3 && update.value === false), "closing confirmation unlocks the Start button");
findButton(clonerPanel(), "Start cloning").props.onClick();
cloner.modals.at(-1).props.onConfirm();
for (let i = 0; i < 10; i++) await cloner.drain();
assert.ok(cloner.changes.length > clonerWritesBeforeConfirm, "the native Start and confirmation buttons reach the selected target");
cloner.changes.length = 0;
cloner.deny();
await assert.rejects(cloneStructure("source", "target", cloneOptions, { log: () => {}, cancelled: () => false }));
assert.equal(cloner.changes.length, 0, "missing admin must prevent writes");
console.log("PASS: reviewed DM queue, cancellation and rate limit failure; message ownership and replacement ordering; clone role remapping, temporary privacy, category links and admin guards.");

const menuCloner = await load("ServerCloner");
const serverMenu = [];
menuCloner.plugin.contextMenus["guild-context"](serverMenu, { guild: { id: "g" } });
assert.equal(serverMenu.length, 1, "server cloning has a single top-level entry");
assert.equal(typeof item(serverMenu, "mc5mr-cloner").props.action, "function", "the single entry opens the cloner directly");
assert.equal(item(serverMenu, "mc5mr-cloner").children.length, 0, "there are no separate template and copy options");

const responsiveProof = await load("StreamProof", "tsx", "index", false);
responsiveProof.plugin.start();
for (let i = 0; i < 500; i++) {
    responsiveProof.plugin.chatBarButton.render({ isMainChat: true }).props.onClick();
    assert.equal(responsiveProof.styleCalls.at(-1).enabled, true, "mask toggles without writing synchronized settings");
    responsiveProof.plugin.flux.CONNECTION_OPEN();
    responsiveProof.plugin.flux.CHANNEL_SELECT();
    assert.equal(responsiveProof.styleCalls.at(-1).enabled, true, "navigation and reconnect preserve a manual mask");
    responsiveProof.plugin.chatBarButton.render({ isMainChat: true }).props.onClick();
    assert.equal(responsiveProof.styleCalls.at(-1).enabled, false);
}
responsiveProof.plugin.stop();
console.log("PASS: repeated session-only StreamProof toggles with unavailable settings writes, navigation and reconnect.");
