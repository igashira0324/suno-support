import { useState, useRef, useEffect, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import { TrackType } from '../types';
import { toApiUrl } from '../../../api/client';

export const useWaveform = (
    result: any, 
    activeTrack: TrackType, 
    volume: number,
    selectedRegion: { start: number, end: number } | null,
    setSelectedRegion: (region: { start: number, end: number } | null) => void,
    isLooping: boolean
) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [wavesurferError, setWavesurferError] = useState<string | null>(null);

    const waveformRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const regionsPluginRef = useRef<RegionsPlugin | null>(null);
    const wasPlayingRef = useRef(false);
    const isLoopingRef = useRef(isLooping);

    useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);

    const getTrackUrl = useCallback((type: TrackType) => {
        if (!result) return '';
        switch (type) {
            case 'vocals': return toApiUrl(result.vocals_url);
            case 'instrumental': return toApiUrl(result.instrumental_url);
            case 'original':
            default:
                return toApiUrl(result.original_path);
        }
    }, [result]);

    const getTrackColor = (type: TrackType, isProgress: boolean) => {
        switch (type) {
            case 'vocals': return isProgress ? '#6366f1' : '#4338ca';
            case 'instrumental': return isProgress ? '#8b5cf6' : '#6d28d9';
            case 'original': return isProgress ? '#10b981' : '#059669';
            default: return isProgress ? '#cbd5e1' : '#475569';
        }
    };

    const initWaveSurfer = useCallback(() => {
        if (!waveformRef.current || !timelineRef.current || !result) return;

        setWavesurferError(null);

        if (wavesurferRef.current) {
            try {
                wavesurferRef.current.destroy();
            } catch (e) { console.warn(e); }
            wavesurferRef.current = null;
        }

        const regions = RegionsPlugin.create();
        regionsPluginRef.current = regions;

        const timeline = TimelinePlugin.create({
            container: timelineRef.current,
            height: 20,
            timeInterval: 1,
            primaryLabelInterval: 60,
            secondaryLabelInterval: 10,
            style: { color: '#94a3b8', fontSize: '10px' },
            formatTimeCallback: (seconds: number) => {
                const min = Math.floor(seconds / 60);
                const sec = Math.floor(seconds % 60);
                return `${min}:${sec.toString().padStart(2, '0')}`;
            }
        });

        const url = getTrackUrl(activeTrack);
        if (!url) {
            setWavesurferError(`No URL for track: ${activeTrack}`);
            return;
        }

        try {
            const ws = WaveSurfer.create({
                container: waveformRef.current,
                waveColor: getTrackColor(activeTrack, false),
                progressColor: getTrackColor(activeTrack, true),
                cursorColor: '#ffffff',
                barWidth: 2,
                barGap: 3,
                height: 128,
                url: url,
                plugins: [regions, timeline],
                normalize: true,
                minPxPerSec: 0,
                interact: true,
            });

            ws.on('ready', () => {
                const d = ws.getDuration();
                setDuration(d);
                ws.setVolume(volume);
                if (d > 300) { ws.zoom(50); setZoom(50); } else { ws.zoom(0); setZoom(0); }
                if (currentTime > 0) ws.setTime(currentTime);

                if (selectedRegion) {
                    regions.addRegion({
                        start: selectedRegion.start,
                        end: selectedRegion.end,
                        color: 'rgba(255, 255, 255, 0.2)',
                        drag: true,
                        resize: true
                    });
                }

                if (wasPlayingRef.current) {
                    ws.play();
                    setIsPlaying(true);
                }
            });

            ws.on('error', (err) => {
                setWavesurferError(`Waveform Error: ${err.message || err}`);
            });

            ws.on('audioprocess', () => setCurrentTime(ws.getCurrentTime()));
            ws.on('play', () => setIsPlaying(true));
            ws.on('pause', () => setIsPlaying(false));
            ws.on('finish', () => setIsPlaying(false));

            regions.on('region-created', (region) => {
                regions.getRegions().forEach(r => { if (r.id !== region.id) r.remove(); });
                setSelectedRegion({ start: region.start, end: region.end });
            });

            regions.on('region-updated', (region) => {
                setSelectedRegion({ start: region.start, end: region.end });
            });

            regions.on('region-out', (region) => {
                if (isLoopingRef.current) region.play();
            });

            regions.enableDragSelection({ color: 'rgba(255, 255, 255, 0.2)' });
            wavesurferRef.current = ws;
        } catch (e: any) {
            setWavesurferError(`Init Error: ${e.message || e}`);
        }
    }, [result, activeTrack, volume, getTrackUrl, setSelectedRegion]);

    useEffect(() => {
        if (result && waveformRef.current && timelineRef.current) {
            if (wavesurferRef.current) {
                wasPlayingRef.current = wavesurferRef.current.isPlaying();
                setCurrentTime(wavesurferRef.current.getCurrentTime());
            }
            const timer = setTimeout(() => initWaveSurfer(), 100);
            return () => clearTimeout(timer);
        }
    }, [result, activeTrack, initWaveSurfer]);

    useEffect(() => {
        return () => {
            if (wavesurferRef.current) wavesurferRef.current.destroy();
        };
    }, []);

    const handlePlayPause = () => wavesurferRef.current?.playPause();
    const handleZoom = (delta: number) => {
        if (!wavesurferRef.current) return;
        let newZoom = zoom === 0 ? 50 : Math.max(1, Math.min(200, zoom + delta * 10));
        setZoom(newZoom);
        wavesurferRef.current.zoom(newZoom);
    };

    return {
        waveformRef,
        timelineRef,
        wavesurferRef,
        regionsPluginRef,
        isPlaying,
        duration,
        currentTime,
        zoom,
        wavesurferError,
        handlePlayPause,
        handleZoom
    };
};
