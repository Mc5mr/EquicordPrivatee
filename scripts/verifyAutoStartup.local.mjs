import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile, readdir, writeFile } from "node:fs/promises";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const me = "523157034141745153";
const friend = "111111111111111111";
const visitor = "222222222222222222";
const channel = (id, guild = "g") => ({ id, guild_id: guild, type: 2, name: id });

async function load(name, extension = "tsx", entry = "index") {
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
    const quietUpdates = [];
    const readAcks = [];
    const singleReadAcks = [];
    const unread = new Set(["a", "b", "c"]);
    const lastMessages = new Map();
    const guildSettings = new Map();
    let messageNumber = 100;
    const markUnread = (id, messageId = String(++messageNumber)) => { unread.add(id); lastMessages.set(id, messageId); };
    const serverElements = new Set();
    const engine = { connections: new Set(), connect(userId) { const connection = { userId, context: "default", destroyed: false, voiceBitrate: 64000, getCodecOptions: () => ({ audioEncoder: { channels: 1, params: { fec: true } }, encryption: "keep", videoEncoder: { codec: "h264" } }), getConnectionTransportOptions: () => ({ audioEncoder: { channels: 1, params: { fec: true } }, encodingVoiceBitRate: 64000, encryption: "keep" }), setVoiceBitRate(value) { this.voiceBitrate = value; } }; this.connections.add(connection); return connection; } };
    let clockOffset = 0;
    class SessionDate extends Date { static now() { return Date.now() + clockOffset; } }
    let socket = { send: (op, data, ...rest) => { gatewayMessages.push({ op, data, rest }); } };
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
    const storage = new Map();
    const subscriptions = new Set();
    const settingsSubscriptions = new Set();
    const stubs = {
        SettingsStore: { addChangeListener: (_key, fn) => settingsSubscriptions.add(fn), removeChangeListener: (_key, fn) => settingsSubscriptions.delete(fn) },
        findCssClassesLazy: () => ({ textArea: "textArea", channelTextArea: "channelTextArea", button: "button", buttonWrapper: "buttonWrapper", actionButtons: "actionButtons", buttonColor: "buttonColor" }),
        findStoreLazy: () => ({ getWindowOpen: () => false }),
        findComponentByCodeLazy: () => () => null,
        useMemo: fn => fn(), Popout: Object.assign(() => null, { Animation: { NONE: 0 } }),
        useState: value => stubs.React.useState(value), useRef: value => stubs.React.useRef(value), useEffect: callback => stubs.React.useEffect(callback), ReadStateUtils: { ackChannel: value => singleReadAcks.push(value.id) }, MessageStore: { getMessage: () => undefined },
        UserGuildSettingsStore: { getAllSettings: () => ({ userGuildSettings: Object.fromEntries(guildSettings) }) },
        updateGuildNotificationSettings: async (guildId, settings) => { quietUpdates.push({ guildId, settings }); guildSettings.set(guildId, settings); },
        lodash: { debounce: (callback, delay) => {
            let timer;
            const run = () => {
                if (timer) timers.delete(timer);
                timer = ++nextTimer;
                timerDelays.set(timer, delay);
                timers.set(timer, () => { timer = undefined; callback(); });
            };
            run.cancel = () => { if (timer) timers.delete(timer); timer = undefined; };
            return run;
        } },
        SettingsPlugin: { customEntries: [] }, SettingsRouter: { openUserSettings: () => {} }, ReactDOM: { createPortal: node => node },
        addServerListElement: (_position, component) => serverElements.add(component), removeServerListElement: (_position, component) => serverElements.delete(component),
        React: { useState: initial => [typeof initial === "function" ? initial() : initial, () => {}], useEffect: () => {}, useRef: value => ({ current: value }), useLayoutEffect: () => {}, useSyncExternalStore: (_subscribe, snapshot) => snapshot(), forwardRef: render => render, createElement: h, cloneElement: (node, props) => h(node.type, { ...node.props, ...props }), isValidElement: value => !!value?.props, Children: { toArray: value => value == null ? [] : Array.isArray(value) ? value : [value] } },
        Menu: new Proxy({}, { get: (_target, key) => key }),
        UserStore: { getCurrentUser: () => ({ id: me }), getUser: id => ({ id, username: id, avatar: null, getAvatarURL: () => `https://cdn.discordapp.com/avatars/${id}/test.png` }), emitChange: () => {} },
        UserProfileStore: { getUserProfile: () => ({ bio: "Visible biography", pronouns: "", banner: "test" }) },
        ContextMenuApi: { openContextMenu: (_event, render) => { modals.push(render()); }, closeContextMenu: () => {} },
        enableStyle: id => styleCalls.push({ enabled: true, id }), disableStyle: id => styleCalls.push({ enabled: false, id }),
        addGlobalContextMenuPatch: patch => menuPatches.add(patch), removeGlobalContextMenuPatch: patch => menuPatches.delete(patch),
        RelationshipStore: {
            isFriend: id => id === friend, getFriendIDs: () => [friend],
            getRelationshipType: id => id === friend ? 1 : 0,
            getMutableRelationships: () => new Map([[friend, 1]]),
            getPendingCount: () => 0, getFriendCount: () => 1, getRelationshipCount: () => 1,
            getSince: () => undefined, getSinces: () => ({}), getVersion: () => 0,
            isStranger: id => id !== friend, isUnfilteredPendingIncoming: () => false, emitChange() {}
        },
        ChannelStore: { getChannel: id => channels.get(id), getChannelIds: guildId => [...channels.values()].filter(channel => guildId ? channel.guild_id === guildId : !channel.guild_id).map(channel => channel.id) },
        ReadStateStore: { hasUnreadOrMentions: id => unread.has(id), lastMessageId: id => lastMessages.get(id) ?? "100" },
        SelectedChannelStore: { getVoiceChannelId: () => states.get(me)?.channelId, getChannelId: () => "a", getCurrentlySelectedChannelId: () => "a", addChangeListener: listener => subscriptions.add(listener), removeChangeListener: listener => subscriptions.delete(listener) },
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
        DataStore: { get: async key => storage.get(key), set: async (key, value) => storage.set(key, value), update: async (key, change) => { storage.set(key, change(storage.get(key))); } },
        findByPropsLazy: prop => prop === "addRelationship" ? { addRelationship: async () => {}, removeRelationship: async () => {}, acceptFriendRequest: async () => {} } : prop === "updateGuildNotificationSettings" ? { updateGuildNotificationSettings: (...args) => stubs.updateGuildNotificationSettings(...args) } : prop === "getSocket" ? { getSocket: () => socket } : ({ selectVoiceChannel: async id => {
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
            return { store, use: () => store, withPrivateSettings() { return this; } };
        },
        NavigationRouter: { transitionTo: path => notices.push(path) },
        Alerts: { show: alert => notices.push(alert), confirm: async () => false },
        useStateFromStores: (_stores, get) => get(), Avatar: "Avatar", Checkbox: "Checkbox", TextArea: "TextArea", TextInput: "TextInput", Select: "Select", SearchableSelect: "SearchableSelect", Slider: "Slider",
        HeaderBarButton: "HeaderBarButton", UserAreaButton: "UserAreaButton", Button: "Button", Heart: "Heart", Modal: "Modal", ConfirmModal: "ConfirmModal", openModal: render => { modals.push(render({ transitionState: 0, onClose: () => {} })); }, closeModal: () => {},
        FluxDispatcher: { wait: callback => callback(), dispatch: event => {
            localEvents.push(event);
            if (event.type === "BULK_ACK") for (const channel of event.channels) {
                if (unread.delete(channel.channelId)) readAcks.push(channel.channelId);
            }
        }, subscribe: (_type, listener) => subscriptions.add(listener), unsubscribe: (_type, listener) => subscriptions.delete(listener) },
        sendBotMessage: (channelId, message) => { localMessages.push({ channelId, message }); return message; }
    };
    const modules = new Map([
        ["@plugins/_core/settings", "export default globalThis.__stubs.SettingsPlugin;"],
        ["@api/PluginManager", "export const isPluginEnabled=()=>true;"],
        ["@components/ErrorBoundary", "const B=()=>null;B.wrap=x=>x;export default B;"],
        ["@components/settings/tabs/plugins/PluginCard", "export const PluginCard='PluginCard';"],
        ["~plugins", "export default {};"],
        ["@utils/types", "export default x=>x; export const StartAt={Init:0}; export const OptionType={STRING:1,SELECT:2,SLIDER:3,BOOLEAN:4,CUSTOM:5,NUMBER:6};"],
        ["@api/ServerList", "export const {addServerListElement,removeServerListElement}=globalThis.__stubs; export const ServerListRenderPosition={Above:0};"],
        ["@api/ContextMenu", "export const findGroupChildrenByChildId=()=>null; export const {addGlobalContextMenuPatch,removeGlobalContextMenuPatch}=globalThis.__stubs;"],
        ["@api/Styles", "export const {enableStyle,disableStyle}=globalThis.__stubs;"],
        ["@api/Commands", "export const sendBotMessage=globalThis.__stubs.sendBotMessage;"],
        ["@api/HeaderBar", "export const HeaderBarButton=globalThis.__stubs.HeaderBarButton;"],
        ["@api/ChatButtons", "export const ChatBarButton='ChatBarButton';"],
        ["@api/UserArea", "export const UserAreaButton=globalThis.__stubs.UserAreaButton;"],
        ["@api/DataStore", "export const {get,set,update}=globalThis.__stubs.DataStore;"],
        ["@api/index", "export const DataStore=globalThis.__stubs.DataStore;"],
        ["@api/Settings", "export const SettingsStore=globalThis.__stubs.SettingsStore; export const definePluginSettings=globalThis.__stubs.definePluginSettings; export const migratePluginSettings=()=>{}; export const useSettings=()=>{};"],
        ["@api/Badges", "export const BadgePosition={START:0};"],
        ["@plugins/_api/badges", "export default {getBadges:()=>[]};"],
        ["@components/Button", "export const Button=globalThis.__stubs.Button; export const LinkButton='LinkButton';"],
        ["@components/Card", "export const Card='Card';"],
        ["@components/CodeBlock", "export const CodeBlock='CodeBlock',InlineCode='InlineCode';"],
        ["@components/Flex", "export const Flex='Flex';"],
        ["@components/Heading", "export const Heading='Heading';"],
        ["@components/margins", "export const Margins={bottom20:'bottom20'};"],
        ["@components/Paragraph", "export const Paragraph='Paragraph';"],
        ["@components/Switch", "export const Switch='Switch';"],
        ["@utils/Logger", "export class Logger {info(){} warn(){} error(){}}"],
        ["@utils/constants", "export const Devs={Loukious:{name:'Loukious',id:211461918127292416n},Mc5mr:{name:'Mc5mr',id:523157034141745153n}};"],
        ["@components/FormSwitch", "export const FormSwitch='FormSwitch';"],
        ["@components/Heart", "export const Heart=globalThis.__stubs.Heart;"],
        ["@components/Icons", 'export const DoubleCheckmarkIcon="DoubleCheckmarkIcon",HeadphonesIcon="HeadphonesIcon",UserIcon="UserIcon",TextIcon="TextIcon",CopyIdIcon="CopyIdIcon",FolderIcon="FolderIcon",DeleteIcon="DeleteIcon",CogWheel="CogWheel",Microphone="Microphone",ScreenshareIcon="ScreenshareIcon",CopyIcon="CopyIcon",PlusIcon="PlusIcon",TrashIcon="TrashIcon",PencilIcon="PencilIcon";'],
        ["@utils/react", "export const useTimer=()=>0;"],
        ["@utils/css", "export const classNameFactory=prefix=>(...names)=>names.filter(name=>typeof name==='string').map(name=>prefix+name).join(' ');"],
        ["@utils/discord", "export const insertTextIntoChatInputBox=text=>globalThis.__stubs.insertedText=text; export const openUserProfile=async()=>{}; export const fetchUserProfile=(...args)=>globalThis.__stubs.fetchUserProfile(...args); export const openPrivateChannel=async()=>undefined;"],
        ["@utils/misc", 'export const sleep=globalThis.__stubs.sleep; export const classes=(...values)=>values.filter(Boolean).join(" ");'],
        ["@utils/clipboard", "export const copyToClipboard=()=>{};"],
        ["@utils/web", "export const saveFile=globalThis.__stubs.saveFile; export const chooseFile=async()=>null;"],
        ["@utils/modal", "export const openModal=()=>{},closeModal=()=>{}; export const ModalRoot='ModalRoot',ModalContent='ModalContent',ModalHeader='ModalHeader',ModalCloseButton='ModalCloseButton',ModalSize={DYNAMIC:0};"],
        ["@webpack", "export const {findByPropsLazy,findCssClassesLazy,findStoreLazy,findComponentByCodeLazy}=globalThis.__stubs;"],
        ["@webpack/common", `const s=globalThis.__stubs; export const {${Object.keys(stubs).filter(key => !["findByPropsLazy", "sleep", "saveFile", "definePluginSettings", "Button", "Heart", "HeaderBarButton", "DataStore"].includes(key)).join(",")}}=s;`]
    ]);
    const bundle = await build({ entryPoints: [`${root}src/userplugins/${name}.discordDesktop/${entry}.${extension}`], bundle: true, write: false, format: "iife", globalName: "Subject", platform: "browser", jsxFactory: "h", jsxFragment: "Fragment", plugins: [{ name: "mock-discord", setup(builder) {
        builder.onResolve({ filter: /\.css(?:\?managed)?$/ }, () => ({ path: "style", namespace: "style" }));
        builder.onLoad({ filter: /.*/, namespace: "style" }, () => ({ contents: "export default '';", loader: "js" }));
        builder.onResolve({ filter: /^(?:@|~plugins)/ }, args => modules.has(args.path) ? { path: args.path, namespace: "mock" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: modules.get(args.path), loader: "js" }));
    } }] });
    const context = { __stubs: stubs, h, Fragment: "Fragment", File, URL, crypto: { randomUUID: () => "test-" + (++nextTimer) }, CSS: { supports: () => true }, window: { addEventListener() {}, removeEventListener() {} }, HTMLElement: class {}, HTMLDivElement: class {}, Date: SessionDate, console, document: { body: { style: {}, appendChild() {} }, head: { appendChild() {} }, createElement: () => ({ remove() {}, style: {}, classList: { add() {}, remove() {} } }), addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => dialogs }, MutationObserver: class { observe() {} disconnect() {} }, VencordNative: { pluginHelpers: { TokenImporter: {} } }, Vencord: { Plugins: { plugins: {} } }, setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, callback); timerDelays.set(id, delay); return id; }, clearTimeout: id => timers.delete(id) };
    context.VencordNative.pluginHelpers.ProdHallowStereo = { launch: async () => ({ success: true, message: "Opened" }) };
    context.VencordNative.pluginHelpers.Mc5mrUpdates = { check: async () => ({ state: "current", message: "Current" }) };
    context.DiscordNative = { nativeModules: { requireModule() {} } };
    vm.createContext(context);
    vm.runInContext(bundle.outputFiles[0].text, context);
    const plugin = context.Subject.default;
    const drain = async () => {
        const callbacks = [...timers.values()];
        timers.clear();
        for (const callback of callbacks) callback();
        for (let i = 0; i < 30; i++) await Promise.resolve();
    };
    return { storage, subscriptions, settingsSubscriptions, dialogs, timerDelays, plugin, exports: context.Subject, stubs, serverElements, engine, states, channels, joins, changes, downloads, notices, timers, drain, gatewayMessages, localMessages, localEvents, modals, menuPatches, styleCalls, quietUpdates, readAcks, singleReadAcks, unread, guildSettings, markUnread, advanceClock: ms => { clockOffset += ms; }, getSocket: () => socket, replaceSocket: () => { socket = { send: (op, data, ...rest) => { gatewayMessages.push({ op, data, rest }); } }; }, setStream: stream => { activeStream = stream; }, setPictures: value => { storedPictures = value; }, deny: () => { permitted = false; } };
}


for(const name of ["AutoUnmute","SilentDelete","SilentEdit","SilentMessageCore"]){const instance = await load(name,name==="SilentMessageCore"?"ts":"tsx"); instance.plugin.start?.(); await instance.drain(); instance.plugin.stop?.(); await instance.drain(); assert.equal(instance.timers.size,0);} console.log("PASS: all changed plugin startup fixtures.");
