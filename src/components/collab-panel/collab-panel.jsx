import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import styles from './collab-panel.css';

class CollabPanel extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            chatOpen: true,
            chatInput: ''
        };
        this.handleSendChat = this.handleSendChat.bind(this);
        this.handleChatKeyPress = this.handleChatKeyPress.bind(this);
        this.chatMessagesRef = React.createRef ? React.createRef() : null;
    }

    componentDidUpdate (prevProps) {
        if (prevProps.chatMessages.length !== this.props.chatMessages.length) {
            this.scrollChatToBottom();
        }
    }

    scrollChatToBottom () {
        if (this.chatMessagesRef && this.chatMessagesRef.current) {
            this.chatMessagesRef.current.scrollTop = this.chatMessagesRef.current.scrollHeight;
        }
    }

    handleSendChat () {
        const text = this.state.chatInput.trim();
        if (!text) return;
        this.props.onSendChat(text);
        this.setState({chatInput: ''});
    }

    handleChatKeyPress (e) {
        if (e.key === 'Enter') {
            this.handleSendChat();
        }
    }

    handleCopyRoomCode () {
        if (this.props.roomCode) {
            navigator.clipboard.writeText(this.props.roomCode);
        }
    }

    renderPeerList () {
        const {peers, myColor, myPeerId, isHost, vm} = this.props;

        // Build list: self first, then other peers
        const allPeers = [];

        // Add self
        allPeers.push({
            peerId: myPeerId,
            displayName: 'You',
            color: myColor,
            currentTargetId: vm ? (vm.editingTarget ? vm.editingTarget.id : null) : null,
            isSelf: true,
            isHost: isHost
        });

        // Add remote peers
        peers.forEach(p => {
            allPeers.push(Object.assign({}, p, {isSelf: false}));
        });

        return allPeers.map(peer => {
            // Find sprite name for the target they're editing
            let spriteName = null;
            if (peer.currentTargetId && vm) {
                const target = vm.runtime.targets.find(t => t.id === peer.currentTargetId);
                if (target) {
                    spriteName = target.isStage ? 'Stage' : target.sprite.name;
                }
            }

            return (
                <div
                    className={styles.peerItem}
                    key={peer.peerId || peer.displayName}
                >
                    <div
                        className={styles.peerColorDot}
                        style={{
                            backgroundColor: peer.color ? peer.color.hex : '#888',
                            '--dot-glow': peer.color
                                ? `${peer.color.hex}80`
                                : 'rgba(136, 136, 136, 0.3)'
                        }}
                    />
                    <div className={styles.peerInfo}>
                        <div className={styles.peerName}>
                            {peer.displayName}
                        </div>
                        {spriteName && (
                            <div className={styles.peerSprite}>
                                {'📝 '}{spriteName}
                            </div>
                        )}
                    </div>
                    {peer.isSelf && (
                        <span className={styles.peerYou}>{'YOU'}</span>
                    )}
                    {peer.isHost && !peer.isSelf && (
                        <span className={styles.peerHost}>{'HOST'}</span>
                    )}
                    {peer.voiceState && peer.voiceState.isMuted && (
                        <span className={styles.peerMuted}>{'🔇'}</span>
                    )}
                </div>
            );
        });
    }

    render () {
        const {
            roomCode,
            voiceState,
            chatMessages,
            onClose,
            onLeave,
            onToggleVoice,
            onToggleMute,
            onToggleDeafen
        } = this.props;
        const {chatOpen, chatInput} = this.state;

        return (
            <div className={styles.panelOverlay}>
                <div className={styles.panel}>
                    {/* Header */}
                    <div className={styles.panelHeader}>
                        <div className={styles.panelTitle}>
                            <span className={styles.statusDot} />
                            {'Live Session'}
                        </div>
                        <button
                            className={styles.closePanel}
                            onClick={onClose}
                        >
                            {'✕'}
                        </button>
                    </div>

                    {/* Room Info */}
                    {roomCode && (
                        <div className={styles.roomInfo}>
                            <div className={styles.roomCodeRow}>
                                <span className={styles.roomLabel}>{'Room Code'}</span>
                                <span
                                    className={styles.roomCodeSmall}
                                    onClick={() => this.handleCopyRoomCode()}
                                    title="Click to copy"
                                >
                                    {roomCode}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Peer List */}
                    <div className={styles.sectionTitle}>{'Collaborators'}</div>
                    <div className={styles.peerList}>
                        {this.renderPeerList()}
                    </div>

                    {/* Voice Controls */}
                    <div className={styles.voiceSection}>
                        {voiceState.isActive ? (
                            <React.Fragment>
                                <button
                                    className={classNames(styles.voiceButton, {
                                        [styles.voiceMute]: !voiceState.isMuted,
                                        [styles.voiceMuted]: voiceState.isMuted
                                    })}
                                    onClick={onToggleMute}
                                >
                                    {voiceState.isMuted ? '🔇 Muted' : '🎤 Mic'}
                                </button>
                                <button
                                    className={classNames(styles.voiceButton, {
                                        [styles.voiceDeafen]: !voiceState.isDeafened,
                                        [styles.voiceDeafened]: voiceState.isDeafened
                                    })}
                                    onClick={onToggleDeafen}
                                >
                                    {voiceState.isDeafened ? '🔇 Deaf' : '🔊 Sound'}
                                </button>
                                <button
                                    className={classNames(styles.voiceButton, styles.voiceLeave)}
                                    onClick={onToggleVoice}
                                >
                                    {'🚪'}
                                </button>
                            </React.Fragment>
                        ) : (
                            <button
                                className={classNames(styles.voiceButton, styles.voiceJoin)}
                                onClick={onToggleVoice}
                            >
                                {'🎤 Join Voice Chat'}
                            </button>
                        )}
                    </div>

                    {/* Chat */}
                    <div className={styles.chatSection}>
                        <div
                            className={styles.chatToggle}
                            onClick={() => this.setState({chatOpen: !chatOpen})}
                        >
                            <span className={styles.chatLabel}>{'💬 Chat'}</span>
                            <span className={styles.chatToggleIcon}>
                                {chatOpen ? '▼' : '▶'}
                            </span>
                        </div>
                        {chatOpen && (
                            <React.Fragment>
                                <div
                                    className={styles.chatMessages}
                                    ref={this.chatMessagesRef}
                                >
                                    {chatMessages.map((msg, i) => (
                                        <div
                                            className={styles.chatMessage}
                                            key={`${msg.timestamp}-${i}`}
                                        >
                                            <span
                                                className={styles.chatSender}
                                                style={{color: msg.color}}
                                            >
                                                {msg.displayName}
                                            </span>
                                            <span className={styles.chatText}>
                                                {msg.text}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className={styles.chatInputRow}>
                                    <input
                                        className={styles.chatInput}
                                        onChange={e => this.setState({chatInput: e.target.value})}
                                        onKeyPress={this.handleChatKeyPress}
                                        placeholder="Type a message..."
                                        type="text"
                                        value={chatInput}
                                    />
                                    <button
                                        className={styles.chatSend}
                                        onClick={this.handleSendChat}
                                    >
                                        {'Send'}
                                    </button>
                                </div>
                            </React.Fragment>
                        )}
                    </div>

                    {/* Leave */}
                    <div className={styles.leaveSection}>
                        <button
                            className={styles.leaveButton}
                            onClick={onLeave}
                        >
                            {'Leave Session'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

CollabPanel.propTypes = {
    chatMessages: PropTypes.arrayOf(PropTypes.shape({
        text: PropTypes.string,
        displayName: PropTypes.string,
        color: PropTypes.string,
        timestamp: PropTypes.number
    })),
    isHost: PropTypes.bool,
    myColor: PropTypes.shape({
        hex: PropTypes.string
    }),
    myPeerId: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    onLeave: PropTypes.func.isRequired,
    onSendChat: PropTypes.func.isRequired,
    onToggleDeafen: PropTypes.func.isRequired,
    onToggleMute: PropTypes.func.isRequired,
    onToggleVoice: PropTypes.func.isRequired,
    peers: PropTypes.array,
    roomCode: PropTypes.string,
    vm: PropTypes.object,
    voiceState: PropTypes.shape({
        isActive: PropTypes.bool,
        isMuted: PropTypes.bool,
        isDeafened: PropTypes.bool
    })
};

CollabPanel.defaultProps = {
    peers: [],
    chatMessages: [],
    voiceState: {isActive: false, isMuted: false, isDeafened: false}
};

export default CollabPanel;
