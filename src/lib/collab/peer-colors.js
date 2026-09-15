/**
 * Unique color assignments for collaboration peers.
 * Each peer gets a distinct color for their cursor indicator,
 * sprite selection highlight, and chat messages.
 */

const PEER_COLORS = [
    {
        id: 0,
        name: 'Coral',
        hex: '#FF6B6B',
        light: '#FFE0E0',
        dark: '#CC4444',
        rgb: [255, 107, 107]
    },
    {
        id: 1,
        name: 'Ocean',
        hex: '#4ECDC4',
        light: '#D4F5F2',
        dark: '#2EA89F',
        rgb: [78, 205, 196]
    },
    {
        id: 2,
        name: 'Amber',
        hex: '#FFB347',
        light: '#FFF0D6',
        dark: '#CC8A2E',
        rgb: [255, 179, 71]
    },
    {
        id: 3,
        name: 'Violet',
        hex: '#A78BFA',
        light: '#EDE5FF',
        dark: '#7C5FCF',
        rgb: [167, 139, 250]
    },
    {
        id: 4,
        name: 'Lime',
        hex: '#77DD77',
        light: '#E0F7E0',
        dark: '#4CAF4C',
        rgb: [119, 221, 119]
    }
];

const getColorForIndex = index => PEER_COLORS[index % PEER_COLORS.length];

const getNextAvailableColor = usedIndices => {
    for (let i = 0; i < PEER_COLORS.length; i++) {
        if (!usedIndices.includes(i)) {
            return PEER_COLORS[i];
        }
    }
    return null; // All colors taken (room full)
};

module.exports = {
    PEER_COLORS,
    getColorForIndex,
    getNextAvailableColor
};
