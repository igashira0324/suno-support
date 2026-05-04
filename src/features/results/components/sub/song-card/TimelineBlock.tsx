import React from 'react';
import { Film } from 'lucide-react';
import { CopyButton } from '../CopyButton';
import { getTimelineDisplayString } from './utils';
import { MVTimeline } from '../../../../../types';

interface TimelineBlockProps {
    timeline: string | MVTimeline | undefined;
}

export const TimelineBlock: React.FC<TimelineBlockProps> = ({ timeline }) => {
    if (!timeline) return null;

    const displayString = getTimelineDisplayString(timeline);

    return (
        <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-amber-400" />
                    MV Scene Prompts (Timeline)
                </label>
                <CopyButton text={displayString} label="タイムラインをコピー" />
            </div>
            <div className="relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 opacity-50" />
                <pre className="p-6 bg-slate-900 rounded-b-lg rounded-tr-lg border-x border-b border-slate-800 font-mono text-sm text-amber-200/80 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto custom-scrollbar">
                    {displayString}
                </pre>
            </div>
        </div>
    );
};
