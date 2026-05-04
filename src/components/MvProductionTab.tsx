import React from 'react';
import MvProduction from '../features/mv';

/**
 * MvProductionTab
 * 
 * A wrapper component for the modularized MV Production feature.
 * The core logic and UI components have been moved to src/features/mv/
 * for better maintainability and code structure.
 */
const MvProductionTab: React.FC = () => {
    return <MvProduction />;
};

export default MvProductionTab;
