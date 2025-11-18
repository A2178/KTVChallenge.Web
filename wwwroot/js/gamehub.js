(function () {
    const connection = new signalR.HubConnectionBuilder().withUrl("/gamehub").build();
    let started = false;

    function $(id) { return document.getElementById(id); }
    function safeText(el, text) {
        if (!el) return;
        el.textContent = text;

        if (el.id === "currentLine" || el.id === "contestantLine" || el.classList?.contains("lyric-main")) {
            el.classList.remove("fade-text");
            void el.offsetWidth;
            el.classList.add("fade-text");
        }
    }

    // ---- LRC Sync State ----
    let lrcEntries = [];           // [{time, text}]
    let currentIdx = -1;
    const challengeLines = [3];
    const triggered = new Set();
    let lrcReady = false;
    let pendingChallenge = null;
    let isStarting = false;
    let currentSongId = null;

    // ✅ 新增：舞台目前是否在「挑戰模式中」
    let inChallenge = false;

    function updateDebugOriginalFromChallenge() {
        const dbg = document.getElementById("debugOriginal");
        if (!dbg) return;

        if (!Array.isArray(challengeLines) || challengeLines.length === 0) {
            dbg.textContent = "（尚未設定挑戰行）";
            return;
        }
        if (!lrcReady || !Array.isArray(lrcEntries) || lrcEntries.length === 0) {
            dbg.textContent = "（等待歌曲歌詞載入…）";
            return;
        }

        const idx = challengeLines[0];    // 0-based
        const line = lrcEntries[idx]?.text;
        dbg.textContent = line || "（此行無歌詞或超出範圍）";
    }


    function loadLrcForSong(songId) {
        const lrcPath = "/media/lrc/" + encodeURI(songId) + ".lrc";
        fetch(lrcPath)
            .then(r => {
                if (!r.ok) throw new Error(`LRC not found: ${lrcPath} (${r.status})`);
                return r.text();
            })
            .then(text => {
                lrcEntries = (window.LrcHelper && window.LrcHelper.parseLrc)
                    ? window.LrcHelper.parseLrc(text) : [];
                currentIdx = -1;
                triggered.clear();
                lrcReady = true;
                pendingChallenge = null;
                safeText($("currentLine"), lrcEntries.length ? "（已載入 LRC，等候播放進度…）" : "（LRC 無內容）");
                updateDebugOriginalFromChallenge();
            })
            .catch(err => {
                lrcEntries = [];
                lrcReady = false;
                safeText($("currentLine"), `（讀取 LRC 失敗：${err.message}）`);
                console.error(err);
            });
    }

    function onTimeUpdate() {
        const player = $("player");
        if (!player || lrcEntries.length === 0) return;
        const t = player.currentTime;

        if (inChallenge) return;

        // ---- 新增：如果還沒到第一個時間標籤，先顯示提示（或顯示第一行內容）----
        if (lrcEntries.length > 0 && t < lrcEntries[0].time) {
            safeText($("currentLine"), "（前奏）"); // 或改成：safeText($("currentLine"), lrcEntries[0].text);
            return;
        }

        // 找到當前時間對應的最後一個不大於 t 的行
        let i = currentIdx;
        while (i + 1 < lrcEntries.length && lrcEntries[i + 1].time <= t) i++;

        if (i !== currentIdx) {
            currentIdx = i;
            if (currentIdx >= 0 && currentIdx < lrcEntries.length) {
                const line = lrcEntries[currentIdx].text;
                safeText($("currentLine"), line);

                if (challengeLines.includes(currentIdx) && !triggered.has(currentIdx)) {
                    triggered.add(currentIdx);
                    if (started) {
                        // 進入挑戰時把原詞一起送到 Server
                        connection.invoke("EnterChallenge", currentIdx, line).catch(() => { });
                    }
                }
            }
        }
        if (currentIdx !== i) {
            console.debug("[LRC] line ->", i, lrcEntries[i]?.text);
        }

    }


    function onEnter(lineIndex) {
        const player = $("player");
        if (player) player.pause();

        if ($("challengeMask")) {
            const text = (lrcEntries[lineIndex]?.text) || "（原詞）";
            const mask = (window.LrcHelper && window.LrcHelper.starMaskFor) ? window.LrcHelper.starMaskFor(text) : "＊＊＊＊";
            $("challengeMask").style.display = "block";
            safeText($("challengeMask"), mask);
        }
        if ($("contestantLine")) $("contestantLine").style.display = "block";
        safeText($("status"), "挑戰模式（第 " + lineIndex + " 行）");
        safeText($("currentLine"), "（原詞已遮罩）");
        if ($("result")) $("result").textContent = "";
    }

    function onSongStarted(songId) {
        safeText($("status"), "播放中：" + songId);

        ensurePlayerEvents();   // ✅ 確保已經綁上 timeupdate

        if (player) {
            const src = "/media/audio/" + encodeURI(songId) + ".mp3";
            player.src = src;
            player.play().catch(() => { });
            loadLrcForSong(songId);
        }
    }

    function onPaused() {
        safeText($("status"), "暫停");
        const player = $("player");
        if (player) player.pause();
    }

    function onContestantUpdated(text) {
        safeText($("contestantLine"), text || "");
    }

    function onShowResult(ok) {
        if ($("challengeMask")) $("challengeMask").style.display = "none";
        safeText($("currentLine"), ok ? "✅ 過關！" : "❌ 挑戰失敗");
        if ($("result")) $("result").textContent = ok ? "🎉 恭喜過關！" : "💥 失敗，返回選單";
    }

    let player = null;

    function ensurePlayerEvents() {
        const el = $("player");
        if (!el || el._lrcBound) return;

        // 歌詞同步相關
        el.addEventListener("timeupdate", onTimeUpdate);
        el.addEventListener("seeked", () => { currentIdx = -1; onTimeUpdate(); });
        el.addEventListener("loadedmetadata", () => { currentIdx = -1; });

        // ✅ 新增：挑戰模式中禁止手動播放
        el.addEventListener("play", () => {
            if (inChallenge) {
                // 挑戰中有人手動按播放，就立刻暫停
                el.pause();
            }
        });

        el._lrcBound = true;
        player = el;
    }

    // 接收：進入挑戰（含原詞）
    connection.on("EnterChallenge", (lineIndex, originalText) => {
        const player = $("player");
        if (player) player.pause();

        inChallenge = true;  // ✅ 標記為挑戰模式中

        if ($("challengeMask")) {
            const mask = (window.LrcHelper && window.LrcHelper.starMaskFor)
                ? window.LrcHelper.starMaskFor(originalText || "")
                : "＊＊＊＊";
            $("challengeMask").style.display = "block";
            safeText($("challengeMask"), mask);
        }
        if ($("contestantLine")) $("contestantLine").style.display = "block";

        // ✅ 顯示給人看的行數 = index + 1
        safeText($("status"), `挑戰模式（第 ${lineIndex + 1} 行）`);
        safeText($("currentLine"), "（原詞已遮罩）");

        const dbg = document.getElementById("debugOriginal");
        if (dbg) dbg.textContent = originalText || "(目前行無原詞 / 手動未帶入)";
    });

    // ✅ 舞台顯示挑戰者唱詞（不判定）
    connection.on("ShowContestantText", (text) => {
        const el = $("result");
        if (el) {
            el.innerHTML = "挑戰者唱出：" + escapeHtml(text || "");
        }
        if ($("contestantLine")) {
            safeText($("contestantLine"), text || "");
        }
    });



    connection.on("SongStarted", onSongStarted);
    connection.on("Paused", onPaused);
    connection.on("ContestantUpdated", onContestantUpdated);
    connection.on("ShowResult", (ok, originalText, contestantText) => {
        // ✅ 離開挑戰模式
        inChallenge = false;
        if ($("challengeMask")) $("challengeMask").style.display = "none";

        const current = $("currentLine");
        if (current) {
            current.innerHTML = (ok ? "✅ " : "❌ ") + (ok ? "挑戰成功" : "挑戰失敗")
                + "<br/>正確歌詞：" + escapeHtml(originalText || "");
        }

        const result = $("result");
        if (result) {
            result.innerHTML = (ok ? "🎉 過關" : "💥 失敗，返回選單")
                + "<br/>挑戰者唱出：" + escapeHtml(contestantText || "");
        }
    });

    // 舞台端：控制台要求進挑戰
    connection.on("RequestEnterChallenge", (idx) => {
        const i = idx | 0;
        if (!lrcReady || !Array.isArray(lrcEntries) || !lrcEntries[i]) {
            pendingChallenge = i;                      // ✅ 尚未就緒就先排隊
            return;
        }
        const line = lrcEntries[i].text;
        connection.invoke("EnterChallenge", i, line).catch(() => { });
    });

    connection.on("CurrentSongChanged", (songId) => {
        currentSongId = songId || null;
        const st = $("status");
        if (st) {
            st.textContent = currentSongId
                ? ("已選擇歌曲：" + currentSongId)
                : "尚未選擇歌曲";
        }
    });


    // 簡單跳脫 HTML（避免輸入造成 XSS）
    function escapeHtml(s) {
        return (s || "").replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }


    connection.on("ChallengeConfigUpdated", (lines, mode, threshold) => {
        // 讓舞台也更新自動觸發的行
        if (Array.isArray(lines)) {
            challengeLines.length = 0;
            lines.forEach(x => challengeLines.push(x | 0));
        }
        // ✅ 挑戰行 / 模式更新後，嘗試預覽原詞
        updateDebugOriginalFromChallenge();
    });

    async function start() {
        try {
            await connection.start();
            started = true;
            if ($("status")) $("status").textContent = "連線成功（待命）";
        } catch (e) {
            console.warn("SignalR connect failed, retrying...", e);
            setTimeout(start, 1000);
        }
    }
    start();

    window.GameHub = {
        startSong: () => started && connection.invoke("StartSong"),
        pause: () => started && connection.invoke("Pause"),

        requestEnterChallenge: (idx) => started && connection.invoke("RequestEnterChallenge", idx | 0),

        updateContestant: (text) => started && connection.invoke("UpdateContestant", text),
        publishContestant: (text) => started && connection.invoke("PublishContestant", text),
        evaluate: (text) => started && connection.invoke("Evaluate", text),

        setChallengeLines: (arr) => started && connection.invoke("SetChallengeLines", arr),
        setMatchMode: (mode, threshold) => started && connection.invoke("SetMatchMode", mode, threshold)
    };
})();