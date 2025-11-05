(function () {
  const connection = new signalR.HubConnectionBuilder().withUrl("/gamehub").build();
  let started = false;

  function $(id){ return document.getElementById(id); }
  function safeText(el, text) { if (el) el.textContent = text; }

  // ---- LRC Sync State ----
  let lrcEntries = [];           // [{time, text}]
  let currentIdx = -1;
  const challengeLines = [3];    // 修改成你要的挑戰行（0-based）
  const triggered = new Set();   // 已觸發過挑戰的行

  function loadLrcForSong(songId){
    const lrcPath = `lrc/${songId}.lrc`; // 依 songId 對應檔名亦可
    fetch(lrcPath).then(r=>{
      if(!r.ok) throw new Error("LRC not found");
      return r.text();
    }).then(text=>{
      lrcEntries = (window.LrcHelper && window.LrcHelper.parseLrc)
        ? window.LrcHelper.parseLrc(text) : [];
      currentIdx = -1;
      triggered.clear();
      if(lrcEntries.length===0){
        safeText($("currentLine"), "（未找到可用的 LRC 歌詞）");
      }else{
        safeText($("currentLine"), "（已載入 LRC，等候播放進度…）");
      }
    }).catch(()=>{
      lrcEntries = [];
      safeText($("currentLine"), "（找不到 LRC 或解析失敗）");
    });
  }

  function onTimeUpdate(){
    const player = $("player");
    if(!player || lrcEntries.length===0) return;
    const t = player.currentTime;
    // 找到當前時間對應的最後一個不大於 t 的行
    let i = currentIdx;
    while(i+1 < lrcEntries.length && lrcEntries[i+1].time <= t) i++;
    if(i !== currentIdx){
      currentIdx = i;
      if(currentIdx >=0 && currentIdx < lrcEntries.length){
        const line = lrcEntries[currentIdx].text;
        safeText($("currentLine"), line);

        if(challengeLines.includes(currentIdx) && !triggered.has(currentIdx)){
          triggered.add(currentIdx);
          if(started){
            connection.invoke("EnterChallenge", currentIdx).catch(()=>{});
          }
        }
      }
    }
  }

  function onEnter(lineIndex){
    const player = $("player");
    if(player) player.pause();

    if($("challengeMask")){
      const text = (lrcEntries[lineIndex]?.text) || "（原詞）";
      const mask = (window.LrcHelper && window.LrcHelper.starMaskFor) ? window.LrcHelper.starMaskFor(text) : "＊＊＊＊";
      $("challengeMask").style.display = "block";
      safeText($("challengeMask"), mask);
    }
    if($("contestantLine")) $("contestantLine").style.display = "block";
    safeText($("status"), "挑戰模式（第 " + lineIndex + " 行）");
    safeText($("currentLine"), "（原詞已遮罩）");
    if($("result")) $("result").textContent = "";
  }

  function onSongStarted(songId){
    safeText($("status"), "播放中：" + songId);
    const player = $("player");
    if (player){
      player.play().catch(()=>{});
      loadLrcForSong(songId);
    }
  }

  function onPaused(){
    safeText($("status"), "暫停");
    const player = $("player");
    if (player) player.pause();
  }

  function onContestantUpdated(text){
    safeText($("contestantLine"), text || "");
  }

  function onShowResult(ok){
    if($("challengeMask")) $("challengeMask").style.display = "none";
    safeText($("currentLine"), ok ? "✅ 過關！" : "❌ 挑戰失敗");
    if($("result")) $("result").textContent = ok ? "🎉 恭喜過關！" : "💥 失敗，返回選單";
  }

  const player = $("player");
  if(player){
    player.addEventListener("timeupdate", onTimeUpdate);
    player.addEventListener("seeked", ()=>{ currentIdx = -1; onTimeUpdate(); });
    player.addEventListener("loadedmetadata", ()=>{ currentIdx = -1; });
  }

  connection.on("EnterChallenge", onEnter);
  connection.on("SongStarted", onSongStarted);
  connection.on("Paused", onPaused);
  connection.on("ContestantUpdated", onContestantUpdated);
  connection.on("ShowResult", onShowResult);

  async function start(){
    try{
      await connection.start();
      started = true;
      if($("status")) $("status").textContent = "連線成功（待命）";
    }catch(e){
      console.warn("SignalR connect failed, retrying...", e);
      setTimeout(start, 1000);
    }
  }
  start();

  window.GameHub = {
    startSong: (id) => started && connection.invoke("StartSong", id),
    pause: () => started && connection.invoke("Pause"),
    enterChallenge: (idx) => started && connection.invoke("EnterChallenge", idx),
    updateContestant: (text) => started && connection.invoke("UpdateContestant", text),
    showResult: (ok) => started && connection.invoke("ShowResult", ok),
  };
})();
