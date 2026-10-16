const $ = (selector) => document.querySelector(selector); const $$ = (selector) => document.querySelectorAll(selector);
const hide = (el) => el && el.classList.add('hidden');
const show = (el) => el && el.classList.remove('hidden');
const saveState = (state) => localStorage.setItem('avalonV8', JSON.stringify(state));
const loadState = () => JSON.parse(localStorage.getItem('avalonV8'));
const clearState = () => localStorage.removeItem('avalonV8');

// TAG 專用持久化函數
const DEFAULT_TAGS = ['鐵好', '鐵壞', '滑水', '帶風向', '外灑', '內黑', '外白'];
const saveTags = () => localStorage.setItem('avalon_tags', JSON.stringify(GAME.customTags));

const RULE_BOOK = {
    5:  { evil: 2, missions: [2, 3, 2, 3, 3] },
    6:  { evil: 2, missions: [2, 3, 4, 3, 4] },
    7:  { evil: 3, missions: [2, 3, 3, 4, 4] },
    8:  { evil: 3, missions: [3, 4, 4, 5, 5] },
    9:  { evil: 3, missions: [3, 4, 4, 5, 5] },
    10: { evil: 4, missions: [3, 4, 4, 5, 5] }
};
const ROLE_NAMES = { 'merlin':'梅林', 'percival':'派西維爾', 'loyal':'忠臣', 'morgana':'魔甘娜', 'assassin':'刺客', 'oberon':'奧伯倫', 'minion':'爪牙', 'mordred':'默德雷德' };

let GAME = {
    isPlaying: false, playerCount: 10, roles: [], perspective: 'recorder',
    mySeat: 1, myRole: 'good', tags: {}, godRoles: {}, history: [],      
    currentRound: 1, currentAttempt: 1, currentCaptain: 1,
    successCount: 0, failCount: 0, 
    useLake: true, lake: { holder: 0, history: [] },
    status: 'playing', tableMarks1: {}, tableMarks2: {}, isEditedConfig: false, privacy: false,
    pendingMissionIndex: -1, pendingLake: false,
    customTags: [...DEFAULT_TAGS], playerTags: {}
};
let TEMP_VOTE = { team: [], votes: {}, editIndex: -1 };
let TEMP_SETUP = { options: {}, fillers: [] };
let TEMP_FAIL_VOTES = null;
let EDITING_MISSION_INDEX = -1;
let CURRENT_TAG_TARGET = -1;

// ==========================================
// Setup: 動態編輯角色與選項
// ==========================================
const initRoleEditor = (count) => {
    //奧伯倫10人以上才可以的話取消該備註
    //$('#opt-oberon').disabled = count < 10;
    //if (count < 10) $('#opt-oberon').checked = false;
    
    if (count >= 8) show($('#lake-setup-option'));
    else hide($('#lake-setup-option'));

    if (!GAME.isEditedConfig) {
        let defaultRoles = count === 10 ? ['merlin','percival','loyal','loyal','loyal','loyal','morgana','assassin','oberon','mordred'] 
                         : count === 9 ? ['merlin','percival','loyal','loyal','loyal','loyal','morgana','assassin','mordred']
                         : count === 8 ? ['merlin','percival','loyal','loyal','loyal','morgana','assassin','minion']
                         : count === 7 ? ['merlin','percival','loyal','loyal','morgana','assassin','minion']
                         : count === 6 ? ['merlin','percival','loyal','loyal','morgana','assassin']
                         : ['merlin','percival','loyal','morgana','assassin'];
        
        TEMP_SETUP.options = { percival: defaultRoles.includes('percival'), morgana: defaultRoles.includes('morgana'), mordred: defaultRoles.includes('mordred'), oberon: defaultRoles.includes('oberon') };
        TEMP_SETUP.fillers = defaultRoles.filter(r => r === 'loyal' || r === 'minion');
        
        $('#opt-percival').checked = TEMP_SETUP.options.percival; $('#opt-morgana').checked = TEMP_SETUP.options.morgana;
        $('#opt-mordred').checked = TEMP_SETUP.options.mordred; $('#opt-oberon').checked = TEMP_SETUP.options.oberon;
    }
    recalcFillers(count);
};

const recalcFillers = (count) => {
    TEMP_SETUP.options = { percival: $('#opt-percival').checked, morgana: $('#opt-morgana').checked, mordred: $('#opt-mordred').checked, oberon: $('#opt-oberon').checked };
    let fixedCount = 2; 
    let optCount = Object.values(TEMP_SETUP.options).filter(Boolean).length;
    let targetFillers = count - fixedCount - optCount;

    if(TEMP_SETUP.fillers.length > targetFillers) TEMP_SETUP.fillers = TEMP_SETUP.fillers.slice(0, targetFillers);
    while(TEMP_SETUP.fillers.length < targetFillers) TEMP_SETUP.fillers.push('loyal');

    let good = 1 + (TEMP_SETUP.options.percival?1:0) + TEMP_SETUP.fillers.filter(r=>r==='loyal').length;
    let evil = 1 + (TEMP_SETUP.options.morgana?1:0) + (TEMP_SETUP.options.mordred?1:0) + (TEMP_SETUP.options.oberon?1:0) + TEMP_SETUP.fillers.filter(r=>r==='minion').length;
    
    let html = '';
    TEMP_SETUP.fillers.forEach((f, idx) => { html += `<span class="role-filler-btn ${f==='loyal'?'good':'evil'}" data-idx="${idx}">${f==='loyal'?'忠臣':'爪牙'}</span>`; });
    $('#role-editor-fillers').innerHTML = html;
    $('#role-balance-hint').innerText = `目前配置: ${good} 好人 / ${evil} 壞人 (預設建議: ${count - RULE_BOOK[count].evil}好 / ${RULE_BOOK[count].evil}壞)`;

    $$('.role-filler-btn').forEach(btn => btn.onclick = (e) => {
        GAME.isEditedConfig = true; let idx = e.target.getAttribute('data-idx');
        TEMP_SETUP.fillers[idx] = TEMP_SETUP.fillers[idx] === 'loyal' ? 'minion' : 'loyal'; recalcFillers(count);
    });
    compileFinalRoles();
};

const compileFinalRoles = () => {
    let arr = ['merlin', 'assassin'];
    if (TEMP_SETUP.options.percival) arr.push('percival'); if (TEMP_SETUP.options.morgana) arr.push('morgana');
    if (TEMP_SETUP.options.mordred) arr.push('mordred'); if (TEMP_SETUP.options.oberon) arr.push('oberon');
    GAME.roles = arr.concat(TEMP_SETUP.fillers); 
    updateMyRoleOptions();
    utilsRenderSetup(); 
};

const updateMyRoleOptions = () => {
    let select = $('#my-role');
    let currentVal = select.value;
    let html = `<option value="good">平民 (無視野)</option>
                <option value="merlin">梅林 (看見紅方)</option>`;
    if (GAME.roles.includes('percival')) html += `<option value="percival">派西維爾</option>`;
    html += `<option value="evil">一般壞人</option>`;
    if (GAME.roles.includes('oberon')) html += `<option value="oberon">奧伯倫</option>`;
    select.innerHTML = html;
    if ([...select.options].some(o => o.value === currentVal)) select.value = currentVal;
    else select.value = 'good';
};

// ==========================================
// 狀態重新運算 (支援防重整與修改)
// ==========================================
const recalcGameState = () => {
    if (GAME.history.length === 0) {
        GAME.currentRound = 1; GAME.currentAttempt = 1; GAME.currentCaptain = 1; 
        GAME.successCount = 0; GAME.failCount = 0; GAME.status = 'playing'; return;
    }
    
    let sCount = 0; let fCount = 0;
    GAME.history.forEach(rec => {
        if ((rec.passed || rec.votes === 'skipped' || rec.attempt === 5) && rec.failVotes !== undefined) {
            let req = calcFailsNeeded(rec.round);
            if (rec.failVotes >= req) fCount++; else sCount++;
        }
    });
    
    GAME.successCount = sCount; GAME.failCount = fCount;
    
    let lastRec = GAME.history[GAME.history.length - 1];
    let isVoteDone = lastRec.passed || lastRec.votes === 'skipped' || lastRec.attempt === 5;
    if (isVoteDone && lastRec.failVotes === undefined) {
        GAME.currentRound = lastRec.round;
        GAME.currentAttempt = lastRec.attempt;
        GAME.currentCaptain = lastRec.captain;
        GAME.pendingMissionIndex = GAME.history.length - 1;
    }
    else if (isVoteDone && lastRec.failVotes !== undefined) {
        GAME.currentRound = lastRec.round + 1; GAME.currentAttempt = 1;
        GAME.currentCaptain = (lastRec.captain % GAME.playerCount) + 1;
        GAME.pendingMissionIndex = -1;
    } 
    else {
        GAME.currentRound = lastRec.round; GAME.currentAttempt = lastRec.attempt + 1;
        GAME.currentCaptain = (lastRec.captain % GAME.playerCount) + 1;
        GAME.pendingMissionIndex = -1;
    }
    
    if (GAME.successCount >= 3) { GAME.status = 'assassin'; }
    else if (GAME.failCount >= 3) { GAME.status = 'endgame'; }
    else { GAME.status = 'playing'; }

    checkPendingLakeState();
};

const checkPendingLakeState = () => {
    GAME.pendingLake = false;
    if (!GAME.useLake || GAME.history.length === 0) return;
    let lastRec = GAME.history[GAME.history.length - 1];
    if ((lastRec.passed || lastRec.votes === 'skipped' || lastRec.attempt === 5) && [2, 3, 4].includes(lastRec.round) && lastRec.failVotes !== undefined) {
        let hasLaked = GAME.lake.history.some(h => h.round === lastRec.round);
        if (!hasLaked) GAME.pendingLake = true;
    }
};

// ==========================================
// 邏輯與標記
// ==========================================
const calcReqTeamSize = (round = GAME.currentRound) => RULE_BOOK[GAME.playerCount].missions[round - 1];
const calcFailsNeeded = (round = GAME.currentRound) => (GAME.playerCount >= 7 && round === 4) ? 2 : 1;
const countApproves = (votes) => Object.values(votes).filter(v => v === 'W').length;
const isEvilRole = (r) => ['assassin','morgana','mordred','oberon','minion'].includes(r);

const logicGetTagLimits = () => {
    if (GAME.perspective !== 'player') return { count: 0, hint: '' };
    if (GAME.myRole === 'oberon') return { count: 0, hint: '奧伯倫看不見其他壞人，無需標記' };
    if (GAME.myRole === 'merlin') {
        let evils = GAME.roles.filter(isEvilRole).length;
        let hasMordred = GAME.roles.includes('mordred');
        let target = hasMordred ? evils - 1 : evils;
        return { count: target, hint: hasMordred ? `請標記 ${target} 位壞人 (看不見默德雷德)` : `請標記 ${target} 位壞人` };
    }
    if (GAME.myRole === 'percival') return { count: 2, hint: `請標記 2 位玩家 (梅林與魔甘娜)` };
    if (GAME.myRole === 'evil') {
        let evils = GAME.roles.filter(isEvilRole).length;
        let hasOberon = GAME.roles.includes('oberon');
        let target = evils - 1 - (hasOberon ? 1 : 0);
        return { count: target, hint: hasOberon ? `請標記 ${target} 位隊友 (看不見奧伯倫)` : `請標記 ${target} 位隊友` };
    }
    return { count: 0, hint: '平民無視野，無需標記' };
};

const logicGetVisionBadge = (seat) => {
    if (seat === GAME.mySeat && GAME.perspective === 'player') return `<span class="vision-badge-td private-info" style="background:var(--primary)">我</span>`;
    if (GAME.perspective === 'god' && GAME.godRoles[seat]) return `<span class="vision-badge-td private-info ${isEvilRole(GAME.godRoles[seat]) ? 'evil':''}">${ROLE_NAMES[GAME.godRoles[seat]]}</span>`;
    if (GAME.perspective === 'player' && GAME.tags[seat]) {
        if (GAME.myRole === 'percival') return `<span class="vision-badge-td private-info" style="background:purple">梅/魔</span>`;
        return `<span class="vision-badge-td private-info" style="background:red">壞人</span>`;
    }
    return '';
};

window.cycleMarker = (type, seat) => {
    let marks = type === 1 ? GAME.tableMarks1 : GAME.tableMarks2;
    marks[seat] = ((marks[seat] || 0) + 1) % 3;
    saveState(GAME); utilsUpdateUI();
};

window.toggleSuspect = (roundIdx, seat) => {
    let rec = GAME.history[roundIdx];
    if (!rec.suspects) rec.suspects = [];
    
    if (rec.suspects.includes(seat)) {
        rec.suspects = rec.suspects.filter(s => s !== seat); // 移除標記
    } else {
        rec.suspects.push(seat); // 加上標記
    }
    saveState(GAME); 
    utilsUpdateUI(); // 重繪畫面
};

// ==========================================
// TAG 系統
// ==========================================
window.openTagModal = (seat) => {
    CURRENT_TAG_TARGET = seat;
    $('#tag-modal-title').innerText = `設定 ${seat} 號玩家的標籤`;
    renderTagPool();
    $('#tag-modal').classList.add('active');
};

const renderTagPool = () => {
    let html = '';
    let playerHas = GAME.playerTags[CURRENT_TAG_TARGET] || [];
    GAME.customTags.forEach(t => {
        let active = playerHas.includes(t) ? 'active' : '';
        html += `<div class="tag-chip ${active}" onclick="togglePlayerTag('${t}')">${t}</div>`;
    });
    $('#tag-pool-container').innerHTML = html;
};

window.togglePlayerTag = (tag) => {
    if (!GAME.playerTags[CURRENT_TAG_TARGET]) GAME.playerTags[CURRENT_TAG_TARGET] = [];
    let tags = GAME.playerTags[CURRENT_TAG_TARGET];
    if (tags.includes(tag)) {
        GAME.playerTags[CURRENT_TAG_TARGET] = tags.filter(t => t !== tag);
    } else {
        GAME.playerTags[CURRENT_TAG_TARGET].push(tag);
    }
    saveState(GAME); renderTagPool(); utilsUpdateUI();
};

$('#btn-add-new-tag').onclick = () => {
    let val = $('#new-tag-input').value.trim();
    if (val && !GAME.customTags.includes(val)) {
        GAME.customTags.push(val);
        $('#new-tag-input').value = '';
        saveTags(); // 全域保留
        renderTagPool();
    }
};

$('#btn-close-tag-modal').onclick = () => {
    $('#tag-modal').classList.remove('active');
};

// ==========================================
// UI 渲染與核心操作
// ==========================================
const utilsUpdateUI = () => {
    document.body.classList.toggle('privacy-mode', GAME.privacy);
    $('#btn-privacy').innerText = GAME.privacy ? '顯示機密' : '隱藏機密';

    $('#status-round').innerText = `第 ${GAME.currentRound} 輪 (${GAME.currentAttempt}/5)`;
    $('#status-mission').innerText = `任務需求: ${calcReqTeamSize()}人`;
    $('#status-score').innerText = `任務進度：好人:${GAME.successCount} | 壞人:${GAME.failCount}`;
    $('#legend-fails-req').innerText = GAME.playerCount >= 7 ? `(第4輪需2失敗才失敗)` : '';

    let overBanner = $('#game-over-banner');
    if (GAME.status === 'assassin') {
        show(overBanner); overBanner.className = 'banner-over good'; overBanner.innerHTML = '<h3>🗡️ 刺殺階段</h3><p>好人已成功 3 次！請壞人討論並由刺客執行刺殺</p>';
    } else if (GAME.status === 'endgame') {
        show(overBanner); overBanner.className = 'banner-over evil'; overBanner.innerHTML = '<h3>☠️ 遊戲結束</h3><p>壞人已成功 3 次！壞人獲勝</p>';
    } else {
        hide(overBanner);
    }

    // 控制湖中仙女與底部的派車按鈕
    if (GAME.pendingLake) {
        show($('#lake-pending-banner')); hide($('#btn-open-action'));
    } else {
        hide($('#lake-pending-banner'));
        // 只有在 playing 狀態下，才顯示派車按鈕
        GAME.status === 'playing' ? show($('#btn-open-action')) : hide($('#btn-open-action'));
    }

    if (GAME.useLake && GAME.playerCount >= 8) {
        show($('#lake-section'));
        $('#lake-holder').innerText = GAME.lake.holder > 0 ? GAME.lake.holder : '-';
        $('#lake-history').innerHTML = GAME.lake.history.map((h) => `<div style="font-size:13px; padding:4px; margin-bottom:4px; background:#f8f9fa; border:1px solid #ddd; border-radius:4px;">第 ${h.round} 輪後：<strong>${h.from}號</strong> 驗 ${h.to}號 ➔ ${h.res==='evil'?'<span style="color:#d9534f;font-weight:bold;">壞人</span>':'<span style="color:#0dad0d;font-weight:bold;">好人</span>'}</div>`).join('');
    } else hide($('#lake-section'));

    const headRow = $('#table-head-row'); const tbody = $('#table-body');
    let icons = ['-', '🟢', '🟥'];
    headRow.innerHTML = '<th style="vertical-align:top; min-width:40px;">編號</th><th style="vertical-align:top; min-width:40px;">隊長</th>';
    for (let i = 1; i <= GAME.playerCount; i++) {
        let badge = logicGetVisionBadge(i);
        let lakeChecked = GAME.lake.history.find(h => h.to === i);
        let lakeBadgeHtml = lakeChecked ? `<div style="font-size:0.75rem; font-weight:bold; color:${lakeChecked.res === 'evil'?'#d9534f':'#0dad0d'};">${lakeChecked.res === 'evil'?'壞':'好'}</div>` : '';
        
        let m1 = icons[GAME.tableMarks1[i] || 0]; let m2 = icons[GAME.tableMarks2[i] || 0];
        let pTags = GAME.playerTags[i] || [];
        let tagsHtml = pTags.length > 0 ? `<div class="player-tag-container">` + pTags.map(t => `<div class="player-tag">${t}</div>`).join('') + `</div>` : '';

        headRow.innerHTML += `<th style="vertical-align:top; min-width:60px;">
            ${i}號<br>${badge} ${lakeBadgeHtml}
            <div class="marker-group private-info">
                <div class="marker-btn" onclick="cycleMarker(1, ${i})">${m1}</div>
                <div class="marker-btn" onclick="cycleMarker(2, ${i})">${m2}</div>
            </div>
            <div class="private-info">
                ${tagsHtml}
                <div class="tag-add-btn" onclick="openTagModal(${i})">[+TAG]</div>
            </div>
        </th>`;
    }
    headRow.innerHTML += `<th style="vertical-align:top">操作</th>`;

    tbody.innerHTML = '';
    GAME.history.forEach((rec, index) => {
        let tr = document.createElement('tr');
        
        let infoTd1 = document.createElement('td');
        infoTd1.innerText = `${rec.round}-${rec.attempt}`;
        let infoTd2 = document.createElement('td');
        infoTd2.innerText = rec.captain;
        tr.appendChild(infoTd1);
        tr.appendChild(infoTd2);

        for (let i = 1; i <= GAME.playerCount; i++) {
            let td = document.createElement('td');
            if (i === rec.captain) td.classList.add('captain');
            
            let onTeam = rec.team.includes(i);
            if(onTeam) td.classList.add('on-team');

            if (onTeam) {
                td.classList.add('suspect-target');
                td.onclick = () => {
                    window.toggleSuspect(index, i);
                };
            }
            
            let suspectHtml = (rec.suspects && rec.suspects.includes(i)) 
                ? `<span class="private-info" style="font-size:0.85rem; margin-left:2px;">⚠️</span>` 
                : '';
            
            if (rec.votes === 'skipped') {
                td.innerHTML = (onTeam ? '出發' : '-') + suspectHtml;
            } else {
                let v = rec.votes[i];
                let alert = ((onTeam && v === 'B') || (!onTeam && v === 'W')) ? `<span class="alert-mark">!</span>` : '';
                let sym = v === 'W' ? `<span class="txt-w">⚪</span>` : `<span class="txt-b">⚫</span>`;
                
                td.innerHTML = `${sym}${alert}${suspectHtml}`;
            }
            tr.appendChild(td);
        }
        
        let editTd = document.createElement('td');
        editTd.innerHTML = `<button class="edit-btn" onclick="openEditSheet(${index})">✎修改票</button>`;
        tr.appendChild(editTd);
        
        tbody.appendChild(tr);
        if (rec.passed || rec.votes === 'skipped'|| rec.attempt === 5) {
            if (rec.failVotes !== undefined) {
                let resTr = document.createElement('tr');
                let isFail = rec.failVotes >= calcFailsNeeded(rec.round);
                resTr.className = isFail ? 'fail-row' : 'success-row';
                let resBadge = isFail ? `<span class="badge-result badge-fail">🔴 任務失敗 (${rec.failVotes}黑)</span>` : `<span class="badge-result badge-success">🟢 任務成功</span>`;
                let editMissBtn = `<button class="edit-btn" style="margin-left:10px;" onclick="openEditMission(${index})">✎改結果</button>`;
                resTr.innerHTML = `<td colspan="${GAME.playerCount + 3}" style="text-align:left; padding:8px 10px;">➔ 第 ${rec.round} 輪：${resBadge} ${editMissBtn}</td>`;
                tbody.appendChild(resTr);
            }

            let lakeRec = GAME.lake.history.find(l => l.round === rec.round);
            if (lakeRec) {
                let lr = document.createElement('tr');
                lr.innerHTML = `<td colspan="${GAME.playerCount + 3}" style="text-align:left; padding-left:10px; font-size:13px; color:#555; background:#e8f4f8;">湖中仙女：${lakeRec.from}號 驗 ${lakeRec.to}號 ➔ ${lakeRec.res==='evil'?'<span style="color:#d9534f;font-weight:bold;">壞人</span>':'<span style="color:#0dad0d;font-weight:bold;">好人</span>'}</td>`;
                tbody.appendChild(lr);
            }
        }
    });
};

const utilsRenderSetup = () => {
    let count = parseInt($('#player-count').value); let p = $('#my-perspective').value;
    hide($('#player-setup')); hide($('#vision-setup')); hide($('#god-setup'));
    if (p === 'player') {
        show($('#player-setup')); $('#my-seat').innerHTML = Array.from({length: count}, (_, i) => `<option value="${i+1}">${i+1}號</option>`).join('');
        renderTaggingGrid();
    } else if (p === 'god') {
        show($('#god-setup')); let uniqueRoles = [...new Set(GAME.roles)];
        $('#god-grid').innerHTML = Array.from({length: count}, (_, i) => `
            <div style="margin-bottom:5px;">${i+1}號: <select class="modern-select" id="god-role-${i+1}">
                <option value="">(無)</option>
                ${uniqueRoles.map(r=>`<option value="${r}">${ROLE_NAMES[r]}</option>`).join('')}
            </select></div>
        `).join('');
    }
};

const renderTaggingGrid = () => {
    let count = parseInt($('#player-count').value); GAME.mySeat = parseInt($('#my-seat').value); GAME.myRole = $('#my-role').value;
    GAME.perspective = $('#my-perspective').value; GAME.tags = {}; 
    let limit = logicGetTagLimits();
    
    // 👇 改成這樣：只要視角是 player 就顯示提示框 (不管 count 是不是 0)
    if (GAME.perspective === 'player') {
        show($('#vision-setup')); 
        $('#vision-hint').innerText = limit.hint; // 顯示提示字
        let grid = $('#vision-grid'); grid.innerHTML = '';
        
        // 有需要標記才生出玩家圓圈
        if (limit.count > 0) {
            for (let i = 1; i <= count; i++) {
                if (i === GAME.mySeat) continue;
                let btn = document.createElement('div'); btn.className = 'player-circle'; btn.innerText = i;
                btn.onclick = () => {
                    if (GAME.tags[i]) { delete GAME.tags[i]; btn.classList.remove('tag-active'); } 
                    else if (Object.keys(GAME.tags).length < limit.count) { GAME.tags[i] = 'target'; btn.classList.add('tag-active'); }
                };
                grid.appendChild(btn);
            }
        }
    } else {
        hide($('#vision-setup'));
    }
};

const openActionSheet = (mode = 'team') => {
    document.body.classList.add('sheet-active'); // 隱藏浮動按鈕
    TEMP_VOTE.editIndex = -1; 
    $('#action-sheet').classList.remove('minimized'); 
    $('#action-sheet').classList.add('open');
    $('#btn-minimize-sheet').innerText = '收合';
    
    if (mode === 'team') {
        TEMP_VOTE.team = []; TEMP_VOTE.votes = {}; let req = calcReqTeamSize();
        $('#require-team-size').innerText = req; $('#sheet-title').innerText = `${GAME.currentRound}-${GAME.currentAttempt} 派車 (隊長: ${GAME.currentCaptain}號)`;
        let grid = $('#team-select-grid'); grid.innerHTML = '';
        for (let i = 1; i <= GAME.playerCount; i++) {
            let btn = document.createElement('div'); btn.className = 'player-circle'; btn.innerText = i; btn.innerHTML += logicGetVisionBadge(i);
            btn.onclick = () => {
                if (TEMP_VOTE.team.includes(i)) { TEMP_VOTE.team = TEMP_VOTE.team.filter(n => n !== i); btn.classList.remove('selected'); } 
                else if (TEMP_VOTE.team.length < req) { TEMP_VOTE.team.push(i); btn.classList.add('selected'); }
                $('#btn-confirm-team').disabled = (TEMP_VOTE.team.length !== req);
            };
            grid.appendChild(btn);
        }
        show($('#step-team-build')); hide($('#step-vote')); $('#btn-confirm-team').disabled = true;
    }
};

const closeActionSheet = () => {
    document.body.classList.remove('sheet-active'); // 重新顯示浮動按鈕
    $('#action-sheet').classList.remove('open', 'minimized');
};

window.openEditSheet = (index) => {
    let rec = GAME.history[index];
    if (rec.votes === 'skipped') return alert('尾派不計票模式無法編輯單人選票。');
    
    document.body.classList.add('sheet-active'); // 隱藏浮動按鈕
    TEMP_VOTE.editIndex = index; 
    $('#action-sheet').classList.remove('minimized'); 
    $('#action-sheet').classList.add('open');
    $('#btn-minimize-sheet').innerText = '收合';
    
    hide($('#step-team-build')); show($('#step-vote')); hide($('#btn-confirm-vote')); show($('#btn-save-edit')); hide($('#hammer-option'));
    $('#sheet-title').innerText = `編輯 ${rec.round}-${rec.attempt} 投票`; TEMP_VOTE.team = rec.team; TEMP_VOTE.votes = {...rec.votes};
    let grid = $('#vote-record-grid'); grid.innerHTML = '';
    for (let i = 1; i <= GAME.playerCount; i++) {
        let v = TEMP_VOTE.votes[i]; let btn = document.createElement('div');
        btn.className = `player-circle ${v==='W'?'vote-white':'vote-black'}`; btn.innerText = i; btn.innerHTML += logicGetVisionBadge(i);
        btn.onclick = () => { TEMP_VOTE.votes[i] = TEMP_VOTE.votes[i] === 'W' ? 'B' : 'W'; btn.classList.toggle('vote-white'); btn.classList.toggle('vote-black'); };
        grid.appendChild(btn);
    }
};

const logicCommitVote = (skipVote = false) => {
    const passed = (skipVote ? GAME.playerCount : countApproves(TEMP_VOTE.votes)) > GAME.playerCount / 2;
    
    // 如果是編輯模式
    if (TEMP_VOTE.editIndex > -1) {
        GAME.history[TEMP_VOTE.editIndex].votes = skipVote ? 'skipped' : { ...TEMP_VOTE.votes };
        GAME.history[TEMP_VOTE.editIndex].passed = passed;
        recalcGameState(); saveState(GAME); utilsUpdateUI(); 
        closeActionSheet(); // 關閉面板並顯示浮動按鈕
        return;
    }
    
    // 如果是全新派車
    let newRec = { round: GAME.currentRound, attempt: GAME.currentAttempt, captain: GAME.currentCaptain, team: [...TEMP_VOTE.team], votes: skipVote ? 'skipped' : { ...TEMP_VOTE.votes }, passed: passed, suspectMarks: {} };
    GAME.history.push(newRec);

    if (passed || GAME.currentAttempt === 5) {
        if (!passed && !skipVote && GAME.currentAttempt === 5) {
            alert('提示：第五次派票遭否決！\n(標準規則下壞人直接獲勝，但系統將強制進入下一輪任務)');
        }
        
        GAME.pendingMissionIndex = GAME.history.length - 1; 
        saveState(GAME); openMissionModal(GAME.pendingMissionIndex);
        closeActionSheet(); // 關閉面板並顯示浮動按鈕
    } else {
        recalcGameState(); saveState(GAME); utilsUpdateUI(); 
        closeActionSheet(); // 關閉面板並顯示浮動按鈕
    }
};

window.openEditMission = (idx) => { EDITING_MISSION_INDEX = idx; openMissionModal(idx); };

const openMissionModal = (idx) => {
    let rec = GAME.history[idx];
    let req = calcFailsNeeded(rec.round); 
    $('#mission-req-hint').innerText = `※ 第 ${rec.round} 輪任務，需 ${req} 張失敗票才會失敗 ※`;
    let maxFails = Math.min(calcReqTeamSize(rec.round), GAME.roles.filter(isEvilRole).length);
    let btnHtml = ''; 
    for(let i=0; i<=maxFails; i++) btnHtml += `<button class="num-btn" onclick="selectFailVotes(${i}, this)">${i}</button>`;
    $('#mission-fail-buttons').innerHTML = btnHtml;
    
    TEMP_FAIL_VOTES = null; $('#btn-confirm-mission').disabled = true;
    $('#mission-success-hint').innerText = ''; $('#mission-deduction-hint').innerText = ''; if (rec.failVotes !== undefined) { setTimeout(() => { $$('.num-btn')[rec.failVotes].click(); }, 50);
    }
    $('#mission-modal').classList.add('active'); };  window.selectFailVotes = (val, btnEl) => { $$('.num-btn').forEach(b => b.classList.remove('active')); btnEl.classList.add('active');
    TEMP_FAIL_VOTES = val; $('#btn-confirm-mission').disabled = false;
    let roundIdx = EDITING_MISSION_INDEX > -1 ? EDITING_MISSION_INDEX : GAME.pendingMissionIndex;
    let rec = GAME.history[roundIdx];
    let req = calcFailsNeeded(rec.round);
    $('#mission-success-hint').innerText = `出發人數：${calcReqTeamSize(rec.round)} | 失敗：${val}`;
    $('#mission-deduction-hint').innerText = val >= req ? `⚠️ 任務失敗！此車至少有 ${val} 名壞人。` : `✅ 任務成功！`;
};

const logicCommitMission = () => {
    let idx = EDITING_MISSION_INDEX > -1 ? EDITING_MISSION_INDEX : GAME.pendingMissionIndex;
    let rec = GAME.history[idx];
    
    // 如果修改失敗張數，清空該輪的嫌疑標記
    if (rec.failVotes !== undefined && rec.failVotes !== TEMP_FAIL_VOTES) { rec.suspects = []; }
    rec.failVotes = TEMP_FAIL_VOTES;
    GAME.pendingMissionIndex = -1; EDITING_MISSION_INDEX = -1;
    
    recalcGameState(); saveState(GAME); utilsUpdateUI(); $('#mission-modal').classList.remove('active');
};

const openLakeModal = () => {
    let pastHolders = GAME.lake.history.map(h => h.from); pastHolders.push(GAME.lake.holder);
    let immPast = GAME.lake.history.length > 0 ? GAME.lake.history[GAME.lake.history.length-1].from : -1;
    
    let opts = ''; 
    for(let i=1; i<=GAME.playerCount; i++) {
        if (i !== GAME.lake.holder && i !== immPast) opts += `<option value="${i}">${i}號</option>`;
    }
    if(!opts) return alert('已經沒有可以驗的對象了。');
    $('#lake-target').innerHTML = opts; $('#lake-modal').classList.add('active');
};

// ==========================================
// Init & Events
// ==========================================
window.onload = () => {
    // 1. 安全綁定字體縮放按鈕
    const fontScale = $('#font-size-scale');
    if (fontScale) {
        fontScale.onchange = (e) => { document.documentElement.style.fontSize = (16 * parseInt(e.target.value) / 100) + 'px'; };
    }
    
    $('#btn-privacy').onclick = () => { GAME.privacy = !GAME.privacy; saveState(GAME); utilsUpdateUI(); };
    $('#player-count').onchange = (e) => { GAME.isEditedConfig = false; initRoleEditor(parseInt(e.target.value)); };
    $('#my-perspective').onchange = utilsRenderSetup;
    $('#my-role').onchange = renderTaggingGrid; $('#my-seat').onchange = renderTaggingGrid; $$('#role-editor-options input').forEach(el => el.onchange = () => { GAME.isEditedConfig = true; recalcFillers(parseInt($('#player-count').value)); });
    $('#opt-lake').onchange = () => { GAME.useLake = $('#opt-lake').checked; };

    $('#btn-start-game').onclick = () => {
        GAME.playerCount = parseInt($('#player-count').value); GAME.perspective = $('#my-perspective').value;
        GAME.useLake = GAME.playerCount >= 8 && $('#opt-lake').checked;
        if (GAME.perspective === 'god') {
            let assigned = [], counts = {}, roleCounts = {};
            for(let i=1; i<=GAME.playerCount; i++) { let v = $(`#god-role-${i}`).value; if(v) assigned.push(v); }
            assigned.forEach(r => counts[r] = (counts[r]||0)+1); GAME.roles.forEach(r => roleCounts[r] = (roleCounts[r]||0)+1);
            let valid = assigned.length === GAME.playerCount; for(let k in roleCounts) if(counts[k] !== roleCounts[k]) valid = false;
            if(!valid) return alert('角色分配與配置不符！');
            assigned.forEach((v, i) => GAME.godRoles[i+1] = v);
        }
        if(GAME.useLake) GAME.lake.holder = GAME.playerCount; 
        GAME.isPlaying = true; saveState(GAME); hide($('#setup-view')); show($('#game-view')); utilsUpdateUI();
    };

    $('#btn-restart').onclick = () => { 
        if(confirm('確定清除紀錄重新開始嗎？')) { 
            let keepTags = confirm('是否保留目前建立的自訂關鍵字 TAG？');
            if (keepTags) { 
                saveTags(); 
            } else { 
                localStorage.removeItem('avalon_tags'); 
            }
            clearState(); 
            location.reload(); 
        } 
    };

    $('#btn-open-action').onclick = () => openActionSheet('team');

    $('.sheet-header').onclick = (e) => { 
        const sheet = $('#action-sheet');
        
        if (e.target.tagName === 'BUTTON' && e.target.id !== 'btn-minimize-sheet') return; 

        if (sheet.classList.contains('minimized')) {
            sheet.classList.remove('minimized');
            $('#btn-minimize-sheet').innerText = '收合';
        } else {
            sheet.classList.add('minimized');
            $('#btn-minimize-sheet').innerText = '展開';
        }
    };
    
    $('#btn-confirm-team').onclick = () => {
        hide($('#step-team-build')); show($('#step-vote')); show($('#btn-confirm-vote')); hide($('#btn-save-edit'));
        GAME.currentAttempt === 5 ? show($('#hammer-option')) : hide($('#hammer-option'));
        let grid = $('#vote-record-grid'); grid.innerHTML = '';
        for (let i = 1; i <= GAME.playerCount; i++) {
            TEMP_VOTE.votes[i] = TEMP_VOTE.team.includes(i) ? 'W' : 'B'; let btn = document.createElement('div');
            btn.className = `player-circle ${TEMP_VOTE.votes[i]==='W'?'vote-white':'vote-black'}`; btn.innerText = i; btn.innerHTML += logicGetVisionBadge(i);
            btn.onclick = () => { TEMP_VOTE.votes[i] = TEMP_VOTE.votes[i] === 'W' ? 'B' : 'W'; btn.classList.toggle('vote-white'); btn.classList.toggle('vote-black'); };
            grid.appendChild(btn);
        }
    };
    $('#btn-confirm-vote').onclick = () => logicCommitVote($('#skip-vote-cb') && $('#skip-vote-cb').checked);
    $('#btn-save-edit').onclick = () => logicCommitVote(false);
    $('#btn-confirm-mission').onclick = logicCommitMission;
    
    
    if ($('#btn-force-lake')) $('#btn-force-lake').onclick = openLakeModal; 
    if ($('#btn-use-lake')) $('#btn-use-lake').onclick = openLakeModal;
    
    $('#btn-confirm-lake').onclick = () => {
        let target = parseInt($('#lake-target').value);
        let targetRound = GAME.history.length > 0 ? GAME.history[GAME.history.length-1].round : GAME.currentRound; 
        
        GAME.lake.history.push({ round: targetRound, from: GAME.lake.holder, to: target, res: $('#lake-result').value });
        GAME.lake.holder = target; GAME.pendingLake = false; saveState(GAME); utilsUpdateUI(); $('#lake-modal').classList.remove('active');
    };

    
    // --- 匯出圖片功能 ---
    $('#btn-export-img').onclick = () => {
        // 預填日期
        let today = new Date();
        $('#export-date').value = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()} 第1場`;
        $('#export-title').value = "阿瓦隆遊戲紀錄";
        $('#export-modal').classList.add('active');
    };

    $('#btn-cancel-export').onclick = () => {
        $('#export-modal').classList.remove('active');
    };

    $('#btn-confirm-export').onclick = async () => {
        const title = $('#export-title').value.trim() || '阿瓦隆遊戲紀錄';
        const date = $('#export-date').value.trim();

        // 建立一個暫時的隱藏容器來排版要輸出的畫面
        const exportArea = document.createElement('div');
        exportArea.style.padding = '20px';
        exportArea.style.background = '#f4f6f8';
        exportArea.style.color = '#333';
        exportArea.style.width = '800px'; // 固定寬度確保圖片不會因為手機螢幕太窄而擠壓
        
        // 加入標題、日期與目前比分
        exportArea.innerHTML = `
            <div style="text-align:center; margin-bottom:15px;">
                <h2 style="font-size: 26px; margin:0 0 5px 0;">${title}</h2>
                <p style="font-size: 16px; color:#555; margin:0;">${date}</p>
                <p style="font-size: 16px; color:#555; margin:5px 0 0 0; font-weight:bold;">
                    (共 ${GAME.playerCount} 人局 | 好人 ${GAME.successCount} : 壞人 ${GAME.failCount})
                </p>
            </div>
        `;

        // 複製表格區域
        const tableClone = $('.table-container').cloneNode(true);
        
        // 【優化出圖畫面 1】拔除所有的編輯按鈕 ("✎修改票", "✎改結果")
        tableClone.querySelectorAll('.edit-btn').forEach(btn => btn.remove());
        
        // 【優化出圖畫面 2】精準移除最後一欄 (操作欄)
        // 針對每一列 (tr) 檢查，如果最後一個儲存格沒有 colspan 屬性，才把它刪除 (這樣就能保留任務結果與湖女)
        tableClone.querySelectorAll('tr').forEach(row => {
            const lastCell = row.lastElementChild;
            if (lastCell && !lastCell.hasAttribute('colspan')) {
                lastCell.remove();
            }
        });

        // 將表格的寬度撐開
        tableClone.style.overflowX = 'visible'; 
        
        exportArea.appendChild(tableClone);
        
        // 將暫時容器放到畫面外
        exportArea.style.position = 'absolute';
        exportArea.style.left = '-9999px';
        document.body.appendChild(exportArea);

        try {
            // 按鈕顯示處理中防呆
            const btn = $('#btn-confirm-export');
            const oldText = btn.innerText;
            btn.innerText = '圖片產生中...';
            btn.disabled = true;
            
            // 透過 html2canvas 繪製
            const canvas = await html2canvas(exportArea, { scale: 2, useCORS: true });
            const filename = `${title}_${date.replace(/\//g, '-')}.png`;

            // 判斷是否為「加到主畫面」的捷徑模式 (PWA 獨立模式)
            // 包含通用的 display-mode 偵測，以及 iOS 專屬的 navigator.standalone 偵測
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

            // 將 canvas 轉成 Blob (檔案格式) 準備給分享或下載使用
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const file = new File([blob], filename, { type: 'image/png' });

            // 只有在「捷徑模式」且「支援原生分享」時，才跳出 iOS 分享面板
            if (isStandalone && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: title
                    });
                } catch (err) {
                    console.log('玩家取消了分享或儲存', err);
                }
            } else {
                // 一般瀏覽器模式 (Safari, Chrome, 電腦版)，直接觸發圖片下載
                const imgData = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = filename;
                link.href = imgData;
                link.click();
            }
            
            // 恢復狀態
            btn.innerText = oldText;
            btn.disabled = false;
            $('#export-modal').classList.remove('active');
        } catch(e) {
            alert('匯出圖片失敗，請確保有網路連線以載入繪圖套件！');
            console.error(e);
        } finally {
            document.body.removeChild(exportArea); // 清理隱藏的排版容器
        }
    };

    let saved = loadState();
    let savedTags = localStorage.getItem('avalon_tags');
    if (savedTags) GAME.customTags = JSON.parse(savedTags);

    if (saved && saved.isPlaying) { 
        saved.customTags = GAME.customTags;
        GAME = saved; 
        if (!GAME.playerTags) GAME.playerTags = {};
        updateMyRoleOptions(); hide($('#setup-view')); show($('#game-view')); utilsUpdateUI(); 
        
        if (GAME.pendingMissionIndex > -1) openMissionModal(GAME.pendingMissionIndex);
        if (GAME.pendingLake) openLakeModal();
        
    } else { 
        if (fontScale) fontScale.value = "100";
        $('#player-count').value = "10";
        initRoleEditor(10); 
        utilsRenderSetup();
    }

    const textInputs = document.querySelectorAll('input[type="text"]');
    textInputs.forEach(input => {
        input.addEventListener('blur', () => {
            // 延遲 100 毫秒等 iOS 鍵盤完全收起後，強制刷新視圖高度
            setTimeout(() => {
                window.scrollTo(0, 0);
            }, 100);
        });
    });
};