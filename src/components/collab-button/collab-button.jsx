import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import styles from './collab-button.css';

const CollabIcon = () => (
    <svg
        className={styles.collabIcon}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
            fill="currentColor"
        />
    </svg>
);

const CollabButton = ({
    isInSession,
    peerCount,
    myColor,
    onClick
}) => (
    <button
        className={classNames(
            styles.collabButton,
            {[styles.collabButtonActive]: isInSession}
        )}
        onClick={onClick}
        id="collab-button"
    >
        {isInSession && myColor ? (
            <span
                className={styles.colorDot}
                style={{backgroundColor: myColor.hex, color: myColor.hex}}
            />
        ) : (
            <CollabIcon />
        )}
        <span className={styles.buttonLabel}>
            {isInSession ? 'Collab' : 'Collaborate'}
        </span>
        {isInSession && (
            <span className={styles.peerCount}>
                {peerCount + 1}
            </span>
        )}
    </button>
);

CollabButton.propTypes = {
    isInSession: PropTypes.bool,
    myColor: PropTypes.shape({
        hex: PropTypes.string
    }),
    onClick: PropTypes.func,
    peerCount: PropTypes.number
};

CollabButton.defaultProps = {
    isInSession: false,
    peerCount: 0
};

export default CollabButton;
