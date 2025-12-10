// LRC Parser & Sync Helpers
function parseLrc(text) {
    const lines = text.split(/\r?\n/);
    const entries = [];
    const timeTag = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
    for (const raw of lines) {
        let m;
        let lastIndex = 0;
        const times = [];
        while ((m = timeTag.exec(raw))) {
            const min = parseInt(m[1], 10);
            const sec = parseInt(m[2], 10);
            const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
            const t = min * 60 + sec + ms / 1000;
            times.push(t);
            lastIndex = timeTag.lastIndex;
        }
        const lyric = raw.substring(lastIndex).trim();
        if (times.length && lyric.length) {
            for (const t of times) {
                entries.push({ time: t, text: lyric });
            }
        }
    }
    entries.sort((a, b) => a.time - b.time);
    return entries;
}

function starMaskFor(text) {
    const len = [...text].length;
    return '★'.repeat(Math.max(1, len));
}

window.LrcHelper = { parseLrc, starMaskFor };