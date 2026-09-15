/**
 * CollabManager — Core P2P collaboration orchestrator.
 * Manages PeerJS connections, room lifecycle, peer registry,
 * color assignment, and message routing for up to 5 users.
 */
const EventEmitter = require('events');
const Peer = require('peerjs').Peer || require('peerjs').default || require('peerjs');
const {OP, createOp} = require('./operations');
const {PEER_COLORS, getNextAvailableColor} = require('./peer-colors');

const MAX_PEERS = 5;
const ROOM_CODE_LENGTH = 6;

const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 for clarity
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

class CollabManager extends EventEmitter {
    constructor (vm) {
        super();
        this.vm = vm;
        this.peer = null;
        this.connections = new Map(); // peerId -> DataConnection
        this.voiceCalls = new Map(); // peerId -> MediaConnection
        this.peers = new Map(); // peerId -> { peerId, displayName, color, currentTargetId }
        this.roomCode = null;
        this._isHost = false;
        this.myPeerId = null;
        this.myColor = null;
        this.myDisplayName = `User ${Math.floor(Math.random() * 9000) + 1000}`;
        this.connectionStatus = 'disconnected';
        this._isRemoteOperation = false; // Flag to prevent re-broadcasting
        this._processedOps = new Set(); // Track processed op IDs for dedup
        this._localStream = null;
        this._isMuted = false;
        this._isDeafened = false;
        this._remoteStreams = new Map(); // peerId -> MediaStream

        // Bind methods
        this._onData = this._onData.bind(this);
        this._onPeerConnection = this._onPeerConnection.bind(this);
        this._onPeerDisconnected = this._onPeerDisconnected.bind(this);
    }

    get isRemoteOperation () {
        return this._isRemoteOperation;
    }

    isHost () {
        return this._isHost;
    }

    isInSession () {
        return this.connectionStatus === 'connected';
    }

    getPeers () {
        return Array.from(this.peers.values());
    }

    /**
     * Create a new collaboration room (host mode).
     * @returns {Promise<string>} The room code
     */
    async createRoom () {
        this.roomCode = generateRoomCode();
        this._isHost = true;
        this.myColor = PEER_COLORS[0]; // Host always gets first color

        const peerId = `sokbanawarp-${this.roomCode}-host`;
        await this._initPeer(peerId);

        // Host listens for incoming connections
        this.peer.on('connection', this._onPeerConnection);
        this.peer.on('call', call => this._handleIncomingCall(call));

        this.connectionStatus = 'connected';
        this.emit('statusChange', this.connectionStatus);
        this.emit('roomCreated', this.roomCode);

        return this.roomCode;
    }

    /**
     * Join an existing collaboration room (peer mode).
     * @param {string} code - The room code to join
     */
    async joinRoom (code) {
        this.roomCode = code.toUpperCase().trim();
        this._isHost = false;

        const peerId = `sokbanawarp-${this.roomCode}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        await this._initPeer(peerId);

        // Connect to the host
        const hostPeerId = `sokbanawarp-${this.roomCode}-host`;
        this.connectionStatus = 'connecting';
        this.emit('statusChange', this.connectionStatus);

        const conn = this.peer.connect(hostPeerId, {reliable: true});
        this._setupConnection(conn, hostPeerId);

        // Listen for connections from other peers
        this.peer.on('connection', this._onPeerConnection);
        this.peer.on('call', call => this._handleIncomingCall(call));
    }

    /**
     * Leave the current session
     */
    leaveRoom () {
        // Notify peers
        this.broadcastOp(createOp(OP.PEER_LEFT, {
            peerId: this.myPeerId,
            displayName: this.myDisplayName
        }, this.myPeerId));

        // Cleanup voice
        this._stopLocalStream();

        // Close all connections
        for (const conn of this.connections.values()) {
            conn.close();
        }
        for (const call of this.voiceCalls.values()) {
            call.close();
        }

        this.connections.clear();
        this.voiceCalls.clear();
        this.peers.clear();
        this._remoteStreams.clear();

        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }

        this.roomCode = null;
        this._isHost = false;
        this.myPeerId = null;
        this.myColor = null;
        this.connectionStatus = 'disconnected';
        this._processedOps.clear();

        this.emit('statusChange', this.connectionStatus);
        this.emit('peersChanged', []);
    }

    /**
     * Broadcast an operation to all connected peers.
     * @param {object} op - The operation message
     */
    broadcastOp (op) {
        if (this._isRemoteOperation) return; // Don't re-broadcast
        const data = JSON.stringify(op);
        for (const conn of this.connections.values()) {
            if (conn.open) {
                conn.send(data);
            }
        }
    }

    /**
     * Send an operation to a specific peer.
     */
    sendToPeer (peerId, op) {
        const conn = this.connections.get(peerId);
        if (conn && conn.open) {
            conn.send(JSON.stringify(op));
        }
    }

    /**
     * Send a chat message
     */
    sendChatMessage (text) {
        const op = createOp(OP.CHAT_MESSAGE, {
            text,
            displayName: this.myDisplayName,
            color: this.myColor.hex
        }, this.myPeerId);
        this.broadcastOp(op);
        // Also emit locally so the sender sees their own message
        this.emit('chatMessage', {
            text,
            displayName: this.myDisplayName,
            color: this.myColor.hex,
            peerId: this.myPeerId,
            timestamp: op.timestamp,
            isSelf: true
        });
    }

    /**
     * Update which sprite this user is currently editing.
     */
    updateCursorTarget (targetId) {
        this.broadcastOp(createOp(OP.CURSOR_MOVE, {
            targetId,
            displayName: this.myDisplayName
        }, this.myPeerId));
    }

    // ---- Voice Chat ----

    async startVoiceChat () {
        try {
            this._localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });

            // Call all connected peers
            for (const [peerId] of this.connections) {
                this._callPeer(peerId);
            }

            this.emit('voiceStateChanged', {
                isMuted: this._isMuted,
                isDeafened: this._isDeafened,
                isActive: true
            });
        } catch (err) {
            console.error('Failed to start voice chat:', err);
            this.emit('voiceError', err.message);
        }
    }

    stopVoiceChat () {
        this._stopLocalStream();
        for (const call of this.voiceCalls.values()) {
            call.close();
        }
        this.voiceCalls.clear();
        this._remoteStreams.clear();
        this.emit('voiceStateChanged', {
            isMuted: false,
            isDeafened: false,
            isActive: false
        });
    }

    toggleMute () {
        this._isMuted = !this._isMuted;
        if (this._localStream) {
            this._localStream.getAudioTracks().forEach(track => {
                track.enabled = !this._isMuted;
            });
        }
        this.broadcastOp(createOp(OP.VOICE_STATE, {
            isMuted: this._isMuted,
            isDeafened: this._isDeafened
        }, this.myPeerId));
        this.emit('voiceStateChanged', {
            isMuted: this._isMuted,
            isDeafened: this._isDeafened,
            isActive: true
        });
    }

    toggleDeafen () {
        this._isDeafened = !this._isDeafened;
        // When deafened, also mute
        if (this._isDeafened) {
            this._isMuted = true;
            if (this._localStream) {
                this._localStream.getAudioTracks().forEach(track => {
                    track.enabled = false;
                });
            }
        }
        // Mute/unmute all remote streams
        for (const stream of this._remoteStreams.values()) {
            stream.getAudioTracks().forEach(track => {
                track.enabled = !this._isDeafened;
            });
        }
        this.broadcastOp(createOp(OP.VOICE_STATE, {
            isMuted: this._isMuted,
            isDeafened: this._isDeafened
        }, this.myPeerId));
        this.emit('voiceStateChanged', {
            isMuted: this._isMuted,
            isDeafened: this._isDeafened,
            isActive: true
        });
    }

    // ---- Internal methods ----

    _initPeer (peerId) {
        return new Promise((resolve, reject) => {
            this.peer = new Peer(peerId, {
                debug: 1 // Minimal logging
            });

            this.peer.on('open', id => {
                this.myPeerId = id;
                resolve(id);
            });

            this.peer.on('error', err => {
                console.error('PeerJS error:', err);
                if (this.connectionStatus === 'connecting') {
                    this.connectionStatus = 'error';
                    this.emit('statusChange', this.connectionStatus);
                    this.emit('error', err.type === 'peer-unavailable'
                        ? 'Room not found. Check the room code and try again.'
                        : `Connection error: ${err.message}`
                    );
                    reject(err);
                } else {
                    this.emit('error', err.message);
                }
            });

            this.peer.on('disconnected', () => {
                if (this.connectionStatus === 'connected') {
                    // Try to reconnect
                    this.peer.reconnect();
                }
            });
        });
    }

    _onPeerConnection (conn) {
        // Check room capacity
        if (this.peers.size >= MAX_PEERS - 1) { // -1 because we don't count ourselves
            const rejectOp = createOp(OP.ROOM_FULL, {}, this.myPeerId);
            conn.on('open', () => {
                conn.send(JSON.stringify(rejectOp));
                setTimeout(() => conn.close(), 500);
            });
            return;
        }

        this._setupConnection(conn, conn.peer);
    }

    _setupConnection (conn, remotePeerId) {
        conn.on('open', () => {
            this.connections.set(remotePeerId, conn);

            if (this._isHost) {
                // Assign color to new peer
                const usedIndices = [0]; // Host has index 0
                for (const p of this.peers.values()) {
                    usedIndices.push(p.color.id);
                }
                const assignedColor = getNextAvailableColor(usedIndices);

                // Send peer info with color assignment and existing peer list
                const peerInfo = createOp(OP.PEER_INFO, {
                    assignedColor,
                    assignedPeerId: remotePeerId,
                    hostDisplayName: this.myDisplayName,
                    hostColor: this.myColor,
                    existingPeers: Array.from(this.peers.values()),
                    roomCode: this.roomCode
                }, this.myPeerId);
                conn.send(JSON.stringify(peerInfo));

                // Send full project sync
                this._sendProjectSync(conn);

                // Register this peer
                const peerData = {
                    peerId: remotePeerId,
                    displayName: `User ${this.peers.size + 2}`,
                    color: assignedColor,
                    currentTargetId: null,
                    voiceState: {isMuted: false, isDeafened: false}
                };
                this.peers.set(remotePeerId, peerData);

                // Notify all existing peers about the new peer
                const joinedOp = createOp(OP.PEER_JOINED, peerData, this.myPeerId);
                for (const [pid, c] of this.connections) {
                    if (pid !== remotePeerId && c.open) {
                        c.send(JSON.stringify(joinedOp));
                    }
                }

                this.emit('peersChanged', this.getPeers());

                // Start voice call if we have a local stream
                if (this._localStream) {
                    setTimeout(() => this._callPeer(remotePeerId), 1000);
                }
            }

            this.connectionStatus = 'connected';
            this.emit('statusChange', this.connectionStatus);
        });

        conn.on('data', data => this._onData(data, remotePeerId));

        conn.on('close', () => this._onPeerDisconnected(remotePeerId));
        conn.on('error', err => {
            console.error(`Connection error with ${remotePeerId}:`, err);
            this._onPeerDisconnected(remotePeerId);
        });
    }

    _onPeerDisconnected (remotePeerId) {
        this.connections.delete(remotePeerId);
        this.peers.delete(remotePeerId);

        // Clean up voice
        const call = this.voiceCalls.get(remotePeerId);
        if (call) {
            call.close();
            this.voiceCalls.delete(remotePeerId);
        }
        this._remoteStreams.delete(remotePeerId);

        // Notify remaining peers
        const leftOp = createOp(OP.PEER_LEFT, {
            peerId: remotePeerId
        }, this.myPeerId);
        this.broadcastOp(leftOp);

        this.emit('peersChanged', this.getPeers());
        this.emit('peerLeft', remotePeerId);
    }

    async _sendProjectSync (conn) {
        try {
            const projectData = await this.vm.saveProjectSb3();
            const syncOp = createOp(OP.FULL_PROJECT_SYNC, {
                projectDataBase64: await this._arrayBufferToBase64(projectData)
            }, this.myPeerId);
            conn.send(JSON.stringify(syncOp));
        } catch (err) {
            console.error('Failed to send project sync:', err);
        }
    }

    _arrayBufferToBase64 (buffer) {
        return new Promise(resolve => {
            const blob = new Blob([buffer]);
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.readAsDataURL(blob);
        });
    }

    _base64ToArrayBuffer (base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    _onData (rawData, sourcePeerId) {
        let op;
        try {
            op = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        } catch (e) {
            console.error('Failed to parse collab message:', e);
            return;
        }

        // Dedup
        if (op.id && this._processedOps.has(op.id)) return;
        if (op.id) {
            this._processedOps.add(op.id);
            // Trim old entries
            if (this._processedOps.size > 5000) {
                const iter = this._processedOps.values();
                for (let i = 0; i < 2500; i++) iter.next();
                // Just clear and hope for the best with old ops
                this._processedOps.clear();
            }
        }

        switch (op.type) {
        case OP.ROOM_FULL:
            this.connectionStatus = 'error';
            this.emit('statusChange', this.connectionStatus);
            this.emit('error', 'Room is full (maximum 5 users).');
            this.leaveRoom();
            return;

        case OP.PEER_INFO:
            this._handlePeerInfo(op);
            return;

        case OP.FULL_PROJECT_SYNC:
            this._handleProjectSync(op);
            return;

        case OP.PEER_JOINED:
            this._handlePeerJoined(op);
            return;

        case OP.PEER_LEFT:
            this._handlePeerLeft(op);
            return;

        case OP.CURSOR_MOVE:
            this._handleCursorMove(op);
            return;

        case OP.CHAT_MESSAGE:
            this.emit('chatMessage', {
                text: op.payload.text,
                displayName: op.payload.displayName,
                color: op.payload.color,
                peerId: op.source,
                timestamp: op.timestamp,
                isSelf: false
            });
            // Forward to other peers if host
            if (this._isHost) {
                this._forwardOp(op, sourcePeerId);
            }
            return;

        case OP.VOICE_STATE: {
            const peer = this.peers.get(op.source);
            if (peer) {
                peer.voiceState = op.payload;
                this.emit('peersChanged', this.getPeers());
            }
            if (this._isHost) this._forwardOp(op, sourcePeerId);
            return;
        }

        case OP.GREEN_FLAG:
            this.vm.greenFlag();
            if (this._isHost) this._forwardOp(op, sourcePeerId);
            return;

        case OP.STOP_ALL:
            this.vm.stopAll();
            if (this._isHost) this._forwardOp(op, sourcePeerId);
            return;

        default:
            // All VM-related operations
            this.emit('remoteOperation', op);
            // If host, forward to all other peers
            if (this._isHost) {
                this._forwardOp(op, sourcePeerId);
            }
            return;
        }
    }

    /**
     * Forward an op to all peers except the source.
     */
    _forwardOp (op, sourcePeerId) {
        const data = JSON.stringify(op);
        for (const [pid, conn] of this.connections) {
            if (pid !== sourcePeerId && conn.open) {
                conn.send(data);
            }
        }
    }

    _handlePeerInfo (op) {
        this.myColor = op.payload.assignedColor;
        this.myPeerId = op.payload.assignedPeerId || this.myPeerId;

        // Add host to our peers list
        const hostData = {
            peerId: op.source,
            displayName: op.payload.hostDisplayName,
            color: op.payload.hostColor,
            currentTargetId: null,
            voiceState: {isMuted: false, isDeafened: false}
        };
        this.peers.set(op.source, hostData);

        // Add existing peers
        if (op.payload.existingPeers) {
            op.payload.existingPeers.forEach(p => {
                this.peers.set(p.peerId, p);
                // Connect to each existing peer for mesh
                const conn = this.peer.connect(p.peerId, {reliable: true});
                this._setupConnection(conn, p.peerId);
            });
        }

        this.emit('peersChanged', this.getPeers());
        this.emit('colorAssigned', this.myColor);
    }

    _handleProjectSync (op) {
        try {
            const projectData = this._base64ToArrayBuffer(op.payload.projectDataBase64);
            this._isRemoteOperation = true;
            this.vm.loadProject(projectData).then(() => {
                this._isRemoteOperation = false;
                this.emit('projectSynced');
            }).catch(err => {
                this._isRemoteOperation = false;
                console.error('Failed to load synced project:', err);
            });
        } catch (err) {
            console.error('Failed to decode project sync:', err);
        }
    }

    _handlePeerJoined (op) {
        const peerData = op.payload;
        this.peers.set(peerData.peerId, peerData);
        this.emit('peersChanged', this.getPeers());
    }

    _handlePeerLeft (op) {
        const peerId = op.payload.peerId;
        this.peers.delete(peerId);
        this.connections.delete(peerId);
        this._remoteStreams.delete(peerId);
        this.emit('peersChanged', this.getPeers());
        this.emit('peerLeft', peerId);
    }

    _handleCursorMove (op) {
        const peer = this.peers.get(op.source);
        if (peer) {
            peer.currentTargetId = op.payload.targetId;
            this.emit('peersChanged', this.getPeers());
            this.emit('cursorMoved', {
                peerId: op.source,
                targetId: op.payload.targetId
            });
        }
        if (this._isHost) {
            this._forwardOp(op, op.source);
        }
    }

    // ---- Voice helpers ----

    _callPeer (remotePeerId) {
        if (!this._localStream) return;
        const call = this.peer.call(remotePeerId, this._localStream);
        if (!call) return;

        call.on('stream', remoteStream => {
            this._remoteStreams.set(remotePeerId, remoteStream);
            // Play the remote audio
            this._playRemoteStream(remotePeerId, remoteStream);
        });

        call.on('close', () => {
            this.voiceCalls.delete(remotePeerId);
            this._remoteStreams.delete(remotePeerId);
        });

        this.voiceCalls.set(remotePeerId, call);
    }

    _handleIncomingCall (call) {
        if (this._localStream) {
            call.answer(this._localStream);
        } else {
            // Answer with no stream — will get audio only
            call.answer();
        }

        call.on('stream', remoteStream => {
            this._remoteStreams.set(call.peer, remoteStream);
            this._playRemoteStream(call.peer, remoteStream);
        });

        call.on('close', () => {
            this.voiceCalls.delete(call.peer);
            this._remoteStreams.delete(call.peer);
        });

        this.voiceCalls.set(call.peer, call);
    }

    _playRemoteStream (peerId, stream) {
        // Create a hidden audio element to play the remote stream
        let audio = document.getElementById(`collab-audio-${peerId}`);
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = `collab-audio-${peerId}`;
            audio.autoplay = true;
            document.body.appendChild(audio);
        }
        audio.srcObject = stream;
        audio.muted = this._isDeafened;
    }

    _stopLocalStream () {
        if (this._localStream) {
            this._localStream.getTracks().forEach(track => track.stop());
            this._localStream = null;
        }
        // Remove all audio elements
        document.querySelectorAll('[id^="collab-audio-"]').forEach(el => el.remove());
    }
}

module.exports = CollabManager;
