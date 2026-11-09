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
            if (stubs.voiceSelect) return stubs.voiceSelect(id);
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

async function verifyMessageTools() {
    const destruct = await load("SelfDestruct");
    destruct.plugin.start();
    destruct.plugin.chatBarButton.render({ channel: { id: "a" }, isMainChat: true }).props.onClick();
    const message = { id: "555555555555555555", channel_id: "a", author: { id: me } };
    const confirmation = { message, channelId: "a", optimistic: true, sendMessageOptions: { sendAnalytics: { duration: 90, queueSize: 0 } } };
    destruct.plugin.flux.MESSAGE_CREATE({ message, channelId: "a", optimistic: true });
    assert.equal(destruct.timers.size, 0, "the initial optimistic send must not start deletion");
    destruct.plugin.flux.MESSAGE_CREATE({ ...confirmation, mc5mrLocalPreview: true });
    destruct.plugin.flux.MESSAGE_CREATE({ ...confirmation, message: { ...message, author: { id: friend } } });
    destruct.plugin.flux.MESSAGE_CREATE({ ...confirmation, message: { ...message, channel_id: "b" } });
    assert.equal(destruct.timers.size, 0, "previews, other users and unarmed channels never schedule deletion");
    destruct.plugin.flux.MESSAGE_CREATE(confirmation);
    assert.equal(destruct.timers.size, 1, "Discord's successful optimistic send response must start the timer");
    assert.equal([...destruct.timerDelays.values()][0], 30_000);
    destruct.plugin.flux.MESSAGE_CREATE({ message, channelId: "a", optimistic: false });
    assert.equal(destruct.timers.size, 1, "the later gateway echo cannot create a second timer");
    const accessory = destruct.plugin.renderMessageAccessory({ message });
    assert.ok(accessory.type(accessory.props).children.includes(30), "the confirmed message immediately shows its countdown");
    destruct.advanceClock(10_000);
    assert.ok(accessory.type(accessory.props).children.includes(20), "the countdown follows the deletion deadline");
    await destruct.drain();
    assert.equal(destruct.changes.length, 1);
    assert.equal(destruct.changes[0].url, "/channels/a/messages/555555555555555555");
    assert.equal(destruct.changes[0].method, "DELETE");
    assert.equal(accessory.type(accessory.props), null);
    destruct.plugin.flux.MESSAGE_CREATE({ ...confirmation, message: { ...message, id: "666666666666666666" } });
    const menu = [];
    destruct.plugin.contextMenus.message(menu, { message: { id: "666666666666666666" } });
    item(menu, "mc5mr-cancel-destruct").props.action();
    await destruct.drain();
    assert.equal(destruct.changes.length, 1, "individual cancellation prevents a confirmed message's deletion");
    destruct.plugin.flux.MESSAGE_CREATE({ ...confirmation, message: { ...message, id: "777777777777777777" } });
    destruct.plugin.chatBarButton.render({ channel: { id: "a" }, isMainChat: true }).props.onClick();
    assert.equal(destruct.timers.size, 0, "turning the clock off cancels all remaining deadlines");
    destruct.plugin.stop();
    console.log("PASS: native successful-send confirmation, thirty-second countdown, gateway deduplication, ownership, cancellation and deletion.");
}


await verifyMessageTools();

const recoveringTimer = await load("SelfDestruct", "tsx", "index", false);
recoveringTimer.plugin.start();
const timerButton = () => recoveringTimer.plugin.chatBarButton.render({ channel: { id: "a" }, isMainChat: true });
timerButton().props.onClick();
const timerMessage = id => recoveringTimer.plugin.flux.MESSAGE_CREATE({ message: { id, channel_id: "a", author: { id: me } } });
let timerAttempts = 0;
recoveringTimer.stubs.RestAPI.del = async request => { timerAttempts++; if (timerAttempts === 1) throw Error("Temporary transport failure"); recoveringTimer.changes.push(request); };
timerMessage("111111111111111111");
timerMessage("222222222222222222");
await recoveringTimer.drain();
assert.equal(timerAttempts, 2, "one transport error cannot cancel the remaining deletion queue");
assert.equal(recoveringTimer.changes.length, 1);
assert.ok(timerButton().props.tooltip.includes("إيقاف"), "storage failure cannot stop the session toggle");
for (let i = 0; i < 500; i++) { timerButton().props.onClick(); timerButton().props.onClick(); }
timerMessage("333333333333333333");
await recoveringTimer.drain();
assert.equal(recoveringTimer.changes.length, 2, "timer controls survive repeated use without saving each state transition");
let finishOldDelete;
recoveringTimer.stubs.RestAPI.del = () => new Promise(resolve => { finishOldDelete = resolve; });
timerMessage("444444444444444444");
await recoveringTimer.drain();
recoveringTimer.plugin.stop();
recoveringTimer.plugin.start();
timerButton().props.onClick();
recoveringTimer.stubs.RestAPI.del = async request => { recoveringTimer.changes.push(request); };
timerMessage("555555555555555555");
await recoveringTimer.drain();
assert.equal(recoveringTimer.changes.length, 3, "an unfinished old deletion cannot block a restarted session");
finishOldDelete();
await recoveringTimer.drain();
assert.ok(timerButton().props.tooltip.includes("إيقاف"));
recoveringTimer.plugin.stop();

const recoveringFollow = await load("FollowList");
const followAttempts = [];

recoveringFollow.stubs.voiceSelect = id => new Promise((resolve, reject) => { followAttempts.push({ id, resolve, reject }); });
await recoveringFollow.plugin.start();
recoveringFollow.states.set(friend, { userId: friend, channelId: "b" });
const recoveringMenu = [];
recoveringFollow.plugin.contextMenus["user-context"](recoveringMenu, { user: { id: friend } });
item(recoveringMenu, "mc5mr-love").props.action();
await recoveringFollow.drain();
assert.equal(followAttempts.length, 1);
recoveringFollow.plugin.flux.CONNECTION_OPEN();
await recoveringFollow.drain();
await recoveringFollow.drain();
assert.equal(followAttempts.length, 2, "reconnect must abandon an unresolved old join");
followAttempts[0].reject(Error("Old socket failed"));
await recoveringFollow.drain();
assert.equal(recoveringFollow.plugin.headerBarButton.render().props.selected, true, "a stale failure cannot pause the current follow");
recoveringFollow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: friend, channelId: "b" }] });
await recoveringFollow.drain();
assert.equal(followAttempts.length, 2, "stale cleanup cannot unlock the new pending attempt");
recoveringFollow.plugin.headerBarButton.render().props.onClick();
recoveringFollow.plugin.flux.CONNECTION_OPEN();
await recoveringFollow.drain();
await recoveringFollow.drain();
assert.equal(followAttempts.length, 2, "reconnect respects an explicit pause");
recoveringFollow.plugin.headerBarButton.render().props.onClick();
recoveringFollow.advanceClock(1000);
await recoveringFollow.drain();
await recoveringFollow.drain();
assert.equal(followAttempts.length, 3, "resuming cannot remain blocked by the old pending attempt");
recoveringFollow.plugin.stop();
await recoveringFollow.plugin.start();
const restartedMenu = [];
recoveringFollow.plugin.contextMenus["user-context"](restartedMenu, { user: { id: friend } });
item(restartedMenu, "mc5mr-love").props.action();
await recoveringFollow.drain();
assert.equal(followAttempts.length, 4, "disable and enable clears stale join ownership");
recoveringFollow.plugin.stop();
for (const attempt of followAttempts.slice(1)) attempt.resolve();
await recoveringFollow.drain();
assert.equal(recoveringFollow.timers.size, 0, "late completion after stop cannot schedule follow");
console.log("PASS: session timer controls, isolated delete failures, stale jobs, reconnect recovery and preserved follow pause.");
