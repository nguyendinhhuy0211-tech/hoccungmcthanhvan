/* MC Academy — Học tiếng Anh cho MC cùng Thanh Vân. Static app, progress in localStorage, voice via Google TTS (device voice fallback) */
const LS = { known: 'mc_known_v1', review: 'mc_review_v1', days: 'mc_days_v1', notes: 'mc_notes_v1', listened: 'mc_listened_v1', listen: 'mc_listen_v1', speak: 'mc_speak_v1', quiz: 'mc_quiz_v1', stage: 'mc_stage_v1', mistakes: 'mc_mistakes_v1', vocabKnown: 'mc_vocab_known_v1' };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
let known = new Set(load(LS.known, []));
let review = new Set(load(LS.review, []));
let days = load(LS.days, []);
let notes = load(LS.notes, []);
let listened = new Set(load(LS.listened, []));
let listenStats = load(LS.listen, { correct: 0, total: 0 });
let speakStats = load(LS.speak, { ratings: {}, count: 0, auto: {} });
if (!speakStats.auto) speakStats.auto = {};
let quizStats = load(LS.quiz, { best: 0, last: 0, correct: 0, total: 0, rounds: 0 });
let stageStats = load(LS.stage, { count: 0, seconds: 0 });
let mistakesDone = new Set(load(LS.mistakes, []));
let vocabKnown = new Set(load(LS.vocabKnown, []));
let CUR = null;
let VOCAB = null, vocabFailed = false;
let vocabCat = 'all', vocabDeck = [], vocabIdx = 0, vocabFlipped = false, vocabTab = 'flash';
let currentTopic = null, flashIdx = 0, flashFlipped = false, phraseMode = 'list';
let currentView = 'overview';

/* ---------- voice: Google TTS (natural voice), device voice as fallback ---------- */
let VOICES = [];
function pickVoice() {
  VOICES = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  if (!VOICES.length) return null;
  const en = VOICES.filter(v => /^en[-_]/.test(v.lang));
  const pool = en.length ? en : VOICES;
  const female = pool.find(v => /female|samantha|zira|aria|google us english|karen|moira|tessa|fiona|veena|natasha|susan|allison|ava|joana/i.test(v.name));
  return female || pool.find(v => /google/i.test(v.name)) || pool[0];
}
let VOICE = null;
if ('speechSynthesis' in window) {
  VOICE = pickVoice();
  speechSynthesis.onvoiceschanged = () => { VOICE = pickVoice(); };
}
let player = null;      // shared <audio> for Google TTS
let playingKey = null;  // text currently playing (tap the same button again to stop)
let playTimer = null;
let seqToken = 0;       // bumped by stopAudio so a stopped sequence cannot resume itself
function stopAudio() {
  if (player) { try { player.onended = null; player.onerror = null; player.onplaying = null; player.pause(); player.removeAttribute('src'); player.load(); } catch (e) {} player = null; }
  if (playTimer) { clearTimeout(playTimer); playTimer = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  playingKey = null;
  seqToken++;
}
function speakDevice(text, rate, onend) {
  if (!('speechSynthesis' in window)) { if (onend) onend(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  if (VOICE) u.voice = VOICE;
  u.pitch = 1.1; u.rate = rate || 0.92; u.volume = 1;
  u.onend = () => { if (onend) onend(); };
  u.onerror = () => { if (onend) onend(); };
  speechSynthesis.speak(u);
}
/* Pre-recorded Aria voice (avocado_v2:MAI_01): AUDIO_BY_TEXT / AUDIO_SCRIPTS come from audio-data.js, loaded before app.js. */
function ariaUri(text) {
  if (typeof AUDIO_BY_TEXT !== 'undefined' && AUDIO_BY_TEXT && AUDIO_BY_TEXT[text]) return AUDIO_BY_TEXT[text];
  return null;
}
function playAriaUri(uri, onend, onerr) {
  player = new Audio();
  player.preload = 'auto';
  player.src = uri;
  player.onended = () => { player = null; if (onend) onend(); };
  player.onerror = () => { player = null; if (onerr) onerr(); };
  player.play().catch(() => { player = null; if (onerr) onerr(); });
}
function playAriaSeq(uris, i, done) {
  const t = seqToken;
  if (i >= uris.length) { playingKey = null; if (done) done(); return; }
  playAriaUri(uris[i], () => { if (t !== seqToken) return; playTimer = setTimeout(() => playAriaSeq(uris, i + 1, done), 120); }, () => { if (t !== seqToken) return; playingKey = null; if (done) done(); });
}
/* Google Translate TTS takes ~200 chars per request: split long text at sentence ends. */
function splitChunks(text) {
  const parts = String(text).match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
  const out = [];
  parts.forEach(p => {
    p = p.trim();
    if (!p) return;
    if (p.length <= 180) { out.push(p); return; }
    const sub = p.split(/,\s*/);
    let buf = '';
    sub.forEach(s => {
      if ((buf ? buf.length + s.length + 2 : s.length) > 180) { if (buf) out.push(buf); buf = s; }
      else buf = buf ? buf + ', ' + s : s;
    });
    if (buf) out.push(buf);
  });
  return out.length ? out : [text];
}
function googleUrl(chunk) {
  return 'https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=' + encodeURIComponent(chunk);
}
let googleBlocked = false;  // if Google TTS fails once, later taps go straight to the device voice
function speakGoogleChunks(chunks, i, done) {
  if (i >= chunks.length) { playingKey = null; if (done) done(); return; }
  if (googleBlocked) { speakDevice(chunks.slice(i).join(' '), 0.92, () => { playingKey = null; if (done) done(); }); return; }
  let failed = false;
  let watchdog = null;
  const failOnce = () => {
    if (failed) return; failed = true;
    if (watchdog) { clearTimeout(watchdog); watchdog = null; }
    googleBlocked = true;
    speakDevice(chunks.slice(i).join(' '), 0.92, () => { playingKey = null; if (done) done(); });
  };
  player = new Audio();
  player.referrerPolicy = 'no-referrer';  // Google answers 404 when the request carries our site as Referer
  player.preload = 'auto';
  player.src = googleUrl(chunks[i]);
  watchdog = setTimeout(() => failOnce(), 6000);  // stalled load (no error event) still falls back
  player.onplaying = () => { if (watchdog) { clearTimeout(watchdog); watchdog = null; } };
  player.onended = () => { if (watchdog) { clearTimeout(watchdog); watchdog = null; } playTimer = setTimeout(() => speakGoogleChunks(chunks, i + 1, done), 120); };
  player.onerror = () => failOnce();
  player.play().catch(() => failOnce());
}
function speak(text, slow) {
  if (playingKey === text) { stopAudio(); return; }
  stopAudio();
  playingKey = text;
  if (slow) { speakDevice(text, 0.7, () => { playingKey = null; }); return; }
  const uri = ariaUri(text);
  if (uri) { playAriaUri(uri, () => { playingKey = null; }, () => { speakGoogleChunks(splitChunks(text), 0, null); }); return; }
  speakGoogleChunks(splitChunks(text), 0, null);
}
function speakLines(lines, i) {
  i = i || 0;
  if (i >= lines.length) return;
  const text = lines.slice(i).join(' ');
  if (playingKey === text) { stopAudio(); return; }
  stopAudio();
  playingKey = text;
  /* "Đọc cả kịch bản": lines = [joined text] -> play that scenario's 3 recordings in order. */
  if (lines.length === 1 && typeof AUDIO_SCRIPTS !== 'undefined' && AUDIO_SCRIPTS && AUDIO_SCRIPTS[lines[0]]) {
    const lineTexts = AUDIO_SCRIPTS[lines[0]];
    const uris = lineTexts.map(t => ariaUri(t)).filter(Boolean);
    if (uris.length === lineTexts.length) { playAriaSeq(uris, 0, null); return; }
  }
  playLineSeq(lines, i);
}
function playLineSeq(lines, i) {
  const t = seqToken;
  if (i >= lines.length) { playingKey = null; return; }
  const uri = ariaUri(lines[i]);
  if (uri) { playAriaUri(uri, () => { if (t !== seqToken) return; playTimer = setTimeout(() => playLineSeq(lines, i + 1), 120); }, () => { if (t !== seqToken) return; speakGoogleChunks(splitChunks(lines[i]), 0, () => { if (t !== seqToken) return; playingKey = lines.join(' '); playLineSeq(lines, i + 1); }); }); return; }
  speakGoogleChunks(splitChunks(lines[i]), 0, () => { if (t !== seqToken) return; playingKey = lines.join(' '); playLineSeq(lines, i + 1); });
}

/* ---------- streak ---------- */
function todayStr() { return new Date().toISOString().slice(0, 10); }
function touchDay() {
  const t = todayStr();
  if (!days.includes(t)) { days.push(t); days = days.slice(-365); save(LS.days, days); }
}
function streakCount() {
  if (!days.length) return 0;
  const set = new Set(days); let n = 0; const d = new Date();
  if (!set.has(todayStr())) d.setDate(d.getDate() - 1);
  while (set.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function allPhrases() { return CUR.topics.flatMap(t => t.phrases.map(p => ({ ...p, topic: t.title, topicId: t.id }))); }
function allScenarios() { return CUR.topics.flatMap(t => t.scenarios.map(s => ({ ...s, topic: t.title, topicId: t.id, topicEmoji: t.emoji }))); }
function shuffle(a) { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = x[i]; x[i] = x[j]; x[j] = t; } return x; }
function pickN(a, n) { return shuffle(a).slice(0, n); }
function markKnown(id) { known.add(id); review.delete(id); touchDay(); persist(); refreshCurrentView(); }
function markReview(id) { review.add(id); known.delete(id); persist(); refreshCurrentView(); }
function persist() { save(LS.known, [...known]); save(LS.review, [...review]); renderStats(); }
function markListened(id) { if (!listened.has(id)) { listened.add(id); save(LS.listened, [...listened]); } }
function markBtns(id) {
  return '<button class="btn known ' + (known.has(id) ? 'on' : '') + '" data-known="' + id + '">' + (known.has(id) ? '✓ Đã thuộc' : 'Đã thuộc') + '</button>' +
    '<button class="btn review ' + (review.has(id) ? 'on' : '') + '" data-review="' + id + '">' + (review.has(id) ? '↻ Ôn lại sau ✓' : 'Ôn lại sau') + '</button>';
}
function phraseCard(p, showTopic) {
  return '<div class="card phrase">' +
    (showTopic ? '<span class="badge">' + esc(p.topic) + '</span>' : '') +
    '<div class="en">' + esc(p.en) + '</div>' +
    '<div class="vi">' + esc(p.vi) + '</div>' +
    '<div class="pron">🗣️ ' + esc(p.pron) + '</div>' +
    '<div class="tip">💡 ' + esc(p.tip) + '</div>' +
    '<div class="row">' +
    '<button class="btn play" data-say="' + esc(p.en) + '" data-pid="' + p.id + '">▶ Nghe</button>' +
    '<button class="btn" data-say-slow="' + esc(p.en) + '">🐢 Nghe chậm</button>' +
    markBtns(p.id) +
    '</div></div>';
}
function vocabCard(p) {
  return '<div class="card phrase">' +
    '<span class="badge">' + esc(p.topic) + '</span> ' + (known.has(p.id) ? '<span class="badge" style="background:#e7f3ea;color:#2e7d4f">✓ Đã thuộc</span>' : '') +
    '<div class="en">' + esc(p.en) + '</div>' +
    '<div class="vi">' + esc(p.vi) + '</div>' +
    '<div class="pron">🗣️ ' + esc(p.pron) + '</div>' +
    '<div class="row"><button class="btn play" data-say="' + esc(p.en) + '" data-pid="' + p.id + '">▶ Nghe</button>' +
    '<button class="btn" data-say-slow="' + esc(p.en) + '">🐢 Nghe chậm</button></div></div>';
}
function renderStats() {
  const total = allPhrases().length || 56;
  const el = (id, v) => { const n = document.getElementById(id); if (n) n.textContent = v; };
  el('totalCount', total);
  el('knownCount', known.size);
  el('streak', streakCount());
  el('noteCount', notes.length);
  el('sideStreak', streakCount());
  el('sideKnown', known.size);
  el('quizBest', quizStats.best ? quizStats.best + '/10' : '–');
  const pb = $('#progressBar'); if (pb) pb.style.width = Math.round(known.size / total * 100) + '%';
}
/* skill % computed from real data only */
function skillData() {
  const total = allPhrases().length || 56;
  const vocab = Math.round(known.size / total * 100);
  const listen = Math.round(listened.size / total * 100);
  const rated = Object.values(speakStats.ratings);
  const speak = rated.length ? Math.round(rated.filter(r => r === 'good').length / rated.length * 100) : 0;
  const reflex = quizStats.total ? Math.round(quizStats.correct / quizStats.total * 100) : 0;
  return { vocab, listen, speak, reflex };
}
function skillBar(label, pct, note) {
  return '<div class="skill"><div class="lab"><span>' + label + '</span><b>' + pct + '%</b></div>' +
    '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
    (note ? '<div class="kbd">' + note + '</div>' : '') + '</div>';
}
function renderOverview() {
  const total = allPhrases().length || 56;
  const pct = Math.round(known.size / total * 100);
  const ring = $('#ringFg');
  if (ring) ring.style.strokeDashoffset = String(326.7 * (1 - pct / 100));
  const op = $('#overallPct'); if (op) op.textContent = pct + '%';
  const s = skillData();
  const rated = Object.values(speakStats.ratings).length;
  $('#skillBars').innerHTML =
    skillBar('Từ vựng', s.vocab, known.size + '/' + total + ' câu đã thuộc') +
    skillBar('Luyện nghe', s.listen, listened.size + '/' + total + ' câu đã nghe · ' + listenStats.correct + '/' + listenStats.total + ' câu nghe đúng') +
    skillBar('Phát âm', s.speak, rated ? rated + ' lượt chấm, ' + Object.values(speakStats.ratings).filter(r => r === 'good').length + ' lượt Đạt' : 'Chưa có lượt chấm nào — vào mục Luyện nói nhé') +
    skillBar('Phản xạ', s.reflex, quizStats.total ? quizStats.correct + '/' + quizStats.total + ' câu kiểm tra đúng' : 'Chưa làm bài kiểm tra nào');
  renderStats();
  const list = allPhrases();
  const dayNo = Math.floor(Date.now() / 86400000);
  const p = list[dayNo % list.length];
  $('#dailyCard').innerHTML = phraseCard(p, true);
  const rl = list.filter(x => review.has(x.id));
  $('#reviewList').innerHTML = rl.length ? rl.map(x => phraseCard(x, true)).join('') :
    '<div class="card empty">Chưa có câu nào cần ôn lại. Khi gặp câu khó, bấm “Ôn lại sau” nhé.</div>';
  renderNotes();
}
function renderNotes() {
  const box = $('#noteList');
  if (!box) return;
  box.innerHTML = notes.length ? notes.map((n, i) =>
    '<div class="card note-item"><div class="txt"><div class="en">' + esc(n.en) + '</div>' +
    (n.vi ? '<div class="vi">' + esc(n.vi) + '</div>' : '') + '</div>' +
    '<button class="btn" data-say="' + esc(n.en) + '">▶</button>' +
    '<button class="btn ghost" data-delnote="' + i + '">🗑️</button></div>'
  ).join('') : '<div class="card empty">Sổ tay còn trống — lưu câu đầu tiên của bạn ở trên nhé.</div>';
}

/* ---------- navigation ---------- */
const RENDERERS = {};
function showView(v) {
  currentView = v;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  document.querySelectorAll('section.view').forEach(s => s.classList.toggle('on', s.id === 'view-' + v));
  if (RENDERERS[v]) RENDERERS[v]();
  window.scrollTo(0, 0);
}
function refreshCurrentView() {
  if (currentView === 'courses' && currentTopic && $('#topicDetail').style.display !== 'none') { renderTopicDetail(currentTopic); return; }
  if (RENDERERS[currentView]) RENDERERS[currentView]();
}

/* ---------- 2. Lộ trình học ---------- */
const STAGES = [
  { n: 1, title: 'Nền tảng sân khấu', desc: 'Câu chào mở đầu, giới thiệu bản thân và khuấy động không khí — nền móng của mọi buổi dẫn.', topics: ['khai-mac'] },
  { n: 2, title: 'Sân khấu cơ bản', desc: 'Giới thiệu đại biểu trang trọng và chuyển ý mượt mà giữa các phần.', topics: ['dai-bieu', 'chuyen-y'] },
  { n: 3, title: 'Sự kiện thực tế', desc: 'Dẫn khai trương, gala dinner và hội thảo — ba dạng sự kiện bạn dẫn nhiều nhất.', topics: ['khai-truong', 'gala', 'hoi-thao'] },
  { n: 4, title: 'MC chuyên nghiệp', desc: 'Đám cưới đầy cảm xúc và ôn tập toàn bộ — sẵn sàng làm chủ mọi sân khấu.', topics: ['dam-cuoi'] }
];
function stageProgress(stage) {
  const ts = CUR.topics.filter(t => stage.topics.includes(t.id));
  const total = ts.reduce((a, t) => a + t.phrases.length, 0);
  const done = ts.reduce((a, t) => a + t.phrases.filter(p => known.has(p.id)).length, 0);
  return { total, done, topics: ts };
}
RENDERERS.roadmap = function () {
  $('#roadmapList').innerHTML = STAGES.map(st => {
    const pr = stageProgress(st);
    const pct = pr.total ? Math.round(pr.done / pr.total * 100) : 0;
    return '<div class="card stage-card"><h3>Giai đoạn ' + st.n + ' · ' + esc(st.title) + '</h3>' +
      '<p class="sub" style="margin:0 0 8px">' + esc(st.desc) + '</p>' +
      pr.topics.map(t => '<div class="row" style="margin-top:6px"><button class="btn" data-topic="' + t.id + '">' + t.emoji + ' ' + esc(t.title) + ' — ' + t.phrases.filter(p => known.has(p.id)).length + '/' + t.phrases.length + ' câu</button></div>').join('') +
      '<div class="pbar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="kbd" style="margin-top:6px">' + pr.done + '/' + pr.total + ' câu đã thuộc · ' + pct + '%</div></div>';
  }).join('');
};

/* ---------- 3. Khóa học ---------- */
RENDERERS.courses = function () { renderTopicList(); };
function renderTopicList() {
  currentTopic = null;
  $('#topicDetail').style.display = 'none';
  const l = $('#courseList');
  if (l) l.style.display = '';
  $('#courseList').innerHTML = CUR.topics.map(t => {
    const k = t.phrases.filter(p => known.has(p.id)).length;
    return '<div class="card topic" data-topic="' + t.id + '">' +
      '<span class="em">' + t.emoji + '</span>' +
      '<div><h3>' + esc(t.title) + '</h3><p>' + esc(t.desc) + '</p>' +
      '<p>' + t.phrases.length + ' câu mẫu · ' + t.scenarios.length + ' kịch bản tình huống</p></div>' +
      '<span class="n">' + k + '/' + t.phrases.length + ' thuộc</span></div>';
  }).join('');
}
function renderTopicDetail(id) {
  const t = CUR.topics.find(x => x.id === id);
  currentTopic = id;
  $('#courseList').style.display = 'none';
  const d = $('#topicDetail');
  d.style.display = '';
  let h = '<button class="back" id="backBtn">← Tất cả khóa học</button>' +
    '<h2>' + t.emoji + ' ' + esc(t.title) + '</h2><p class="sub">' + esc(t.desc) + '</p>' +
    '<h2 style="font-size:16px">💬 Câu mẫu</h2>' + t.phrases.map(p => phraseCard(p, false)).join('') +
    '<h2 style="font-size:16px; margin-top:20px">🎭 Kịch bản tình huống</h2>';
  t.scenarios.forEach(s => { h += scenarioHtml(s); });
  d.innerHTML = h;
  $('#backBtn').onclick = renderTopicList;
}
function scenarioHtml(s) {
  let h = '<div class="scen"><h4>' + esc(s.title) + '</h4><p class="sit">' + esc(s.situation) + '</p>';
  s.lines.forEach((ln, i) => {
    h += '<div class="sline"><span class="no">' + (i + 1) + '</span><div style="flex:1">' +
      '<div class="en">' + esc(ln.en) + '</div><div class="vi">' + esc(ln.vi) + '</div></div>' +
      '<button class="btn mini" data-say="' + esc(ln.en) + '">▶</button></div>';
  });
  const allEn = s.lines.map(l => l.en).join(' ');
  h += '<div class="row"><button class="btn play" data-say-all="' + esc(allEn) + '">▶ Đọc cả kịch bản</button></div></div>';
  return h;
}

/* ---------- 4. Từ vựng ---------- */
function renderVocab(q) {
  q = (q || '').trim().toLowerCase();
  const list = allPhrases().filter(p => !q || (p.en + ' ' + p.vi + ' ' + p.topic).toLowerCase().includes(q));
  $('#vocabList').innerHTML = list.length ? list.map(p => vocabCard(p)).join('') :
    '<div class="card empty">Không tìm thấy câu nào khớp “' + esc(q) + '”.</div>';
}
/* Flashcard 1000 từ vựng chuyên ngành MC (vocab.json) */
function vocabAll() { return VOCAB.categories.flatMap(c => c.words.map(w => ({ ...w, cat: c.tag, catId: c.id, catTitle: c.title }))); }
function vocabDeckBuild() {
  let list = vocabAll();
  if (vocabCat !== 'all') list = list.filter(w => w.catId === vocabCat);
  vocabDeck = list;
  vocabIdx = Math.min(vocabIdx, Math.max(0, vocabDeck.length - 1));
}
function renderVocabFlash() {
  const box = $('#vocabFlash');
  if (!VOCAB) {
    box.innerHTML = vocabFailed
      ? '<div class="card empty">Không tải được bộ 1000 từ (vocab.json). Bạn tải lại trang giúp mình nhé.</div>'
      : '<div class="card empty">Đang tải bộ 1000 từ…</div>';
    return;
  }
  if (!vocabDeck.length) vocabDeckBuild();
  const w = vocabDeck[vocabIdx];
  const known = vocabKnown.has(w.en);
  box.innerHTML =
    '<div class="card flash" id="vocabCard">' +
    '<div class="fhead"><span>FLASHCARD · ' + esc(w.cat) + '</span><span>' + (vocabIdx + 1) + '/' + vocabDeck.length + '</span></div>' +
    '<div class="en">' + esc(w.en) + '</div>' +
    '<div class="pron">' + esc(w.pron) + '</div>' +
    (vocabFlipped
      ? '<div class="vi">' + esc(w.vi) + '</div><div class="fex">“' + esc(w.ex) + '”</div>'
      : '<div class="hint">Nhấn vào thẻ để xem nghĩa</div>') +
    '</div>' +
    '<div class="row" style="justify-content:center">' +
    '<button class="btn" id="vocabPrev">‹ Trước</button>' +
    '<button class="btn" id="vocabFlip">⟳ Lật thẻ</button>' +
    '<button class="btn" id="vocabNext">Tiếp ›</button></div>' +
    '<div class="row" style="justify-content:center">' +
    '<button class="btn play" data-say="' + esc(w.en) + '">▶ Nghe</button>' +
    '<button class="btn known ' + (known ? 'on' : '') + '" id="vocabKnownBtn">' + (known ? '✓ Đã thuộc' : '✓ Đã thuộc') + '</button></div>';
  const catTitle = vocabCat === 'all' ? 'Tất cả chủ đề' : (VOCAB.categories.find(c => c.id === vocabCat) || {}).title || '';
  $('#vocabKnownLine').textContent = vocabKnown.size + '/1000 từ đã thuộc · ' + catTitle;
  $('#vocabCard').onclick = () => { vocabFlipped = !vocabFlipped; renderVocabFlash(); };
  $('#vocabPrev').onclick = e => { e.stopPropagation(); vocabFlipped = false; vocabIdx = (vocabIdx - 1 + vocabDeck.length) % vocabDeck.length; renderVocabFlash(); };
  $('#vocabNext').onclick = e => { e.stopPropagation(); vocabFlipped = false; vocabIdx = (vocabIdx + 1) % vocabDeck.length; renderVocabFlash(); };
  $('#vocabFlip').onclick = e => { e.stopPropagation(); vocabFlipped = !vocabFlipped; renderVocabFlash(); };
  $('#vocabKnownBtn').onclick = e => {
    e.stopPropagation();
    if (vocabKnown.has(w.en)) vocabKnown.delete(w.en); else { vocabKnown.add(w.en); touchDay(); }
    save(LS.vocabKnown, [...vocabKnown]);
    renderVocabFlash();
  };
}
function setVocabTab(t) {
  vocabTab = t;
  $('#vocabTabFlash').classList.toggle('play', t === 'flash');
  $('#vocabTabList').classList.toggle('play', t === 'list');
  $('#vocabFlashWrap').style.display = t === 'flash' ? '' : 'none';
  $('#vocabListWrap').style.display = t === 'list' ? '' : 'none';
  if (t === 'flash') renderVocabFlash(); else renderVocab($('#vocabSearch').value);
}
RENDERERS.vocab = function () {
  const sel = $('#vocabCat');
  if (VOCAB && !sel.options.length) {
    sel.innerHTML = '<option value="all">Tất cả 10 chủ đề · 1000 từ</option>' + VOCAB.categories.map(c => '<option value="' + c.id + '">' + esc(c.title) + ' · ' + c.words.length + ' từ</option>').join('');
  }
  setVocabTab(vocabTab);
};

/* ---------- 5. Mẫu câu MC (danh sách + flashcard) ---------- */
function renderPhraseList() {
  const tid = $('#phraseTopic').value;
  const q = $('#phraseSearch').value.trim().toLowerCase();
  let list = allPhrases();
  if (tid !== 'all') list = list.filter(p => p.topicId === tid);
  if (q) list = list.filter(p => (p.en + ' ' + p.vi).toLowerCase().includes(q));
  $('#phraseList').innerHTML = list.length ? list.map(p => phraseCard(p, tid === 'all')).join('') :
    '<div class="card empty">Không có câu nào khớp bộ lọc.</div>';
}
function flashDeck() {
  const list = allPhrases();
  const pending = list.filter(p => !known.has(p.id));
  return pending.length ? pending : list;
}
function renderPhraseFlash() {
  const deck = flashDeck();
  const box = $('#phraseFlash');
  if (!deck.length) { box.innerHTML = '<div class="card empty">Chưa có câu nào để ôn.</div>'; return; }
  flashIdx = Math.min(flashIdx, deck.length - 1);
  const p = deck[flashIdx];
  box.innerHTML =
    '<p class="sub">Thẻ ' + (flashIdx + 1) + '/' + deck.length + ' · ' + esc(p.topic) + '</p>' +
    '<div class="card flash" id="flashCard">' +
    '<div class="en">' + esc(p.en) + '</div>' +
    (flashFlipped ? '<div class="vi">' + esc(p.vi) + '</div><div class="pron">' + esc(p.pron) + '</div>' : '<div class="hint">Bấm vào thẻ để xem nghĩa</div>') +
    '</div>' +
    '<div class="row" style="justify-content:center">' +
    '<button class="btn play" data-say="' + esc(p.en) + '" data-pid="' + p.id + '">▶ Nghe</button>' +
    '<button class="btn known" id="flashKnown">✓ Đã thuộc</button>' +
    '<button class="btn" id="flashNext">Câu tiếp →</button></div>' +
    '<p class="kbd" style="text-align:center">Mẹo: câu đã thuộc sẽ rời khỏi bộ ôn tập.</p>';
  $('#flashCard').onclick = () => { flashFlipped = !flashFlipped; renderPhraseFlash(); };
  $('#flashKnown').onclick = (e) => { e.stopPropagation(); markKnown(p.id); flashFlipped = false; flashIdx = Math.min(flashIdx, flashDeck().length - 1); renderPhraseFlash(); };
  $('#flashNext').onclick = (e) => { e.stopPropagation(); flashFlipped = false; flashIdx = (flashIdx + 1) % flashDeck().length; renderPhraseFlash(); };
}
function setPhraseMode(m) {
  phraseMode = m;
  $('#phraseModeList').classList.toggle('play', m === 'list');
  $('#phraseModeFlash').classList.toggle('play', m === 'flash');
  $('#phraseList').style.display = m === 'list' ? '' : 'none';
  $('#phraseFlash').style.display = m === 'flash' ? '' : 'none';
  if (m === 'flash') renderPhraseFlash(); else renderPhraseList();
}
RENDERERS.phrases = function () {
  const sel = $('#phraseTopic');
  if (!sel.options.length) {
    sel.innerHTML = '<option value="all">Tất cả chủ đề</option>' + CUR.topics.map(t => '<option value="' + t.id + '">' + t.emoji + ' ' + esc(t.title) + '</option>').join('');
  }
  setPhraseMode(phraseMode);
};

/* ---------- 6. Luyện nghe ---------- */
let listenQ = null, listenAnswered = false;
function newListenQ() {
  const list = allPhrases();
  const p = list[Math.floor(Math.random() * list.length)];
  const wrong = pickN(list.filter(x => x.id !== p.id), 3).map(x => x.vi);
  listenQ = { p, options: shuffle([p.vi].concat(wrong)) };
  listenAnswered = false;
  renderListenQ();
}
function renderListenQ() {
  const box = $('#listenBox');
  const s = listenStats;
  let h = '<div class="card"><p class="sub" style="margin:0 0 10px">Đã nghe đúng ' + s.correct + '/' + s.total + ' câu · đã nghe ' + listened.size + '/56 câu mẫu</p>';
  if (!listenQ) {
    h += '<p>Bấm “Nghe” để nghe câu tiếng Anh, rồi chọn đúng nghĩa tiếng Việt bên dưới.</p><div class="row"><button class="btn primary" id="listenStartBtn">🎧 Bắt đầu luyện nghe</button></div>';
  } else {
    h += '<div class="row"><button class="btn play" id="listenPlayBtn">▶ Nghe lại câu này</button>' +
      '<button class="btn" id="listenNextBtn">Câu tiếp theo →</button></div>' +
      '<div style="margin-top:12px">' + listenQ.options.map(o =>
        '<button class="opt" data-listen-opt="' + esc(o) + '">' + esc(o) + '</button>').join('') + '</div>' +
      '<p class="kbd" id="listenFeedback"></p>';
  }
  h += '</div>';
  box.innerHTML = h;
  const st = $('#listenStartBtn'); if (st) st.onclick = newListenQ;
  const pl = $('#listenPlayBtn'); if (pl) pl.onclick = () => { markListened(listenQ.p.id); speak(listenQ.p.en, false); };
  const nx = $('#listenNextBtn'); if (nx) nx.onclick = newListenQ;
  box.querySelectorAll('[data-listen-opt]').forEach(b => b.onclick = () => {
    if (listenAnswered) return;
    listenAnswered = true;
    listenStats.total++;
    const ok = b.dataset.listenOpt === listenQ.p.vi;
    if (ok) listenStats.correct++;
    save(LS.listen, listenStats);
    box.querySelectorAll('[data-listen-opt]').forEach(x => {
      x.disabled = true;
      if (x.dataset.listenOpt === listenQ.p.vi) x.classList.add('correct');
      else if (x === b) x.classList.add('wrong');
    });
    $('#listenFeedback').textContent = ok ? '✓ Đúng rồi! Câu này là: ' + listenQ.p.en : 'Chưa đúng. Câu đúng là: ' + listenQ.p.en;
    renderStats();
  });
}
RENDERERS.listening = function () { renderListenQ(); };

/* ---------- 7. Luyện nói (shadowing + thu âm) ---------- */
let speakPhrase = null, mediaRec = null, recChunks = [], recUrl = null, recStream = null, recState = 'idle', recSecs = 0, recTimer = null;
function renderSpeak() {
  const box = $('#speakBox');
  let h = '<div class="card"><div class="row" style="margin-top:0">' +
    '<button class="btn primary" id="speakNewBtn">🎲 Lấy câu ngẫu nhiên</button></div>';
  if (!speakPhrase) {
    h += '<p class="sub" style="margin:12px 0 0">Bấm “Lấy câu ngẫu nhiên” để bắt đầu. Bạn sẽ nghe mẫu, đọc theo và thu âm lại giọng của mình.</p>';
  } else {
    const p = speakPhrase;
    const rating = speakStats.ratings[p.id];
    h += '<div class="en" style="font-size:18px; font-weight:700; margin-top:12px">' + esc(p.en) + '</div>' +
      '<div class="vi" style="color:#555">' + esc(p.vi) + '</div>' +
      '<div class="pron" style="color:var(--gold); font-style:italic">🗣️ ' + esc(p.pron) + '</div>' +
      '<div class="row"><button class="btn play" data-say="' + esc(p.en) + '" data-pid="' + p.id + '">▶ Nghe mẫu</button>' +
      '<button class="btn" data-say-slow="' + esc(p.en) + '">🐢 Nghe chậm</button></div>';
    if (recState === 'idle') {
      h += '<div class="row"><button class="btn primary" id="recStartBtn">● Thu âm giọng của bạn</button>' +
        (hasSR() ? '<button class="btn primary" id="scoreBtn">✦ Chấm điểm tự động</button>' : '') + '</div>' +
        '<p class="kbd">Trình duyệt sẽ xin quyền dùng micro. Nếu bạn không cho phép, vẫn có thể nghe mẫu rồi tự chấm bên dưới.</p>' +
        (hasSR() ? '' : '<p class="kbd">Trình duyệt này không hỗ trợ chấm điểm tự động (cần dùng Chrome). Bạn vẫn thu âm và tự chấm như thường.</p>') +
        (scoreError ? '<p style="color:#dc2626; margin:8px 0 0">' + esc(scoreError) + '</p>' : '');
    } else if (recState === 'listening') {
      h += '<div class="row"><button class="btn danger" id="scoreStopBtn">■ Dừng chấm điểm</button></div>' +
        '<p class="kbd">Đang nghe… đọc to câu trên, rõ ràng như đang đứng trên sân khấu.</p>';
    } else if (recState === 'recording') {
      h += '<div class="row"><button class="btn danger" id="recStopBtn">■ Dừng thu âm (' + recSecs + 's)</button></div>' +
        '<p class="kbd">Đang thu… đọc to, rõ ràng như đang đứng trên sân khấu.</p>';
    } else if (recState === 'done') {
      h += '<p style="margin:12px 0 6px"><b>Bản thu của bạn:</b></p><audio controls src="' + recUrl + '" style="width:100%"></audio>' +
        '<div class="row"><button class="btn" id="recAgainBtn">↻ Thu lại</button></div>' +
        '<p style="margin:14px 0 6px"><b>Bạn tự chấm lần đọc này:</b></p><div class="row">' +
        '<button class="btn known ' + (rating === 'good' ? 'on' : '') + '" id="rateGoodBtn">✓ Đạt — rõ, có ngữ điệu</button>' +
        '<button class="btn review ' + (rating === 'retry' ? 'on' : '') + '" id="rateRetryBtn">↻ Chưa đạt — tập lại sau</button></div>';
    }
    if (autoResult && autoResult.phraseId === p.id) {
      h += '<div style="margin-top:14px"><b>Kết quả chấm điểm:</b></div>' +
        '<div style="font-size:18px; line-height:2; margin:8px 0">' + autoResult.words.map(w =>
          '<span style="background:' + (w.ok ? '#dcfce7' : '#fee2e2') + '; color:' + (w.ok ? '#15803d' : '#dc2626') + '; border-radius:6px; padding:2px 6px; margin:1px; display:inline-block">' + esc(w.word) + '</span>').join(' ') + '</div>' +
        '<p class="sub" style="margin:4px 0">Máy nghe được: “' + esc(autoResult.heard) + '”</p>' +
        '<p style="margin:6px 0"><b>' + autoResult.score + '/' + autoResult.total + ' từ đúng (' + autoResult.pct + '%) — ' + (autoResult.ok ? '✓ Đạt!' : 'Chưa đạt, tập lại nhé!') + '</b></p>' +
        '<p class="kbd">Chấm bằng nhận dạng giọng nói nên đôi khi máy nghe nhầm. Nếu bạn chắc mình đọc đúng mà vẫn bị tô đỏ, cứ bấm “✓ Đạt” bên dưới.</p>' +
        '<div class="row"><button class="btn" id="scoreAgainBtn">↻ Chấm lại</button></div>';
    }
    h += '<p class="kbd" style="margin-top:12px">Đã chấm ' + Object.keys(speakStats.ratings).length + ' câu · ' +
      Object.values(speakStats.ratings).filter(r => r === 'good').length + ' lượt Đạt</p>';
  }
  h += '</div>';
  box.innerHTML = h;
  const nb = $('#speakNewBtn'); if (nb) nb.onclick = () => { stopAudio(); const list = allPhrases(); speakPhrase = list[Math.floor(Math.random() * list.length)]; recState = 'idle'; recUrl = null; autoResult = null; scoreError = null; renderSpeak(); };
  const rs = $('#recStartBtn'); if (rs) rs.onclick = startRecording;
  const rp = $('#recStopBtn'); if (rp) rp.onclick = stopRecording;
  const ra = $('#recAgainBtn'); if (ra) ra.onclick = () => { recState = 'idle'; recUrl = null; renderSpeak(); };
  const rg = $('#rateGoodBtn'); if (rg) rg.onclick = () => rateSpeaking('good');
  const rr = $('#rateRetryBtn'); if (rr) rr.onclick = () => rateSpeaking('retry');
  const sb = $('#scoreBtn'); if (sb) sb.onclick = startScoring;
  const ss = $('#scoreStopBtn'); if (ss) ss.onclick = stopScoring;
  const sa = $('#scoreAgainBtn'); if (sa) sa.onclick = startScoring;
}
function rateSpeaking(v) {
  if (!speakPhrase) return;
  speakStats.ratings[speakPhrase.id] = v;
  speakStats.count++;
  save(LS.speak, speakStats);
  renderStats(); renderSpeak();
}
async function startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alert('Trình duyệt này không hỗ trợ thu âm. Bạn vẫn có thể nghe mẫu rồi tự chấm.'); return; }
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recChunks = [];
    mediaRec = new MediaRecorder(recStream);
    mediaRec.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
    mediaRec.onstop = () => {
      if (recStream) { recStream.getTracks().forEach(t => t.stop()); recStream = null; }
      const blob = new Blob(recChunks, { type: (mediaRec && mediaRec.mimeType) || 'audio/webm' });
      if (recUrl) URL.revokeObjectURL(recUrl);
      recUrl = URL.createObjectURL(blob);
      recState = 'done';
      renderSpeak();
    };
    mediaRec.start();
    recState = 'recording'; recSecs = 0;
    recTimer = setInterval(() => { recSecs++; const b = $('#recStopBtn'); if (b) b.textContent = '■ Dừng thu âm (' + recSecs + 's)'; }, 1000);
    renderSpeak();
  } catch (err) {
    alert('Không dùng được micro (' + (err.name || 'bị từ chối') + '). Bạn vẫn có thể nghe mẫu rồi đọc theo và tự chấm.');
  }
}
function stopRecording() {
  if (recTimer) { clearInterval(recTimer); recTimer = null; }
  if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop();
}
/* ---------- 7b. Chấm điểm tự động (SpeechRecognition, tô đỏ từ sai) ---------- */
let recog = null, autoResult = null, scoreError = null, scoreGotResult = false;
function hasSR() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
function normWords(t) { return t.toLowerCase().replace(/[^a-z0-9'\s]/g, '').split(/\s+/).filter(Boolean); }
function scoreWords(target, heard) {
  const t = normWords(target), h = normWords(heard);
  const n = t.length, m = h.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = t[i] === h[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const words = []; let i = 0, j = 0;
  while (i < n) {
    if (j < m && t[i] === h[j]) { words.push({ word: t[i], ok: true }); i++; j++; }
    else if (j < m && dp[i][j + 1] >= dp[i + 1][j]) { j++; }
    else { words.push({ word: t[i], ok: false }); i++; }
  }
  const matched = words.filter(w => w.ok).length;
  return { words, matched, total: n, heard: heard.trim() };
}
function startScoring() {
  if (!speakPhrase) return;
  if (!hasSR()) { scoreError = 'Trình duyệt này không hỗ trợ chấm điểm tự động. Bạn hãy dùng Chrome, hoặc thu âm rồi tự chấm.'; renderSpeak(); return; }
  try { stopAudio(); } catch (e) {}
  scoreError = null; autoResult = null; scoreGotResult = false;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recog = new SR();
  recog.lang = 'en-US'; recog.continuous = false; recog.interimResults = false; recog.maxAlternatives = 1;
  recog.onresult = e => {
    scoreGotResult = true;
    const heard = (e.results[0][0].transcript || '');
    const r = scoreWords(speakPhrase.en, heard);
    const pct = r.total ? Math.round(r.matched / r.total * 100) : 0;
    const ok = pct >= 80;
    autoResult = { phraseId: speakPhrase.id, words: r.words, heard: r.heard, score: r.matched, total: r.total, pct, ok };
    speakStats.ratings[speakPhrase.id] = ok ? 'good' : 'retry';
    speakStats.count++;
    speakStats.auto[speakPhrase.id] = { pct, heard: r.heard };
    save(LS.speak, speakStats);
    recState = 'idle'; recog = null;
    renderStats(); renderSpeak();
  };
  recog.onerror = e => {
    recState = 'idle'; recog = null;
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') scoreError = 'Bạn chưa cho phép dùng micro. Hãy cho phép micro rồi bấm chấm lại.';
    else if (e.error === 'no-speech') scoreError = 'Máy không nghe thấy bạn đọc. Thử lại, đọc to và rõ hơn nhé.';
    else if (e.error === 'network') scoreError = 'Chấm điểm cần mạng (nhận dạng giọng nói chạy trên máy chủ). Kiểm tra mạng rồi thử lại.';
    else if (e.error !== 'aborted') scoreError = 'Chưa chấm được (' + e.error + '). Thử lại nhé.';
    renderSpeak();
  };
  recog.onend = () => {
    if (recState !== 'listening') return;
    recog = null; recState = 'idle';
    if (!scoreGotResult && !scoreError) scoreError = 'Máy không nghe thấy bạn đọc. Thử lại, đọc to và rõ hơn nhé.';
    renderSpeak();
  };
  try { recog.start(); recState = 'listening'; renderSpeak(); }
  catch (err) { recog = null; scoreError = 'Chưa mở được micro để chấm điểm. Thử lại nhé.'; renderSpeak(); }
}
function stopScoring() { if (recog) { try { recog.stop(); } catch (e) {} } recState = 'idle'; recog = null; renderSpeak(); }
RENDERERS.speaking = function () { renderSpeak(); };

/* ---------- 8. Kho kịch bản ---------- */
RENDERERS.scripts = function () {
  const sel = $('#scriptTopic');
  if (!sel.options.length) {
    sel.innerHTML = '<option value="all">Tất cả chủ đề</option>' + CUR.topics.map(t => '<option value="' + t.id + '">' + t.emoji + ' ' + esc(t.title) + '</option>').join('');
  }
  renderScriptList();
};
function renderScriptList() {
  const tid = $('#scriptTopic').value;
  let list = allScenarios();
  if (tid !== 'all') list = list.filter(s => s.topicId === tid);
  $('#scriptList').innerHTML = list.map(s =>
    '<div class="scen"><span class="badge">' + esc(s.topic) + '</span><h4 style="margin-top:6px">' + esc(s.title) + '</h4>' +
    '<p class="sit">' + esc(s.situation) + '</p>' + scenarioLinesOnly(s) + '</div>'
  ).join('');
}
function scenarioLinesOnly(s) {
  let h = '';
  s.lines.forEach((ln, i) => {
    h += '<div class="sline"><span class="no">' + (i + 1) + '</span><div style="flex:1">' +
      '<div class="en">' + esc(ln.en) + '</div><div class="vi">' + esc(ln.vi) + '</div></div>' +
      '<button class="btn mini" data-say="' + esc(ln.en) + '">▶</button></div>';
  });
  const allEn = s.lines.map(l => l.en).join(' ');
  h += '<div class="row"><button class="btn play" data-say-all="' + esc(allEn) + '">▶ Đọc cả kịch bản</button></div>';
  return h;
}

/* ---------- 9. AI MC Coach ---------- */
const COACH_TIPS = {
  'khai-mac': ['Mở đầu bằng nụ cười và ánh mắt bao quát khán phòng trước khi nói câu đầu tiên.', 'Nói chậm hơn bình thường khoảng 20% trong 30 giây đầu — khán giả cần thời gian “bắt nhịp” giọng bạn.', 'Luôn có sẵn 1 câu dự phòng nếu chương trình bắt đầu trễ (xem kịch bản “Diễn giả đến trễ”).'],
  'dai-bieu': ['Đọc tên khách mời chậm, rõ từng âm — tên người là thứ họ nghe kỹ nhất.', 'Nhìn về phía khách mời khi giới thiệu họ, tay mở hướng về phía họ.', 'Đừng đọc chức danh quá dài: chọn chức danh quan trọng nhất rồi dừng lại.'],
  'khai-truong': ['Cao trào là lúc đếm ngược cắt băng — kéo cả khán phòng đếm cùng bạn.', 'Chuẩn bị trước phương án B cho kéo, nhạc và micro (xem kịch bản “Kéo cắt băng bị thất lạc”).', 'Chúc mừng chủ đầu tư bằng tên riêng — nghe chân thành hơn chúc chung chung.'],
  'gala': ['Giọng trầm, ấm và chậm hơn buổi sáng — gala là tiệc tối, không khí thư giãn.', 'Khi nâng ly: giơ ly cao, nhìn quanh, đợi mọi người cùng nâng rồi mới chúc.', 'Xen tiết mục văn nghệ giữa các phần phát biểu để khán phòng không mệt.'],
  'hoi-thao': ['Tóm tắt ý chính sau mỗi diễn giả bằng 1 câu ngắn — khán giả sẽ nhớ bạn vì điều đó.', 'Thông báo rõ luật hỏi đáp trước: giơ tay, chờ micro, hỏi ngắn gọn.', 'Có sẵn 2 câu hỏi “mồi” nếu phần hỏi đáp im lặng (xem kịch bản “Phần hỏi đáp không ai hỏi”).'],
  'chuyen-y': ['Câu chuyển ý chỉ cần 1 câu — đừng giải thích dài, khán giả sẽ mất nhịp.', 'Khi có sự cố, nói sự thật ngắn gọn rồi chuyển ngay sang phần tiếp theo, đừng xin lỗi quá 2 lần.', 'Chuẩn bị sẵn 1 tiết mục “lấp chỗ trống” (nhạc, video, trò chơi nhỏ).'],
  'dam-cuoi': ['Giọng nhẹ nhàng, lãng mạn — nói chậm lại ở những câu chúc phúc.', 'Gọi tên cô dâu chú rể thường xuyên, khán giả yêu khoảnh khắc đó.', 'Luôn có phương án khi cô dâu chú rể đến trễ: nhạc + mời khách dùng tiệc trước (xem kịch bản).']
};
const MISTAKES = [
  'Nói quá nhanh khi hồi hộp',
  'Quên giới thiệu tên mình ở đầu chương trình',
  'Đọc y nguyên kịch bản, không nhìn khán giả',
  'Không chuẩn bị câu xử lý khi có sự cố',
  'Âm lượng không đều, nuốt chữ cuối câu',
  'Kết thúc đột ngột, không cảm ơn khán giả'
];
RENDERERS.coach = function () {
  $('#coachTips').innerHTML = CUR.topics.map(t =>
    '<div class="card"><h3>' + t.emoji + ' ' + esc(t.title) + '</h3>' +
    (COACH_TIPS[t.id] || []).map(tip => '<div class="check" style="border:0; padding:4px 0">💡 <span>' + esc(tip) + '</span></div>').join('') + '</div>'
  ).join('');
  $('#mistakeList').innerHTML = MISTAKES.map((m, i) =>
    '<label class="check"><input type="checkbox" data-mistake="' + i + '"' + (mistakesDone.has(i) ? ' checked' : '') + '> <span>' + esc(m) + '</span></label>'
  ).join('') + '<p class="kbd" style="margin:8px 0 0">Đã khắc phục ' + mistakesDone.size + '/' + MISTAKES.length + ' lỗi.</p>';
  document.querySelectorAll('[data-mistake]').forEach(cb => cb.onchange = () => {
    const i = +cb.dataset.mistake;
    if (cb.checked) mistakesDone.add(i); else mistakesDone.delete(i);
    save(LS.mistakes, [...mistakesDone]);
    RENDERERS.coach();
  });
};

/* ---------- line builder (client-side substitute for server AI) ---------- */
const TEMPLATES = {
  open: [
    { en: 'Good {time}, ladies and gentlemen, and welcome to {name}!', vi: 'Xin chào {time}, thưa quý vị, và chào mừng quý vị đến với {name}!' },
    { en: 'It is my great pleasure to welcome you all to {name}.', vi: 'Thật vinh hạnh khi được chào đón tất cả quý vị đến với {name}.' }
  ],
  invite: [
    { en: 'Please join me in welcoming {name} to the stage!', vi: 'Xin mời quý vị cùng chào đón {name} lên sân khấu!' },
    { en: 'Ladies and gentlemen, please welcome {name} with a big round of applause!', vi: 'Thưa quý vị, xin mời chào đón {name} bằng một tràng pháo tay thật lớn!' }
  ],
  thanks: [
    { en: 'Thank you all for being part of {name}. Have a wonderful evening!', vi: 'Cảm ơn tất cả quý vị đã góp mặt trong {name}. Chúc quý vị một buổi tối tuyệt vời!' },
    { en: 'That brings {name} to a close. Thank you, and good night!', vi: '{name} xin được khép lại tại đây. Cảm ơn quý vị, và chúc ngủ ngon!' }
  ],
  transition: [
    { en: 'And now, let us move on to the next part of {name}.', vi: 'Và bây giờ, chúng ta cùng chuyển sang phần tiếp theo của {name}.' },
    { en: 'Thank you for that wonderful moment. Next, please enjoy the next part of {name}.', vi: 'Cảm ơn quý vị về khoảnh khắc tuyệt vời vừa rồi. Tiếp theo, xin mời quý vị thưởng thức phần tiếp theo của {name}.' }
  ]
};
function buildLine() {
  const ev = $('#bEvent').value, mo = $('#bMoment').value;
  const name = $('#bName').value.trim() || { 'khai-mac': 'this special occasion', 'dai-bieu': 'our guest of honour', 'khai-truong': 'the grand opening', 'gala': "tonight's gala dinner", 'hoi-thao': 'this seminar', 'dam-cuoi': 'this beautiful wedding' }[ev];
  const time = new Date().getHours() < 12 ? 'morning' : (new Date().getHours() < 18 ? 'afternoon' : 'evening');
  const t = TEMPLATES[mo][Math.floor(Math.random() * TEMPLATES[mo].length)];
  const en = t.en.replace('{name}', name).replace('{time}', time);
  const vi = t.vi.replace('{name}', $('#bName').value.trim() || 'chương trình hôm nay').replace('{time}', time === 'morning' ? 'buổi sáng' : (time === 'afternoon' ? 'buổi chiều' : 'buổi tối'));
  $('#builtResult').innerHTML = '<div class="card" style="margin:0">' +
    '<div class="en" style="font-weight:700; font-size:16px">' + esc(en) + '</div>' +
    '<div class="vi" style="color:#555; margin-top:4px">' + esc(vi) + '</div>' +
    '<div class="row"><button class="btn play" data-say="' + esc(en) + '">▶ Nghe</button>' +
    '<button class="btn" id="saveBuilt">＋ Lưu vào sổ tay</button></div></div>';
  $('#saveBuilt').onclick = () => { notes.unshift({ en, vi }); save(LS.notes, notes); renderStats(); alert('Đã lưu vào sổ tay!'); };
}

/* ---------- 10. Sân khấu ảo ---------- */
let stageScen = null, stageLineIdx = 0, stageStartTs = 0, stageTick = null;
function stageStatsText() {
  const m = Math.floor(stageStats.seconds / 60);
  return 'Đã tập ' + stageStats.count + ' buổi · tổng ' + m + ' phút trên sân khấu ảo.';
}
RENDERERS.stage = function () {
  const sel = $('#stageScenario');
  if (!sel.options.length) {
    sel.innerHTML = allScenarios().map(s => '<option value="' + s.id + '">' + s.topicEmoji + ' ' + esc(s.topic) + ' — ' + esc(s.title) + '</option>').join('');
  }
  $('#stageStats').textContent = stageStatsText();
};
function showStageLine() {
  const ln = stageScen.lines[stageLineIdx];
  $('#stageScenTitle').textContent = stageScen.topic + ' · ' + stageScen.title;
  $('#stageLineEn').textContent = ln.en;
  $('#stageLineVi').textContent = ln.vi;
  $('#stageLineNo').textContent = 'Câu ' + (stageLineIdx + 1) + '/' + stageScen.lines.length;
  $('#stageNextBtn').textContent = stageLineIdx + 1 >= stageScen.lines.length ? '✓ Đọc xong — kết thúc' : 'Câu tiếp theo →';
}
function startStage() {
  const id = $('#stageScenario').value;
  stageScen = allScenarios().find(s => s.id === id);
  if (!stageScen) return;
  stopAudio();
  stageLineIdx = 0;
  stageStartTs = Date.now();
  $('#stageOverlay').classList.add('on');
  showStageLine();
  if (stageTick) clearInterval(stageTick);
  stageTick = setInterval(() => {
    const s = Math.floor((Date.now() - stageStartTs) / 1000);
    $('#stageTimer').textContent = '⏱ ' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }, 1000);
}
function finishStage() {
  if (stageTick) { clearInterval(stageTick); stageTick = null; }
  const secs = Math.floor((Date.now() - stageStartTs) / 1000);
  stageStats.count++;
  stageStats.seconds += secs;
  save(LS.stage, stageStats);
  $('#stageOverlay').classList.remove('on');
  stopAudio();
  renderStats();
  $('#stageStats').textContent = stageStatsText();
  alert('Tập xong! Buổi này ' + Math.floor(secs / 60) + ' phút ' + (secs % 60) + ' giây. Tổng cộng bạn đã tập ' + stageStats.count + ' buổi.');
}

/* ---------- 11. Teleprompter ---------- */
let teleTimer = null, telePlaying = false;
function teleScriptLines() {
  const id = $('#teleScenario').value;
  const s = allScenarios().find(x => x.id === id);
  return s || allScenarios()[0];
}
function renderTeleText() {
  const s = teleScriptLines();
  const fs = $('#teleFont').value;
  $('#teleFontVal').textContent = fs + 'px';
  const box = $('#teleBox');
  box.style.fontSize = fs + 'px';
  box.innerHTML = '<p style="color:#ffd97a; font-weight:700">' + esc(s.topic) + ' — ' + esc(s.title) + '</p>' +
    '<p style="color:#8b96ad; font-size:14px">' + esc(s.situation) + '</p>' +
    s.lines.map(ln => '<p>' + esc(ln.en) + '<br><span style="color:#9aa5bd; font-size:.78em">' + esc(ln.vi) + '</span></p>').join('');
  box.scrollTop = 0;
}
function setTelePlaying(on) {
  telePlaying = on;
  $('#telePlayBtn').textContent = on ? '⏸ Tạm dừng' : '▶ Chạy chữ';
  if (teleTimer) { clearInterval(teleTimer); teleTimer = null; }
  if (on) {
    const speed = parseFloat($('#teleSpeed').value);
    teleTimer = setInterval(() => {
      const box = $('#teleBox');
      box.scrollTop += speed * 0.6;
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) setTelePlaying(false);
    }, 100);
  }
}
RENDERERS.tele = function () {
  const sel = $('#teleScenario');
  if (!sel.options.length) {
    sel.innerHTML = allScenarios().map(s => '<option value="' + s.id + '">' + s.topicEmoji + ' ' + esc(s.topic) + ' — ' + esc(s.title) + '</option>').join('');
  }
  renderTeleText();
};

/* ---------- 12. AI Script Studio ---------- */
function buildScript() {
  const ev = $('#stEvent').value;
  const name = $('#stName').value.trim() || { 'khai-mac': 'this special occasion', 'khai-truong': 'the grand opening', 'gala': "tonight's gala dinner", 'hoi-thao': 'this seminar', 'dam-cuoi': 'this beautiful wedding' }[ev];
  const guest = $('#stGuest').value.trim();
  const tone = $('#stTone').value;
  const topic = CUR.topics.find(t => t.id === ev) || CUR.topics[0];
  const pick = (arr, n) => pickN(arr, n);
  const toneOpen = tone === 'lively' ? 'Good {time}, ladies and gentlemen — are you ready? Welcome to {name}!' :
    tone === 'warm' ? 'Good {time}, everyone, and welcome to {name}. We are so glad you are here with us.' :
    'Good {time}, ladies and gentlemen, and welcome to {name}.';
  const sections = [];
  sections.push({ title: '🎤 Mở đầu', lines: [
    { en: toneOpen.replace('{name}', name).replace('{time}', new Date().getHours() < 12 ? 'morning' : (new Date().getHours() < 18 ? 'afternoon' : 'evening')), vi: 'Câu chào mở đầu — đọc chậm, cười tươi, nhìn khắp khán phòng.' },
    { en: pick(topic.phrases, 1)[0].en, vi: pick(topic.phrases, 1)[0].vi }
  ] });
  const inviteLines = [];
  if (guest) inviteLines.push({ en: 'Please join me in welcoming ' + guest + ' to the stage!', vi: 'Xin mời quý vị cùng chào đón ' + guest + ' lên sân khấu!' });
  inviteLines.push({ en: pick(CUR.topics.find(t => t.id === 'dai-bieu').phrases, 1)[0].en, vi: pick(CUR.topics.find(t => t.id === 'dai-bieu').phrases, 1)[0].vi });
  sections.push({ title: '👥 Giới thiệu khách mời', lines: inviteLines });
  sections.push({ title: '🔄 Chuyển ý', lines: [{ en: pick(CUR.topics.find(t => t.id === 'chuyen-y').phrases, 1)[0].en, vi: pick(CUR.topics.find(t => t.id === 'chuyen-y').phrases, 1)[0].vi }] });
  sections.push({ title: '👋 Kết thúc', lines: [
    { en: 'Thank you all for being part of ' + name + '. Have a wonderful ' + (new Date().getHours() < 18 ? 'day' : 'evening') + '!', vi: 'Cảm ơn tất cả quý vị đã góp mặt trong ' + ($('#stName').value.trim() || 'chương trình hôm nay') + '.' },
    { en: pick(CUR.topics.find(t => t.id === 'chuyen-y').phrases, 1)[0].en, vi: pick(CUR.topics.find(t => t.id === 'chuyen-y').phrases, 1)[0].vi }
  ] });
  let h = '';
  const allText = [];
  sections.forEach(sec => {
    h += '<div class="card"><h3>' + sec.title + '</h3>';
    sec.lines.forEach(ln => {
      allText.push(ln.en);
      h += '<div class="sline"><div style="flex:1"><div class="en">' + esc(ln.en) + '</div><div class="vi">' + esc(ln.vi) + '</div></div>' +
        '<button class="btn mini" data-say="' + esc(ln.en) + '">▶</button></div>';
    });
    h += '</div>';
  });
  h += '<div class="row"><button class="btn play" data-say-all="' + esc(allText.join(' ')) + '">▶ Nghe toàn bộ kịch bản</button>' +
    '<button class="btn primary" id="copyScriptBtn">📋 Sao chép toàn bộ kịch bản</button></div>';
  $('#studioResult').innerHTML = h;
  $('#copyScriptBtn').onclick = () => {
    const text = sections.map(sec => sec.title + '\n' + sec.lines.map(l => '- ' + l.en).join('\n')).join('\n\n');
    const done = () => alert('Đã sao chép kịch bản! Bạn dán vào ghi chú hoặc gửi cho mình để sửa tiếp nhé.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  };
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { alert('Không sao chép tự động được — bạn chụp màn hình lại giúp mình nhé.'); }
  document.body.removeChild(ta);
}

/* ---------- 13. Kiểm tra ---------- */
let quiz = null;
function startQuiz() {
  const mode = $('#quizMode').value;
  const list = allPhrases();
  const qs = [];
  pickN(list, 10).forEach(p => {
    if (mode === 'en-vi') {
      qs.push({ q: p.en, sub: 'Chọn nghĩa tiếng Việt đúng', options: shuffle([p.vi].concat(pickN(list.filter(x => x.id !== p.id), 3).map(x => x.vi))), answer: p.vi });
    } else if (mode === 'vi-en') {
      qs.push({ q: p.vi, sub: 'Chọn câu tiếng Anh đúng', options: shuffle([p.en].concat(pickN(list.filter(x => x.id !== p.id), 3).map(x => x.en))), answer: p.en });
    } else {
      const words = p.en.split(' ');
      const cand = words.map((w, i) => ({ w, i })).filter(x => x.w.replace(/[^A-Za-z']/g, '').length > 3);
      const pick = cand.length ? cand[Math.floor(Math.random() * cand.length)] : { w: words[0], i: 0 };
      const clean = pick.w.replace(/[^A-Za-z']/g, '');
      const masked = words.slice(); masked[pick.i] = '____';
      const distract = [];
      shuffle(list.filter(x => x.id !== p.id)).slice(0, 20).forEach(x => {
        x.en.split(' ').forEach(w => { const c = w.replace(/[^A-Za-z']/g, ''); if (c.length > 3 && c.toLowerCase() !== clean.toLowerCase() && !distract.includes(c)) distract.push(c); });
      });
      qs.push({ q: masked.join(' '), sub: 'Điền từ còn thiếu · Nghĩa câu: ' + p.vi, options: shuffle([clean].concat(distract.slice(0, 3))), answer: clean });
    }
  });
  quiz = { mode, qs, idx: 0, score: 0, answers: [] };
  renderQuizQ();
}
function renderQuizQ() {
  const box = $('#quizBox');
  if (!quiz) return;
  if (quiz.idx >= quiz.qs.length) { finishQuiz(); return; }
  const q = quiz.qs[quiz.idx];
  box.innerHTML = '<div class="card"><p class="sub">Câu ' + (quiz.idx + 1) + '/10 · Đúng ' + quiz.score + ' câu</p>' +
    '<div class="en" style="font-size:18px; font-weight:700">' + esc(q.q) + '</div>' +
    '<p class="sub" style="margin-top:6px">' + esc(q.sub) + '</p>' +
    q.options.map(o => '<button class="opt" data-quiz-opt="' + esc(o) + '">' + esc(o) + '</button>').join('') +
    '<p class="kbd" id="quizFeedback"></p>' +
    '<div class="row" id="quizNextRow" style="display:none"><button class="btn primary" id="quizNextBtn">' + (quiz.idx + 1 >= quiz.qs.length ? 'Xem kết quả' : 'Câu tiếp theo →') + '</button></div></div>';
  box.querySelectorAll('[data-quiz-opt]').forEach(b => b.onclick = () => {
    if (b.disabled) return;
    const ok = b.dataset.quizOpt === q.answer;
    if (ok) quiz.score++;
    quiz.answers.push({ q: q.q, answer: q.answer, picked: b.dataset.quizOpt, ok });
    box.querySelectorAll('[data-quiz-opt]').forEach(x => {
      x.disabled = true;
      if (x.dataset.quizOpt === q.answer) x.classList.add('correct');
      else if (x === b) x.classList.add('wrong');
    });
    $('#quizFeedback').textContent = ok ? '✓ Đúng rồi!' : 'Chưa đúng — đáp án đúng đã tô xanh.';
    $('#quizNextRow').style.display = '';
    $('#quizNextBtn').onclick = () => { quiz.idx++; renderQuizQ(); };
  });
}
function finishQuiz() {
  quizStats.best = Math.max(quizStats.best, quiz.score);
  quizStats.last = quiz.score;
  quizStats.correct += quiz.score;
  quizStats.total += quiz.qs.length;
  quizStats.rounds++;
  save(LS.quiz, quizStats);
  renderStats();
  const wrong = quiz.answers.filter(a => !a.ok);
  $('#quizBox').innerHTML = '<div class="card"><h3>🎉 Kết quả: ' + quiz.score + '/10 ' + (quiz.score >= 8 ? '— xuất sắc!' : quiz.score >= 5 ? '— khá tốt, ôn lại vài câu nhé.' : '— cố lên, ôn lại các câu dưới đây nhé.') + '</h3>' +
    '<p class="sub">Điểm cao nhất: ' + quizStats.best + '/10 · Tổng số câu đúng từ trước đến nay: ' + quizStats.correct + '/' + quizStats.total + '</p>' +
    (wrong.length ? '<h3>Câu cần ôn lại</h3>' + wrong.map(a => '<div class="sline"><div style="flex:1"><div class="en">' + esc(a.q) + '</div><div class="vi">Đáp án: ' + esc(a.answer) + ' · Bạn chọn: ' + esc(a.picked) + '</div></div></div>').join('') : '<p class="sub">Hoàn hảo — không sai câu nào!</p>') +
    '<div class="row"><button class="btn primary" id="quizAgainBtn">↻ Làm bài mới</button></div></div>';
  $('#quizAgainBtn').onclick = startQuiz;
  quiz = null;
}
RENDERERS.quiz = function () {
  $('#quizBestLine').textContent = quizStats.rounds ? 'Điểm cao nhất: ' + quizStats.best + '/10 · Lần gần nhất: ' + quizStats.last + '/10 · Đã làm ' + quizStats.rounds + ' lượt.' : 'Bạn chưa làm bài kiểm tra nào.';
};

/* ---------- 14. Tiến độ học ---------- */
RENDERERS.progress = function () {
  const total = allPhrases().length || 56;
  const s = skillData();
  const rated = Object.values(speakStats.ratings);
  const m = Math.floor(stageStats.seconds / 60);
  $('#progressBox').innerHTML =
    '<div class="card"><h3>🔥 Chuỗi ngày học: ' + streakCount() + ' ngày</h3><p class="sub" style="margin:0">Mở web và học mỗi ngày để giữ lửa. Hôm nay bạn ' + (days.includes(todayStr()) ? 'đã học rồi — tuyệt vời!' : 'chưa học — làm 1 câu mẫu ngay nhé!') + '</p></div>' +
    '<div class="card"><h3>✅ Từ vựng &amp; câu mẫu</h3>' +
    skillBar('Câu đã thuộc', s.vocab, known.size + '/' + total + ' câu') +
    skillBar('Câu cần ôn lại', Math.round(review.size / total * 100), review.size + ' câu đang chờ ôn') + '</div>' +
    '<div class="card"><h3>📚 Theo từng chủ đề</h3>' + CUR.topics.map(t => {
      const k = t.phrases.filter(p => known.has(p.id)).length;
      const pct = Math.round(k / t.phrases.length * 100);
      return '<div class="skill"><div class="lab"><span>' + t.emoji + ' ' + esc(t.title) + '</span><b>' + k + '/' + t.phrases.length + '</b></div><div class="bar"><i style="width:' + pct + '%"></i></div></div>';
    }).join('') + '</div>' +
    '<div class="card"><h3>🎧 Luyện nghe</h3><p class="sub" style="margin:0">Nghe đúng ' + listenStats.correct + '/' + listenStats.total + ' câu · Đã nghe ' + listened.size + '/' + total + ' câu mẫu</p></div>' +
    '<div class="card"><h3>🎙️ Luyện nói</h3><p class="sub" style="margin:0">Đã chấm ' + rated.length + ' câu · ' + rated.filter(r => r === 'good').length + ' lượt Đạt · Tổng ' + speakStats.count + ' lượt chấm</p></div>' +
    '<div class="card"><h3>📋 Kiểm tra</h3><p class="sub" style="margin:0">Điểm cao nhất ' + quizStats.best + '/10 · Lần gần nhất ' + quizStats.last + '/10 · Đúng ' + quizStats.correct + '/' + quizStats.total + ' câu · ' + quizStats.rounds + ' lượt làm bài</p></div>' +
    '<div class="card"><h3>🎪 Sân khấu ảo</h3><p class="sub" style="margin:0">Đã tập ' + stageStats.count + ' buổi · tổng ' + m + ' phút · Sổ tay: ' + notes.length + ' câu</p></div>';
};

/* ---------- overview renderer registration ---------- */
RENDERERS.overview = renderOverview;

/* ---------- global click delegation ---------- */
document.addEventListener('click', e => {
  const say = e.target.closest('[data-say]');
  if (say) { if (say.dataset.pid) markListened(say.dataset.pid); speak(say.dataset.say, false); return; }
  const slow = e.target.closest('[data-say-slow]');
  if (slow) { speak(slow.dataset.saySlow, true); return; }
  const all = e.target.closest('[data-say-all]');
  if (all) { speakLines([all.dataset.sayAll]); return; }
  const k = e.target.closest('[data-known]');
  if (k) { markKnown(k.dataset.known); return; }
  const r = e.target.closest('[data-review]');
  if (r) { markReview(r.dataset.review); return; }
  const tp = e.target.closest('[data-topic]');
  if (tp) { showView('courses'); renderTopicDetail(tp.dataset.topic); return; }
  const dn = e.target.closest('[data-delnote]');
  if (dn) { notes.splice(+dn.dataset.delnote, 1); save(LS.notes, notes); renderStats(); renderNotes(); return; }
});
document.querySelectorAll('#nav button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
$('#addNoteBtn').addEventListener('click', () => {
  const en = $('#noteEn').value.trim(), vi = $('#noteVi').value.trim();
  if (!en) { alert('Bạn nhập câu tiếng Anh trước nhé.'); return; }
  notes.unshift({ en, vi }); save(LS.notes, notes);
  $('#noteEn').value = ''; $('#noteVi').value = '';
  renderStats(); renderNotes();
});
$('#buildBtn').addEventListener('click', buildLine);
$('#vocabSearch').addEventListener('input', e => renderVocab(e.target.value));
$('#vocabCat').addEventListener('change', e => { vocabCat = e.target.value; vocabIdx = 0; vocabFlipped = false; vocabDeckBuild(); renderVocabFlash(); });
$('#vocabShuffle').addEventListener('click', () => { vocabDeck = shuffle(vocabDeck); vocabIdx = 0; vocabFlipped = false; renderVocabFlash(); });
$('#vocabTabFlash').addEventListener('click', () => setVocabTab('flash'));
$('#vocabTabList').addEventListener('click', () => setVocabTab('list'));
$('#phraseSearch').addEventListener('input', () => { if (phraseMode === 'list') renderPhraseList(); });
$('#phraseTopic').addEventListener('change', () => { if (phraseMode === 'list') renderPhraseList(); });
$('#phraseModeList').addEventListener('click', () => setPhraseMode('list'));
$('#phraseModeFlash').addEventListener('click', () => setPhraseMode('flash'));
$('#scriptTopic').addEventListener('change', renderScriptList);
$('#stageStartBtn').addEventListener('click', startStage);
$('#stageNextBtn').addEventListener('click', () => { if (stageLineIdx + 1 >= stageScen.lines.length) finishStage(); else { stageLineIdx++; showStageLine(); } });
$('#stageEndBtn').addEventListener('click', finishStage);
$('#teleSpeed').addEventListener('input', e => { $('#teleSpeedVal').textContent = parseFloat(e.target.value).toFixed(1) + '×'; });
$('#teleFont').addEventListener('input', () => renderTeleText());
$('#teleScenario').addEventListener('change', () => { setTelePlaying(false); renderTeleText(); });
$('#telePlayBtn').addEventListener('click', () => setTelePlaying(!telePlaying));
$('#teleListenBtn').addEventListener('click', () => { const s = teleScriptLines(); speakLines(s.lines.map(l => l.en)); });
$('#studioBtn').addEventListener('click', buildScript);
$('#quizStartBtn').addEventListener('click', startQuiz);

/* ---------- boot ---------- */
fetch('vocab.json').then(r => r.json()).then(data => {
  VOCAB = data;
  if (currentView === 'vocab') RENDERERS.vocab();
}).catch(() => { VOCAB = null; vocabFailed = true; if (currentView === 'vocab') RENDERERS.vocab(); });
fetch('curriculum.json').then(r => r.json()).then(data => {
  CUR = data;
  touchDay();
  renderStats();
  showView('overview');
}).catch(() => {
  document.querySelector('main').innerHTML = '<div class="card empty">Không tải được nội dung bài học (curriculum.json). Bạn tải lại trang giúp mình nhé.</div>';
});
