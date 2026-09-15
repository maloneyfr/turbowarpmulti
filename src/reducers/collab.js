/**
 * Redux reducer for collaboration state.
 */

const COLLAB_SET_STATUS = 'scratch-gui/collab/SET_STATUS';
const COLLAB_SET_SESSION = 'scratch-gui/collab/SET_SESSION';
const COLLAB_SET_PEERS = 'scratch-gui/collab/SET_PEERS';
const COLLAB_SET_MY_COLOR = 'scratch-gui/collab/SET_MY_COLOR';
const COLLAB_SET_ERROR = 'scratch-gui/collab/SET_ERROR';
const COLLAB_TOGGLE_PANEL = 'scratch-gui/collab/TOGGLE_PANEL';
const COLLAB_TOGGLE_CHAT = 'scratch-gui/collab/TOGGLE_CHAT';
const COLLAB_ADD_CHAT_MESSAGE = 'scratch-gui/collab/ADD_CHAT_MESSAGE';
const COLLAB_SET_VOICE_STATE = 'scratch-gui/collab/SET_VOICE_STATE';
const COLLAB_SET_ROOM_CODE = 'scratch-gui/collab/SET_ROOM_CODE';
const COLLAB_SHOW_JOIN_MODAL = 'scratch-gui/collab/SHOW_JOIN_MODAL';

const loadChatHistory = () => {
    try {
        const stored = localStorage.getItem('sokbanawarp-chat');
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error('Failed to load chat history', e);
    }
    return [];
};

const collabInitialState = {
    isInSession: false,
    isHost: false,
    roomCode: null,
    myPeerId: null,
    myColor: null,
    peers: [],
    connectionStatus: 'disconnected', // 'connecting' | 'connected' | 'disconnected' | 'error'
    errorMessage: null,
    showCollabPanel: false,
    showChat: false,
    showJoinModal: false,
    chatMessages: loadChatHistory(),
    voiceState: {
        isActive: false,
        isMuted: false,
        isDeafened: false
    }
};

const collabReducer = function (state, action) {
    if (typeof state === 'undefined') state = collabInitialState;

    switch (action.type) {
    case COLLAB_SET_STATUS:
        return Object.assign({}, state, {
            connectionStatus: action.status,
            errorMessage: action.status === 'error' ? (action.error || state.errorMessage) : null
        });
    case COLLAB_SET_SESSION:
        return Object.assign({}, state, {
            isInSession: action.isInSession,
            isHost: action.isHost,
            roomCode: action.roomCode
        });
    case COLLAB_SET_PEERS:
        return Object.assign({}, state, {
            peers: action.peers
        });
    case COLLAB_SET_MY_COLOR:
        return Object.assign({}, state, {
            myColor: action.color
        });
    case COLLAB_SET_ERROR:
        return Object.assign({}, state, {
            errorMessage: action.error,
            connectionStatus: 'error'
        });
    case COLLAB_TOGGLE_PANEL:
        return Object.assign({}, state, {
            showCollabPanel: !state.showCollabPanel
        });
    case COLLAB_TOGGLE_CHAT:
        return Object.assign({}, state, {
            showChat: !state.showChat
        });
    case COLLAB_ADD_CHAT_MESSAGE: {
        const newMessages = state.chatMessages.concat([action.message]).slice(-100);
        try {
            localStorage.setItem('sokbanawarp-chat', JSON.stringify(newMessages));
        } catch (e) {
            console.error('Failed to save chat history', e);
        }
        return Object.assign({}, state, {
            chatMessages: newMessages // Keep last 100
        });
    }
    case COLLAB_SET_VOICE_STATE:
        return Object.assign({}, state, {
            voiceState: action.voiceState
        });
    case COLLAB_SET_ROOM_CODE:
        return Object.assign({}, state, {
            roomCode: action.roomCode
        });
    case COLLAB_SHOW_JOIN_MODAL:
        return Object.assign({}, state, {
            showJoinModal: action.show
        });
    default:
        return state;
    }
};

// Action creators
const setCollabStatus = (status, error) => ({
    type: COLLAB_SET_STATUS,
    status,
    error
});

const setCollabSession = (isInSession, isHost, roomCode) => ({
    type: COLLAB_SET_SESSION,
    isInSession,
    isHost,
    roomCode
});

const setCollabPeers = peers => ({
    type: COLLAB_SET_PEERS,
    peers
});

const setCollabMyColor = color => ({
    type: COLLAB_SET_MY_COLOR,
    color
});

const setCollabError = error => ({
    type: COLLAB_SET_ERROR,
    error
});

const toggleCollabPanel = () => ({
    type: COLLAB_TOGGLE_PANEL
});

const toggleCollabChat = () => ({
    type: COLLAB_TOGGLE_CHAT
});

const addCollabChatMessage = message => ({
    type: COLLAB_ADD_CHAT_MESSAGE,
    message
});

const setCollabVoiceState = voiceState => ({
    type: COLLAB_SET_VOICE_STATE,
    voiceState
});

const setCollabRoomCode = roomCode => ({
    type: COLLAB_SET_ROOM_CODE,
    roomCode
});

const showCollabJoinModal = show => ({
    type: COLLAB_SHOW_JOIN_MODAL,
    show
});

export {
    collabReducer as default,
    collabInitialState,
    setCollabStatus,
    setCollabSession,
    setCollabPeers,
    setCollabMyColor,
    setCollabError,
    toggleCollabPanel,
    toggleCollabChat,
    addCollabChatMessage,
    setCollabVoiceState,
    setCollabRoomCode,
    showCollabJoinModal
};
