import React from 'react';
import PropTypes from 'prop-types';

import styles from './collab-sprite-indicator.css';

/**
 * Shows colored dots on a sprite thumbnail indicating which
 * collaborators are currently editing that sprite.
 */
const CollabSpriteIndicator = ({peers}) => {
    if (!peers || peers.length === 0) return null;

    return (
        <div className={styles.indicatorContainer}>
            {peers.map(peer => (
                <div
                    className={styles.indicator}
                    key={peer.peerId}
                    style={{
                        backgroundColor: peer.color ? peer.color.hex : '#888',
                        '--indicator-glow': peer.color
                            ? `${peer.color.hex}80`
                            : 'rgba(136, 136, 136, 0.5)'
                    }}
                >
                    <div className={styles.tooltip}>
                        {peer.displayName}
                    </div>
                </div>
            ))}
        </div>
    );
};

CollabSpriteIndicator.propTypes = {
    peers: PropTypes.arrayOf(PropTypes.shape({
        peerId: PropTypes.string,
        displayName: PropTypes.string,
        color: PropTypes.shape({
            hex: PropTypes.string
        })
    }))
};

export default CollabSpriteIndicator;
