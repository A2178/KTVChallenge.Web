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
    let challengeLine = -1;
    const triggered = new Set();
    let lrcReady = false;
    let pendingChallenge = null;
    let isStarting = false;
    let currentSongId = null;
    let failEffectPlayed = false;
    let exitBtnTimer = null;
    // ✅ 新增：記住這次挑戰的原始歌詞
    let currentOriginalText = "";
    // ✅ 新增：舞台目前是否在「挑戰模式中」
    let inChallenge = false;

    function updateDebugOriginalFromChallenge() {
        const dbg = document.getElementById("debugOriginal");
        if (!dbg) return;

        if (challengeLine < 0) {
            dbg.textContent = "（尚未設定挑戰行）";
            return;
        }
        if (!lrcReady || !Array.isArray(lrcEntries) || lrcEntries.length === 0) {
            dbg.textContent = "（等待歌曲歌詞載入…）";
            return;
        }

        const idx = challengeLine;               // 這裡就是 0-based 的行號
        const line = lrcEntries[idx]?.text;
        dbg.textContent = line || "（此行無歌詞或超出範圍）";
    }



    function loadLrcForSong(songId) {
        const lrcPath = "/media/lrc/" + encodeURI(songId) + ".lrc";
        return fetch(lrcPath, { cache: "no-store" })                     // ←★ 多了這個 return
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
                safeText($("currentLine"), lrcEntries.length ? "（已載入歌詞，等候播放進度…）" : "（歌詞目前無內容）");

                updateDebugOriginalFromChallenge();
                updatePreAlert();
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

                if (currentIdx === challengeLine && !triggered.has(currentIdx)) {
                    triggered.add(currentIdx);
                    if (started) {
                        connection.invoke("EnterChallenge", currentIdx, line).catch(() => { });
                    }
                }
            }
            updatePreAlert();
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

    function updatePreAlert() {
        const alertEl = $("preAlert");
        if (!alertEl) return;

        // 尚未載入 LRC 或尚未設定挑戰行，直接關閉提醒
        if (!lrcReady || challengeLine < 0 || currentIdx < 0 || inChallenge) {
            alertEl.classList.remove("show-alert");
            return;
        }

        // 提前幾行開始提醒（現在是 2 行）
        const warnOffset = 2;
        const warnIndex = challengeLine - warnOffset;

        // 避免負數，若挑戰行太前面就不提醒
        if (warnIndex < 0) {
            alertEl.classList.remove("show-alert");
            return;
        }

        // 只要介於 warnIndex ~ (challengeLine-1) 之間就開始閃爍
        if (currentIdx >= warnIndex && currentIdx < challengeLine) {
            alertEl.classList.add("show-alert");
        } else {
            alertEl.classList.remove("show-alert");
        }
    }

    // 接收：進入挑戰（含原詞）
    connection.on("EnterChallenge", (lineIndex, originalText) => {

        // 暫停音樂
        const player = $("player");
        if (player) player.pause();

        // 進入挑戰模式
        inChallenge = true;

        // 關閉提前提醒用的閃爍圖片
        const alertEl = $("preAlert");
        if (alertEl) alertEl.classList.remove("show-alert");

        // ★★ 保存原始歌詞，供之後「部分揭露 + 補星號」使用
        currentOriginalText = originalText || "";

        // 顯示星號遮罩（原詞全部轉成星號）
        const maskEl = $("challengeMask");
        if (maskEl) {
            const mask = (window.LrcHelper && window.LrcHelper.starMaskFor)
                ? window.LrcHelper.starMaskFor(currentOriginalText)
                : "＊＊＊＊";
            maskEl.style.display = "block";
            safeText(maskEl, mask);
        }


        // 不再使用小行 contestantLine
        const contestantEl = $("contestantLine");
        if (contestantEl) {
            contestantEl.style.display = "none";
            contestantEl.textContent = "";
        }

        // 更新狀態顯示：挑戰模式（第 n 行）
        safeText($("status"), `挑戰模式（第 ${lineIndex + 1} 行）`);

        // ★ 挑戰開始時，大字幕清空（等待控制台輸入）
        safeText($("currentLine"), "");

        // ★★ 保存原始歌詞（舞台 + 控制台共用）
        window.currentChallengeOriginal = originalText || window.currentChallengeOriginal || "";

        // Debug 區：只有在有原詞的情況下才更新，避免蓋掉舊內容
        const dbg = document.getElementById("debugOriginal");
        if (dbg && window.currentChallengeOriginal) {
            dbg.textContent = window.currentChallengeOriginal;
        }
    });



    // ✅ 舞台顯示挑戰者唱詞（不判定）
    connection.on("ShowContestantText", (typed) => {
        const currentLineEl = $("currentLine");
        const maskEl = $("challengeMask");
        const ori = window.currentChallengeOriginal || "";

        if (!currentLineEl) return;

        // 如果根本沒有原始歌詞，就直接秀輸入內容
        if (!ori) {
            safeText(currentLineEl, typed || "");
            if (maskEl) maskEl.style.display = "none";
            return;
        }

        const typedText = typed || "";
        const totalLen = ori.length;
        const typedLen = typedText.length;

        // 已揭露的部分 = 原詞前 typedLen 個字（超過就吃滿）
        const revealCount = Math.min(typedLen, totalLen);
        const front = ori.slice(0, revealCount);

        // 剩餘幾個字就補幾個星號
        const remainCount = Math.max(totalLen - revealCount, 0);
        const stars = "★".repeat(remainCount);

        const display = front + stars;

        safeText(currentLineEl, display);

        // 挑戰進行中就把上面那條星號遮罩關掉
        if (maskEl) maskEl.style.display = "none";
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
            current.innerHTML = (ok ? "✅ " : "❌ ")
                + (ok ? "挑戰成功" : "挑戰失敗")
                + "<br/>正確歌詞：" + escapeHtml(originalText || "");
        }

        const result = $("result");
        if (result) {
            result.innerHTML = (ok ? "🎉 成功！" : "💥 失敗")
                + "<br/>挑戰者唱出：" + escapeHtml(contestantText || "");
        }

        // ★★★ 新增：全畫面 GIF + 音效 5 秒 ★★★
        const overlay = $("resultOverlay");
        const gif = $("resultGif");
        const sfx = $(ok ? "sfxSuccess" : "sfxFail");

        if (overlay && gif) {
            // 依照成功 / 失敗切換不同 GIF
            gif.src = ok ? "/images/success.gif" : "/images/fail.gif";

            // 顯示覆蓋層（淡入效果由 CSS 控制）
            overlay.classList.add("show");

            // 播放音效
            if (sfx) {
                sfx.currentTime = 0;
                sfx.volume = 1.0;             // 想小聲一點就調 0.4 之類
                sfx.play().catch(() => { });
            }

            // ✅ 成功：5 秒   ❌ 失敗：2.5 秒
            const duration = ok ? 5000 : 4400;

            setTimeout(() => {
                overlay.classList.remove("show");
                if (sfx) sfx.pause();
            }, duration);
        }
        const exitBtn = document.getElementById("btnExitToMenu");
        if (exitBtn) {
            // 每次出結果先把按鈕藏起來、取消上一次的計時器
            exitBtn.style.display = "none";
            exitBtn.classList.remove("exit-visible");

            if (exitBtnTimer) {
                clearTimeout(exitBtnTimer);
                exitBtnTimer = null;
            }

            // 5 秒後再顯示按鈕（並有淡入動畫）
            exitBtnTimer = setTimeout(() => {
                exitBtn.style.display = "block";   // 取消 display:none
                exitBtn.classList.add("exit-visible");
            }, 5000); // 5000ms = 5 秒
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

        // ★ 新增：在收到「選好歌曲」的事件時，就把 LRC 先載入
        // 這樣控制台按「設定本次挑戰行」時，updateDebugOriginalFromChallenge()
        // 就已經有 lrcEntries 可以查，會立刻顯示那一行歌詞
        if (currentSongId && !lrcReady) {
            loadLrcForSong(currentSongId);
        }
    });





    // 簡單跳脫 HTML（避免輸入造成 XSS）
    function escapeHtml(s) {
        return (s || "").replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }


    connection.on("ChallengeConfigUpdated", (line, mode, threshold) => {
        // line 可能是 null/undefined，保險起見轉成整數
        challengeLine = (line ?? -1) | 0;
        updateDebugOriginalFromChallenge();
        updatePreAlert();
    });

    connection.on("ResumeSong", () => {
        const player = document.getElementById("player");
        if (player) {
            player.play().catch(err => {
                console.warn("ResumeSong play failed:", err);
            });
        }
    });

    //connection.on("updateContestant", (typed) => {

    //    const ori = currentOriginalText || "";
    //    const typedLength = typed.length;

    //    // 前面 = 使用者已唱出的內容
    //    const front = typed;

    //    // 後面 = 原詞剩餘部分 → 全部補星號
    //    const remainCount = Math.max(ori.length - typedLength, 0);
    //    const stars = "★".repeat(remainCount);

    //    // 合併
    //    const display = front + stars;

    //    // 顯示在大字 currentLine
    //    safeText($("currentLine"), display);

    //    // 星號遮罩要消失
    //    const maskEl = $("challengeMask");
    //    if (maskEl) maskEl.style.display = "none";
    //});


    async function start() {
        try {
            await connection.start();
            started = true;

            // ★ 新增：連線成功後，問伺服器「目前是哪一首歌」
            try {
                const songId = await connection.invoke("GetCurrentSong");
                if (songId) {
                    currentSongId = songId;
                    // 立刻載入對應 LRC，載完之後 loadLrcForSong 會呼叫
                    // updateDebugOriginalFromChallenge()，把那一行歌詞秀出來
                    loadLrcForSong(songId);
                }
            } catch (e) {
                console.warn("GetCurrentSong failed:", e);
            }

            const st = $("status");
            if (st) {
                st.textContent = currentSongId
                    ? ("已選擇歌曲：" + currentSongId)
                    : "連線成功（待命）";
            }
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

        // ★ 這裡整個替換掉
        setChallengeLine: async (line) => {
            if (!started) return;

            // 1. 先告訴伺服器目前挑戰行（會觸發 ChallengeConfigUpdated -> 設定 challengeLine）
            await connection.invoke("SetChallengeLine", line);

            // 2. 如果這一邊還沒載入 LRC，就再問一次目前是哪首歌，然後強制載入 LRC
            try {
                if (!lrcReady) {
                    const songId = await connection.invoke("GetCurrentSong");
                    if (songId) {
                        currentSongId = songId;
                        await loadLrcForSong(songId);  // 讀完時會順便呼叫 updateDebugOriginalFromChallenge()
                    }
                }
            } catch (e) {
                console.warn("setChallengeLine GetCurrentSong failed", e);
            }

            // 3. 無論如何再手動刷新一次顯示
            updateDebugOriginalFromChallenge();
        },

        setMatchMode: (mode, threshold) => started && connection.invoke("SetMatchMode", mode, threshold),
        resumeSong: () => started && connection.invoke("ResumeSong")
    };

})();