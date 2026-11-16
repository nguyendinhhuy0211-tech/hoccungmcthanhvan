/* Học cùng MC Thanh Vân — static app, progress in localStorage, voice via Google TTS (device voice fallback) */
const LS = { known: 'mc_known_v1', review: 'mc_review_v1', days: 'mc_days_v1', notes: 'mc_notes_v1' };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
let known = new Set(load(LS.known, []));
let review = new Set(load(LS.review, []));
let days = load(LS.days, []);
let notes = load(LS.notes, []);
let CUR = null;
let currentTopic = null, flashIdx = 0, flashFlipped = false;

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
function stopAudio() {
  if (player) { try { player.onended = null; player.onerror = null; player.onplaying = null; player.pause(); player.removeAttribute('src'); player.load(); } catch (e) {} player = null; }
  if (playTimer) { clearTimeout(playTimer); playTimer = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  playingKey = null;
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
  speakGoogleChunks(splitChunks(text), 0, null);
}
function speakLines(lines, i) {
  i = i || 0;
  if (i >= lines.length) return;
  const text = lines.slice(i).join(' ');
  if (playingKey === text) { stopAudio(); return; }
  stopAudio();
  playingKey = text;
  speakGoogleChunks(splitChunks(text), 0, null);
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
function markKnown(id) { known.add(id); review.delete(id); touchDay(); persist(); }
function markReview(id) { review.add(id); known.delete(id); persist(); }
function persist() { save(LS.known, [...known]); save(LS.review, [...review]); renderStats(); }
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
    '<button class="btn play" data-say="' + esc(p.en) + '">▶ Nghe</button>' +
    '<button class="btn" data-say-slow="' + esc(p.en) + '">🐢 Nghe chậm</button>' +
    markBtns(p.id) +
    '</div></div>';
}
function renderStats() {
  const total = allPhrases().length || 56;
  $('#totalCount').textContent = total;
  $('#knownCount').textContent = known.size;
  $('#streak').textContent = streakCount();
  $('#noteCount').textContent = notes.length;
  $('#progressBar').style.width = Math.round(known.size / total * 100) + '%';
}

/* ---------- views ---------- */
function showView(v) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  document.querySelectorAll('section.view').forEach(s => s.classList.toggle('on', s.id === 'view-' + v));
  if (v === 'topics') renderTopicList();
  if (v === 'review') renderFlash();
  if (v === 'notes') renderNotes();
}
function renderDaily() {
  const list = allPhrases();
  const dayNo = Math.floor(Date.now() / 86400000);
  const p = list[dayNo % list.length];
  $('#dailyCard').innerHTML = phraseCard(p, true);
  const rl = list.filter(x => review.has(x.id));
  $('#reviewList').innerHTML = rl.length ? rl.map(x => phraseCard(x, true)).join('') :
    '<div class="card empty">Chưa có câu nào cần ôn lại. Khi gặp câu khó, bấm “Ôn lại sau” nhé.</div>';
}
function renderTopicList() {
  $('#topicDetail').style.display = 'none';
  $('#topicList').style.display = '';
  $('#topicList').innerHTML = CUR.topics.map(t => {
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
  $('#topicList').style.display = 'none';
  const d = $('#topicDetail');
  d.style.display = '';
  let h = '<button class="back" id="backBtn">← Tất cả chủ đề</button>' +
    '<h2>' + t.emoji + ' ' + esc(t.title) + '</h2><p class="sub">' + esc(t.desc) + '</p>' +
    '<h2 style="font-size:16px">💬 Câu mẫu</h2>' + t.phrases.map(p => phraseCard(p, false)).join('') +
    '<h2 style="font-size:16px; margin-top:20px">🎭 Kịch bản tình huống</h2>';
  t.scenarios.forEach(s => {
    h += '<div class="scen"><h4>' + esc(s.title) + '</h4><p class="sit">' + esc(s.situation) + '</p>';
    s.lines.forEach((ln, i) => {
      h += '<div class="sline"><span class="no">' + (i + 1) + '</span><div style="flex:1">' +
        '<div class="en">' + esc(ln.en) + '</div><div class="vi">' + esc(ln.vi) + '</div></div>' +
        '<button class="btn mini" data-say="' + esc(ln.en) + '">▶</button></div>';
    });
    const allEn = s.lines.map(l => l.en).join(' ');
    h += '<div class="row"><button class="btn play" data-say-all="' + esc(allEn) + '">▶ Đọc cả kịch bản</button></div></div>';
  });
  d.innerHTML = h;
  $('#backBtn').onclick = renderTopicList;
}

/* ---------- flashcards ---------- */
function flashDeck() {
  const list = allPhrases();
  const pending = list.filter(p => !known.has(p.id));
  return pending.length ? pending : list;
}
function renderFlash() {
  const deck = flashDeck();
  if (!deck.length) { $('#flashWrap').innerHTML = '<div class="card empty">Chưa có câu nào để ôn.</div>'; return; }
  flashIdx = Math.min(flashIdx, deck.length - 1);
  const p = deck[flashIdx];
  $('#flashWrap').innerHTML =
    '<p class="sub">Thẻ ' + (flashIdx + 1) + '/' + deck.length + ' · ' + esc(p.topic) + '</p>' +
    '<div class="card flash" id="flashCard">' +
    '<div class="en">' + esc(p.en) + '</div>' +
    (flashFlipped ? '<div class="vi">' + esc(p.vi) + '</div><div class="pron">' + esc(p.pron) + '</div>' : '<div class="hint">Bấm vào thẻ để xem nghĩa</div>') +
    '</div>' +
    '<div class="row" style="justify-content:center">' +
    '<button class="btn play" data-say="' + esc(p.en) + '">▶ Nghe</button>' +
    '<button class="btn known" id="flashKnown">✓ Đã thuộc</button>' +
    '<button class="btn" id="flashNext">Câu tiếp →</button></div>' +
    '<p class="kbd" style="text-align:center">Mẹo: câu đã thuộc sẽ rời khỏi bộ ôn tập.</p>';
  $('#flashCard').onclick = () => { flashFlipped = !flashFlipped; renderFlash(); };
  $('#flashKnown').onclick = (e) => { e.stopPropagation(); markKnown(p.id); flashFlipped = false; flashIdx = Math.min(flashIdx, flashDeck().length - 1); renderFlash(); };
  $('#flashNext').onclick = (e) => { e.stopPropagation(); flashFlipped = false; flashIdx = (flashIdx + 1) % flashDeck().length; renderFlash(); };
}

/* ---------- notebook ---------- */
function renderNotes() {
  $('#noteList').innerHTML = notes.length ? notes.map((n, i) =>
    '<div class="card note-item"><div class="txt"><div class="en">' + esc(n.en) + '</div>' +
    (n.vi ? '<div class="vi">' + esc(n.vi) + '</div>' : '') + '</div>' +
    '<button class="btn" data-say="' + esc(n.en) + '">▶</button>' +
    '<button class="btn ghost" data-delnote="' + i + '">🗑️</button></div>'
  ).join('') : '<div class="card empty">Sổ tay còn trống — lưu câu đầu tiên của bạn ở trên nhé.</div>';
}

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

/* ---------- search ---------- */
function doSearch(q) {
  q = q.trim().toLowerCase();
  const box = $('#searchResults');
  if (!q) { box.innerHTML = ''; return; }
  const hits = allPhrases().filter(p => (p.en + ' ' + p.vi + ' ' + p.topic).toLowerCase().includes(q)).slice(0, 10);
  box.innerHTML = hits.length ? hits.map(p => phraseCard(p, true)).join('') :
    '<div class="card empty">Không tìm thấy câu nào khớp “' + esc(q) + '”.</div>';
}

/* ---------- global click delegation ---------- */
document.addEventListener('click', e => {
  const say = e.target.closest('[data-say]');
  if (say) { speak(say.dataset.say, false); return; }
  const slow = e.target.closest('[data-say-slow]');
  if (slow) { speak(slow.dataset.saySlow, true); return; }
  const all = e.target.closest('[data-say-all]');
  if (all) { speakLines([all.dataset.sayAll]); return; }
  const k = e.target.closest('[data-known]');
  if (k) { markKnown(k.dataset.known); if (currentTopic) renderTopicDetail(currentTopic); else { renderDaily(); renderTopicList(); } return; }
  const r = e.target.closest('[data-review]');
  if (r) { markReview(r.dataset.review); if (currentTopic) renderTopicDetail(currentTopic); else { renderDaily(); renderTopicList(); } return; }
  const tp = e.target.closest('[data-topic]');
  if (tp) { renderTopicDetail(tp.dataset.topic); return; }
  const dn = e.target.closest('[data-delnote]');
  if (dn) { notes.splice(+dn.dataset.delnote, 1); save(LS.notes, notes); renderStats(); renderNotes(); return; }
});
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
$('#addNoteBtn').addEventListener('click', () => {
  const en = $('#noteEn').value.trim(), vi = $('#noteVi').value.trim();
  if (!en) { alert('Bạn nhập câu tiếng Anh trước nhé.'); return; }
  notes.unshift({ en, vi }); save(LS.notes, notes);
  $('#noteEn').value = ''; $('#noteVi').value = '';
  renderStats(); renderNotes();
});
$('#buildBtn').addEventListener('click', buildLine);
$('#searchInput').addEventListener('input', e => doSearch(e.target.value));

/* ---------- boot ---------- */
fetch('curriculum.json').then(r => r.json()).then(data => {
  CUR = data;
  touchDay();
  renderStats(); renderDaily(); renderTopicList();
}).catch(() => {
  document.querySelector('main').innerHTML = '<div class="card empty">Không tải được nội dung bài học (curriculum.json). Bạn tải lại trang giúp mình nhé.</div>';
});
