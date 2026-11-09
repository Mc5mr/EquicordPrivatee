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
        DisplayProfileUtils: { getDisplayProfile: userId => ({ userId, ...stubs.UserProfileStore.getUserProfile(userId), getBannerURL: () => "real-banner" }) },
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

async function verifyNotificationPopups() {
    // Notification routing, per-account suppression and refreshed typing lifetimes.
    const mentions = await load("MentionPopup");
    mentions.setSelectedChannel("b");
    mentions.plugin.start();
    assert.equal(mentions.serverElements.size, 1);
    mentions.plugin.settings.store.timeout = 0;
    const mentionIncoming = { id: "mention-1", channel_id: "a", author: { id: friend, username: "Friend" }, mentions: [{ id: me }], content: "hello" };
    mentions.plugin.flux.MESSAGE_CREATE({ message: mentionIncoming });
    assert.equal(mentions.exports.getPopups().length, 1);
    findButton([...mentions.serverElements][0](), "رفض").props.onClick();
    assert.equal(mentions.exports.getPopups().length, 0);
    assert.equal(mentions.plugin.settings.store.ignored[me], undefined, "reject does not ignore the author");
    mentions.plugin.flux.MESSAGE_CREATE({ message: { ...mentionIncoming, id: "mention-2" } });
    mentions.exports.accept("mention-2");
    assert.equal(mentions.notices.at(-1), "/channels/g/a/mention-2");
    mentions.plugin.settings.store.roleIds = "role-a, role-b role-c";
    mentions.plugin.flux.MESSAGE_CREATE({ message: { ...mentionIncoming, id: "role-mention", channel_id: undefined, channelId: "a", mentions: [], mentionRoles: ["role-c"] } });
    assert.equal(mentions.exports.getPopups().length, 1);
    mentions.exports.ignore(friend);
    assert.equal(mentions.exports.getPopups().length, 0);
    mentions.plugin.flux.MESSAGE_CREATE({ message: { ...mentionIncoming, id: "ignored" } });
    assert.equal(mentions.exports.getPopups().length, 0);
    mentions.stubs.UserStore.getCurrentUser = () => ({ id: visitor });
    mentions.plugin.flux.MESSAGE_CREATE({ message: { ...mentionIncoming, id: "other-owner", mentions: [visitor] } });
    assert.equal(mentions.exports.getPopups().length, 1, "one account's ignore list must not affect another");
    mentions.plugin.stop();
    assert.equal(mentions.serverElements.size, 0);
    assert.equal(mentions.timers.size, 0);

    const filtered = await load("MentionPopup");
    filtered.plugin.start();
    filtered.plugin.settings.store.timeout = 10;
    filtered.channels.set("dm", { id: "dm", type: 1 });
    filtered.channels.set("group", { id: "group", type: 3 });
    const privateMention = { ...mentionIncoming, channel_id: "dm" };
    filtered.setSelectedChannel("dm");
    filtered.plugin.flux.MESSAGE_CREATE({ message: privateMention });
    filtered.setSelectedChannel("group");
    filtered.plugin.flux.MESSAGE_CREATE({ message: { ...privateMention, id: "open-group", channel_id: "group" } });
    assert.equal(filtered.exports.getPopups().length, 0, "the open DM or group conversation never creates a mention popup");
    assert.equal(filtered.timers.size, 0);
    filtered.setSelectedChannel("a");
    filtered.plugin.flux.MESSAGE_CREATE({ message: { ...privateMention, id: "other-dm" } });
    filtered.plugin.flux.MESSAGE_CREATE({ message: { ...privateMention, id: "other-group", channel_id: "group" } });
    assert.equal(filtered.exports.getPopups().length, 2, "mentions from other private conversations still appear");
    filtered.plugin.flux.MESSAGE_CREATE({ message: { ...privateMention, id: "bot-dm", author: { id: visitor, username: "Bot", bot: true } } });
    filtered.plugin.flux.MESSAGE_CREATE({ message: { ...privateMention, id: "bot-group", channel_id: "group", author: { id: visitor, username: "Bot", bot: true } } });
    assert.equal(filtered.exports.getPopups().length, 2, "bot mention popups are suppressed in private conversations");
    const getUser = filtered.stubs.UserStore.getUser;
    filtered.stubs.UserStore.getUser = id => ({ ...getUser(id), bot: id === visitor });
    filtered.plugin.flux.MESSAGE_CREATE({ message: { ...privateMention, id: "stored-bot", author: { id: visitor, username: "Bot" } } });
    assert.equal(filtered.exports.getPopups().length, 2, "stored bot metadata is respected when the message omits its bot flag");
    filtered.stubs.UserStore.getUser = getUser;
    filtered.setSelectedChannel("dm");
    assert.deepEqual(Array.from(filtered.exports.getPopups(), popup => popup.id), ["other-group"], "opening a private conversation removes its existing mention popups only");
    assert.equal(filtered.timers.size, 1, "dismissed popup timers are cancelled");
    filtered.plugin.flux.MESSAGE_CREATE({ message: { ...mentionIncoming, id: "guild-bot", author: { id: visitor, username: "Bot", bot: true } } });
    assert.equal(filtered.exports.getPopups().length, 2, "guild bot mentions retain their existing behavior");
    filtered.setSelectedChannel("group");
    assert.deepEqual(Array.from(filtered.exports.getPopups(), popup => popup.id), ["guild-bot"]);
    filtered.setSelectedChannel("a");
    filtered.plugin.flux.MESSAGE_CREATE({ message: { ...privateMention, id: "dm-after-leaving" } });
    assert.equal(filtered.exports.getPopups().length, 1, "leaving the DM re-enables its human mention popups and opening the guild channel dismisses that channel's popup");
    filtered.plugin.flux.MESSAGE_CREATE({ message: { ...mentionIncoming, id: "open-guild" } });
    assert.equal(filtered.exports.getPopups().length, 1, "mentions in the currently open guild conversation are suppressed too");
    filtered.plugin.stop(); assert.equal(filtered.timers.size, 0); assert.equal(filtered.serverElements.size, 0); assert.equal(filtered.channelListeners.size, 0);
    
    const typing = await load("DmTypingPopup");
    typing.channels.set("dm", { id: "dm", type: 1 });
    typing.plugin.start();
    typing.plugin.flux.TYPING_START({ channel_id: "dm", user_id: friend });
    const oldTypingTimer = [...typing.timers.keys()][0];
    typing.plugin.flux.TYPING_START({ channelId: "dm", userId: friend });
    assert.equal(typing.exports.getCards().length, 1);
    assert.equal(typing.timers.size, 1);
    assert.ok(!typing.timers.has(oldTypingTimer), "repeated typing replaces rather than reuses the expiry timer");
    typing.exports.openCard(`dm:${friend}`);
    assert.equal(typing.notices.at(-1), "/channels/@me/dm");
    assert.equal(typing.timers.size, 0);
    typing.plugin.flux.TYPING_START({ channelId: "a", userId: friend });
    assert.equal(typing.exports.getCards().length, 0, "guild typing does not show a DM popup");
    typing.channels.set("group", { id: "group", type: 3 });
    typing.setSelectedChannel("dm");
    typing.plugin.flux.TYPING_START({ channelId: "dm", userId: friend });
    typing.setSelectedChannel("group");
    typing.plugin.flux.TYPING_START({ channelId: "group", userId: friend });
    assert.equal(typing.exports.getCards().length, 0, "typing in the open DM or group does not show a popup");
    assert.equal(typing.timers.size, 0);
    typing.setSelectedChannel("a");
    typing.plugin.flux.TYPING_START({ channelId: "dm", userId: friend });
    typing.plugin.flux.TYPING_START({ channelId: "dm", userId: visitor });
    typing.plugin.flux.TYPING_START({ channelId: "group", userId: friend });
    assert.equal(typing.exports.getCards().length, 3);
    typing.setSelectedChannel("dm");
    assert.deepEqual(Array.from(typing.exports.getCards(), card => card.channelId), ["group"], "opening a DM dismisses all of its users' typing cards and leaves other conversations visible");
    assert.equal(typing.timers.size, 1);
    typing.setSelectedChannel("group");
    assert.equal(typing.timers.size, 0);
    typing.setSelectedChannel("a");
    typing.plugin.flux.TYPING_START({ channelId: "dm", userId: friend });
    assert.equal(typing.exports.getCards().length, 1, "typing popups resume after leaving the private conversation");
    typing.plugin.stop();
    assert.equal(typing.serverElements.size, 0);
    assert.equal(typing.timers.size, 0);
    assert.equal(typing.channelListeners.size, 0);
    for (const name of ["MentionPopup", "DmTypingPopup"]) {
        const subject = await load(name);
        subject.channels.set("dm", { id: "dm", type: 1 });
        subject.channels.set("group", { id: "group", type: 3 });
        subject.plugin.start();
        const items = name === "MentionPopup" ? subject.exports.getPopups : subject.exports.getCards;
        const incoming = channelId => name === "MentionPopup"
            ? subject.plugin.flux.MESSAGE_CREATE({ message: { ...privateMention, channel_id: channelId } })
            : subject.plugin.flux.TYPING_START({ channelId, userId: friend });
        subject.setCurrentChannel("dm");
        assert.equal(subject.stubs.SelectedChannelStore.getChannelId(), "a", "the guild-context fallback can differ from the displayed conversation");
        incoming("dm");
        assert.equal(items().length, 0, `${name} uses the displayed private conversation, not the fallback channel`);
        incoming("group");
        assert.equal(items().length, 1);
        subject.setCurrentChannel("group");
        assert.equal(items().length, 0, `${name} dismisses on store navigation without a plugin CHANNEL_SELECT event`);
        assert.equal(subject.timers.size, 0);
        const deferred = [];
        subject.stubs.FluxDispatcher.wait = callback => deferred.push(callback);
        incoming("dm");
        subject.setCurrentChannel("dm");
        deferred.shift()();
        assert.equal(items().length, 0, `${name} waits for native navigation to settle before showing a card`);
        incoming("group");
        subject.plugin.stop();
        deferred.shift()();
        assert.equal(items().length, 0, `${name} cannot recreate a popup from a queued callback after stopping`);
        assert.equal(subject.channelListeners.size, 0);
    }
    console.log("PASS: selected-private-conversation popup suppression, immediate navigation dismissal, private bot mention filtering, preserved guild mentions and cleanup.");
}

if (process.argv.includes("--notifications-only")) { await verifyNotificationPopups(); process.exit(0); }
if (process.argv.includes("--message-tools-only")) { await verifyMessageTools(); process.exit(0); }
await verifyMessageTools();

const voiceLayout = await load("NightcordUI", "ts");
voiceLayout.plugin.start();
const arrangeRoomMenu = [...voiceLayout.menuPatches][0];
const voiceRows = ["mc5mr-move-all", "mc5mr-list-protect", "mc5mr-list-blacklist", "mc5mr-slide", "mc5mr-list-pull", "mc5mr-list-freeze", "mc5mr-follow-channel", "mc5mr-stop-all"];
const roomRow = (id, children) => ({ type: "MenuItem", props: Object.freeze({ id, label: id, children }) });
const nativeRoomRows = [roomRow("edit-channel"), roomRow("delete-channel"), roomRow("copy-channel-id")];
const recorderRow = { type: "MenuCheckboxItem", props: Object.freeze({ id: "auto-record", checked: true, action: () => {} }) };
const loggerRow = roomRow("message-logger", [roomRow("message-logger-action")]);
const rawVoiceRows = voiceRows.toReversed().map(id => roomRow(id, [roomRow(`${id}-action`)]));
const crowdedRoomMenu = [...nativeRoomRows, { type: "MenuGroup", props: Object.freeze({ children: [recorderRow, ...rawVoiceRows] }) }, loggerRow];
arrangeRoomMenu("channel-context", crowdedRoomMenu);
const compactVoiceTools = item(crowdedRoomMenu, "mc5mr-voice-tools");
assert.ok(compactVoiceTools, "flat channel actions are consolidated into Voice Tools");
assert.equal(compactVoiceTools.type, "MenuItem", "Voice Tools is a native submenu, not a group of top-level rows");
assert.equal(compactVoiceTools.props.label, "Voice Tools");
assert.deepEqual(compactVoiceTools.props.children.map(node => node.props.id), voiceRows);
assert.ok(crowdedRoomMenu.every(node => !voiceRows.includes(node.props?.id)));
for (const row of [...nativeRoomRows, recorderRow, loggerRow]) assert.equal(item(crowdedRoomMenu, row.props.id), row, "native and other plugin rows retain their original actions");
for (const row of rawVoiceRows) assert.equal(item(compactVoiceTools.props.children, row.props.id), row, "voice submenu elements and their nested actions are preserved");
const oldFollowRow = roomRow("mc5mr-follow-channel");
const latestFollowRow = roomRow("mc5mr-follow-channel", [roomRow("current-follow-person")]);
const duplicatedRoomMenu = [
    roomRow("copy-channel-id"),
    { type: "MenuGroup", props: Object.freeze({ children: [roomRow("mc5mr-voice-tools", [rawVoiceRows[0], oldFollowRow])] }) },
    latestFollowRow,
    roomRow("mc5mr-voice-tools", [roomRow("mc5mr-move-all")])
];
assert.doesNotThrow(() => arrangeRoomMenu("channel-context", duplicatedRoomMenu), "frozen React props and nested containers are supported");
assert.equal(duplicatedRoomMenu.filter(node => node.props?.id === "mc5mr-voice-tools").length, 1);
assert.equal(item(duplicatedRoomMenu, "mc5mr-follow-channel"), latestFollowRow, "a later plugin update replaces its existing entry");
arrangeRoomMenu("channel-context", duplicatedRoomMenu);
assert.equal(duplicatedRoomMenu.filter(node => node.props?.id === "mc5mr-voice-tools").length, 1, "opening or arranging repeatedly does not duplicate the submenu");
const unrelatedRoomMenu = [...nativeRoomRows, recorderRow, loggerRow];
arrangeRoomMenu("channel-context", unrelatedRoomMenu);
assert.deepEqual(unrelatedRoomMenu, [...nativeRoomRows, recorderRow, loggerRow], "no Voice Tools entry is created without any active voice tools");
const roomVoiceLists = await load("VoiceLists");
const roomFollowList = await load("FollowList");
for (const producers of [[roomVoiceLists, roomFollowList], [roomFollowList, roomVoiceLists]]) {
    const combinedRoomMenu = [...nativeRoomRows];
    for (const producer of producers) producer.plugin.contextMenus["channel-context"](combinedRoomMenu, { channel: producer.channels.get("a") });
    arrangeRoomMenu("channel-context", combinedRoomMenu);
    assert.equal(combinedRoomMenu.length, nativeRoomRows.length + 1, "enabled voice plugins add exactly one top-level row in either registration order");
    const combinedTools = item(combinedRoomMenu, "mc5mr-voice-tools");
    assert.deepEqual(combinedTools.props.children.map(node => node.props.id), voiceRows);
    assert.equal(combinedTools.props.children.at(-1).props.label, "إيقاف كل الأكشنز والعمليات");
    assert.equal(typeof combinedTools.props.children.at(-1).props.action, "function");
    assert.equal(combinedRoomMenu[nativeRoomRows.length], combinedTools, "Voice Tools follows Discord's existing room actions");
}
voiceLayout.plugin.stop();
assert.equal(voiceLayout.menuPatches.size, 0);
console.log("PASS: compact native Voice Tools submenu, ordered merged plugin actions, frozen props, and preserved native/third-party entries.");
if (process.argv.includes("--voice-menu-only")) process.exit(0);

const follow = await load("FollowList");
await follow.plugin.start();
assert.equal(follow.plugin.headerBarButton.render(), null, "the upper heart is hidden when nobody is followed");
follow.plugin.userAreaButton.render().props.onClick();
assert.equal(follow.modals.length, 1, "the lower account button still opens the centered native manager");
assert.equal(follow.modals[0].props.role, "dialog");
assert.equal(follow.modals[0].props.size, "md", "use Discord's modal layout instead of manual fixed positioning");
assert.equal(follow.modals[0].props.actions[0].text, "إغلاق", "close action stays outside the scrollable content");
assert.equal(follow.modals[0].children[0].props.inModal, true);
const followMenu = [];
follow.plugin.contextMenus["user-context"](followMenu, { user: { id: friend } });
item(followMenu, "mc5mr-love").props.action();
follow.states.set(friend, { userId: friend, channelId: "b" });
await follow.drain();
assert.deepEqual(follow.joins, ["b"]);
follow.plugin.pauseFollow();
follow.states.set(friend, { userId: friend, channelId: "c" });
follow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: friend, channelId: "c" }] });
await follow.drain();
assert.equal(follow.joins.length, 1, "paused follow must not join");
item(followMenu, "mc5mr-love").props.action();
item(followMenu, "mc5mr-love").props.action();
await follow.drain();
assert.deepEqual(follow.joins, ["b", "c"]);
follow.deny();
follow.states.set(friend, { userId: friend, channelId: "a" });
follow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: friend, channelId: "a" }] });
await follow.drain();
assert.equal(follow.joins.length, 2, "missing CONNECT must block follow");
follow.plugin.stop();
assert.equal(follow.timers.size, 0);

const waitingFollow = await load("FollowList");
await waitingFollow.plugin.start();
waitingFollow.stubs.PermissionStore.can = permission => permission !== waitingFollow.stubs.PermissionsBits.MOVE_MEMBERS;
waitingFollow.channels.set("b", { ...channel("b"), userLimit: 2 });
waitingFollow.states.set(friend, { userId: friend, channelId: "b" });
waitingFollow.states.set(visitor, { userId: visitor, channelId: "b" });
const waitingMenu = [];
waitingFollow.plugin.contextMenus["user-context"](waitingMenu, { user: { id: friend } });
item(waitingMenu, "mc5mr-love").props.action();
await waitingFollow.drain();
assert.equal(waitingFollow.joins.length, 0, "a full target room waits without attempting to join");
assert.equal(waitingFollow.timers.size, 0, "waiting for a vacancy does not poll");
waitingFollow.states.delete(visitor);
waitingFollow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: visitor, channelId: null, oldChannelId: "b" }] });
await waitingFollow.drain();
assert.deepEqual(waitingFollow.joins, ["b"], "another person leaving opens the target room");
waitingFollow.plugin.settings.store.manualOnly = true;
waitingFollow.states.set(friend, { userId: friend, channelId: "c" });
waitingFollow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: friend, channelId: "c" }] });
await waitingFollow.drain();
assert.deepEqual(waitingFollow.joins, ["b"], "manual mode does not follow target moves");
waitingFollow.plugin.settings.store.manualOnly = false;
waitingFollow.plugin.settings.store.autoReturn = true;
waitingFollow.states.set(me, { userId: me, channelId: null });
waitingFollow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: null }] });
await waitingFollow.drain();
assert.deepEqual(waitingFollow.joins, ["b", "c"], "auto return rejoins the current target");
waitingFollow.plugin.settings.store.leaveWithTarget = true;
waitingFollow.states.set(friend, { userId: friend, channelId: null });
waitingFollow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: friend, channelId: null }] });
await waitingFollow.drain();
assert.equal(waitingFollow.joins.at(-1), null, "leave with target disconnects after the target leaves voice");
waitingFollow.plugin.stop();
assert.equal(waitingFollow.timers.size, 0);

const conditionalFollow = await load("FollowList");
await conditionalFollow.plugin.start();
conditionalFollow.plugin.settings.store.onlyWhileConnected = true;
conditionalFollow.states.set(me, { userId: me, channelId: null });
conditionalFollow.states.set(friend, { userId: friend, channelId: "b" });
const conditionalMenu = [];
conditionalFollow.plugin.contextMenus["user-context"](conditionalMenu, { user: { id: friend } });
item(conditionalMenu, "mc5mr-love").props.action();
await conditionalFollow.drain();
assert.equal(conditionalFollow.joins.length, 0, "only while connected keeps an offline user out of voice");
conditionalFollow.plugin.settings.store.onlyWhileConnected = false;
conditionalFollow.plugin.settings.store.joinOnFollow = false;
item(conditionalMenu, "mc5mr-love").props.action();
item(conditionalMenu, "mc5mr-love").props.action();
await conditionalFollow.drain();
assert.equal(conditionalFollow.joins.length, 0, "join on follow can be disabled");
conditionalFollow.states.set(friend, { userId: friend, channelId: "c" });
conditionalFollow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: friend, channelId: "c" }] });
await conditionalFollow.drain();
assert.deepEqual(conditionalFollow.joins, ["c"]);
conditionalFollow.plugin.stop();

const nonFriendFollow = await load("FollowList");
await nonFriendFollow.plugin.start();
assert.equal(nonFriendFollow.stubs.RelationshipStore.isFriend(visitor), false);
const nonFriendMenu = [];
nonFriendFollow.plugin.contextMenus["user-context"](nonFriendMenu, { user: { id: visitor } });
assert.notEqual(item(nonFriendMenu, "mc5mr-love").props.disabled, true, "non-friends can be followed from their context menu");
item(nonFriendMenu, "mc5mr-love").props.action();
await nonFriendFollow.drain();
assert.equal(nonFriendFollow.joins.length, 0, "a target without a known voice room waits for a voice update");
nonFriendFollow.states.set(visitor, { userId: visitor, channelId: "b" });
nonFriendFollow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: visitor, channelId: "b" }] });
await nonFriendFollow.drain();
assert.deepEqual(nonFriendFollow.joins, ["b"], "a non-friend's known voice room can be followed");
nonFriendFollow.plugin.openManager();
const manager = nonFriendFollow.modals[0].children[0];
const panel = manager.type(manager.props);
function findFollowNode(node, predicate) {
    if (Array.isArray(node)) return node.map(child => findFollowNode(child, predicate)).find(Boolean);
    if (!node || typeof node !== "object") return;
    if (predicate(node)) return node;
    return findFollowNode(node.children, predicate);
}
const activeRow = findFollowNode(panel, node => node.props?.className === "vc-mc5mr-follow-row");
const cancel = findFollowNode(activeRow, node => node.type === "Button" && node.children.includes("إلغاء"));
assert.ok(cancel, "the active non-friend appears in the manager");
assert.notEqual(cancel.props.disabled, true, "non-friend follow can also be cancelled from the manager");
nonFriendFollow.states.set(visitor, { userId: visitor, channelId: "c" });
nonFriendFollow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: visitor, channelId: "c" }] });
await nonFriendFollow.drain();
assert.deepEqual(nonFriendFollow.joins, ["b", "c"], "following continues when a non-friend moves");
nonFriendFollow.deny();
nonFriendFollow.states.set(visitor, { userId: visitor, channelId: "a" });
nonFriendFollow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: visitor, channelId: "a" }] });
await nonFriendFollow.drain();
assert.equal(nonFriendFollow.joins.length, 2, "following a non-friend still requires voice room access");
cancel.props.onClick();
nonFriendFollow.plugin.stop();
assert.equal(nonFriendFollow.timers.size, 0);

const fastFollow = await load("FollowList");
await fastFollow.plugin.start();
fastFollow.states.set(friend, { userId: friend, channelId: "b" });
const fastMenu = [];
fastFollow.plugin.contextMenus["user-context"](fastMenu, { user: { id: friend } });
item(fastMenu, "mc5mr-love").props.action();
const firstCheck = [...fastFollow.timers.keys()][0];
assert.equal(fastFollow.timerDelays.get(firstCheck), 0, "following starts on the next event loop without an artificial delay");
for (let i = 0; i < 50; i++) fastFollow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: friend, channelId: "b" }] });
assert.deepEqual([...fastFollow.timers.keys()], [firstCheck], "voice event bursts cannot postpone the first follow check");
const heart = fastFollow.plugin.headerBarButton.render();
assert.equal(heart.props.icon, "Heart");
assert.equal(heart.props.selected, true);
heart.props.onClick();
assert.equal(fastFollow.modals.length, 0, "the heart toggles following instead of opening the manager");
assert.equal(fastFollow.timers.size, 0, "pausing from the heart cancels a pending join");
assert.equal(fastFollow.plugin.headerBarButton.render().props.selected, false);
assert.equal(fastFollow.plugin.headerBarButton.render().props["aria-label"], "استئناف الفولو");
fastFollow.plugin.headerBarButton.render().props.onClick();
assert.equal(fastFollow.plugin.headerBarButton.render().props.selected, true, "pressing again resumes the same target");
await fastFollow.drain();
assert.deepEqual(fastFollow.joins, ["b"]);
fastFollow.states.set(me, { userId: me, channelId: "a" });
fastFollow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: friend, channelId: "b" }] });
await fastFollow.drain();
assert.equal(fastFollow.joins.length, 1, "duplicate attempts to the same unconfirmed destination keep their cooldown");
const retry = [...fastFollow.timers.keys()][0];
assert.ok(fastFollow.timerDelays.get(retry) > 0 && fastFollow.timerDelays.get(retry) <= 800);
fastFollow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: friend, channelId: "c" }] });
fastFollow.states.set(friend, { userId: friend, channelId: "c" });
assert.equal(fastFollow.timerDelays.get([...fastFollow.timers.keys()][0]), 0, "a new room interrupts the old retry cooldown even before native stores finish updating");
await fastFollow.drain();
assert.deepEqual(fastFollow.joins, ["b", "c"]);
fastFollow.plugin.pauseFollow();
assert.equal(fastFollow.plugin.headerBarButton.render().props.selected, false, "pausing dims the heart while keeping the target available");
const cancelMenu = [];
fastFollow.plugin.contextMenus["user-context"](cancelMenu, { user: { id: friend } });
item(cancelMenu, "mc5mr-love").props.action();
assert.equal(fastFollow.plugin.headerBarButton.render(), null, "cancelling hides the pink heart");
fastFollow.plugin.stop();
assert.equal(fastFollow.timers.size, 0);

const quickRules = await load("VoiceLists");
quickRules.plugin.start();
const quickMenu = [];
quickRules.plugin.contextMenus["user-context"](quickMenu, { user: { id: friend } });
item(quickMenu, "mc5mr-rule-mute").props.action();
const firstRuleCheck = [...quickRules.timers.keys()][0];
assert.equal(quickRules.timerDelays.get(firstRuleCheck), 0, "voice tools react without an artificial debounce");
for (let i = 0; i < 50; i++) quickRules.plugin.flux.VOICE_STATE_UPDATES();
assert.deepEqual([...quickRules.timers.keys()], [firstRuleCheck], "voice event bursts cannot postpone a pending rule check");
await quickRules.drain();
assert.equal(quickRules.changes.length, 1, "coalesced updates produce a single required member change");
quickRules.plugin.stop();
assert.equal(quickRules.timers.size, 0);

const responsive = await load("VoiceLists");
responsive.plugin.start();
responsive.states.set(visitor, { userId: visitor, channelId: "b", mute: false, deaf: false });
const memberMenu = (subject, id) => { const menu = []; subject.plugin.contextMenus["user-context"](menu, { user: { id }, guildId: "g" }); return menu; };
let releaseMember;
const stalledMember = new Promise(resolve => { releaseMember = resolve; });
const nativeMemberPatch = responsive.stubs.RestAPI.patch;
const memberRequests = [];
responsive.stubs.RestAPI.patch = async request => {
    memberRequests.push(request);
    if (request.url.endsWith(friend) && memberRequests.length === 1) await stalledMember;
    return nativeMemberPatch(request);
};
item(memberMenu(responsive, friend), "mc5mr-rule-mute").props.action();
item(memberMenu(responsive, friend), "mc5mr-rule-deaf").props.action();
item(memberMenu(responsive, visitor), "mc5mr-rule-pull").props.action();
await responsive.drain();
assert.equal(responsive.states.get(visitor).channelId, "a", "one slow member request cannot delay another person's Pull");
assert.equal(memberRequests.filter(request => request.url.endsWith(friend)).length, 1, "changes for the same member stay serialized");
releaseMember(); await responsive.drain();
assert.equal(responsive.states.get(friend).mute, true);
assert.equal(responsive.states.get(friend).deaf, true);
responsive.plugin.stop(); assert.equal(responsive.timers.size, 0);

const awaitingAck = await load("VoiceLists"); awaitingAck.plugin.start();
awaitingAck.stubs.RestAPI.patch = async request => { awaitingAck.changes.push(request); };
item(memberMenu(awaitingAck, friend), "mc5mr-rule-mute").props.action();
await awaitingAck.drain(); await awaitingAck.drain();
assert.equal(awaitingAck.changes.length, 1, "a successful request cannot continuously resend while its gateway acknowledgement is pending");
awaitingAck.plugin.stop();

const limitedRules = await load("VoiceLists"); limitedRules.plugin.start();
const limitedPatch = limitedRules.stubs.RestAPI.patch;
let voiceLimitAttempts = 0;
limitedRules.stubs.RestAPI.patch = async request => {
    if (++voiceLimitAttempts === 1) throw { status: 429, body: { retry_after: 2.5 } };
    return limitedPatch(request);
};
item(memberMenu(limitedRules, friend), "mc5mr-rule-mute").props.action(); await limitedRules.drain();
const retryTimer = [...limitedRules.timers.keys()][0];
assert.equal(limitedRules.timerDelays.get(retryTimer), 2500, "Discord's retry_after controls the retry delay");
assert.match(item(memberMenu(limitedRules, friend), "mc5mr-rule-mute").props.label, /إيقاف/, "rate limits preserve the rule");
limitedRules.plugin.flux.VOICE_STATE_UPDATES(); await limitedRules.drain(); await limitedRules.drain();
assert.equal(voiceLimitAttempts, 2); assert.equal(limitedRules.states.get(friend).mute, true);
limitedRules.plugin.stop(); assert.equal(limitedRules.timers.size, 0);

const fastWalk = await load("VoiceLists"); fastWalk.plugin.start();
fastWalk.states.set(visitor, { userId: visitor, channelId: "a" });
item(memberMenu(fastWalk, friend), "mc5mr-walk").props.action();
for (let i = 0; i < 12; i++) await Promise.resolve();
assert.equal(fastWalk.changes.length, 1, "Walk starts its first move immediately");
assert.equal([...fastWalk.timerDelays.values()][0], 1500, "Walk keeps bounded pacing without the old eight-second pause");
item(memberMenu(fastWalk, visitor), "mc5mr-walk").props.action();
for (let i = 0; i < 12; i++) await Promise.resolve();
assert.equal(fastWalk.changes.length, 2, "a walk does not block starting another person's action");
item(memberMenu(fastWalk, friend), "mc5mr-stop-user").props.action();
await fastWalk.drain();
assert.equal(fastWalk.changes.filter(request => request.url.endsWith(friend)).length, 1, "stopping a walk cancels its remaining moves");
fastWalk.plugin.stop(); assert.equal(fastWalk.timers.size, 0);
await fastWalk.drain(); assert.equal(fastWalk.changes.length, 3);

const stoppedWalk = await load("VoiceLists"); stoppedWalk.plugin.start();
let releaseStoppedWalk;
stoppedWalk.stubs.RestAPI.patch = () => new Promise(resolve => { releaseStoppedWalk = resolve; });
item(memberMenu(stoppedWalk, friend), "mc5mr-walk").props.action();
stoppedWalk.plugin.stop(); releaseStoppedWalk(); await stoppedWalk.drain();
assert.equal(stoppedWalk.timers.size, 0, "a request completing after stop cannot create a new Walk timer");

const cameraCheck = await load("FakeCamera");
cameraCheck.states.set(me, { userId: me, channelId: "a", selfVideo: true });
cameraCheck.stubs.VoiceStateStore.getVoiceStateForUser = () => ({ userId: me, channelId: "b", selfVideo: false });
findButton(cameraCheck.plugin.settingsAboutComponent(), "فحص حالة Discord").props.onClick();
assert.match(cameraCheck.notices.at(-1), /يعرض علامة الكاميرا/, "camera diagnostics inspect the selected desktop voice channel instead of another device");
cameraCheck.states.delete(me);
findButton(cameraCheck.plugin.settingsAboutComponent(), "فحص حالة Discord").props.onClick();
assert.match(cameraCheck.notices.at(-1), /ادخل روم/);

const playback = await load("StreamPlaybackFix", "ts");
const decoderOptions = {
    videoEncoder: { name: "H264", params: { "hardware-h264": "1" } },
    audioEncoder: { name: "opus", channels: 2 }, audioDecoders: [{ name: "opus" }],
    videoDecoders: [{ name: "H264", params: { "hardware-h264": "1", "profile-level-id": "42e034" } }, { name: "AV1X", params: { "hardware-av1-decode": "1" } }, { name: "H265", params: { "software-h265": "0" } }]
};
const incomingCodecs = playback.plugin.prepareDecoders(decoderOptions, "stream");
assert.equal(incomingCodecs.videoDecoders[0].params["hardware-h264"], "0");
assert.equal(incomingCodecs.videoDecoders[0].params["profile-level-id"], "42e034");
assert.equal(incomingCodecs.videoDecoders[1].params["hardware-av1-decode"], "0");
assert.equal(incomingCodecs.videoDecoders.length, 2, "the failing H265 decoder is removed from the native receive options");
assert.ok(incomingCodecs.videoDecoders.every(decoder => decoder.params["fallback-on-consecutive-errors"] === "1"));
assert.equal(incomingCodecs.videoEncoder, decoderOptions.videoEncoder, "outgoing video encoding is untouched");
assert.equal(incomingCodecs.audioEncoder, decoderOptions.audioEncoder, "stereo microphone encoding is untouched");
assert.equal(incomingCodecs.audioDecoders, decoderOptions.audioDecoders);
assert.equal(decoderOptions.videoDecoders[0].params["hardware-h264"], "1", "native codec objects are not mutated");
assert.equal(playback.plugin.prepareDecoders(decoderOptions, "default"), decoderOptions, "ordinary voice and camera connections are untouched");
assert.equal(playback.plugin.prepareDecoders(decoderOptions, "stream", false), decoderOptions, "outgoing screen share options are untouched");
const capabilities = [{ name: "H265", encode: true, decode: true }, { name: "H264", encode: true, decode: true }, { name: "VP8", encode: true, decode: true }];
const receivedCapabilities = playback.plugin.prepareCapabilities(capabilities, "stream");
assert.equal(receivedCapabilities.length, 2, "incoming negotiation removes H265 entirely instead of leaving its encode flag advertised");
assert.equal(receivedCapabilities[0], capabilities[1]); assert.equal(receivedCapabilities[1], capabilities[2]);
assert.equal(playback.plugin.prepareCapabilities(capabilities, "stream", false), capabilities, "outgoing H265 encoding capability is preserved");
assert.equal(capabilities[0].decode, true, "native capability objects are not mutated");
assert.equal(playback.plugin.prepareCapabilities(capabilities, "default"), capabilities);
const negotiationPatch = playback.plugin.patches[0].replacement;
const negotiationPattern = new RegExp(negotiationPatch.match.source.replaceAll("\\i", "[A-Za-z_$][\\w$]*"));
const nativeNegotiationFixture = 'this.videoSupported?L(o,r,d).map((e,t)=>({name:e.name})) : []';
assert.equal(nativeNegotiationFixture.replace(negotiationPattern, negotiationPatch.replace), 'this.videoSupported?$self.prepareCapabilities(L(o,r,d),this.context,this.streamUserId!==this.userId).map((e,t)=>({name:e.name})) : []');
const decoderPatch = playback.plugin.patches[1].replacement;
const decoderPattern = new RegExp(decoderPatch.match.source.replaceAll("\\i", "[A-Za-z_$][\\w$]*"));
const nativeCodecFixture = 'return{videoEncoder:l,videoDecoders:s,audioEncoder:r,audioDecoders:a}';
assert.match(nativeCodecFixture, decoderPattern);
assert.equal(nativeCodecFixture.replace(decoderPattern, decoderPatch.replace), 'return $self.prepareDecoders({videoEncoder:l,videoDecoders:s,audioEncoder:r,audioDecoders:a},this.context,this.streamUserId!==this.userId)');
assert.equal(playback.plugin.hidden, true); assert.equal(playback.plugin.required, true, "stream repair remains active without a plugin-list toggle");
console.log("PASS: independent voice request queues, acknowledgement pacing, rate-limit preservation, immediate cancellable walks and isolated stream decoder fallback.");

const followCss = await readFile(new URL("../src/userplugins/FollowList.discordDesktop/styles.css", import.meta.url), "utf8");
assert.doesNotMatch(followCss, /position:\s*fixed|inset:|translate:/, "follow sizing must not override Discord's modal centering");
console.log("PASS: follow settings, full-room vacancy events, manual mode, return, and disconnect.");
if (process.argv.includes("--follow-only")) process.exit(0);

const unmute = await load("AutoUnmute");
assert.equal(unmute.plugin.enabledByDefault, false, "automatic voice protection must be explicitly enabled");
unmute.plugin.start(); await unmute.drain();
assert.equal(unmute.changes.length, 0);
unmute.states.set(friend, { userId: friend, channelId: "a", mute: true, deaf: true });
unmute.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: friend, channelId: "a", mute: true, deaf: true }] });
await unmute.drain();
assert.equal(unmute.changes.length, 0, "other members cannot trigger protection writes");
unmute.states.set(me, { userId: me, channelId: "a", mute: false, deaf: false, selfMute: true, selfDeaf: true });
unmute.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: "a", selfMute: true, selfDeaf: true }] });
await unmute.drain();
assert.equal(unmute.changes.length, 0, "self mute and self deafen stay under the user's control");
unmute.states.set(me, { ...unmute.states.get(me), mute: true, deaf: true });
for (let i = 0; i < 20; i++) unmute.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: "a", mute: true, deaf: true }] });
await unmute.drain();
assert.equal(unmute.changes.length, 1, "burst updates coalesce into one request");
assert.equal(unmute.changes[0].url, `/guilds/g/members/${me}`);
assert.deepEqual(JSON.parse(JSON.stringify(unmute.changes[0].body)), { mute: false, deaf: false });
assert.equal(unmute.states.get(me).selfMute, true); assert.equal(unmute.states.get(me).selfDeaf, true);
unmute.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: "a", mute: false, deaf: false }] });
unmute.states.set(me, { ...unmute.states.get(me), mute: true, deaf: true });
unmute.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: "a", mute: true, deaf: true }] });
await unmute.drain();
assert.equal(unmute.changes.length, 1, "repeated corrections wait for their deadline instead of creating rapid request loops");
assert.equal(unmute.timers.size, 1, "protection keeps one pending check until the deadline");
unmute.advanceClock(1100);
await unmute.drain();
assert.equal(unmute.changes.length, 2, "a rapid unmute and re-mute re-arms protection even before the queued check runs");
unmute.plugin.settings.store.removeMute = false;
unmute.states.set(me, { ...unmute.states.get(me), mute: true, deaf: true });
unmute.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: "a", mute: true, deaf: true }] });
unmute.advanceClock(1100);
await unmute.drain();
assert.deepEqual(JSON.parse(JSON.stringify(unmute.changes.at(-1).body)), { deaf: false }, "the two protection options are independent");
unmute.plugin.stop(); assert.equal(unmute.timers.size, 0);

const partialUnmute = await load("AutoUnmute");
partialUnmute.stubs.PermissionStore.can = permission => permission === partialUnmute.stubs.PermissionsBits.MUTE_MEMBERS;
partialUnmute.states.set(me, { userId: me, channelId: "a", mute: true, deaf: true });
partialUnmute.plugin.start(); await partialUnmute.drain();
assert.deepEqual(JSON.parse(JSON.stringify(partialUnmute.changes[0].body)), { mute: false }, "only the permitted operation is submitted");
assert.equal(partialUnmute.states.get(me).deaf, true);
assert.ok(JSON.stringify(partialUnmute.plugin.settingsAboutComponent()).includes("الصلاحية غير متوفرة"));
partialUnmute.plugin.stop();

const deniedUnmute = await load("AutoUnmute");
deniedUnmute.deny(); deniedUnmute.states.set(me, { userId: me, channelId: "a", mute: true, deaf: true });
deniedUnmute.plugin.start(); await deniedUnmute.drain();
assert.equal(deniedUnmute.changes.length, 0, "missing permissions block all writes");
deniedUnmute.plugin.stop();
const privateUnmute = await load("AutoUnmute");
privateUnmute.channels.set("dm", { id: "dm", type: 1 });
privateUnmute.states.set(me, { userId: me, channelId: "dm", mute: true, deaf: true });
privateUnmute.plugin.start(); await privateUnmute.drain();
assert.equal(privateUnmute.changes.length, 0, "private calls do not use guild member actions");
privateUnmute.plugin.stop();

const throttledUnmute = await load("AutoUnmute");
let unmuteAttempts = 0;
throttledUnmute.stubs.RestAPI.patch = async () => { unmuteAttempts++; if (unmuteAttempts === 1) throw { status: 429, body: { retry_after: 2 } }; };
throttledUnmute.states.set(me, { userId: me, channelId: "a", mute: true, deaf: false });
throttledUnmute.plugin.start(); await throttledUnmute.drain();
assert.equal(unmuteAttempts, 1); assert.equal(throttledUnmute.timers.size, 1);
await throttledUnmute.drain();
assert.equal(unmuteAttempts, 1, "a rate limit cannot be retried before its deadline");
throttledUnmute.advanceClock(2100); await throttledUnmute.drain();
assert.equal(unmuteAttempts, 2); assert.equal(throttledUnmute.notices.length, 0);
throttledUnmute.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: "a", mute: true }] });
await throttledUnmute.drain();
assert.equal(unmuteAttempts, 2, "duplicate states while awaiting a server acknowledgement cannot spam writes");
throttledUnmute.plugin.stop();

const limitedUnmute = await load("AutoUnmute");
let limitedAttempts = 0;
limitedUnmute.stubs.RestAPI.patch = async () => { limitedAttempts++; throw { status: 429, body: { retry_after: 1 } }; };
limitedUnmute.states.set(me, { userId: me, channelId: "a", mute: true, deaf: true });
limitedUnmute.plugin.start(); await limitedUnmute.drain();
for (let i = 0; i < 3; i++) { limitedUnmute.advanceClock(1100); await limitedUnmute.drain(); }
assert.equal(limitedAttempts, 3, "rate-limit retries are bounded");
assert.equal(limitedUnmute.notices.length, 1); assert.equal(limitedUnmute.timers.size, 0);
limitedUnmute.plugin.stop();

const stoppedUnmute = await load("AutoUnmute");
stoppedUnmute.states.set(me, { userId: me, channelId: "a", mute: true, deaf: true });
stoppedUnmute.plugin.start(); stoppedUnmute.plugin.stop(); await stoppedUnmute.drain();
assert.equal(stoppedUnmute.changes.length, 0, "disable cancels a queued correction");
const pendingUnmute = await load("AutoUnmute");
let finishUnmute, pendingAttempts = 0;
pendingUnmute.stubs.RestAPI.patch = () => { pendingAttempts++; return new Promise(resolve => { finishUnmute = resolve; }); };
pendingUnmute.states.set(me, { userId: me, channelId: "a", mute: true, deaf: true });
pendingUnmute.plugin.start(); await pendingUnmute.drain();
pendingUnmute.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: "a", mute: true }] });
await pendingUnmute.drain();
assert.equal(pendingAttempts, 1, "requests never overlap");
pendingUnmute.plugin.stop(); finishUnmute(); await pendingUnmute.drain();
assert.equal(pendingAttempts, 1); assert.equal(pendingUnmute.timers.size, 0);
const loggedOutUnmute = await load("AutoUnmute");
loggedOutUnmute.states.set(me, { userId: me, channelId: "a", mute: true, deaf: true });
loggedOutUnmute.plugin.start(); loggedOutUnmute.stubs.UserStore.getCurrentUser = () => undefined;
loggedOutUnmute.plugin.flux.LOGOUT(); await loggedOutUnmute.drain();
assert.equal(loggedOutUnmute.changes.length, 0); assert.equal(loggedOutUnmute.timers.size, 0);
loggedOutUnmute.plugin.stop();
const sessionUnmute = await load("AutoUnmute");
sessionUnmute.states.set(me, { userId: me, channelId: "b", mute: true, deaf: true });
sessionUnmute.stubs.VoiceStateStore.getVoiceStateForUser = () => ({ userId: me, channelId: "a", mute: false, deaf: false });
sessionUnmute.plugin.start(); await sessionUnmute.drain();
assert.equal(sessionUnmute.changes.length, 1, "the current voice room is used instead of another session's first voice state");
assert.equal(sessionUnmute.changes[0].rejectWithError, true, "HTTP failures cannot be treated as successful protection");
sessionUnmute.plugin.stop();
const permissionUnmute = await load("AutoUnmute");
permissionUnmute.states.set(me, { userId: me, channelId: "a", mute: true, deaf: true });
permissionUnmute.deny(); permissionUnmute.plugin.start(); await permissionUnmute.drain();
assert.equal(permissionUnmute.changes.length, 0);
permissionUnmute.stubs.PermissionStore.can = () => true;
permissionUnmute.plugin.flux.GUILD_MEMBER_UPDATE({ user: { id: me } }); await permissionUnmute.drain();
assert.equal(permissionUnmute.changes.length, 1, "new permissions recheck protection without toggling the plugin");
permissionUnmute.plugin.stop();
console.log("PASS: opt-in AutoUnmute, own-account scope, independent server mute/deafen permissions, preserved self controls, coalesced requests, rate-limit deadlines/retry bounds and lifecycle cancellation.");
if (process.argv.includes("--auto-unmute-only")) process.exit(0);

const switcher = await load("FakeSwitcher");
const stableReal = { id: me, username: "Owner", email: "owner@example.test", premiumType: 0, publicFlags: 0, bot: false };
const stablePreview = { id: friend, username: friend, avatar: null, getAvatarURL: () => "https://cdn.discordapp.com/avatar.png" };
switcher.stubs.UserStore.getCurrentUser = () => stableReal;
switcher.stubs.UserStore.getUser = id => id === friend ? stablePreview : stableReal;
const getReal = switcher.stubs.UserStore.getCurrentUser;
switcher.plugin.start();
assert.equal(switcher.menuPatches.size, 1);
const nativeItem = { type: "MenuItem", props: { id: "native-real-row" }, children: [] };
const nativeFooter = { type: "MenuItem", props: { id: "manage-accounts", label: "Manage Accounts" }, children: [] };
const nativeMenu = [nativeItem, nativeFooter];
[...switcher.menuPatches][0]("account", nativeMenu);
assert.equal(nativeMenu[0], nativeItem, "native real-account rows are preserved");
assert.equal(nativeMenu.at(-1), nativeFooter, "native auth management is preserved");
assert.equal(item(nativeMenu, "mc5mr-manage-accounts"), undefined, "native menu has no extra manager footer");
assert.equal(item(nativeMenu, "mc5mr-local-restore"), undefined);
const unrelatedMenu = [{ type: "MenuItem", props: { id: "other" }, children: [] }];
[...switcher.menuPatches][0]("other-user", unrelatedMenu);
assert.equal(unrelatedMenu.length, 1, "unrelated menus are not changed");
const addMenu = [];
switcher.plugin.contextMenus["user-context"](addMenu, { user: stablePreview });
item(addMenu, "mc5mr-fake-switcher-add").props.action();
const nativeSavedMenu = [nativeItem, nativeFooter];
[...switcher.menuPatches][0]("account", nativeSavedMenu);
item(nativeSavedMenu, `mc5mr-switch-${friend}`).props.action();
assert.equal(switcher.plugin.userAreaButton, undefined, "no separate switcher button is added");
assert.equal(switcher.plugin.settings.store.selected, friend);
assert.equal(switcher.stubs.UserStore.getCurrentUser, getReal, "switcher must never replace authentication/user store methods");
assert.equal(switcher.stubs.UserStore.getCurrentUser(), stableReal, "store identity remains the real record");
assert.equal(stableReal.username, "Owner", "real user data stays unchanged");
assert.equal(switcher.changes.length, 0, "local switcher must never update a remote account");
switcher.plugin.flux.LOGOUT();
assert.equal(switcher.plugin.settings.store.selected, "", "logout must clear the local preview");
switcher.plugin.stop();
assert.equal(switcher.menuPatches.size, 0, "disable removes menu hooks");

const core = await load("LocalProfileCore", "ts");
core.stubs.UserStore.getCurrentUser = () => stableReal;
const originalProfileLookup = core.stubs.UserProfileStore.getUserProfile;
const originalAvatar = core.stubs.IconUtils.getUserAvatarURL;
const originalDisplay = core.stubs.DisplayProfileUtils.getDisplayProfile;
core.plugin.start();
const appearance = core.exports.capture(stablePreview);
core.exports.apply(appearance, "copy");
const renderedUser = core.plugin.visualUser(stableReal);
assert.equal(renderedUser.id, me);
assert.equal(renderedUser.email, stableReal.email);
assert.equal(renderedUser.premiumType, 0);
assert.equal(renderedUser.publicFlags, 0);
assert.equal(renderedUser.bot, false);
assert.equal(renderedUser.username, friend);
assert.equal(core.stubs.UsernameUtils.getName(stableReal), friend);
assert.equal(core.stubs.IconUtils.getUserAvatarURL(stableReal), stablePreview.getAvatarURL());
assert.equal(core.stubs.DisplayProfileUtils.getDisplayProfile(me).bio, "Visible biography");
assert.equal(renderedUser.getAvatarURL(), stablePreview.getAvatarURL());
assert.equal(core.plugin.visualUser(stableReal), renderedUser, "display clone is cached for stable props");
assert.equal(core.plugin.visualUser(stablePreview), stablePreview, "other users are never altered");
const realProfile = { userId: me, bio: "Owner biography", pronouns: "", premiumSince: null, badges: [] };
const displayedProfile = core.plugin.visualProfile(realProfile);
assert.equal(displayedProfile.userId, me);
assert.equal(displayedProfile.bio, "Visible biography");
assert.equal(realProfile.bio, "Owner biography", "profile source is never changed");
assert.equal(displayedProfile.badges, realProfile.badges, "real badges stay intact");
const otherProfile = { userId: visitor, bio: "Other" };
assert.equal(core.plugin.visualProfile(otherProfile), otherProfile);
assert.equal(core.stubs.UserProfileStore.getUserProfile, originalProfileLookup, "profile store methods are untouched");
core.stubs.UserStore.getCurrentUser = () => ({ id: visitor });
assert.equal(core.exports.snapshot(), null, "local appearance never leaks to another signed-in account");
core.stubs.UserStore.getCurrentUser = () => stableReal;
core.plugin.stop();
assert.equal(core.stubs.IconUtils.getUserAvatarURL, originalAvatar);
assert.equal(core.stubs.DisplayProfileUtils.getDisplayProfile, originalDisplay);
assert.equal(core.plugin.visualUser(stableReal), stableReal, "disable restores native display props");

const copiedProfile = await load("CopyProfile");
const copyMenu = [];
copiedProfile.plugin.contextMenus["user-context"](copyMenu, { user: copiedProfile.stubs.UserStore.getUser(friend) });
await item(copyMenu, "mc5mr-copy-profile").props.action();
assert.equal(copiedProfile.plugin.renderProfileCollection, undefined, "no extra preview card is rendered");
assert.equal(copiedProfile.changes.length, 0, "copy appearance makes no profile/account requests");
const removeMenu = [];
copiedProfile.plugin.contextMenus["user-context"](removeMenu, { user: copiedProfile.stubs.UserStore.getUser(friend) });
assert.equal(item(removeMenu, "mc5mr-copy-profile").props.label, "Remove copy profile");
item(removeMenu, "mc5mr-copy-profile").props.action();
copiedProfile.plugin.stop();

const fakeDm = await load("FakeDM");
fakeDm.channels.set("a", { id: "a", type: 1, recipients: [friend] });
const draft = { channelId: "a", authorId: friend, content: "Local example", date: "2026-10-09T04:41", call: false };
assert.equal(fakeDm.exports.insertPreview(draft), true);
assert.equal(fakeDm.localEvents[0].message.content, "Local example");
assert.equal(fakeDm.localEvents[0].mc5mrLocalPreview, true, "local previews are explicitly separated from server messages");
fakeDm.plugin.start();
assert.equal(fakeDm.serverElements.size, 1);
assert.equal([...fakeDm.serverElements][0](), null);
fakeDm.plugin.chatBarButton.render({ channel: fakeDm.channels.get("a") }).props.onClick();
const floating = [...fakeDm.serverElements][0]();
const floatingPanel = floating.type(floating.props);
assert.equal(floatingPanel.type, "section", "FakeDM uses a floating section, never a blocking modal");
assert.equal(floatingPanel.props["aria-modal"], "false");
fakeDm.plugin.flux.CHANNEL_SELECT();
assert.equal([...fakeDm.serverElements][0](), null);
assert.equal(fakeDm.localEvents[0].message.author.id, friend);
assert.equal(new Date(fakeDm.localEvents[0].message.timestamp).getHours(), 4);
assert.equal(fakeDm.localEvents[0].message.flags, 0, "local message is not a Clyde ephemeral reply");
assert.equal(fakeDm.exports.insertPreview({ ...draft, authorId: visitor }), false, "only open DM participants can be selected");
assert.equal(fakeDm.exports.insertPreview({ ...draft, date: "not a date" }), false);
assert.equal(fakeDm.exports.insertPreview({ ...draft, call: true, minutes: 2 }), true);
const call = fakeDm.localEvents.at(-1).message;
assert.equal(call.type, 3);
assert.equal(call.call.duration, 120);
assert.equal(new Date(call.call.ended_timestamp) - new Date(call.timestamp), 120_000);
assert.deepEqual(Array.from(call.call.participants), [me, friend]);
assert.equal(fakeDm.exports.insertPreview({ ...draft, call: true, minutes: -1 }), false);
assert.equal(fakeDm.changes.length, 0, "fake DM must not send network requests");
fakeDm.plugin.stop();
assert.equal(fakeDm.localEvents.filter(event => event.type === "MESSAGE_DELETE").length, 2, "disable removes messages and calls");
assert.equal(fakeDm.serverElements.size, 0, "disable unmounts the floating UI host");
const groupPreview = await load("FakeDM");
groupPreview.channels.set("a", { id: "a", type: 3, recipients: [friend, visitor, me], name: "Group" });
assert.ok(groupPreview.plugin.chatBarButton.render({ channel: groupPreview.channels.get("a") }));
assert.equal(groupPreview.plugin.headerBarButton, undefined, "FakeDM stays out of the native conversation toolbar");
assert.equal(groupPreview.exports.insertPreview({ ...draft, authorId: visitor }), true, "any group participant can author a local preview");
assert.equal(groupPreview.exports.insertPreview({ ...draft, authorId: visitor, call: true }), true);
assert.deepEqual(Array.from(groupPreview.localEvents.at(-1).message.call.participants), [me, friend, visitor]);
assert.equal(groupPreview.changes.length, 0);
groupPreview.plugin.stop();
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

const voice = await load("VoiceLists");
voice.plugin.start();
const voiceMenu = [];
voice.plugin.contextMenus["user-context"](voiceMenu, { user: { id: friend } });
item(voiceMenu, "mc5mr-rule-pull").props.action();
voice.states.set(me, { userId: me, channelId: "b" });
await voice.drain();
assert.equal(voice.changes[0].body.channel_id, "b", "pull moves friend to self");
voice.plugin.flux.VOICE_STATE_UPDATES();
await voice.drain();
assert.equal(voice.changes.length, 1, "matching state must not repeat the move");
item(voiceMenu, "mc5mr-rule-mute").props.action();
await voice.drain();
assert.equal(voice.changes.at(-1).body.mute, true);
voice.deny();
voice.states.set(friend, { userId: friend, channelId: "b", mute: false });
voice.plugin.flux.VOICE_STATE_UPDATES();
await voice.drain();
assert.equal(voice.changes.length, 2, "lost permission must prevent API call");
assert.ok(voice.notices.length, "failure must be visible");
voice.plugin.stop();
assert.equal(voice.timers.size, 0);

const slide = await load("VoiceLists");
slide.plugin.start();
const channelMenu = [];
slide.plugin.contextMenus["channel-context"](channelMenu, { channel: slide.channels.get("a") });
item(channelMenu, "mc5mr-slide-b").props.action();
slide.plugin.flux.VOICE_STATE_UPDATES();
await slide.drain();
assert.equal(slide.changes.length, 0, "slide must leave existing occupants alone");
slide.states.set(visitor, { userId: visitor, channelId: "a" });
slide.plugin.flux.VOICE_STATE_UPDATES();
await slide.drain();
assert.equal(slide.changes.length, 1);
assert.equal(slide.changes[0].body.channel_id, "b");
item(channelMenu, "mc5mr-stop-all").props.action();
slide.states.set(visitor, { userId: visitor, channelId: "a" });
slide.plugin.flux.VOICE_STATE_UPDATES();
await slide.drain();
assert.equal(slide.changes.length, 1, "stop must remove slide rules");
slide.plugin.stop();

const capture = await load("DmCapture");
capture.plugin.settings.store.maxMessages = 100;
let requestCount = 0;
capture.stubs.RestAPI.get = async () => {
    requestCount++;
    return { body: [{ id: "1", content: '<script>alert("x")</script>', timestamp: "2026-10-08T00:00:00Z", author: { id: friend, username: "Friend" } }] };
};
assert.equal(capture.plugin.contextMenus, undefined, "DM export is only available from its header/settings button");
await capture.exports.exportMessages({ id: "dm", type: 1 }, "html");
await capture.drain();
assert.equal(requestCount, 1);
assert.equal(capture.downloads.length, 1);
const html = await capture.downloads[0].text();
assert.ok(html.includes("&lt;script&gt;"), "export must escape message HTML");
assert.ok(!html.includes("<script>"));

const shared = await build({ stdin: { contents: await readFile(`${root}src/userplugins/tokenImporter.discordDesktop/shared.ts`, "utf8"), loader: "ts" }, write: false, format: "iife", globalName: "Shared" });
const sharedContext = vm.createContext({});
vm.runInContext(shared.outputFiles[0].text, sharedContext);
assert.equal(sharedContext.Shared.MAX_ACCOUNTS, 30);
assert.equal(sharedContext.Shared.isToken("invalid"), false);
assert.equal(sharedContext.Shared.profileFromResponse({ id: friend, username: "Friend", bot: true }), null);
const flags = await load("FakeVoiceCore", "tsx", "index", false);
const fakeButton = mode => flags.exports.ModeButton({ mode, label: mode });
const normalSend = flags.getSocket().send;
flags.plugin.start();
fakeButton("mute").props.onClick();
assert.equal(fakeButton("mute").props["aria-checked"], true, "button state updates without settings IPC writes");
assert.equal(flags.gatewayMessages.at(-1).data.self_mute, true);
assert.equal(flags.stubs.MediaEngineStore.isMute(), false, "fake flag must not change local media");
flags.exports.setMode("deaf", true);
flags.exports.setMode("mute", false);
assert.equal(flags.gatewayMessages.at(-1).data.self_mute, false);
assert.equal(flags.gatewayMessages.at(-1).data.self_deaf, true, "independent modes must remain active");
flags.exports.setMode("both", true);
flags.exports.setMode("camera", true);
const source = { guild_id: "g", channel_id: "a", self_mute: false, self_deaf: false, self_video: false, mute: true, deaf: true, flags: 7 };
flags.getSocket().send(4, source, "extra");
const sent = flags.gatewayMessages.at(-1);
assert.equal(sent.data.self_video, true);
assert.equal(sent.data.self_mute, true);
assert.equal(sent.data.mute, true, "server moderation fields must never be changed");
assert.equal(sent.data.deaf, true);
assert.equal(sent.data.flags, 7);
assert.equal(sent.rest[0], "extra");
assert.equal(source.self_mute, false, "outgoing payload must not be mutated");
flags.getSocket().send(1, source);
assert.equal(flags.gatewayMessages.at(-1).data, source, "other opcodes must pass through");
flags.getSocket().send(4, { channel_id: null });
assert.equal(flags.gatewayMessages.at(-1).data.self_video, undefined, "disconnect must not be rewritten");
flags.replaceSocket();
const replacementSend = flags.getSocket().send;
flags.plugin.flux.CONNECTION_OPEN();
assert.equal(flags.gatewayMessages.at(-1).data.self_deaf, true, "reconnect immediately reapplies active session modes");
flags.getSocket().send(4, source);
assert.equal(flags.gatewayMessages.at(-1).data.self_video, true, "reconnect must reinstall socket hook");
flags.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: null }] });
assert.equal(fakeButton("both").props["aria-checked"], true, "another device disconnecting must not clear this client's active modes");
flags.states.delete(me);
flags.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: null }] });
flags.getSocket().send(4, source);
assert.equal(flags.gatewayMessages.at(-1).data.self_video, false, "disconnect must clear session flags");
flags.plugin.stop();
assert.equal(flags.getSocket().send, replacementSend, "stop must restore current socket");
assert.notEqual(normalSend, replacementSend);
flags.plugin.start();
flags.states.delete(me);
flags.exports.setMode("mute", true);
assert.equal(fakeButton("mute").props["aria-checked"], false, "disconnected toggles must be rejected");
flags.states.set(me, { userId: me, channelId: "a" });
flags.setGatewayConnected(false);
const beforeClosedGateway = flags.gatewayMessages.length;
fakeButton("deaf").props.onClick();
assert.equal(flags.gatewayMessages.length, beforeClosedGateway, "an unavailable gateway must not pretend to send a voice update");
assert.equal(fakeButton("deaf").props["aria-checked"], false, "failed sends restore the visible button state");
flags.setGatewayConnected(true);
flags.stubs.VoiceStateStore.getVoiceStateForUser = () => ({ userId: me, channelId: "other-device" });
fakeButton("both").props.onClick();
assert.equal(flags.gatewayMessages.at(-1).data.channel_id, "a", "fake modes target the current client's voice channel");
assert.equal(flags.gatewayMessages.at(-1).data.self_mute, true);
assert.equal(flags.gatewayMessages.at(-1).data.self_deaf, true);
assert.equal(flags.stubs.MediaEngineStore.isMute(), false);
assert.equal(flags.stubs.MediaEngineStore.isDeaf(), false);
flags.plugin.flux.LOGOUT();
assert.equal(fakeButton("both").props["aria-checked"], false, "logout clears session modes without a settings write");
flags.plugin.stop();

const preview = await load("CustomStreamPreview");
preview.setPictures([{ id: "p1", name: "one.jpg", data: "data:image/jpeg;base64,YQ==" }, { id: "p2", name: "two.jpg", data: "data:image/jpeg;base64,Yg==" }, { id: "bad", name: "bad.svg", data: "data:image/svg+xml;base64,YQ==" }]);
preview.plugin.start();
await preview.drain();
const thumbnail = preview.plugin.resolveThumbnail("original");
assert.ok(thumbnail.startsWith("data:image/jpeg;base64,"));
assert.equal(preview.plugin.resolveThumbnail("original"), thumbnail, "selection must stay stable within one stream");
await preview.plugin.uploadPreview();
assert.equal(preview.changes[0].url, `/streams/guild:g:a:${me}/preview`);
assert.equal(preview.changes[0].body.thumbnail, thumbnail, "manual upload must use the same selected picture");
preview.plugin.settings.store.random = false;
preview.advanceClock(10_001);
const nextThumbnail = preview.plugin.resolveThumbnail("original");
assert.notEqual(nextThumbnail, thumbnail, "slideshow must rotate on the next capture after ten seconds");
assert.equal(preview.plugin.resolveThumbnail("original"), nextThumbnail, "captures within ten seconds must not rotate again");
preview.plugin.settings.store.slideshow = false;
preview.advanceClock(60_000);
assert.equal(preview.plugin.resolveThumbnail("original"), nextThumbnail, "disabled slideshow must keep selection stable");
preview.plugin.settings.store.enabled = false;
assert.equal(preview.plugin.resolveThumbnail("original"), "original");
preview.plugin.settings.store.enabled = true;
preview.setStream({ guildId: "g", channelId: "a", ownerId: friend });
assert.equal(preview.plugin.resolveThumbnail("other"), "other", "other users' streams must be unchanged");
await assert.rejects(preview.plugin.uploadPreview(), "uploading another user's stream must be rejected");
const previewMenu = [];
preview.plugin.contextMenus["stream-context"](previewMenu, { stream: { ownerId: friend } });
assert.equal(previewMenu.length, 0);
preview.plugin.flux.LOGOUT();
preview.setStream({ guildId: "g", channelId: "a", ownerId: me });
assert.equal(preview.plugin.resolveThumbnail("original"), "original", "logout must clear gallery");
preview.plugin.stop();

const picturesBuild = await build({ entryPoints: [`${root}src/userplugins/CustomStreamPreview.discordDesktop/pictures.ts`], write: false, format: "iife", globalName: "Pictures" });
const picturesContext = vm.createContext({});
vm.runInContext(picturesBuild.outputFiles[0].text, picturesContext);
const { parseProfiles, emptyProfiles } = picturesContext.Pictures;
const legacyPictures = [{ id: "one", name: "one.jpg", data: "data:image/jpeg;base64,YQ==" }];
const migrated = parseProfiles(legacyPictures);
assert.equal(migrated.profiles[0].pictures.length, 1, "migration must retain existing gallery images");
assert.equal(migrated.selected, "default");
assert.throws(() => parseProfiles({ version: 1, profiles: [{ id: "one", name: "One", pictures: [] }], selected: "missing" }), "invalid backup must not replace a gallery");
assert.throws(() => parseProfiles({ version: 1, profiles: Array.from({ length: 6 }, (_, index) => ({ id: String(index), name: "Profile", pictures: [] })), selected: "0" }), "profile limit must apply to imports");
const fullProfile = emptyProfiles();
fullProfile.profiles[0].pictures = Array.from({ length: 51 }, (_, index) => ({ ...legacyPictures[0], id: String(index) }));
assert.throws(() => parseProfiles(fullProfile), "image limit must apply to imports");
console.log("PASS: voice actions, follow, HTML escaping, tokens, independent self voice flags, reconnect and cleanup, scoped stream previews, and stable gallery selection.");
console.log("PASS: local switcher preserves identity and restores on disable; Fake DM has no remote writes; profile migration, import limits, and slideshow cadence.");

const dmQueueBuild = await build({ entryPoints: [`${root}src/userplugins/MassDM.discordDesktop/queue.ts`], write: false, format: "iife", globalName: "QueueSubject" });
const queueContext = vm.createContext({});
vm.runInContext(dmQueueBuild.outputFiles[0].text, queueContext);
const sentDms = [];
let cancelled = false;
const port = { cancelled: () => cancelled, isFriend: () => true, send: async (id, content) => { sentDms.push({ id, content }); }, wait: async () => {}, progress: () => {} };
await queueContext.QueueSubject.runDmQueue({ recipients: [friend, friend, visitor], content: "Project meeting", delayMs: 5000 }, port);
assert.equal(sentDms.length, 2, "recipients must be deduplicated");
sentDms.length = 0;
await queueContext.QueueSubject.runDmQueue({ recipients: [friend, visitor], content: "Project meeting", delayMs: 5000 }, { ...port, progress: () => { cancelled = true; } });
assert.equal(sentDms.length, 1, "cancellation must stop the next recipient");
cancelled = false;
let attempts = 0;
await assert.rejects(queueContext.QueueSubject.runDmQueue({ recipients: [friend, visitor], content: "Project meeting", delayMs: 5000 }, { ...port, send: async () => { attempts++; throw new Error("429"); } }));
assert.equal(attempts, 1, "rate limits must not schedule retries or continue the batch");
await assert.rejects(queueContext.QueueSubject.runDmQueue({ recipients: [friend], content: "Message", delayMs: 1 }, port));

const silent = await load("SilentMessageCore", "ts");
const ownMessage = { id: "333333333333333333", channel_id: "a", author: { id: me }, attachments: [], content: "Original" };
silent.plugin.start();
silent.stubs.RestAPI.get = async () => ({ body: ownMessage });
silent.stubs.RestAPI.post = async request => { silent.changes.push({ ...request, method: "POST" }); return { body: { id: "444444444444444444", author: { id: me } } }; };
await silent.exports.replaceMessage(ownMessage, "Updated", false);
assert.equal(silent.changes[0].body.nonce, ownMessage.id);
assert.equal(silent.changes[0].body.flags, 4096);
assert.equal(silent.changes[1].url, `/channels/a/messages/${ownMessage.id}`);
silent.changes.length = 0;
await silent.exports.replaceMessage(ownMessage, "** **", true);
assert.deepEqual(silent.changes.filter(change => change.method === "DELETE").map(change => change.url), ["/channels/a/messages/444444444444444444", `/channels/a/messages/${ownMessage.id}`]);
silent.changes.length = 0;
await assert.rejects(silent.exports.replaceMessage({ ...ownMessage, author: { id: friend } }, "Updated", false));
assert.equal(silent.changes.length, 0, "other users' messages must never be changed");
await assert.rejects(silent.exports.replaceMessage({ ...ownMessage, attachments: [{}] }, "Updated", false));
assert.equal(silent.changes.length, 0, "attachments must not be lost through replacement");
silent.stubs.RestAPI.post = async () => { throw new Error("403"); };
await assert.rejects(silent.exports.replaceMessage(ownMessage, "Updated", false));
assert.equal(silent.changes.length, 0, "original must not be deleted if replacement fails");
silent.stubs.RestAPI.post = async request => { silent.changes.push({ ...request, method: "POST" }); silent.plugin.stop(); return { body: { id: "444444444444444444", author: { id: me } } }; };
await assert.rejects(silent.exports.replaceMessage(ownMessage, "Updated", false));
assert.equal(silent.changes.length, 1, "stopping must prevent deletion of the original after posting");

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

const destruct = await load("SelfDestruct");
destruct.plugin.start();
assert.equal(destruct.plugin.settings.store.seconds, 30, "new installations default to thirty seconds");
destruct.plugin.chatBarButton.render({ channel: { id: "a" }, isMainChat: true }).props.onClick();
const incoming = (id, author = me) => destruct.plugin.flux.MESSAGE_CREATE({ message: { id, channel_id: "a", author: { id: author } } });
incoming("555555555555555555", friend);
assert.equal(destruct.timers.size, 0, "other users' messages must not be scheduled");
incoming("555555555555555555");
assert.ok([...destruct.timerDelays.values()].includes(30_000), "deletion must wait thirty seconds");
const destructMenu = [];
destruct.plugin.contextMenus.message(destructMenu, { message: { id: "555555555555555555" } });
item(destructMenu, "mc5mr-cancel-destruct").props.action();
await destruct.drain();
assert.equal(destruct.changes.length, 0, "cancelling a message must prevent deletion");
incoming("666666666666666666");
await destruct.drain();
assert.equal(destruct.changes[0].url, "/channels/a/messages/666666666666666666");
destruct.plugin.flux.MESSAGE_CREATE({ mc5mrLocalPreview: true, message: { id: "777777777777777777", channel_id: "a", author: { id: me } } });
assert.equal(destruct.timers.size, 0, "FakeDM previews never schedule remote deletes");
destruct.plugin.flux.MESSAGE_CREATE({ optimistic: true, message: { id: "777777777777777777", channel_id: "a", author: { id: me } } });
assert.equal(destruct.timers.size, 0, "unconfirmed outgoing messages are not deleted");
destruct.plugin.flux.MESSAGE_CREATE({ channelId: "a", message: { id: "777777777777777777", author: { id: me } } });
assert.equal(destruct.timers.size, 1, "confirmed events also accept the native camel-case channel envelope");
destruct.plugin.flux.MESSAGE_DELETE({ id: "777777777777777777" });
assert.equal(destruct.timers.size, 0, "manual deletion cancels its timer");
incoming("777777777777777777");
destruct.plugin.stop();
assert.equal(destruct.timers.size, 0, "disabling must remove all pending timers");
await destruct.drain();
assert.equal(destruct.changes.length, 1, "stopping must prevent pending deletes");
destruct.plugin.start();
destruct.plugin.chatBarButton.render({ channel: { id: "a" }, isMainChat: true }).props.onClick();
destruct.stubs.RestAPI.del = async () => { throw new Error("403"); };
incoming("888888888888888888");
incoming("999999999999999999");
await destruct.drain();
assert.ok(destruct.plugin.chatBarButton.render({ channel: { id: "a" }, isMainChat: true }).props.tooltip.includes("إيقاف"), "one failed deletion must leave later messages armed");
assert.equal(destruct.timers.size, 0);
destruct.plugin.stop();
console.log("PASS: self-destruct ownership, individual cancellation, deletion, stop cleanup and failure cancellation.");

const failedPins = await load("FollowList");
failedPins.stubs.DataStore.get = async () => { throw new Error("storage unavailable"); };
await failedPins.plugin.start();
const failedPinMenu = [];
failedPins.plugin.contextMenus["user-context"](failedPinMenu, { user: { id: friend } });
assert.equal(item(failedPinMenu, "mc5mr-pin-follow").props.disabled, true, "a failed load must not overwrite saved pins");
failedPins.plugin.stop();

const hidden = await load("HiddenDm");
const hiddenId = "333333333333333333";
hidden.stubs.DataStore.get = async () => [hiddenId];
hidden.plugin.start();
await hidden.drain();
assert.equal(hidden.plugin.isHidden(hiddenId), true);
hidden.stubs.DataStore.get = async () => ({ corrupt: true });
hidden.plugin.flux.CONNECTION_OPEN();
await hidden.drain();
assert.equal(hidden.plugin.isHidden(hiddenId), false, "malformed storage must not crash or retain another account's hidden list");
hidden.stubs.DataStore.get = async () => { throw new Error("storage unavailable"); };
hidden.plugin.flux.CONNECTION_OPEN();
await hidden.drain();
assert.equal(hidden.plugin.contextMenus, undefined, "Hide DM is removed from right-click menus");
assert.equal(findButton(hidden.plugin.settingsAboutComponent(), "إخفاء / إظهار الخاص المفتوح").props.disabled, true, "storage failures disable writes in the settings manager");
hidden.plugin.stop();

const abbreviation = await load("Abbreviation");
abbreviation.stubs.DataStore.get = async () => Array.from({ length: 200 }, (_, index) => ({ abbreviation: `k${index}`, phrase: `text${index}` }));
const savedAbbreviations = [];
abbreviation.stubs.DataStore.set = async (key, value) => { savedAbbreviations.push({ key, value }); };
await abbreviation.plugin.start();
const formValues = ["k0", "replacement", "", false];
abbreviation.stubs.React.useState = () => [formValues.shift(), () => {}];
const abbreviationManager = abbreviation.plugin.settingsAboutComponent();
findButton(abbreviationManager, "حفظ الاختصار").props.onClick();
await abbreviation.drain();
assert.equal(savedAbbreviations[0].value.length, 200, "editing at the limit must not add or reject an existing abbreviation");
assert.equal(savedAbbreviations[0].key, `mc5mr-abbreviation:${me}`);
const messageDraft = { content: "k0" };
abbreviation.plugin.onBeforeMessageSend("a", messageDraft);
assert.equal(messageDraft.content, "replacement");
abbreviation.plugin.stop();

const events = await load("EventLogs");
let finishLoading;
events.stubs.DataStore.get = () => new Promise(resolve => { finishLoading = resolve; });
const persistedEvents = [];
events.stubs.DataStore.set = async (_key, value) => { persistedEvents.push(value); };
const loadingEvents = events.plugin.start();
await events.drain();
events.plugin.flux.RELATIONSHIP_ADD({ relationship: { id: friend, type: 1 } });
assert.equal(persistedEvents.length, 0, "new events must not overwrite storage before it finishes loading");
finishLoading([{ at: "2026-10-01T12:00:00Z", kind: "Old event", text: "saved before launch" }]);
await loadingEvents;
await events.drain();
assert.equal(persistedEvents.at(-1).length, 2, "events received while loading must merge with saved events");
assert.equal(persistedEvents.at(-1)[0].kind, "Old event");
events.plugin.stop();

console.log("PASS: view-scoped switcher previews, storage failure handling, malformed hidden lists, abbreviation edits at capacity, and event buffering during load.");

await verifyNotificationPopups();

const independent = await load("VoiceLists");
independent.plugin.start();
const independentMenu = [];
independent.plugin.contextMenus["user-context"](independentMenu, { user: { id: friend } });
item(independentMenu, "mc5mr-rule-mute").props.action();
item(independentMenu, "mc5mr-rule-deaf").props.action();
await independent.drain();
assert.equal(independent.states.get(friend).mute, true);
assert.equal(independent.states.get(friend).deaf, true);
const tools = [];
independent.plugin.contextMenus["channel-context"](tools, { channel: independent.channels.get("a") });
assert.ok(item(tools, "mc5mr-voice-tools"));
item(independentMenu, "mc5mr-rule-disconnect").props.action();
await independent.drain();
assert.equal(independent.states.get(friend).channelId, null);
independent.plugin.stop();
console.log("PASS: portalled mention routing, per-account ignore, refreshed DM typing, native account list integration, reversible audio hooks and room bitrate caps, independent voice rules.");

const lockedHelpers = await load("LocalProfileCore", "ts");
Object.freeze(lockedHelpers.stubs.IconUtils);
Object.freeze(lockedHelpers.stubs.UsernameUtils);
Object.freeze(lockedHelpers.stubs.DisplayProfileUtils);
assert.doesNotThrow(() => lockedHelpers.plugin.start(), "read-only native exports must not crash the plugin");
lockedHelpers.plugin.stop();
const restoredProfiles = await load("FakeSwitcher");
restoredProfiles.plugin.start();
const saveProfileMenu = [];
restoredProfiles.plugin.contextMenus["user-context"](saveProfileMenu, { user: restoredProfiles.stubs.UserStore.getUser(friend) });
item(saveProfileMenu, "mc5mr-fake-switcher-add").props.action();
restoredProfiles.stubs.UserStore.getUser = () => undefined;
const restoredNative = [{ type: "MenuItem", props: { id: "manage-accounts" }, children: [] }];
[...restoredProfiles.menuPatches][0]("account", restoredNative);
assert.ok(item(restoredNative, `mc5mr-switch-${friend}`), "saved appearance remains selectable when the source user is not cached");
item(restoredNative, `mc5mr-switch-${friend}`).props.action();
assert.equal(restoredProfiles.plugin.settings.store.selected, friend);
restoredProfiles.plugin.stop();
console.log("PASS: read-only presentation exports and saved switcher appearance after cache loss.");

const deferredCopy = await load("CopyProfile");
let completeProfile;
deferredCopy.stubs.fetchUserProfile = () => new Promise(resolve => { completeProfile = resolve; });
const deferredMenu = [];
deferredCopy.plugin.contextMenus["user-context"](deferredMenu, { user: deferredCopy.stubs.UserStore.getUser(friend) });
const pendingCopy = item(deferredMenu, "mc5mr-copy-profile").props.action();
const immediateCopy = [];
deferredCopy.plugin.contextMenus["user-context"](immediateCopy, { user: deferredCopy.stubs.UserStore.getUser(friend) });
assert.equal(item(immediateCopy, "mc5mr-copy-profile").props.label, "Remove copy profile", "cached appearance is visible before the network fetch completes");
deferredCopy.plugin.stop(); completeProfile(); await pendingCopy;
const stoppedCopyMenu = [];
deferredCopy.plugin.contextMenus["user-context"](stoppedCopyMenu, { user: deferredCopy.stubs.UserStore.getUser(friend) });
assert.equal(item(stoppedCopyMenu, "mc5mr-copy-profile").props.label, "Copy this profile", "an in-flight public profile fetch must not apply after disable");
console.log("PASS: disabling during a public profile fetch cancels the appearance change.");

const syntaxCore = await load("LocalProfileCore", "ts");
syntaxCore.exports.apply(syntaxCore.exports.capture(stablePreview), "copy");
const renderSource = "function profile(p){let{user:u,displayProfile:d}=p;return {user:u,bio:d.bio}}";
const patch = syntaxCore.plugin.patches[1].replacement.find(value => value.replace.includes("visualProps"));
const normalized = new RegExp(patch.match.source.replaceAll("\\i", "[A-Za-z_$][\\w$]*"), patch.match.flags);
const rewritten = renderSource.replace(normalized, patch.replace);
assert.notEqual(rewritten, renderSource);
const patchedRender = new Function("$self", `return (${rewritten});`)(syntaxCore.plugin);
assert.equal(patchedRender({ user: stableReal, displayProfile: { userId: me, bio: "Real" } }).user.username, friend);
assert.equal(patchedRender({ user: stableReal, displayProfile: { userId: me, bio: "Real" } }).bio, "Visible biography");
syntaxCore.plugin.stop();
console.log("PASS: profile render patch preserves destructuring syntax and transforms display props only.");

const copiedBadges = await load("LocalProfileCore", "ts");
const publicBadges = [{ id: "hypesquad", description: "Visible badge", icon: "badge-hash" }];
copiedBadges.stubs.UserProfileStore.getUserProfile = () => ({ badges: publicBadges, bio: "Bio", accentColor: 123, themeColors: [123, 456] });
copiedBadges.exports.apply(copiedBadges.exports.capture(stablePreview), "copy");
assert.equal(copiedBadges.plugin.copiedBadges({ userId: visitor }), null);
const ownProfile = { userId: me, badges: [], premiumType: 0, premiumSince: null };
assert.equal(copiedBadges.plugin.visualProfile(ownProfile).getBadges()[0].id, "hypesquad");
assert.equal(ownProfile.badges.length, 0);
assert.equal(copiedBadges.plugin.visualProfile(ownProfile).premiumType, 0, "copying displayed badges never grants account features");
publicBadges[0].description = "Changed source";
assert.equal(copiedBadges.plugin.copiedBadges(ownProfile)[0].description, "Visible badge", "public badge snapshots are copied");
const normalize = regex => new RegExp(regex.source.replaceAll("\\i", "(?:[A-Za-z_$][\\w$]*)"), regex.flags);
const modalPatch = copiedBadges.plugin.patches.find(value => value.find === ".MODAL_V2,onClose:");
let modalFixture = "function render(id){return u.Z.getUser(id)}";
for (const replacement of modalPatch.replacement) modalFixture = modalFixture.replace(normalize(replacement.match), replacement.replace);
const nativeUser = copiedBadges.stubs.UserStore.getCurrentUser();
assert.equal(new Function("$self", "u", `return (${modalFixture});`)(copiedBadges.plugin, { Z: { getUser: () => nativeUser } })(me).username, friend, "full-profile render patch handles mangled module exports");
const badgePatch = copiedBadges.plugin.patches.find(value => value.find === "getLegacyUsername(){").replacement[0];
const badgeFixture = "class Profile{constructor(){this.userId='" + me + "'} getBadges(){return []}getLegacyUsername(){return ''}}".replace(normalize(badgePatch.match), badgePatch.replace);
assert.equal(new Function("$self", `return new (${badgeFixture})();`)(copiedBadges.plugin).getBadges()[0].id, "hypesquad");
copiedBadges.stubs.ownBadges = () => [{ id: "user_plugin_contributor_badge", description: "User Plugin Contributor" }];
assert.equal(copiedBadges.plugin.copiedBadges(ownProfile)[0].id, "user_plugin_contributor_badge", "local profile copy keeps the actual user's UserPlugins badge");
assert.equal(copiedBadges.plugin.visualProfile(ownProfile).getBadges()[0].id, "user_plugin_contributor_badge", "cached local appearance reflects current mod badges");
assert.equal(copiedBadges.plugin.copiedBadges(ownProfile)[1].id, "hypesquad", "copied public badges remain visible");
copiedBadges.stubs.ownBadges = () => [];

const switchSyntax = await load("FakeSwitcher");
const nativeCall = 'function render(){let s=[];return s.push((0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(i.MenuItem,{id:"manage-accounts"})]})),s}';
const replacement = switchSyntax.plugin.patches[0].replacement;
const nativeRewritten = nativeCall.replace(normalize(replacement.match), replacement.replace);
assert.notEqual(nativeRewritten, nativeCall);
switchSyntax.plugin.start();
const addOnly = [];
switchSyntax.plugin.contextMenus["user-context"](addOnly, { user: switchSyntax.stubs.UserStore.getUser(friend) });
item(addOnly, "mc5mr-fake-switcher-add").props.action();
assert.equal(switchSyntax.modals.length, 0);
const renderAccounts = new Function("$self", "i", `return (${nativeRewritten})`)(switchSyntax.plugin, { Fragment: "Fragment", MenuItem: "MenuItem", jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) });
const firstAccounts = renderAccounts();
item(firstAccounts, `mc5mr-switch-${friend}`).props.action();
assert.equal(switchSyntax.plugin.settings.store.selected, friend);
const reopenedAccounts = renderAccounts();
assert.ok(item(reopenedAccounts, `mc5mr-switch-${friend}`), "local rows survive native menu close and reopen");
switchSyntax.plugin.appendAccountMenu(reopenedAccounts);
assert.equal(reopenedAccounts.flatMap(node => allNodes(node)).filter(node => node.props?.id === `mc5mr-switch-${friend}`).length, 1, "direct and context menu hooks do not duplicate rows");
assert.equal(switchSyntax.changes.length, 0);
switchSyntax.plugin.stop();

const menuCloner = await load("ServerCloner");
const serverMenu = [];
menuCloner.plugin.contextMenus["guild-context"](serverMenu, { guild: { id: "g" } });
assert.equal(serverMenu.length, 1, "server cloning has a single top-level entry");
assert.equal(typeof item(serverMenu, "mc5mr-cloner").props.action, "function", "the single entry opens the cloner directly");
assert.equal(item(serverMenu, "mc5mr-cloner").children.length, 0, "there are no separate template and copy options");

const formats = await load("DmCapture", "ts", "formats");
const transcript = [{ id: "1", timestamp: "2026-10-09", author: { id: friend, username: "=FORMULA()" }, content: '<script>alert(1)</script>\n"quoted"', attachments: [{ url: "javascript:alert(1)", filename: "bad" }, { url: "https://evil.example/a.png", filename: "remote", content_type: "image/png" }], reactions: [{ count: 2, emoji: { name: "❤️" } }] }];
const options = { media: true, embeds: true, reactions: true };
const exportHtml = formats.exports.serialize(transcript, "<Title>", "html", options);
assert.ok(exportHtml.includes("&lt;script&gt;"));
assert.ok(!exportHtml.includes("javascript:"));
assert.ok(!exportHtml.includes('<img loading="lazy" src="https://evil.example'), "non-Discord hosts never load automatically");
assert.ok(exportHtml.includes("❤️ × 2"));
assert.ok(formats.exports.serialize(transcript, "DM", "csv", options).includes('"\'=FORMULA()"'), "CSV neutralizes spreadsheet formulas");
const json = JSON.parse(formats.exports.serialize(transcript, "DM", "json", { media: false, embeds: false, reactions: false }));
assert.equal(json[0].attachments, undefined);
assert.equal(json[0].reactions, undefined);
assert.ok(formats.exports.serialize(transcript, "DM", "md", options).includes("    <script>"), "Markdown renders message HTML as literal code");

const crowns = await load("StaffCrowns");
assert.equal(crowns.exports.getTier(me, "g").id, "gold");
crowns.stubs.GuildRoleStore.getRole = () => ({ permissions: 32n });
assert.equal(crowns.exports.getTier(friend, "g").id, "silver");
crowns.stubs.GuildRoleStore.getRole = () => ({ permissions: 8n });
assert.equal(crowns.exports.getTier(friend, "g").id, "bronze");
crowns.stubs.GuildRoleStore.getRole = () => ({ permissions: 0n });
assert.equal(crowns.exports.getTier(friend, "g"), null);
assert.equal(crowns.exports.getTier(friend, null), null);
crowns.stubs.UserStore.getUser = id => ({ id, bot: true });
assert.equal(crowns.exports.getTier(friend, "g", true), null);
assert.equal(crowns.plugin.userProfileBadges.length, 1, "external plugin uses Equicord's current badge API");
assert.equal(crowns.changes.length, 0);
console.log("PASS: immediate profile copy, visible badge isolation, modal/list patch syntax, startup without native audio, single cloner menu, five export formats, and reviewed staff crowns.");

const avatarComposer = await load("MassDM");
avatarComposer.stubs.React.useState = value => [value, () => {}];
avatarComposer.stubs.React.useEffect = () => {};
avatarComposer.plugin.headerBarButton.render().props.onClick();
const composer = avatarComposer.modals[0].children[0].type();
function findNode(node, predicate) {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) return node;
    for (const child of node.children?.flat() ?? []) { const found = findNode(child, predicate); if (found) return found; }
}
const selectFriends = findNode(composer, node => node.type === "SearchableSelect");
const friendAvatar = selectFriends.props.renderOptionPrefix({ value: friend });
assert.equal(friendAvatar.type, "Avatar");
assert.ok(friendAvatar.props.src.includes(friend));
avatarComposer.stubs.UserStore.getUser = () => undefined;
assert.equal(selectFriends.props.renderOptionPrefix({ value: friend }).props.src, `default:${friend}`);
console.log("PASS: Mass DM exclusion choices render cached avatars with a default fallback.");

// The original account-management action remains operational; local deletion
// only touches this owner's saved presentation records.
const managementTest = await load("FakeSwitcher");
managementTest.plugin.start();
const savedManagerMenu = [];
managementTest.plugin.contextMenus["user-context"](savedManagerMenu, { user: managementTest.stubs.UserStore.getUser(friend) });
item(savedManagerMenu, "mc5mr-fake-switcher-add").props.action();
let nativeManageCalls = 0;
let appendedMount;
const innerContent = { appendChild: node => { appendedMount = node; } };
const nativeDialog = { isConnected: true, querySelector: () => innerContent };
const nativeManageMenu = [{ type: "MenuItem", props: { id: "manage-accounts", action: () => { nativeManageCalls++; managementTest.dialogs.push(nativeDialog); return "native-result"; } } }];
[...managementTest.menuPatches][0]("account", nativeManageMenu);
assert.equal(nativeManageMenu.at(-1).props.action(), "native-result");
assert.equal(nativeManageCalls, 1, "native Manage Accounts action is called exactly once");
let portalTarget = null;
const cleanups = [];
managementTest.stubs.React.useState = () => [portalTarget, value => { portalTarget = value; }];
let managerEffectMounted = false;
managementTest.stubs.React.useEffect = callback => { if (managerEffectMounted) return; managerEffectMounted = true; const cleanup = callback(); if (cleanup) cleanups.push(cleanup); };
managementTest.stubs.ReactDOM.createPortal = (node, target) => ({ node, target });
const host = [...managementTest.serverElements][0];
host();
const portal = host();
assert.equal(portal.target, appendedMount, "local management rows use a private mount inside the native account container");
assert.equal(appendedMount.className, "vc-nc-fake-management-mount");
const rowsToManage = portal.node.type(portal.node.props);
assert.equal(rowsToManage.props.className, "vc-nc-fake-managed-list", "manager rows use isolated classes, unaffected by old list margins");
const loginButton = { textContent: "Log in", closest: () => null };
const addButton = { textContent: "Add an account" };
const rowContainer = { contains: node => node === loginButton };
const nativeRow = { querySelector: () => ({}), parentElement: rowContainer };
loginButton.parentElement = nativeRow;
const structuralDialog = { querySelector: () => null, querySelectorAll: query => query === "button" ? [loginButton, addButton] : [] };
assert.equal(managementTest.exports.nativeAccountContainer(structuralDialog), rowContainer, "account rows are discovered structurally inside their native group, not at the Add an account footer");
rowContainer.contains = () => true;
assert.equal(managementTest.exports.nativeAccountContainer(structuralDialog), null, "a footer/dialog container containing the Add button is refused");
const accountMore = allNodes(rowsToManage).find(node => node.props?.["aria-label"] === "Account options");
accountMore.props.onClick({});
item([managementTest.modals.at(-1)], "mc5mr-local-log-out").props.action();
assert.equal(managementTest.plugin.settings.store.accounts[me].length, 0);
assert.equal(managementTest.changes.length, 0, "removing a local row cannot invoke Discord account deletion");
for (const cleanup of cleanups) cleanup();
managementTest.plugin.stop();
assert.equal(managementTest.serverElements.size, 0);
console.log("PASS: v14 floating FakeDM lifecycle, instant StreamProof CSS, thirty-second deletion, removed DM menu entries, and native local-account management.");

const layout = await load("NightcordUI", "ts");
layout.plugin.start();
const nativeFollow = { type: "MenuCheckboxItem", props: { id: "native-follow", label: "Follow User" } };
const nativeMention = { type: "MenuItem", props: { id: "native-copy-mention", label: "Copy User Mention" } };
const frozenGroup = { type: "MenuGroup", props: Object.freeze({ children: [nativeFollow, nativeMention] }) };
const plain = id => ({ type: "MenuItem", props: Object.freeze({ id }) });
const desired = ["mc5mr-rule-disconnect", "mc5mr-rule-mute", "mc5mr-rule-deaf", "mc5mr-copy-profile", "mc5mr-fake-switcher-add", "mc5mr-love", "mc5mr-pin-follow", "mc5mr-rule-protect", "mc5mr-walk", "mc5mr-walk-return", "mc5mr-rule-blacklist", "mc5mr-rule-pull", "mc5mr-rule-freeze"];
const allRows = [frozenGroup, ...desired.toReversed().map(plain)];
const arrangement = [...layout.menuPatches][0];
assert.doesNotThrow(() => arrangement("user-context", allRows));
assert.equal(item(allRows, "native-follow"), nativeFollow, "Equicord's follow stays intact");
assert.equal(item(allRows, "native-copy-mention"), nativeMention, "Equicord's mention stays intact");
const customGroups = allRows.filter(node => node.props?.key?.startsWith("mc5mr-user-section"));
assert.equal(customGroups.length, 4, "custom actions use native group separators");
assert.deepEqual(customGroups.flatMap(group => group.children.map(node => node.props.id)), desired);
const nonUser = [plain("mc5mr-love")]; arrangement("channel-context", nonUser); assert.equal(nonUser[0].props.id, "mc5mr-love");
layout.plugin.stop(); assert.equal(layout.menuPatches.size, 0);

const offlineVoice = await load("VoiceLists");
offlineVoice.plugin.start(); offlineVoice.states.delete(friend);
let offlineMenu = []; offlineVoice.plugin.contextMenus["user-context"](offlineMenu, { user: { id: friend }, guildId: "g" });
for (const id of ["blacklist", "pull", "freeze", "mute", "deaf", "protect", "disconnect"]) {
    const option = item(offlineMenu, `mc5mr-rule-${id}`);
    assert.equal(option.type, "MenuItem"); assert.equal(option.props.disabled, undefined, "offline user actions stay visible and explain unavailable actions on click");
}
item(offlineMenu, "mc5mr-walk").props.action(); assert.ok(offlineVoice.notices.at(-1).includes("ليس داخل"));
item(offlineMenu, "mc5mr-rule-blacklist").props.action(); await offlineVoice.drain(); assert.equal(offlineVoice.changes.length, 0);
offlineVoice.states.set(friend, { userId: friend, channelId: "a" }); offlineVoice.plugin.flux.VOICE_STATE_UPDATES(); await offlineVoice.drain();
assert.equal(offlineVoice.changes.at(-1).body.channel_id, null, "an armed offline blacklist applies when the member joins the bound room");
offlineMenu = []; offlineVoice.plugin.contextMenus["user-context"](offlineMenu, { user: { id: friend } });
assert.equal(item(offlineMenu, "mc5mr-rule-blacklist").props.label, "شيل البلاك لست"); item(offlineMenu, "mc5mr-rule-blacklist").props.action();
offlineVoice.deny(); offlineMenu = []; offlineVoice.plugin.contextMenus["user-context"](offlineMenu, { user: { id: friend } });
item(offlineMenu, "mc5mr-rule-pull").props.action(); await offlineVoice.drain(); assert.equal(offlineVoice.changes.length, 1, "missing permissions never become API writes");
offlineVoice.plugin.stop();

const nativeTag = await load("LocalProfileCore", "ts");
nativeTag.plugin.start(); const copiedAppearance = nativeTag.exports.capture(nativeTag.stubs.UserStore.getUser(friend)); nativeTag.exports.apply(copiedAppearance, "copy");
assert.equal(nativeTag.stubs.UsernameUtils.getUserTag({ id: me, username: "real" }), friend, "native tag renders the copied username");
assert.equal(nativeTag.stubs.UserStore.getCurrentUser().id, me); nativeTag.plugin.stop();
assert.equal(nativeTag.stubs.UsernameUtils.getUserTag({ id: me, username: "real" }), "real", "stopping restores native username helpers");

const confirmDelete = await load("SilentDelete");
confirmDelete.stubs.silentCore.start(); confirmDelete.plugin.start();
confirmDelete.stubs.RestAPI.get = async () => ({ body: ownMessage });
confirmDelete.stubs.RestAPI.post = async request => { confirmDelete.changes.push({ ...request, method: "POST" }); return { body: { id: "444444444444444444", author: { id: me } } }; };
assert.equal(confirmDelete.plugin.contextMenus, undefined, "silent delete has no right-click entry");
assert.equal(confirmDelete.plugin.messagePopoverButton.render({ ...ownMessage, author: { id: friend } }), null);
const deleteHover = confirmDelete.plugin.messagePopoverButton.render(ownMessage);
assert.equal(deleteHover.icon({}).type, "TrashIcon");
assert.equal(deleteHover.icon({}).props.color, "var(--text-feedback-critical)");
deleteHover.onClick(); await confirmDelete.drain();
assert.equal(confirmDelete.modals.length, 0, "hover deletion starts on a single click without a confirmation modal");
assert.equal(confirmDelete.changes.filter(change => change.method === "DELETE").length, 2);
confirmDelete.plugin.stop(); confirmDelete.stubs.silentCore.stop();

const nativeEdit = await load("SilentEdit"); nativeEdit.stubs.silentCore.start(); nativeEdit.plugin.start();
nativeEdit.stubs.RestAPI.get = async () => ({ body: ownMessage });
nativeEdit.stubs.RestAPI.post = async request => { nativeEdit.changes.push({ ...request, method: "POST" }); return { body: { id: "444444444444444444", author: { id: me } } }; };
assert.equal(nativeEdit.plugin.contextMenus, undefined, "silent edit has no right-click entry");
assert.equal(await nativeEdit.plugin.onBeforeMessageEdit("a", ownMessage.id, { content: "Normal edit" }), undefined, "ordinary edits are never intercepted");
const editHover = nativeEdit.plugin.messagePopoverButton.render(ownMessage);
assert.equal(editHover.icon({}).type, "PencilIcon");
assert.equal(editHover.icon({}).props.color, "var(--text-feedback-critical)");
editHover.onClick();
assert.equal(nativeEdit.localEvents.at(-1).type, "MESSAGE_START_EDIT", "red pencil opens the native inline editor immediately");
assert.equal(nativeEdit.changes.length, 0, "opening the editor makes no server changes");
assert.equal(await nativeEdit.plugin.onBeforeMessageEdit("a", "999", { content: "Another message" }), undefined);
assert.equal((await nativeEdit.plugin.onBeforeMessageEdit("a", ownMessage.id, { content: "Replacement text" })).cancel, true);
assert.equal(nativeEdit.changes.filter(change => change.method === "DELETE").length, 1);
assert.equal(nativeEdit.localEvents.at(-1).type, "MESSAGE_END_EDIT");
editHover.onClick(); nativeEdit.plugin.flux.MESSAGE_END_EDIT({ channelId: "a" });
assert.equal(await nativeEdit.plugin.onBeforeMessageEdit("a", ownMessage.id, { content: "Normal after cancel" }), undefined);
editHover.onClick(); nativeEdit.plugin.stop();
assert.equal(await nativeEdit.plugin.onBeforeMessageEdit("a", ownMessage.id, { content: "Stopped" }), undefined);
nativeEdit.stubs.silentCore.stop();

const envelope = await load("StreamProof"); envelope.plugin.settings.store.automatic = true; envelope.plugin.start();
assert.doesNotThrow(() => envelope.plugin.flux.STREAM_DELETE({}));
envelope.plugin.flux.STREAM_CLOSE({ stream: { streamKey: `guild:g:a:${me}` } }); assert.equal(envelope.styleCalls.at(-1).enabled, false); envelope.plugin.stop();
const armed = await load("SelfDestruct"); armed.plugin.start(); armed.plugin.chatBarButton.render({ channel: { id: "a" }, isMainChat: true }).props.onClick();
assert.ok(armed.plugin.chatBarButton.render({ channel: { id: "a" }, isMainChat: true }).props.tooltip.includes("إيقاف")); armed.plugin.settings.store.seconds = NaN;
armed.plugin.flux.MESSAGE_CREATE({ channelId: "a", message: { id: "777777777777777777", author: { id: me } } });
assert.ok([...armed.timerDelays.values()].includes(30_000), "malformed stored delays use thirty seconds instead of immediate deletion");
armed.plugin.stop();
console.log("PASS: v16 offline context rules, native menu grouping without touching Equicord rows, copied username tags, native delete confirmation, edit submission, stream event variants, and timer arming.");

const rules17 = await load("VoiceLists"); rules17.plugin.start();
rules17.stubs.VoiceStateStore.getVoiceState = (guild, id) => guild === "g" ? rules17.states.get(id) : undefined;
rules17.stubs.VoiceStateStore.getVoiceStateForUser = () => ({ channelId: "other-guild", mute: false, deaf: false });
rules17.stubs.SelectedChannelStore.getVoiceChannelId = () => rules17.states.get(me)?.channelId;
const ruleMenu = () => { const nodes = []; rules17.plugin.contextMenus["user-context"](nodes, { user: { id: friend }, guildId: "g" }); return nodes; };
rules17.states.set(friend, { userId: friend, channelId: "b", mute: false, deaf: false });
item(ruleMenu(), "mc5mr-rule-protect").props.action(); await rules17.drain();
rules17.states.set(friend, { userId: friend, channelId: "c", mute: true, deaf: true });
rules17.plugin.flux.VOICE_STATE_UPDATES(); await rules17.drain();
assert.deepEqual({ ...rules17.changes.at(-1).body }, { mute: false, deaf: false, channel_id: "b" });
assert.equal(item(ruleMenu(), "mc5mr-rule-protect").props.label, "Unprotect");
item(ruleMenu(), "mc5mr-rule-protect").props.action();

rules17.states.set(friend, { userId: friend, channelId: "b" });
item(ruleMenu(), "mc5mr-rule-pull").props.action(); await rules17.drain();
assert.equal(rules17.states.get(friend).channelId, "a");
rules17.states.set(me, { userId: me, channelId: "c" });
rules17.plugin.flux.VOICE_STATE_UPDATES(); await rules17.drain();
assert.equal(rules17.states.get(friend).channelId, "c");
assert.equal(item(ruleMenu(), "mc5mr-rule-pull").props.label, "Unpull");
item(ruleMenu(), "mc5mr-rule-pull").props.action();
rules17.states.set(me, { userId: me, channelId: "a" }); rules17.states.set(friend, { userId: friend, channelId: "b" });
item(ruleMenu(), "mc5mr-rule-freeze").props.action(); await rules17.drain();
rules17.states.set(friend, { userId: friend, channelId: "c" }); rules17.plugin.flux.VOICE_STATE_UPDATES(); await rules17.drain();
assert.equal(rules17.states.get(friend).channelId, "b");
assert.equal(item(ruleMenu(), "mc5mr-rule-freeze").props.label, "فك التجميد"); item(ruleMenu(), "mc5mr-rule-freeze").props.action();

item(ruleMenu(), "mc5mr-rule-blacklist").props.action(); await rules17.drain();
assert.equal(rules17.states.get(friend).channelId, "b", "blacklist is bound to my room, not the member's current room");
rules17.states.set(friend, { userId: friend, channelId: "c" }); rules17.plugin.flux.VOICE_STATE_UPDATES(); await rules17.drain();
assert.equal(rules17.states.get(friend).channelId, "c", "other rooms stay accessible");
rules17.states.set(friend, { userId: friend, channelId: "a" }); rules17.plugin.flux.VOICE_STATE_UPDATES(); await rules17.drain();
assert.equal(rules17.states.get(friend).channelId, null);
assert.equal(item(ruleMenu(), "mc5mr-rule-blacklist").props.label, "شيل البلاك لست");
rules17.states.set(me, { userId: me, channelId: "b" }); item(ruleMenu(), "mc5mr-rule-blacklist").props.action(); await rules17.drain();
rules17.states.set(friend, { userId: friend, channelId: "b" }); rules17.plugin.flux.VOICE_STATE_UPDATES(); await rules17.drain();
assert.equal(rules17.states.get(friend).channelId, null, "separate room blacklists coexist");
item(ruleMenu(), "mc5mr-rule-blacklist").props.action();
rules17.states.set(friend, { userId: friend, channelId: "b" }); rules17.plugin.flux.VOICE_STATE_UPDATES(); await rules17.drain();
assert.equal(rules17.states.get(friend).channelId, "b", "unblacklisting this room leaves it accessible");
rules17.plugin.stop(); assert.equal(rules17.timers.size, 0);

const fetch17 = await load("SilentMessageCore", "ts"); fetch17.plugin.start();
const reads17 = [];
fetch17.stubs.RestAPI.get = async request => { reads17.push(request); if (request.url.endsWith(ownMessage.id)) throw { status: 403, body: { message: "Single message unavailable", code: 50013 } }; return { body: [ownMessage] }; };
fetch17.stubs.RestAPI.post = async request => { fetch17.changes.push(request); return { body: { id: "555555555555555555", author: { id: me } } }; };
await fetch17.exports.replaceMessage(ownMessage, "New text", false);
assert.equal(reads17.length, 2); assert.equal(reads17[1].query.around, ownMessage.id);
assert.equal(fetch17.changes.at(-1).method, "DELETE"); assert.equal(fetch17.changes.at(-1).rejectWithError, true);
fetch17.stubs.RestAPI.get = async () => ({ body: [] }); fetch17.changes.length = 0;
await assert.rejects(fetch17.exports.replaceMessage(ownMessage, "New text", false)); assert.equal(fetch17.changes.length, 0);
assert.match(fetch17.exports.describeFailure({ status: 403, body: { message: "Missing permissions", code: 50013 } }), /HTTP 403.*50013/);
fetch17.plugin.stop();

const frozen17 = await load("FakeSwitcher"); frozen17.plugin.start();
const add17 = []; frozen17.plugin.contextMenus["user-context"](add17, { user: frozen17.stubs.UserStore.getUser(friend) }); item(add17, "mc5mr-fake-switcher-add").props.action();
const authentic17 = { type: "MenuItem", props: { id: "real-account", action: () => {} } };
const frozenFooter17 = { type: "MenuItem", props: Object.freeze({ id: "manage-accounts", action: () => {} }) };
const combined17 = [authentic17, frozenFooter17]; frozen17.plugin.appendAccountMenu(combined17); frozen17.plugin.appendAccountMenu(combined17);
assert.equal(combined17[0], authentic17); assert.equal(combined17.length, 3);
assert.notEqual(combined17.at(-1), frozenFooter17); assert.equal(frozen17.changes.length, 0);
frozen17.plugin.stop();
console.log("PASS: v17 scoped protect/mute/deaf/move restoration, pull after my own move, exact toggle labels, freeze reversal, independent room blacklists, single-message route fallback, failure diagnostics, and immutable native account menu injection.");

function allNodes(node) { return !node ? [] : [node, ...(node.children ?? []).flat().flatMap(allNodes)]; }

await import("./verifyDeleteMyMessages.mjs");

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
await recoveringFollow.drain(1000);
assert.equal(followAttempts.length, 1);
recoveringFollow.plugin.flux.CONNECTION_OPEN();
await recoveringFollow.drain(1000);
await recoveringFollow.drain(1000);
assert.equal(followAttempts.length, 2, "reconnect must abandon an unresolved old join");
followAttempts[0].reject(Error("Old socket failed"));
await recoveringFollow.drain(1000);
assert.equal(recoveringFollow.plugin.headerBarButton.render().props.selected, true, "a stale failure cannot pause the current follow");
recoveringFollow.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: friend, channelId: "b" }] });
await recoveringFollow.drain(1000);
assert.equal(followAttempts.length, 2, "stale cleanup cannot unlock the new pending attempt");
recoveringFollow.plugin.headerBarButton.render().props.onClick();
recoveringFollow.plugin.flux.CONNECTION_OPEN();
await recoveringFollow.drain(1000);
await recoveringFollow.drain(1000);
assert.equal(followAttempts.length, 2, "reconnect respects an explicit pause");
recoveringFollow.plugin.headerBarButton.render().props.onClick();
recoveringFollow.advanceClock(1000);
await recoveringFollow.drain(1000);
await recoveringFollow.drain(1000);
assert.equal(followAttempts.length, 3, "resuming cannot remain blocked by the old pending attempt");
recoveringFollow.plugin.stop();
await recoveringFollow.plugin.start();
const restartedMenu = [];
recoveringFollow.plugin.contextMenus["user-context"](restartedMenu, { user: { id: friend } });
item(restartedMenu, "mc5mr-love").props.action();
await recoveringFollow.drain(1000);
assert.equal(followAttempts.length, 4, "disable and enable clears stale join ownership");
recoveringFollow.plugin.stop();
for (const attempt of followAttempts.slice(1)) attempt.resolve();
await recoveringFollow.drain(1000);
assert.equal(recoveringFollow.timers.size, 0, "late completion after stop cannot schedule follow");
console.log("PASS: session timer controls, isolated delete failures, stale jobs, reconnect recovery and preserved follow pause.");

const resumeRegression = await load("FollowList");
await resumeRegression.plugin.start();
resumeRegression.states.set(friend, { userId: friend, channelId: "b" });
const resumeMenu = [];
resumeRegression.plugin.contextMenus["user-context"](resumeMenu, { user: { id: friend } });
item(resumeMenu, "mc5mr-love").props.action();
await resumeRegression.drain(0);
resumeRegression.states.set(me, { userId: me, channelId: null });
resumeRegression.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: null }] });
assert.equal(resumeRegression.plugin.headerBarButton.render().props.selected, true, "voice disconnects cannot pause an active follow");
resumeRegression.plugin.headerBarButton.render().props.onClick();
assert.equal(resumeRegression.plugin.headerBarButton.render().props.selected, false, "only an explicit heart click pauses follow");
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
assert.equal(resumeRegression.plugin.headerBarButton.render().props.selected, true, "an unconfirmed native attempt does not pause follow");
resumeRegression.plugin.flux.CONNECTION_OPEN();
await resumeRegression.drain(0);
assert.equal(resumeCalls.length, 3, "reconnection retries an expired attempt without requiring resume");
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

const immediateLock = await load("VoiceLock");
immediateLock.plugin.start();
immediateLock.plugin.userAreaButton.render().props.onClick();
immediateLock.states.set(me, { userId: me, channelId: "b" });
for (let i = 0; i < 500; i++) immediateLock.plugin.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: me, channelId: "b" }] });
assert.equal(immediateLock.timers.size, 1, "bursty own voice updates coalesce without postponing the room lock");
assert.equal(immediateLock.timerDelays.get([...immediateLock.timers.keys()][0]), 0, "room lock starts on the next event loop without an extra debounce");
await immediateLock.drain();
assert.deepEqual(immediateLock.joins, ["a"]);
immediateLock.plugin.stop();
assert.equal(immediateLock.timers.size, 0);
console.log("PASS: 500 own voice updates coalesce into one immediate room-lock attempt.");

const appearanceFix = await load("LocalProfileCore", "ts");
appearanceFix.plugin.start();
const originalNameUser = appearanceFix.stubs.UserStore.getUser(friend);
const nameMenu = []; appearanceFix.plugin.contextMenus["user-context"](nameMenu, { user: originalNameUser });
item(nameMenu, "mc5mr-change-name").props.action();
assert.equal(appearanceFix.modals.at(-1).props.user, originalNameUser);
appearanceFix.exports.saveName(me, friend, "  Local friend  ");
assert.equal(appearanceFix.stubs.UsernameUtils.getName(originalNameUser), "Local friend");
assert.equal(appearanceFix.plugin.visualProps({ user: originalNameUser }).user.globalName, "Local friend", "profile names change without copying a profile");
assert.equal(appearanceFix.plugin.visualProps({ user: originalNameUser }).user.username, friend, "local names leave the username intact");
assert.equal(originalNameUser.username, friend, "real user records are untouched");
assert.equal(appearanceFix.stubs.UsernameUtils.getUserTag(originalNameUser), friend, "local display names never replace username tags");
assert.equal(appearanceFix.stubs.UsernameUtils.getFormattedName(originalNameUser), friend, "local display names never replace formatted usernames");
appearanceFix.stubs.UserStore.getCurrentUser = () => ({ id: visitor });
assert.equal(appearanceFix.exports.localName(friend), undefined);
appearanceFix.exports.saveName(me, friend, "Wrong owner");
appearanceFix.stubs.UserStore.getCurrentUser = () => ({ id: me });
assert.equal(appearanceFix.exports.localName(friend), "Local friend");
appearanceFix.exports.saveName(me, friend, "");
assert.equal(appearanceFix.stubs.UsernameUtils.getName(originalNameUser), friend);
let capturedGuild;
appearanceFix.stubs.DisplayProfileUtils.getDisplayProfile = (_id, guildId) => {
    capturedGuild = guildId;
    return { userId: friend, bio: "Guild biography", banner: "guild-banner", themeColors: [0x123456, 0xabcdef], profileEffect: { id: "effect" }, profileFrame: { skuId: "frame" }, getBannerURL: () => "https://cdn.discordapp.com/guilds/g/users/u/banners/banner.png" };
};
const detailedAppearance = appearanceFix.exports.capture({ ...originalNameUser, avatarDecorationData: { asset: "decoration", skuId: "decoration-sku" } }, "guild-id");
assert.equal(capturedGuild, "guild-id");
assert.equal(detailedAppearance.bio, "Guild biography");
assert.ok(detailedAppearance.bannerUrl.includes("/guilds/"));
appearanceFix.exports.apply(detailedAppearance, "copy");
let profileClass = `class NativeProfile{constructor(g){this.userId="${me}";this._guildMemberProfile=g}get canEditThemes(){return false}getPreviewThemeColors(){return undefined}getBadges(){return []}getLegacyUsername(){return ""}}`;
for (const p of appearanceFix.plugin.patches.find(p => p.find === "getLegacyUsername(){").replacement) profileClass = profileClass.replace(normalize(p.match), p.replace);
const nativeDisplay = new Function("$self", `return new (${profileClass})(null)`)(appearanceFix.plugin);
assert.equal(nativeDisplay.canEditThemes, true);
assert.deepEqual(Array.from(nativeDisplay.getPreviewThemeColors()), [0x123456, 0xabcdef]);
assert.equal(nativeDisplay.primaryColor, 0x123456);
assert.equal(nativeDisplay.profileEffect.id, "effect");
assert.equal(nativeDisplay.profileFrame.skuId, "frame");
assert.equal(appearanceFix.plugin.visualUser({ id: me, username: "Owner" }).avatarDecorationData.asset, "decoration");
assert.equal(appearanceFix.plugin.visualProfile(nativeDisplay), nativeDisplay);
appearanceFix.exports.apply({ ...detailedAppearance, themeColors: [10, 20] }, "copy");
assert.deepEqual(Array.from(nativeDisplay.getPreviewThemeColors()), [10, 20], "a cached native display observes the latest copy");
appearanceFix.exports.saveName(me, friend, "Saved alias");
appearanceFix.plugin.stop();
assert.equal(appearanceFix.stubs.UsernameUtils.getName(originalNameUser), friend);
assert.equal(nativeDisplay.canEditThemes, false, "cached native displays restore after stopping");
assert.equal(nativeDisplay.getPreviewThemeColors(), undefined);
assert.equal(appearanceFix.changes.length, 0, "local names and styles never write to Discord");
console.log("PASS: owner-scoped names, native name display, restore, guild banner, native theme gates, decorations, effects and frames without remote writes.");
