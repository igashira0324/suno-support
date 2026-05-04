import { MVTimeline } from '../../../../../types';

export const formatContent = (content: string): string => {
    if (!content) return '';
    let formatted = content.replace(/\\n/g, '\n').trim();
    const structureTags = /\[(Intro|Verse\s*\d*|Chorus|Bridge|Outro|Pre-Chorus|Post-Chorus|Drop|Hook|Interlude|Breakdown|Instrumental|Solo|Refrain|Fade|End|Tag|Coda|Stanza|Skit|Spoken|Rap|Singing|Harmonies|Ad-lib|Whisper|Screaming|Break|Build)\]/gi;
    formatted = formatted.replace(structureTags, (match) => '\n\n' + match);
    formatted = formatted.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
    return formatted;
};

export const timelineToDisplayString = (tl: MVTimeline): string => {
    const lines: string[] = [];
    for (const s of tl.scenes) {
        lines.push(`--- Scene ${s.scene_number}: ${s.scene_name} ---`);
        lines.push(`Timestamp: ${s.timestamp}`);
        lines.push(`Section: ${s.section}`);
        lines.push(`Lyrics Excerpt: ${s.lyrics_excerpt}`);
        lines.push(`Prompt (EN): ${s.prompt_en}`);
        lines.push(`Camera: ${s.camera}`);
        lines.push(`Effect: ${s.effect}`);
        lines.push(`Color Palette: ${s.color_palette}`);
        lines.push(`Genspark Prompt: ${s.genspark_prompt}`);
        lines.push(`Continuity Notes:`);
        lines.push(`  - Character: ${s.continuity_notes?.character || ''}`);
        lines.push(`  - Color Shift: ${s.continuity_notes?.color_shift || ''}`);
        lines.push(`  - Key Object Carry: ${s.continuity_notes?.key_object_carry || ''}`);
        lines.push(`Mood: ${s.mood}`);
        lines.push(``);
    }
    if (tl.evaluation_criteria) {
        const ec = tl.evaluation_criteria;
        lines.push(`--- Evaluation Criteria ---`);
        lines.push(`Must Include: ${ec.must_include}`);
        lines.push(`Style Consistency: ${ec.style_consistency}`);
        lines.push(`Color Evolution: ${Array.isArray(ec.color_evolution) ? ec.color_evolution.join(' -> ') : ec.color_evolution}`);
        lines.push(`Aspect Ratio: ${ec.aspect_ratio}`);
        lines.push(`Negative Prompt: ${ec.negative_prompt}`);
        lines.push(`Quality Threshold: ${ec.quality_threshold}`);
        lines.push(`Max Retries: ${ec.max_retries}`);
    }
    return lines.join('\n');
};

export const getTimelineDisplayString = (timeline: string | MVTimeline | undefined): string => {
    if (!timeline) return '';
    if (typeof timeline === 'string') return timeline;
    return timelineToDisplayString(timeline);
};
