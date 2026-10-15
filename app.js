const $ = (selector) => document.querySelector(selector); const $$ = (selector) => document.querySelectorAll(selector);
const hide = (el) => el && el.classList.add('hidden');
const show = (el) => el && el.classList.remove('hidden');

// 更新為 v8 防衝突
const saveState = (state) => localStorage.setItem('avalon_v8', JSON.stringify(state));
const loadState = () => JSON.parse(localStorage.getItem('avalon_v8'));
const clearState = () => localStorage.removeItem('avalon_v8');
const saveTags = () => localStorage.setItem('avalon_v8_tags', JSON.stringify(GAME.customTags));

const DEFAULT_TAGS = ['鐵好', '鐵壞', '滑水', '帶風向', '被發好人', '被發查殺'];

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
    $('#opt-oberon').disabled = count < 10;
    if (count < 10) $('#opt-oberon').checked = false;
    
    if (count >= 8) show($('#lake-setup-option'));
    else hide($('#lake-setup-option'));

    if (!GAME.isEditedConfig) {
        let defaultRoles = count === 10 ? ['merlin','percival','loyal','loyal','loyal','loyal','morgana','assassin','oberon','mordred'] 
                         : count === 9 ? ['merlin','percival','loyal','loyal','loyal','loyal','morgana','assassin','mordred']
                         : count === 8 ? ['merlin','percival','loyal','loyal','loyal','morgana','assassin','minion']
                         : count === 7 ? ['merlin','percival','loyal','loyal','morgana','assassin','oberon']
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
    TEMP_SETUP.options = { percival: $('#opt-percival').checked, morgana: $('#opt-morgana').checked, mordred: $('#opt-mordred').checked, oberon: $('#opt-oberon').checked && count === 10 };
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
// 狀態重新運算 (防重整保護)
// ==========================================
const recalcGameState = () => {
    if (GAME.history.length === 0) {
        GAME.currentRound = 1; GAME.currentAttempt = 1; GAME.currentCaptain = 1; 
        GAME.successCount = 0; GAME.failCount = 0; GAME.status = 'playing'; return;
    }
    
    let sCount = 0; let fCount = 0;
    GAME.history.forEach(rec => {
        if ((rec.passed || rec.votes === 'skipped') && rec.failVotes !== undefined) {
            let req = calcFailsNeeded(rec.round);
            if (rec.failVotes >= req) fCount++; else sCount++;
        }
    });
    
    GAME.successCount = sCount; GAME.failCount = fCount;
    
    let lastRec = GAME.history[GAME.history.length - 1];
    if ((lastRec.passed || lastRec.votes === 'skipped')) {
        // 如果任務還沒開出成敗結果 (重整狀態)，不要進入下一輪
        if (lastRec.failVotes !== undefined) {
            GAME.currentRound = lastRec.round + 1; GAME.currentAttempt = 1;
            GAME.currentCaptain = (lastRec.captain % GAME.playerCount) + 1;
        }
    } else {
        GAME.currentRound = lastRec.round; GAME.currentAttempt = lastRec.attempt + 1;
        GAME.currentCaptain = (lastRec.captain % GAME.playerCount) + 1;
    }
    
    if (GAME.successCount >= 3) GAME.status = 'assassin';
    else GAME.status = 'playing';

    checkPendingLakeState();
};

const checkPendingLakeState = () => {
    GAME.pendingLake = false;
    if (!GAME.useLake || GAME.history.length === 0) return;
    let lastRec = GAME.history[GAME.history.length - 1];
    if ((lastRec.passed || lastRec.votes === 'skipped') && lastRec.failVotes !== undefined && [2, 3, 4].includes(lastRec.round)) {
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

window.cycleSuspectMark = (roundIdx, seat) => {
    let rec = GAME.history[roundIdx];
    if (!rec.suspectMarks) rec.suspectMarks = {};
    let curr = rec.suspectMarks[seat] || 0;
    rec.suspectMarks[seat] = (curr + 1) % 3; // 0:無, 1:綠, 2:紅
    saveState(GAME); utilsUpdateUI();
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
        saveTags(); // 即時寫入 localstorage
        saveState(GAME); renderTagPool();
    }
};

$('#btn-close-tag-modal').onclick = () => { $('#tag-modal').classList.remove('active'); };

// ==========================================
// UI 渲染與核心操作
// ==========================================
const utilsUpdateUI = () => {
    document.body.classList.toggle('privacy-mode', GAME.privacy);
    $('#btn-privacy').innerText = GAME.privacy ? '🙈 顯示機密' : '👁️ 隱藏機密';

    $('#status-round').innerText = `第 ${GAME.currentRound} 輪 (${GAME.currentAttempt}/5)`;
    $('#status-mission').innerText = `任務需求: ${calcReqTeamSize()}人`;
    $('#status-score').innerText = `好人:${GAME.successCount} | 壞人:${GAME.failCount}`;
    $('#legend-fails-req').innerText = GAME.playerCount >= 7 ? `(第4輪需2黑才失敗)` : '';

    GAME.status === 'assassin' ? show($('#assassin-phase-banner')) : hide($('#assassin-phase-banner'));
    
    if (GAME.pendingLake) {
        show($('#lake-pending-banner')); hide($('#btn-open-action'));
    } else {
        hide($('#lake-pending-banner'));
        GAME.status === 'assassin' ? hide($('#btn-open-action')) : show($('#btn-open-action'));
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
        let lakeBadgeHtml = lakeChecked ? `<div style="font-size:0.75rem; font-weight:bold; color:${lakeChecked.res === 'evil'?'#d9534f':'#0dad0d'};">🧚${lakeChecked.res === 'evil'?'壞':'好'}</div>` : '';
        let m1 = icons[GAME.tableMarks1[i] || 0]; let m2 = icons[GAME.tableMarks2[i] || 0];
        let pTags = GAME.playerTags[i] || [];
        let tagsHtml = pTags.length > 0 ? `<div class="player-tag-container">` + pTags.map(t => `<div class="player-tag">${t}</div>`).join('') + `</div>` : '';

        headRow.innerHTML += `<th style="vertical-align:top; min-width:65px;">
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
        tr.innerHTML = `<td>${rec.round}-${rec.attempt}</td><td>${rec.captain}</td>`;
        for (let i = 1; i <= GAME.playerCount; i++) {
            let td = document.createElement('td');
            if (i === rec.captain) td.classList.add('captain');
            
            let onTeam = rec.team.includes(i);
            if(onTeam) td.classList.add('on-team');

            if (onTeam && rec.failVotes > 0) {
                td.classList.add('suspect-target');
                td.onclick = () => cycleSuspectMark(index, i);
            }
            
            if (rec.votes === 'skipped') td.innerHTML = onTeam ? '出發' : '-';
            else {
                let v = rec.votes[i];
                let alert = ((onTeam && v === 'B') || (!onTeam && v === 'W')) ? `<span class="alert-mark">!</span>` : '';
                let sym = v === 'W' ? `<span class="txt-w">⚪</span>` : `<span class="txt-b">⚫</span>`;
                
                // 緊貼的標記
                let markVal = (rec.suspectMarks && rec.suspectMarks[i]) ? rec.suspectMarks[i] : 0;
                let markIcon = markVal === 1 ? '🟢' : markVal === 2 ? '🟥' : '';
                let markHtml = markIcon ? `<span style="font-size:0.8rem; margin-left:2px; vertical-align:middle;" class="private-info">${markIcon}</span>` : '';
                td.innerHTML = `${sym}${alert}${markHtml}`;
            }
            tr.appendChild(td);
        }
        tr.innerHTML += `<td><button class="edit-btn" onclick="openEditSheet(${index})">✎修改票</button></td>`;
        tbody.appendChild(tr);

        if (rec.passed || rec.votes === 'skipped') {
            if (rec.failVotes !== undefined) {
                let resTr = document.createElement('tr');
                let isFail = rec.failVotes >= calcFailsNeeded(rec.round);
                resTr.className = isFail ? 'fail-row' : 'success-row';
                let resBadge = isFail ? `<span class="badge-result badge-fail">🔴 任務失敗 (${rec.failVotes}黑)</span>` : `<span class="badge-result badge-success">🟢 任務成功 (全白)</span>`;
                let editMissBtn = `<button class="edit-btn" style="margin-left:10px;" onclick="openEditMission(${index})">✎改結果</button>`;
                resTr.innerHTML = `<td colspan="${GAME.playerCount + 3}" style="text-align:left; padding:8px 10px;">➔ 第 ${rec.round} 輪：${resBadge} ${editMissBtn}</td>`;
                tbody.appendChild(resTr);
            }
            let lakeRec = GAME.lake.history.find(l => l.round === rec.round);
            if (lakeRec) {
                let lr = document.createElement('tr');
                lr.innerHTML = `<td colspan="${GAME.playerCount + 3}" style="text-align:left; padding-left:10px; font-size:13px; color:#555; background:#e8f4f8;">🧚 湖中仙女：${lakeRec.from}號 驗 ${lakeRec.to}號 ➔ ${lakeRec.res==='evil'?'<span style="color:#d9534f;font-weight:bold;">壞人</span>':'<span style="color:#0dad0d;font-weight:bold;">好人</span>'}</td>`;
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
    if (limit.count > 0) {
        show($('#vision-setup')); $('#vision-hint').innerText = limit.hint;
        let grid = $('#vision-grid'); grid.innerHTML = '';
        for (let i = 1; i <= count; i++) {
            if (i === GAME.mySeat) continue;
            let btn = document.createElement('div'); btn.className = 'player-circle'; btn.innerText = i;
            btn.onclick = () => {
                if (GAME.tags[i]) { delete GAME.tags[i]; btn.classList.remove('tag-active'); } 
                else if (Object.keys(GAME.tags).length < limit.count) { GAME.tags[i] = 'target'; btn.classList.add('tag-active'); }
            };
            grid.appendChild(btn);
        }
    } else hide($('#vision-setup'));
};

const openActionSheet = (mode = 'team') => {
    TEMP_VOTE.editIndex = -1; $('#action-sheet').classList.remove('minimized'); $('#action-sheet').classList.add('open');
    $('#btn-minimize-sheet').innerText = '收合對照';
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

window.openEditSheet = (index) => {
    let rec = GAME.history[index];
    if (rec.votes === 'skipped') return alert('尾派不計票模式無法編輯單人選票。');
    TEMP_VOTE.editIndex = index; $('#action-sheet').classList.remove('minimized'); $('#action-sheet').classList.add('open');
    $('#btn-minimize-sheet').innerText = '收合對照';
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
    if (TEMP_VOTE.editIndex > -1) {
        GAME.history[TEMP_VOTE.editIndex].votes = skipVote ? 'skipped' : { ...TEMP_VOTE.votes };
        GAME.history[TEMP_VOTE.editIndex].passed = passed;
        recalcGameState(); saveState(GAME); utilsUpdateUI(); $('#action-sheet').classList.remove('open', 'minimized'); return;
    }
    
    let newRec = { round: GAME.currentRound, attempt: GAME.currentAttempt, captain: GAME.currentCaptain, team: [...TEMP_VOTE.team], votes: skipVote ? 'skipped' : { ...TEMP_VOTE.votes }, passed: passed, suspectMarks: {} };
    GAME.history.push(newRec);

    if (passed || GAME.currentAttempt === 5) {
        GAME.pendingMissionIndex = GAME.history.length - 1; 
        saveState(GAME); openMissionModal(GAME.pendingMissionIndex);
        $('#action-sheet').classList.remove('open', 'minimized');
    } else {
        recalcGameState(); saveState(GAME); utilsUpdateUI(); $('#action-sheet').classList.remove('open', 'minimized');
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
    $('#mission-success-hint').innerText = ''; $('#mission-deduction-hint').innerText = '';  if (rec.failVotes !== undefined) { setTimeout(() => { $$('.num-btn')[rec.failVotes].click(); }, 50);
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
    if (rec.failVotes !== undefined && rec.failVotes !== TEMP_FAIL_VOTES) { rec.suspectMarks = {}; }
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
    $('#font-size-scale').onchange = (e) => { document.documentElement.style.fontSize = (16 * parseInt(e.target.value) / 100) + 'px'; };
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
            let savedTags = keepTags ? GAME.customTags : [...DEFAULT_TAGS];
            clearState(); 
            localStorage.setItem('avalon_v8_tags', JSON.stringify(savedTags));
            location.reload(); 
        } 
    };

    $('#btn-open-action').onclick = () => openActionSheet('team');
    $('#btn-minimize-sheet').onclick = () => { 
        const sheet = $('#action-sheet');
        if (sheet.classList.contains('minimized')) {
            sheet.classList.remove('minimized');
            $('#btn-minimize-sheet').innerText = '收合對照';
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
    $('#btn-force-lake').onclick = openLakeModal; $('#btn-use-lake').onclick = openLakeModal;
    
    $('#btn-confirm-lake').onclick = () => {
        let target = parseInt($('#lake-target').value);
        let targetRound = GAME.history[GAME.history.length-1].round; 
        GAME.lake.history.push({ round: targetRound, from: GAME.lake.holder, to: target, res: $('#lake-result').value });
        GAME.lake.holder = target; GAME.pendingLake = false; recalcGameState(); saveState(GAME); utilsUpdateUI(); $('#lake-modal').classList.remove('active');
    };

    let saved = loadState();
    let savedTags = localStorage.getItem('avalon_v8_tags');
    
    // 初始化免點擊預設帶出
    $('#player-count').value = "10";
    if (savedTags) GAME.customTags = JSON.parse(savedTags);

    if (saved && saved.isPlaying) { 
        GAME = saved; 
        if (!GAME.customTags) GAME.customTags = savedTags ? JSON.parse(savedTags) : [...DEFAULT_TAGS];
        if (!GAME.playerTags) GAME.playerTags = {};
        updateMyRoleOptions(); hide($('#setup-view')); show($('#game-view')); utilsUpdateUI(); 
        
        // 防重整機制：如果在任務結算時按了 F5，重新開起任務結算視窗
        if (GAME.pendingMissionIndex > -1) openMissionModal(GAME.pendingMissionIndex);
    } else { 
        initRoleEditor(10); 
        utilsRenderSetup();
    }
};