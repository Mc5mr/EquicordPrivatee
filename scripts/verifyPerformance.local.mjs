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
    const intervals = new Map();
    const dialogs = [];
    let nextTimer = 0;
    let formatterCreations = 0;
    const fixtureIntl = Object.create(Intl);
    fixtureIntl.RelativeTimeFormat = class extends Intl.RelativeTimeFormat { constructor(...args) { super(...args); formatterCreations++; } };
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
        React: { useMemo: callback => callback(), useState: initial => [initial, () => {}], useEffect: () => {}, useRef: () => ({ current: null }), useLayoutEffect: () => {}, useSyncExternalStore: (_subscribe, snapshot) => snapshot(), createElement: h, cloneElement: (node, props) => h(node.type, { ...node.props, ...props }), isValidElement: value => !!value?.props, Children: { toArray: value => value == null ? [] : Array.isArray(value) ? value : [value] } },
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
        ["@components/ErrorBoundary", "const B={wrap: component=>component}; export default B;"],
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
    const context = { __stubs: stubs, h, Fragment: "Fragment", File, URL, Intl: fixtureIntl, Date: SessionDate, console, document: { body: {}, querySelectorAll: () => dialogs, createElement: () => ({ className: "", remove() {} }) }, MutationObserver: class { observe() {} disconnect() {} }, Vencord: { Plugins: { plugins: {} } }, setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, callback); timerDelays.set(id, delay); return id; }, clearTimeout: id => timers.delete(id), setInterval: (callback, delay) => { const id = ++nextTimer; intervals.set(id, { callback, delay }); return id; }, clearInterval: id => intervals.delete(id) };
    vm.createContext(context);
    vm.runInContext(bundle.outputFiles[0].text, context);
    const plugin = context.Subject.default;
    const drain = async (maximumDelay = Infinity) => {
        const due = [...timers].filter(([id]) => timerDelays.get(id) <= maximumDelay);
        const callbacks = due.map(([, callback]) => callback);
        for (const [id] of due) timers.delete(id);
        for (const callback of callbacks) callback();
        for (let i = 0; i < 30; i++) await Promise.resolve();
    };
    return { dialogs, timerDelays, intervals, formatterCreations: () => formatterCreations, plugin, exports: context.Subject, stubs, serverElements, engine, states, channels, joins, changes, downloads, notices, timers, drain, gatewayMessages, localMessages, localEvents, modals, menuPatches, styleCalls, channelListeners, setSelectedChannel: id => { selectedChannel = currentChannel = id; channelListeners.forEach(listener => listener()); }, setCurrentChannel: id => { currentChannel = id; channelListeners.forEach(listener => listener()); }, advanceClock: ms => { clockOffset += ms; }, getSocket: () => socket, setGatewayConnected: value => { gatewayConnected = value; }, replaceSocket: () => { socket = { isSessionEstablished: () => gatewayConnected, send: (op, data, ...rest) => { gatewayMessages.push({ op, data, rest }); } }; }, setStream: stream => { activeStream = stream; }, setPictures: value => { storedPictures = value; }, deny: () => { permitted = false; } };
}

function item(nodes, id) {
    for (const node of nodes.flat()) {
        if (!node || typeof node !== "object") continue;
        if (node.props?.id === id) return node;
        const found = item(node.children ?? [], id);
        if (found) return found;
    }
}


const resumeRegression = await load("FollowList");
await resumeRegression.plugin.start();
resumeRegression.states.set(friend, { userId: friend, channelId: "b" });
const resumeMenu = [];
resumeRegression.plugin.contextMenus["user-context"](resumeMenu, { user: { id: friend } });
item(resumeMenu, "mc5mr-love").props.action();
await resumeRegression.drain(0);
resumeRegression.states.set(me, { userId: me, channelId: null });
resumeRegression.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: null }] });
assert.equal(resumeRegression.plugin.headerBarButton.render().props.selected, false);
const resumeCalls = [];
resumeRegression.stubs.voiceSelect = id => { resumeCalls.push(id); return Promise.resolve(); };
resumeRegression.plugin.headerBarButton.render().props.onClick();
await resumeRegression.drain(0);
assert.deepEqual(resumeCalls, ["b"], "resume retries immediately even in the old channel cooldown");
resumeRegression.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: null }] });
await resumeRegression.drain(0);
assert.equal(resumeRegression.plugin.headerBarButton.render().props.selected, true, "the intermediate disconnected voice event cannot pause an active join");
assert.equal(resumeCalls.length, 1, "waiting for voice acknowledgement cannot duplicate the native request");
resumeRegression.states.set(me, { userId: me, channelId: "b" });
resumeRegression.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: "b" }] });
assert.equal(resumeRegression.timers.size, 0, "voice acknowledgement removes the attempt deadline");
resumeRegression.states.set(friend, { userId: friend, channelId: "c" });
resumeRegression.stubs.voiceSelect = id => { resumeCalls.push(id); return new Promise(() => {}); };
resumeRegression.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: friend, channelId: "c" }] });
await resumeRegression.drain(0);
assert.equal(resumeCalls.at(-1), "c");
await resumeRegression.drain(10_000);
assert.equal(resumeRegression.plugin.headerBarButton.render().props.selected, false, "an unconfirmed native attempt expires rather than staying blocked forever");
resumeRegression.plugin.headerBarButton.render().props.onClick();
await resumeRegression.drain(0);
assert.equal(resumeCalls.length, 3, "one click resumes after the attempt deadline without another cooldown");
resumeRegression.plugin.stop();
assert.equal(resumeRegression.timers.size, 0);

const quietRules = await load("VoiceLists");
quietRules.plugin.start();
for (let i = 0; i < 1000; i++) quietRules.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: visitor, channelId: "c" }] });
assert.equal(quietRules.timers.size, 0, "idle voice tools schedule no background reconciliation");
const quietMenu = [];
quietRules.plugin.contextMenus["user-context"](quietMenu, { user: { id: friend }, guildId: "g" });
item(quietMenu, "mc5mr-rule-mute").props.action();
await quietRules.drain();
const quietChanges = quietRules.changes.length;
for (let i = 0; i < 1000; i++) quietRules.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: visitor, channelId: "c" }] });
assert.equal(quietRules.timers.size, 0, "unrelated voice users cannot rescan active rules");
assert.equal(quietRules.changes.length, quietChanges);
quietRules.states.set(friend, { userId: friend, channelId: "a", mute: false });
quietRules.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: friend, channelId: "a", mute: false }] });
await quietRules.drain();
assert.equal(quietRules.changes.length, quietChanges + 1, "the affected user still reacts on the next event loop");
quietRules.plugin.stop();

const efficientEvents = await load("EventLogs", "tsx", "index", false);
const eventWrites = [];
efficientEvents.stubs.DataStore.set = async (key, rows) => { eventWrites.push({ key, rows }); };
await efficientEvents.plugin.start();
for (let i = 0; i < 500; i++) efficientEvents.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: friend, channelId: "a", mute: false, deaf: false }] });
assert.equal(eventWrites.length, 0, "voice events never write settings or disk synchronously");
assert.equal(efficientEvents.timers.size, 1, "a voice burst coalesces into one save");
await efficientEvents.drain();
assert.equal(eventWrites.length, 1);
assert.equal(eventWrites[0].rows.length, 1, "unchanged voice log entries are deduplicated");
let finishEventWrite;
efficientEvents.stubs.DataStore.set = (key, rows) => { eventWrites.push({ key, rows }); return new Promise(resolve => { finishEventWrite = resolve; }); };
efficientEvents.plugin.flux.RELATIONSHIP_ADD({ relationship: { id: friend, type: 1 } });
await efficientEvents.drain();
for (let i = 0; i < 1000; i++) efficientEvents.plugin.flux.RELATIONSHIP_ADD({ relationship: { id: visitor, type: i } });
assert.equal(efficientEvents.timers.size, 0, "a slow save cannot accumulate timers or snapshots");
assert.equal(eventWrites.length, 2, "at most one normal event save is in flight");
finishEventWrite();
await efficientEvents.drain(0);
efficientEvents.stubs.DataStore.set = async (key, rows) => { eventWrites.push({ key, rows }); };
await efficientEvents.drain();
assert.equal(eventWrites.length, 3, "the newest bounded log is saved once after storage recovers");
assert.equal(eventWrites.at(-1).rows.length, 500);
efficientEvents.plugin.flux.RELATIONSHIP_REMOVE({ id: friend });
efficientEvents.plugin.stop();
await efficientEvents.drain();
assert.equal(efficientEvents.timers.size, 0);
assert.equal(eventWrites.at(-1).key, "mc5mr-events:" + me, "stop flushes the last snapshot to its original owner");

const sharedClock = await load("SelfDestruct");
sharedClock.plugin.start();
sharedClock.plugin.chatBarButton.render({ channel: { id: "a" }, isMainChat: true }).props.onClick();
const clockUnsubscribe = [];
let changedSnapshots = 0;
sharedClock.stubs.React.useSyncExternalStore = (subscribe, read) => {
    let current = read();
    clockUnsubscribe.push(subscribe(() => { const next = read(); if (!Object.is(current, next)) { changedSnapshots++; current = next; } }));
    return current;
};
for (let i = 0; i < 100; i++) {
    const node = sharedClock.plugin.renderMessageAccessory({ message: { id: String(700000000000000000n + BigInt(i)) } });
    assert.equal(node.type(node.props), null);
}
assert.equal(sharedClock.intervals.size, 0, "messages without active deletion never start a clock");
for (let i = 0; i < 20; i++) {
    const message = { id: String(800000000000000000n + BigInt(i)), channel_id: "a", author: { id: me } };
    sharedClock.plugin.flux.MESSAGE_CREATE({ message });
    const node = sharedClock.plugin.renderMessageAccessory({ message });
    node.type(node.props);
}
assert.equal(sharedClock.intervals.size, 1, "twenty visible countdowns share a single one-second clock");
changedSnapshots = 0;
sharedClock.plugin.flux.MESSAGE_CREATE({ message: { id: "999999999999999999", channel_id: "a", author: { id: me } } });
assert.equal(changedSnapshots, 0, "scheduling another message cannot invalidate unrelated message snapshots");
for (const unsubscribe of clockUnsubscribe) unsubscribe();
assert.equal(sharedClock.intervals.size, 0, "unmounting the last countdown stops the shared clock");
sharedClock.plugin.stop();
assert.equal(sharedClock.timers.size, 0);

const efficientAges = await load("MessageTimestamps");
for (let i = 0; i < 500; i++) assert.equal(typeof efficientAges.exports.relativeAge(Date.now() - i * 60_000, Date.now()), "string");
assert.equal(efficientAges.formatterCreations(), 1, "all message timestamps share one locale formatter");
console.log("PASS: follow resume and acknowledgement deadline, 2000 unrelated voice events, bounded batched logging, one shared countdown clock and one relative-time formatter.");
