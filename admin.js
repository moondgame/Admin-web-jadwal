// admin.js — situs admin terpisah untuk mengelola data jadwal.
//
// Situs ini SENGAJA dipisah dari situs publik (jadwal-publik) dan tidak
// ditautkan dari sana. Keduanya "nyambung" lewat format data yang sama
// (jadwal.json), bukan lewat tautan langsung:
//   1. Admin login & mengedit jadwal di sini.
//   2. Admin klik "Unduh jadwal.json".
//   3. File itu diunggah/replace ke repo situs publik lalu di-commit.
//
// CATATAN KEAMANAN: password dicek di browser (dibandingkan sebagai hash
// SHA-256, bukan teks polos) — cukup untuk mencegah orang iseng, BUKAN
// keamanan kelas berat karena kode sumbernya publik di GitHub. Ganti
// password default lewat ADMIN_PASSWORD_HASH di bawah (lihat README).

const ADMIN_PASSWORD_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'; // = "admin123"
const SESSION_KEY = 'jadwal_admin_session';
const STORAGE_KEY = 'jadwal_admin_data';

const HARI_LIST = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const JURUSAN_INFO = {
  TI: { nama: 'Teknik Informatika', desk: 'Punya dua kelas paralel (A & B), atur jadwal per kelas.' },
  SI: { nama: 'Sistem Informasi', desk: 'Hanya satu kelas, langsung menuju pengaturan jadwalnya.' }
};

const ICON_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
const ICON_ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`;

let data = [];
let editingId = null;
let state = { jurusan: null, kelas: null };

const loginScreen = document.getElementById('loginScreen');
const adminScreen = document.getElementById('adminScreen');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

const boardMain = document.getElementById('boardMain');
const trailEl = document.getElementById('trail');
const backBtnSlot = document.getElementById('backBtnSlot');
const statusPill = document.getElementById('statusPill');
const importInput = document.getElementById('importInput');

// ---------------------------------------------------------------- login --

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = document.getElementById('passwordInput').value;
  const hash = await sha256(pw);
  if (hash === ADMIN_PASSWORD_HASH) {
    sessionStorage.setItem(SESSION_KEY, '1');
    loginError.textContent = '';
    enterAdmin();
  } else {
    loginError.textContent = 'Password salah. Coba lagi.';
  }
});

logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
});

async function enterAdmin() {
  loginScreen.style.display = 'none';
  adminScreen.style.display = 'block';
  await loadInitialData();
  render();
}

if (sessionStorage.getItem(SESSION_KEY) === '1') enterAdmin();

// ------------------------------------------------------------- data i/o --

async function loadInitialData() {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    data = JSON.parse(cached);
    return;
  }
  try {
    const res = await fetch('jadwal.json', { cache: 'no-store' });
    data = res.ok ? await res.json() : [];
  } catch {
    data = [];
  }
}

function persistLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function flashStatus(msg) {
  statusPill.textContent = msg;
  setTimeout(() => { if (statusPill.textContent === msg) statusPill.textContent = ''; }, 3500);
}

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'jadwal.json';
  a.click();
  URL.revokeObjectURL(url);
  flashStatus('jadwal.json diunduh — unggah ke repo situs publik untuk mempublikasikan.');
});

importInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) throw new Error('format tidak sesuai');
      data = parsed;
      persistLocal();
      render();
      flashStatus('Data berhasil diimpor.');
    } catch {
      alert('File JSON tidak valid.');
    }
  };
  reader.readAsText(file);
  importInput.value = '';
});

// ------------------------------------------------------------ navigasi --

function setState(next) {
  state = { ...state, ...next };
  editingId = null;
  render();
}

function goBack() {
  if (state.jurusan === 'TI' && state.kelas) {
    setState({ kelas: null });
  } else if (state.jurusan) {
    setState({ jurusan: null, kelas: null });
  }
}

function renderTrail() {
  const parts = [];
  parts.push(state.jurusan
    ? `<button data-action="root">Kelola Jadwal</button>`
    : `<span class="trail__current">Kelola Jadwal</span>`);

  if (state.jurusan) {
    const nama = JURUSAN_INFO[state.jurusan].nama;
    if (state.jurusan === 'TI' && state.kelas) {
      parts.push(`<span class="sep">/</span>`);
      parts.push(`<button data-action="jurusan">${nama}</button>`);
      parts.push(`<span class="sep">/</span>`);
      parts.push(`<span class="trail__current">Kelas ${state.kelas}</span>`);
    } else {
      parts.push(`<span class="sep">/</span>`);
      parts.push(`<span class="trail__current">${nama}</span>`);
    }
  }
  trailEl.innerHTML = parts.join('');

  trailEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'root') setState({ jurusan: null, kelas: null });
      if (btn.dataset.action === 'jurusan') setState({ kelas: null });
    });
  });

  if (state.jurusan) {
    backBtnSlot.innerHTML = `<button class="btn-back" id="backBtn">${ICON_BACK} Kembali</button>`;
    document.getElementById('backBtn').addEventListener('click', goBack);
  } else {
    backBtnSlot.innerHTML = '';
  }
}

// -------------------------------------------------------------- layar --

function renderJurusanChoice() {
  boardMain.innerHTML = `
    <div class="choice-grid">
      <button class="choice-card" data-jurusan="TI">
        <div class="choice-card__top">
          <h3>Teknik Informatika</h3>
          <span class="choice-card__arrow">${ICON_ARROW}</span>
        </div>
        <p>${JURUSAN_INFO.TI.desk}</p>
      </button>
      <button class="choice-card" data-jurusan="SI">
        <div class="choice-card__top">
          <h3>Sistem Informasi</h3>
          <span class="choice-card__arrow">${ICON_ARROW}</span>
        </div>
        <p>${JURUSAN_INFO.SI.desk}</p>
      </button>
    </div>`;

  boardMain.querySelectorAll('[data-jurusan]').forEach(card => {
    card.addEventListener('click', () => setState({ jurusan: card.dataset.jurusan, kelas: null }));
  });
}

function renderKelasChoice() {
  boardMain.innerHTML = `
    <div class="choice-grid">
      <button class="choice-card" data-kelas="A">
        <div class="choice-card__top">
          <h3>Kelas TI A</h3>
          <span class="choice-card__arrow">${ICON_ARROW}</span>
        </div>
        <p>Atur jadwal kuliah kelas A.</p>
      </button>
      <button class="choice-card" data-kelas="B">
        <div class="choice-card__top">
          <h3>Kelas TI B</h3>
          <span class="choice-card__arrow">${ICON_ARROW}</span>
        </div>
        <p>Atur jadwal kuliah kelas B.</p>
      </button>
    </div>`;

  boardMain.querySelectorAll('[data-kelas]').forEach(card => {
    card.addEventListener('click', () => setState({ kelas: card.dataset.kelas }));
  });
}

function segmentLabel() {
  if (state.jurusan === 'TI') return `Teknik Informatika — Kelas ${state.kelas}`;
  return 'Sistem Informasi';
}

function segmentRows() {
  return data.filter(item => {
    if (item.jurusan !== state.jurusan) return false;
    if (state.jurusan === 'TI') return item.kelas === state.kelas;
    return true;
  });
}

function renderPanel() {
  const rows = segmentRows().sort((a, b) =>
    HARI_LIST.indexOf(a.hari) - HARI_LIST.indexOf(b.hari) || a.jamMulai.localeCompare(b.jamMulai)
  );

  boardMain.innerHTML = `
    <div class="segment-banner">
      <span class="dot"></span>
      <div>
        <strong>${segmentLabel()}</strong><br>
        <span>Perubahan di sini hanya berlaku untuk segmen ini.</span>
      </div>
    </div>

    <section class="panel">
      <h2 id="formTitle">Tambah Jadwal</h2>
      <form id="entryForm">
        <div class="form-grid">
          <div class="field">
            <label for="f_matkul">Mata Kuliah</label>
            <input type="text" id="f_matkul" required placeholder="cth. Struktur Data">
          </div>
          <div class="field">
            <label for="f_dosen">Dosen Pengampu</label>
            <input type="text" id="f_dosen" required placeholder="cth. Dr. Andi Prasetyo">
          </div>
          <div class="field">
            <label for="f_ruangan">Ruangan</label>
            <input type="text" id="f_ruangan" required placeholder="cth. Lab TI 1">
          </div>
          <div class="field">
            <label for="f_hari">Hari</label>
            <select id="f_hari" required>
              ${HARI_LIST.map(h => `<option>${h}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="f_jamMulai">Jam Mulai</label>
            <input type="time" id="f_jamMulai" required>
          </div>
          <div class="field">
            <label for="f_jamSelesai">Jam Selesai</label>
            <input type="time" id="f_jamSelesai" required>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn--primary">Simpan Jadwal</button>
          <button type="button" id="cancelEditBtn" class="btn btn--ghost" style="display:none;">Batal Ubah</button>
        </div>
      </form>
    </section>

    <section class="panel">
      <h2>Daftar Jadwal — ${segmentLabel()}</h2>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Mata Kuliah</th><th>Dosen</th><th>Ruangan</th><th>Waktu</th><th>Aksi</th></tr>
          </thead>
          <tbody id="dataTableBody"></tbody>
        </table>
      </div>
    </section>`;

  document.getElementById('entryForm').addEventListener('submit', onSubmitEntry);
  document.getElementById('cancelEditBtn').addEventListener('click', resetForm);
  renderTable(rows);
}

function onSubmitEntry(e) {
  e.preventDefault();
  const entry = {
    id: editingId || String(Date.now()),
    jurusan: state.jurusan,
    kelas: state.jurusan === 'TI' ? state.kelas : null,
    mataKuliah: document.getElementById('f_matkul').value.trim(),
    dosen: document.getElementById('f_dosen').value.trim(),
    ruangan: document.getElementById('f_ruangan').value.trim(),
    hari: document.getElementById('f_hari').value,
    jamMulai: document.getElementById('f_jamMulai').value,
    jamSelesai: document.getElementById('f_jamSelesai').value,
  };

  if (editingId) {
    data = data.map(d => (d.id === editingId ? entry : d));
  } else {
    data.push(entry);
  }

  persistLocal();
  resetForm();
  renderTable(segmentRows().sort((a, b) =>
    HARI_LIST.indexOf(a.hari) - HARI_LIST.indexOf(b.hari) || a.jamMulai.localeCompare(b.jamMulai)
  ));
}

function resetForm() {
  editingId = null;
  const form = document.getElementById('entryForm');
  if (form) form.reset();
  const title = document.getElementById('formTitle');
  const cancelBtn = document.getElementById('cancelEditBtn');
  if (title) title.textContent = 'Tambah Jadwal';
  if (cancelBtn) cancelBtn.style.display = 'none';
}

function startEdit(id) {
  const item = data.find(d => d.id === id);
  if (!item) return;
  editingId = id;
  document.getElementById('f_matkul').value = item.mataKuliah;
  document.getElementById('f_dosen').value = item.dosen;
  document.getElementById('f_ruangan').value = item.ruangan;
  document.getElementById('f_hari').value = item.hari;
  document.getElementById('f_jamMulai').value = item.jamMulai;
  document.getElementById('f_jamSelesai').value = item.jamSelesai;
  document.getElementById('formTitle').textContent = 'Ubah Jadwal';
  document.getElementById('cancelEditBtn').style.display = 'inline-flex';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteEntry(id) {
  if (!confirm('Hapus jadwal ini?')) return;
  data = data.filter(d => d.id !== id);
  persistLocal();
  renderTable(segmentRows().sort((a, b) =>
    HARI_LIST.indexOf(a.hari) - HARI_LIST.indexOf(b.hari) || a.jamMulai.localeCompare(b.jamMulai)
  ));
}

function renderTable(rows) {
  const body = document.getElementById('dataTableBody');
  if (!body) return;
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="5" style="color:var(--paper-dim);">Belum ada jadwal di segmen ini.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(item => `
    <tr>
      <td>${escapeHtml(item.mataKuliah)}</td>
      <td>${escapeHtml(item.dosen)}</td>
      <td>${escapeHtml(item.ruangan)}</td>
      <td>${item.hari}, ${item.jamMulai}–${item.jamSelesai}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn--ghost btn--small" data-edit="${item.id}">Ubah</button>
          <button class="btn btn--danger btn--small" data-delete="${item.id}">Hapus</button>
        </div>
      </td>
    </tr>`).join('');

  body.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => startEdit(btn.dataset.edit)));
  body.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () => deleteEntry(btn.dataset.delete)));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------------------------------------------------------------- render --

function render() {
  document.body.classList.remove('theme-ti', 'theme-si');
  if (state.jurusan === 'TI') document.body.classList.add('theme-ti');
  if (state.jurusan === 'SI') document.body.classList.add('theme-si');

  renderTrail();

  if (!state.jurusan) {
    renderJurusanChoice();
  } else if (state.jurusan === 'TI' && !state.kelas) {
    renderKelasChoice();
  } else {
    renderPanel();
  }

  boardMain.classList.remove('screen-in');
  void boardMain.offsetWidth;
  boardMain.classList.add('screen-in');
}
