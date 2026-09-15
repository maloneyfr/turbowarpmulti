/**
 * Operation types and message protocol for real-time collaboration.
 * Each operation is a JSON message sent over PeerJS DataChannels.
 */

// --- Operation type constants ---

const OP = {
    // Session management
    PEER_INFO: 'PEER_INFO',
    PEER_JOINED: 'PEER_JOINED',
    PEER_LEFT: 'PEER_LEFT',
    FULL_PROJECT_SYNC: 'FULL_PROJECT_SYNC',
    ROOM_FULL: 'ROOM_FULL',
    KICK: 'KICK',

    // Block operations
    BLOCK_EVENT: 'BLOCK_EVENT',


    // Sprite operations
    SPRITE_ADD: 'SPRITE_ADD',
    SPRITE_DELETE: 'SPRITE_DELETE',
    SPRITE_RENAME: 'SPRITE_RENAME',
    SPRITE_PROPERTY: 'SPRITE_PROPERTY',
    SPRITE_REORDER: 'SPRITE_REORDER',

    // Costume operations
    COSTUME_ADD: 'COSTUME_ADD',
    COSTUME_DELETE: 'COSTUME_DELETE',
    COSTUME_CHANGE: 'COSTUME_CHANGE',
    COSTUME_UPDATE: 'COSTUME_UPDATE',

    // Sound operations
    SOUND_ADD: 'SOUND_ADD',
    SOUND_DELETE: 'SOUND_DELETE',

    // Variable / List operations
    VARIABLE_CREATE: 'VARIABLE_CREATE',
    VARIABLE_DELETE: 'VARIABLE_DELETE',
    VARIABLE_SET: 'VARIABLE_SET',
    VARIABLE_RENAME: 'VARIABLE_RENAME',

    // Execution
    GREEN_FLAG: 'GREEN_FLAG',
    STOP_ALL: 'STOP_ALL',

    // Cursor / presence
    CURSOR_MOVE: 'CURSOR_MOVE',

    // Project metadata
    PROJECT_RENAME: 'PROJECT_RENAME',

    // Chat
    CHAT_MESSAGE: 'CHAT_MESSAGE',

    // Voice
    VOICE_STATE: 'VOICE_STATE'
};

/**
 * Create an operation message.
 * @param {string} type - One of the OP constants
 * @param {object} payload - The operation data
 * @param {string} sourcePeerId - The peer ID that originated this op
 * @returns {object} The operation message
 */
const createOp = (type, payload, sourcePeerId) => ({
    type,
    payload,
    source: sourcePeerId,
    timestamp: Date.now(),
    id: `${sourcePeerId}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
});

/**
 * Serialize an operation for sending over a DataChannel.
 * For binary payloads (like FULL_PROJECT_SYNC), the payload is kept as ArrayBuffer.
 * For JSON payloads, stringified.
 */
const serializeOp = op => {
    if (op.type === OP.FULL_PROJECT_SYNC) {
        // Send metadata and binary separately
        const meta = JSON.stringify({
            type: op.type,
            source: op.source,
            timestamp: op.timestamp,
            id: op.id,
            _hasBinary: true
        });
        return {isBinary: true, meta, binary: op.payload.projectData};
    }
    return {isBinary: false, data: JSON.stringify(op)};
};

/**
 * Deserialize a received message back into an operation.
 */
const deserializeOp = data => {
    if (typeof data === 'string') {
        return JSON.parse(data);
    }
    // ArrayBuffer — this is the binary part of a FULL_PROJECT_SYNC
    return {_binaryPayload: data};
};

/**
 * Maps Scratch VM / workspace event types to our operation types.
 */
const WORKSPACE_EVENT_MAP = {
    BLOCK_EVENT: OP.BLOCK_EVENT
};

module.exports = {
    OP,
    createOp,
    serializeOp,
    deserializeOp,
    WORKSPACE_EVENT_MAP
};
