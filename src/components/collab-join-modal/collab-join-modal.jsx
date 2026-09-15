import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import styles from './collab-join-modal.css';

class CollabJoinModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            activeTab: 'host', // 'host' | 'join'
            joinCode: '',
            isCreating: false,
            isJoining: false,
            copied: false
        };
        this.handleCreateRoom = this.handleCreateRoom.bind(this);
        this.handleJoinRoom = this.handleJoinRoom.bind(this);
        this.handleCodeChange = this.handleCodeChange.bind(this);
        this.handleCopyCode = this.handleCopyCode.bind(this);
        this.handleKeyPress = this.handleKeyPress.bind(this);
    }

    handleCreateRoom () {
        this.setState({isCreating: true});
        this.props.onCreateRoom();
    }

    handleJoinRoom () {
        if (this.state.joinCode.length < 6) return;
        this.setState({isJoining: true});
        this.props.onJoinRoom(this.state.joinCode);
    }

    handleCodeChange (e) {
        const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        this.setState({joinCode: value});
    }

    handleCopyCode () {
        if (this.props.roomCode) {
            navigator.clipboard.writeText(this.props.roomCode).then(() => {
                this.setState({copied: true});
                setTimeout(() => this.setState({copied: false}), 2000);
            });
        }
    }

    handleKeyPress (e) {
        if (e.key === 'Enter') {
            this.handleJoinRoom();
        }
    }

    render () {
        const {activeTab, joinCode, isCreating, copied} = this.state;
        const {roomCode, connectionStatus, errorMessage, onClose} = this.props;

        return (
            <div
                className={styles.modalOverlay}
                onClick={onClose}
            >
                <div
                    className={styles.modal}
                    onClick={e => e.stopPropagation()}
                >
                    <div className={styles.modalHeader}>
                        <h2 className={styles.modalTitle}>{'Collaborate'}</h2>
                        <button
                            className={styles.closeButton}
                            onClick={onClose}
                        >
                            {'✕'}
                        </button>
                    </div>

                    <div className={styles.tabs}>
                        <button
                            className={classNames(styles.tab, {
                                [styles.tabActive]: activeTab === 'host'
                            })}
                            onClick={() => this.setState({activeTab: 'host'})}
                        >
                            {'🏠 Host'}
                        </button>
                        <button
                            className={classNames(styles.tab, {
                                [styles.tabActive]: activeTab === 'join'
                            })}
                            onClick={() => this.setState({activeTab: 'join'})}
                        >
                            {'🔗 Join'}
                        </button>
                    </div>

                    <div className={styles.tabContent}>
                        {activeTab === 'host' ? (
                            <div>
                                <p className={styles.description}>
                                    {'Create a room and share the code with your friends. Up to 5 people can collaborate on a project at the same time.'}
                                </p>

                                {roomCode ? (
                                    <div>
                                        <div className={styles.roomCodeDisplay}>
                                            <div className={styles.roomCodeLabel}>
                                                {'Room Code'}
                                            </div>
                                            <div className={styles.roomCode}>
                                                {roomCode}
                                            </div>
                                            <button
                                                className={styles.copyButton}
                                                onClick={this.handleCopyCode}
                                            >
                                                {copied ? '✓ Copied!' : '📋 Copy Code'}
                                            </button>
                                        </div>
                                        <p className={styles.statusText}>
                                            {'Waiting for friends to join...'}
                                        </p>
                                    </div>
                                ) : (
                                    <button
                                        className={classNames(styles.actionButton, styles.hostButton)}
                                        onClick={this.handleCreateRoom}
                                        disabled={isCreating}
                                    >
                                        {isCreating ? 'Creating...' : '✨ Create Room'}
                                    </button>
                                )}

                                {errorMessage && (
                                    <div className={styles.errorText}>{errorMessage}</div>
                                )}

                                <p className={styles.maxPeers}>
                                    {'Maximum 5 users per room'}
                                </p>
                            </div>
                        ) : (
                            <div>
                                <p className={styles.description}>
                                    {'Enter the room code shared by the host to join their project.'}
                                </p>

                                <div className={styles.inputGroup}>
                                    <input
                                        className={styles.input}
                                        maxLength="6"
                                        onChange={this.handleCodeChange}
                                        onKeyPress={this.handleKeyPress}
                                        placeholder="ABC123"
                                        type="text"
                                        value={joinCode}
                                    />
                                </div>

                                {connectionStatus === 'connecting' ? (
                                    <div className={styles.connecting}>
                                        <div className={styles.spinner} />
                                        {'Connecting...'}
                                    </div>
                                ) : (
                                    <button
                                        className={classNames(styles.actionButton, styles.joinButton)}
                                        disabled={joinCode.length < 6}
                                        onClick={this.handleJoinRoom}
                                    >
                                        {'🚀 Join Room'}
                                    </button>
                                )}

                                {errorMessage && (
                                    <div className={styles.errorText}>{errorMessage}</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }
}

CollabJoinModal.propTypes = {
    connectionStatus: PropTypes.string,
    errorMessage: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    onCreateRoom: PropTypes.func.isRequired,
    onJoinRoom: PropTypes.func.isRequired,
    roomCode: PropTypes.string
};

export default CollabJoinModal;
