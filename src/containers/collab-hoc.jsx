/**
 * Collaboration HOC — Wraps the GUI to inject CollabManager lifecycle,
 * wire up Redux state, and render collaboration UI components.
 */
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import VM from 'scratch-vm';

import CollabManager from '../lib/collab/collab-manager';
import CollabVMListener from '../lib/collab/vm-listener';
import CollabButton from '../components/collab-button/collab-button.jsx';
import CollabJoinModal from '../components/collab-join-modal/collab-join-modal.jsx';
import CollabPanel from '../components/collab-panel/collab-panel.jsx';

import {
    setCollabStatus,
    setCollabSession,
    setCollabPeers,
    setCollabMyColor,
    setCollabError,
    toggleCollabPanel,
    addCollabChatMessage,
    setCollabVoiceState,
    setCollabRoomCode,
    showCollabJoinModal
} from '../reducers/collab';

/**
 * HOC that adds collaboration capabilities to the GUI.
 * @param {React.Component} WrappedComponent - The GUI component
 * @returns {React.Component} Enhanced component with collaboration
 */
const collabHOC = WrappedComponent => {
    class CollabWrapper extends React.Component {
        constructor (props) {
            super(props);
            this.collabManager = null;
            this.vmListener = null;

            this.handleCreateRoom = this.handleCreateRoom.bind(this);
            this.handleJoinRoom = this.handleJoinRoom.bind(this);
            this.handleLeaveRoom = this.handleLeaveRoom.bind(this);
            this.handleTogglePanel = this.handleTogglePanel.bind(this);
            this.handleToggleJoinModal = this.handleToggleJoinModal.bind(this);
            this.handleSendChat = this.handleSendChat.bind(this);
            this.handleToggleVoice = this.handleToggleVoice.bind(this);
            this.handleToggleMute = this.handleToggleMute.bind(this);
            this.handleToggleDeafen = this.handleToggleDeafen.bind(this);
            this.handleCollabButtonClick = this.handleCollabButtonClick.bind(this);
        }

        componentDidMount () {
            this._initCollabManager();
        }

        componentDidUpdate (prevProps) {
            if (this.props.vm !== prevProps.vm) {
                this._initCollabManager();
            }
        }

        componentWillUnmount () {
            if (this.vmListener) {
                this.vmListener.destroy();
            }
            if (this.collabManager) {
                this.collabManager.leaveRoom();
                this.collabManager.removeAllListeners();
            }
        }

        _initCollabManager () {
            if (!this.props.vm) return;
            if (this.collabManager) return; // Already initialized

            this.collabManager = new CollabManager(this.props.vm);
            this.vmListener = new CollabVMListener(this.props.vm, this.collabManager);

            // Wire up events to Redux
            this.collabManager.on('statusChange', status => {
                this.props.onSetStatus(status);
                if (status === 'connected') {
                    this.props.onSetSession(true, this.collabManager.isHost(), this.collabManager.roomCode);
                } else if (status === 'disconnected') {
                    this.props.onSetSession(false, false, null);
                }
            });

            this.collabManager.on('peersChanged', peers => {
                this.props.onSetPeers(peers);
            });

            this.collabManager.on('colorAssigned', color => {
                this.props.onSetMyColor(color);
            });

            this.collabManager.on('roomCreated', roomCode => {
                this.props.onSetRoomCode(roomCode);
            });

            this.collabManager.on('error', errMsg => {
                this.props.onSetError(errMsg);
            });

            this.collabManager.on('chatMessage', msg => {
                this.props.onAddChatMessage(msg);
            });

            this.collabManager.on('voiceStateChanged', voiceState => {
                this.props.onSetVoiceState(voiceState);
            });

            this.collabManager.on('projectSynced', () => {
                // Project has been loaded from host — VM listener should start
                this.vmListener.attach();
            });
        }

        async handleCreateRoom () {
            if (!this.collabManager) return;
            try {
                await this.collabManager.createRoom();
                this.props.onSetMyColor(this.collabManager.myColor);
                // Attach VM listener for the host immediately
                this.vmListener.attach();
            } catch (err) {
                this.props.onSetError(err.message || 'Failed to create room');
            }
        }

        async handleJoinRoom (code) {
            if (!this.collabManager) return;
            try {
                await this.collabManager.joinRoom(code);
            } catch (err) {
                this.props.onSetError(err.message || 'Failed to join room');
            }
        }

        handleLeaveRoom () {
            if (!this.collabManager) return;
            this.vmListener.detach();
            this.collabManager.leaveRoom();
            this.props.onShowJoinModal(false);
            this.props.onTogglePanel(); // Close panel if open
        }

        handleTogglePanel () {
            this.props.onTogglePanel();
        }

        handleToggleJoinModal () {
            this.props.onShowJoinModal(!this.props.showJoinModal);
        }

        handleSendChat (text) {
            if (!this.collabManager) return;
            this.collabManager.sendChatMessage(text);
        }

        async handleToggleVoice () {
            if (!this.collabManager) return;
            if (this.props.voiceState.isActive) {
                this.collabManager.stopVoiceChat();
            } else {
                await this.collabManager.startVoiceChat();
            }
        }

        handleToggleMute () {
            if (!this.collabManager) return;
            this.collabManager.toggleMute();
        }

        handleToggleDeafen () {
            if (!this.collabManager) return;
            this.collabManager.toggleDeafen();
        }

        handleCollabButtonClick () {
            if (this.props.isInSession) {
                this.handleTogglePanel();
            } else {
                this.handleToggleJoinModal();
            }
        }

        render () {
            const {
                // Collab-specific props (don't pass to wrapped component)
                isInSession,
                connectionStatus,
                roomCode,
                myColor,
                myPeerId,
                isHost,
                peers,
                errorMessage,
                showCollabPanel,
                showJoinModal,
                chatMessages,
                voiceState,
                onSetStatus,
                onSetSession,
                onSetPeers,
                onSetMyColor,
                onSetError,
                onTogglePanel,
                onAddChatMessage,
                onSetVoiceState,
                onSetRoomCode,
                onShowJoinModal,
                // Pass everything else to the wrapped component
                ...componentProps
            } = this.props;

            return (
                <React.Fragment>
                    <WrappedComponent
                        {...componentProps}
                        collabButton={
                            <CollabButton
                                isInSession={isInSession}
                                myColor={myColor}
                                onClick={this.handleCollabButtonClick}
                                peerCount={peers.length}
                            />
                        }
                        collabPeers={peers}
                    />

                    {showJoinModal && !isInSession && (
                        <CollabJoinModal
                            connectionStatus={connectionStatus}
                            errorMessage={errorMessage}
                            onClose={this.handleToggleJoinModal}
                            onCreateRoom={this.handleCreateRoom}
                            onJoinRoom={this.handleJoinRoom}
                            roomCode={roomCode}
                        />
                    )}

                    {isInSession && showCollabPanel && (
                        <CollabPanel
                            chatMessages={chatMessages}
                            isHost={isHost}
                            myColor={myColor}
                            myPeerId={myPeerId || (this.collabManager ? this.collabManager.myPeerId : null)}
                            onClose={this.handleTogglePanel}
                            onLeave={this.handleLeaveRoom}
                            onSendChat={this.handleSendChat}
                            onToggleDeafen={this.handleToggleDeafen}
                            onToggleMute={this.handleToggleMute}
                            onToggleVoice={this.handleToggleVoice}
                            peers={peers}
                            roomCode={roomCode}
                            vm={this.props.vm}
                            voiceState={voiceState}
                        />
                    )}
                </React.Fragment>
            );
        }
    }

    CollabWrapper.propTypes = {
        chatMessages: PropTypes.array,
        connectionStatus: PropTypes.string,
        errorMessage: PropTypes.string,
        isHost: PropTypes.bool,
        isInSession: PropTypes.bool,
        myColor: PropTypes.object,
        myPeerId: PropTypes.string,
        onAddChatMessage: PropTypes.func,
        onSetError: PropTypes.func,
        onSetMyColor: PropTypes.func,
        onSetPeers: PropTypes.func,
        onSetRoomCode: PropTypes.func,
        onSetSession: PropTypes.func,
        onSetStatus: PropTypes.func,
        onSetVoiceState: PropTypes.func,
        onShowJoinModal: PropTypes.func,
        onTogglePanel: PropTypes.func,
        peers: PropTypes.array,
        roomCode: PropTypes.string,
        showCollabPanel: PropTypes.bool,
        showJoinModal: PropTypes.bool,
        vm: PropTypes.instanceOf(VM),
        voiceState: PropTypes.object
    };

    const mapStateToProps = state => ({
        isInSession: state.scratchGui.collab.isInSession,
        isHost: state.scratchGui.collab.isHost,
        connectionStatus: state.scratchGui.collab.connectionStatus,
        roomCode: state.scratchGui.collab.roomCode,
        myColor: state.scratchGui.collab.myColor,
        myPeerId: state.scratchGui.collab.myPeerId,
        peers: state.scratchGui.collab.peers,
        errorMessage: state.scratchGui.collab.errorMessage,
        showCollabPanel: state.scratchGui.collab.showCollabPanel,
        showJoinModal: state.scratchGui.collab.showJoinModal,
        chatMessages: state.scratchGui.collab.chatMessages,
        voiceState: state.scratchGui.collab.voiceState,
        vm: state.scratchGui.vm
    });

    const mapDispatchToProps = dispatch => ({
        onSetStatus: (status, error) => dispatch(setCollabStatus(status, error)),
        onSetSession: (isInSession, isHost, roomCode) =>
            dispatch(setCollabSession(isInSession, isHost, roomCode)),
        onSetPeers: peers => dispatch(setCollabPeers(peers)),
        onSetMyColor: color => dispatch(setCollabMyColor(color)),
        onSetError: error => dispatch(setCollabError(error)),
        onTogglePanel: () => dispatch(toggleCollabPanel()),
        onAddChatMessage: msg => dispatch(addCollabChatMessage(msg)),
        onSetVoiceState: voiceState => dispatch(setCollabVoiceState(voiceState)),
        onSetRoomCode: roomCode => dispatch(setCollabRoomCode(roomCode)),
        onShowJoinModal: show => dispatch(showCollabJoinModal(show))
    });

    return connect(mapStateToProps, mapDispatchToProps)(CollabWrapper);
};

export default collabHOC;
