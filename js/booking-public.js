// =====================================================================
// FRDR Garage — Public Portal Script (Landing Page & Booking Online)
// File: js/booking-public.js
// =====================================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyArvWKgTasNsqbtA_9JOJWv6CPvKVOQfhU",
  authDomain: "kasir-bengkel-b1265.firebaseapp.com",
  projectId: "kasir-bengkel-b1265",
  storageBucket: "kasir-bengkel-b1265.firebasestorage.app",
  messagingSenderId: "965227241284",
  appId: "1:965227241284:web:c9d0bbd99353f719724111"
};

let db = null;
let shopInfo = {
  name: 'FRDR Garage',
  phone: '08123456789',
  address: 'Bengkel Motor',
  telegramBotToken: '',
  telegramChatId: '',
  bookingPortalUrl: ''
};
let availableDates = [];

// Helper Format Tanggal Indonesia
const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function formatIndonesianDate(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const dayName = DAYS_ID[d.getDay()];
  const day = d.getDate();
  const monthName = MONTHS_ID[d.getMonth()];
  const year = d.getFullYear();
  return `${dayName}, ${day} ${monthName} ${year}`;
}

function formatIndonesianDateTime(timestamp) {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  const dayName = DAYS_ID[d.getDay()];
  const day = d.getDate();
  const monthName = MONTHS_ID[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${dayName}, ${day} ${monthName} ${year} ${hours}:${mins} WIB`;
}

function formatRupiah(num) {
  const n = parseFloat(num) || 0;
  return 'Rp ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function getTodayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function cleanPhoneNumber(phone) {
  let p = String(phone || '').replace(/[^0-9]/g, '');
  if (p.startsWith('0')) {
    p = '62' + p.substring(1);
  } else if (!p.startsWith('62') && p.length > 7) {
    p = '62' + p;
  }
  return p;
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// Inisialisasi Firebase & Public Portal
async function initPublicPortal() {
  try {
    if (typeof firebase !== 'undefined') {
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      db.settings({ experimentalAutoDetectLongPolling: true, useFetchStreams: false });

      // Autentikasi anonim untuk akses baca/tulis publik aman
      try {
        await firebase.auth().signInAnonymously();
      } catch (authErr) {
        console.warn('Auth anonim:', authErr);
      }

      // Ambil Info Toko (Nama, Alamat, Kontak, Telegram)
      loadShopInfo();

      // Dengarkan jadwal tanggal buka secara real-time
      listenBookingSchedule();

      // Periksa Deep-Link URL parameters
      handleUrlParameters();
    }
  } catch (err) {
    console.error('Inisialisasi Firebase gagal:', err);
  }

  // Bersihkan tampilan URL di browser (hilangkan /index.html atau /booking.html jika diakses via HTTP/HTTPS)
  try {
    if (window.location.protocol.startsWith('http') && window.history && window.history.replaceState) {
      const cleanPath = window.location.pathname.replace(/\/(index|booking)\.html$/i, '/');
      if (cleanPath !== window.location.pathname) {
        window.history.replaceState(null, '', cleanPath + window.location.search + window.location.hash);
      }
    }
  } catch (e) {}

  // Inisialisasi Tema (Dark / Light)
  initTheme();

  // Setup auto-formatting & event listeners
  setupInputListeners();
}

// =====================================================================
// DEEP-LINK URL PARAMETERS (?booking=..., ?confirmBooking=..., ?code=...)
// =====================================================================
function handleUrlParameters() {
  const urlParams = new URLSearchParams(window.location.search);

  // 1. Parameter Cetak Remote Telegram (?remotePrint=...&code=...&id=...)
  const remotePrintType = urlParams.get('remotePrint');
  if (remotePrintType) {
    const printCode = urlParams.get('code');
    const printId = urlParams.get('id');
    handleTelegramRemotePrint(remotePrintType, printCode, printId);
    return;
  }

  // 2. Parameter Konfirmasi Telegram Bot Owner
  const confirmBookingId = urlParams.get('confirmBooking');
  const confirmBookingCode = urlParams.get('code');
  if (confirmBookingId || confirmBookingCode) {
    handleTelegramDirectConfirm(confirmBookingId, confirmBookingCode);
    return;
  }

  // 2. Parameter Booking Langsung (?booking=1)
  if (urlParams.get('booking')) {
    const bookingSec = document.getElementById('booking');
    if (bookingSec) {
      setTimeout(() => {
        bookingSec.scrollIntoView({ behavior: 'smooth' });
      }, 400);
    }
  }
}

// =====================================================================
// KARTU HASIL CEK TIKET RESERVASI BOOKING
// =====================================================================

function renderBookingTicketCard(b) {
  let statusLabel = 'Menunggu Konfirmasi';
  let statusClass = 'status-menunggu';
  if (b.status === 'dikonfirmasi') {
    statusLabel = 'Dikonfirmasi Bengkel';
    statusClass = 'status-dikonfirmasi';
  } else if (b.status === 'masuk_servis') {
    statusLabel = 'Sudah Masuk Bengkel';
    statusClass = 'status-masuk_servis';
  } else if (b.status === 'batal') {
    statusLabel = 'Reservasi Dibatalkan';
    statusClass = 'status-batal';
  }

  const isHome = b.bookingType === 'home_service';
  const serviceBadge = isHome 
    ? '<span style="color:var(--primary-on-dark); font-weight:600; background:rgba(41,151,255,0.12); border:1px solid rgba(41,151,255,0.3); padding:2px 10px; border-radius:9999px; font-size:11.5px;">Home Service</span>' 
    : '<span style="color:var(--text-white); font-weight:400;">Servis di Bengkel</span>';

  return `
    <div class="ticket-container" style="margin-bottom:18px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <span class="ticket-badge-status ${statusClass}">${statusLabel}</span>
        <span style="font-size:12px; color:var(--text-muted);">${formatIndonesianDate(b.bookingDate)}</span>
      </div>
      <div class="ticket-code">${escapeHtml(b.code || '')}</div>
      <div class="ticket-row"><span class="ticket-label">Layanan:</span><span class="ticket-val">${serviceBadge}</span></div>
      ${isHome && b.customerAddress ? `<div class="ticket-row"><span class="ticket-label">Alamat:</span><span class="ticket-val" style="font-size:12px;">${escapeHtml(b.customerAddress)}</span></div>` : ''}
      <div class="ticket-row"><span class="ticket-label">Jam Tiba / Kunjungan:</span><span class="ticket-val" style="color:var(--primary-on-dark); font-weight:700;">${escapeHtml(b.bookingTime ? b.bookingTime + ' WIB' : '10:00 WIB')}</span></div>
      <div class="ticket-row"><span class="ticket-label">Kendaraan:</span><span class="ticket-val">${escapeHtml(b.vehicleModel || '-')} (${escapeHtml(b.vehiclePlate || '-')})</span></div>
      <div class="ticket-row"><span class="ticket-label">Pemesan:</span><span class="ticket-val">${escapeHtml(b.customerName || '-')}</span></div>
      <div style="margin-top:10px; font-size:12px; color:var(--text-muted);">Keluhan / Rencana Servis:</div>
      <div class="ticket-complaint-box">${escapeHtml(b.complaint || '-')}</div>
    </div>
  `;
}

// =====================================================================
// SLOT JAM OPERASIONAL & PERHITUNGAN DINAMIS (+3 JAM HARI H)
// =====================================================================
const WORKSHOP_TIME_SLOTS = [
  { value: '10:00', label: '10:00 WIB (Pagi)', hour: 10, minute: 0 },
  { value: '11:00', label: '11:00 WIB (Siang)', hour: 11, minute: 0 },
  { value: '12:00', label: '12:00 WIB (Siang)', hour: 12, minute: 0 },
  { value: '13:00', label: '13:00 WIB (Siang)', hour: 13, minute: 0 },
  { value: '14:00', label: '14:00 WIB (Sore)', hour: 14, minute: 0 },
  { value: '15:00', label: '15:00 WIB (Sore)', hour: 15, minute: 0 }
];

const HOME_SERVICE_TIME_SLOTS = [
  { value: '16:00', label: '16:00 WIB (Sore)', hour: 16, minute: 0 },
  { value: '17:00', label: '17:00 WIB (Sore)', hour: 17, minute: 0 },
  { value: '18:00', label: '18:00 WIB (Malam)', hour: 18, minute: 0 },
  { value: '19:00', label: '19:00 WIB (Malam)', hour: 19, minute: 0 },
  { value: '20:00', label: '20:00 WIB (Malam)', hour: 20, minute: 0 },
  { value: '21:00', label: '21:00 WIB (Malam)', hour: 21, minute: 0 },
  { value: '22:00', label: '22:00 WIB (Malam)', hour: 22, minute: 0 },
  { value: '23:00', label: '23:00 WIB (Malam)', hour: 23, minute: 0 }
];

let rawBookingScheduleConfig = {
  workshop: { openDates: [], dailyHours: null },
  homeService: { openDates: [], dailyHours: null }
};

function formatSlotLabel(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  let period = '(Pagi)';
  if (h >= 11 && h < 15) period = '(Siang)';
  else if (h >= 15 && h < 18) period = '(Sore)';
  else if (h >= 18 || h < 4) period = '(Malam)';
  return `${timeStr} WIB ${period}`;
}

function getAvailableTimeSlotsForDate(dateStr, type) {
  const currentType = type || selectedBookingType || 'workshop';
  const targetConfig = (currentType === 'home_service') 
    ? rawBookingScheduleConfig.homeService 
    : rawBookingScheduleConfig.workshop;

  let masterSlots = [];

  if (dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      const dayOfWeek = d.getDay();
      const dayCfg = (targetConfig && targetConfig.dailyHours) ? targetConfig.dailyHours[dayOfWeek] : null;

      if (dayCfg) {
        if (dayCfg.open === false) {
          return [];
        }
        if (Array.isArray(dayCfg.slots) && dayCfg.slots.length > 0) {
          masterSlots = dayCfg.slots.map(s => {
            const [h, m] = s.split(':').map(Number);
            return {
              value: s,
              label: formatSlotLabel(s),
              hour: h,
              minute: m
            };
          });
        }
      }
    }
  }

  if (masterSlots.length === 0) {
    masterSlots = (currentType === 'home_service') ? HOME_SERVICE_TIME_SLOTS : WORKSHOP_TIME_SLOTS;
  }

  const todayStr = getTodayString();

  if (!dateStr || dateStr > todayStr) {
    return [...masterSlots];
  }

  if (dateStr === todayStr) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const minAllowedMinutes = currentMinutes + (3 * 60);

    return masterSlots.filter(slot => {
      const slotMinutes = slot.hour * 60 + slot.minute;
      return slotMinutes >= minAllowedMinutes;
    });
  }

  return [];
}

function updateTimeSlotDropdown(dateStr) {
  const timeSelect = document.getElementById('bookingTimeSelect');
  const timeHint = document.getElementById('bookingTimeHint');
  const timeLabel = document.getElementById('bookingTimeLabel');
  if (!timeSelect) return;

  const isHome = selectedBookingType === 'home_service';
  if (timeLabel) {
    timeLabel.textContent = isHome ? 'Estimasi Jam Kunjungan Mekanik' : 'Estimasi Jam Kedatangan Bengkel';
  }

  if (!dateStr) {
    timeSelect.innerHTML = isHome
      ? '<option value="">-- Pilih Tanggal Kunjungan Terlebih Dahulu --</option>'
      : '<option value="">-- Pilih Tanggal Servis Terlebih Dahulu --</option>';
    timeSelect.disabled = true;
    if (timeHint) {
      timeHint.textContent = isHome
        ? 'ℹ️ Layanan Home Service buka setiap hari pukul 16:00 - 23:00 WIB. Pilih tanggal di atas.'
        : 'ℹ️ Pilih tanggal servis di atas untuk melihat jam kedatangan bengkel yang tersedia.';
      timeHint.style.color = 'var(--primary-on-dark, #0284c7)';
    }
    return;
  }

  const slots = getAvailableTimeSlotsForDate(dateStr, selectedBookingType);
  const isToday = dateStr === getTodayString();

  if (slots.length === 0) {
    timeSelect.innerHTML = '<option value="">-- Waktu Booking Hari Ini Tidak Cukup --</option>';
    timeSelect.disabled = true;
    if (timeHint) {
      if (isHome) {
        timeHint.textContent = '⚠️ Waktu persiapan Home Service hari ini sudah tidak cukup (+3 jam sudah melewati batas jam 23:00 WIB). Harap pilih tanggal besok.';
      } else {
        timeHint.textContent = '⚠️ Waktu persiapan mekanik hari ini sudah tidak cukup (+3 jam sudah melewati jam 15:00 WIB). Harap pilih hari berikutnya.';
      }
      timeHint.style.color = '#dc2626';
    }
    return;
  }

  timeSelect.disabled = false;
  let html = isHome ? '<option value="">-- Pilih Jam Kunjungan --</option>' : '<option value="">-- Pilih Jam Kedatangan --</option>';
  slots.forEach(s => {
    html += `<option value="${s.value}">${s.label}</option>`;
  });
  timeSelect.innerHTML = html;

  if (timeHint) {
    if (isToday) {
      timeHint.textContent = isHome
        ? 'ℹ️ Khusus booking hari ini, slot kunjungan yang tersedia minimal 3 jam dari sekarang untuk persiapan peralatan & teknisi.'
        : 'ℹ️ Khusus booking hari ini, slot yang tersedia minimal 3 jam dari sekarang untuk persiapan mekanik & suku cadang.';
      timeHint.style.color = '#d97706';
    } else {
      timeHint.textContent = isHome
        ? 'ℹ️ Layanan Home Service beroperasi setiap hari pukul 16:00 - 23:00 WIB (Sore - Malam).'
        : 'ℹ️ Estimasi jam kedatangan di bengkel pada tanggal servis yang dipilih (10:00 - 15:00 WIB).';
      timeHint.style.color = 'var(--primary-on-dark, #0284c7)';
    }
  }
}

let selectedBookingType = 'workshop';

function setupBookingTypeSwitch() {
  const switchEl = document.getElementById('bookingTypeSwitch');
  const homeFields = document.getElementById('homeServiceFields');
  const typeInput = document.getElementById('bookingType');
  const addressInput = document.getElementById('bookingCustomerAddress');
  const dateLabel = document.getElementById('bookingDateLabel');
  const timeLabel = document.getElementById('bookingTimeLabel');
  if (!switchEl) return;

  switchEl.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchEl.querySelectorAll('.type-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = '';
        b.style.color = '';
      });
      btn.classList.add('active');
      btn.style.background = '';
      btn.style.color = '';

      selectedBookingType = btn.dataset.type || 'workshop';
      if (typeInput) typeInput.value = selectedBookingType;

      const isHome = selectedBookingType === 'home_service';

      if (dateLabel) {
        dateLabel.textContent = 'Pilih Tanggal Booking';
      }
      if (timeLabel) {
        timeLabel.textContent = isHome ? 'Estimasi Jam Kunjungan Mekanik' : 'Estimasi Jam Kedatangan';
      }

      if (homeFields) {
        if (isHome) {
          homeFields.style.display = 'block';
          if (addressInput) addressInput.setAttribute('required', 'true');
        } else {
          homeFields.style.display = 'none';
          if (addressInput) addressInput.removeAttribute('required');
        }
      }

      renderDateOptions();
    });
  });
}

function setupInputListeners() {
  const plateInputs = [
    document.getElementById('bookingVehiclePlate'),
    document.getElementById('searchQuery')
  ];

  plateInputs.forEach(input => {
    if (input) {
      input.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
      });
    }
  });

  const dateSelect = document.getElementById('bookingDateSelect');
  if (dateSelect) {
    dateSelect.addEventListener('change', (e) => {
      updateTimeSlotDropdown(e.target.value);
    });
  }

  setupBookingTypeSwitch();
}

// =====================================================================
// DATA PROFIL TOKO & JADWAL BOOKING (FIRESTORE)
// =====================================================================
async function loadShopInfo() {
  if (!db) return;
  try {
    // 1. Prioritaskan dokumen meta/shopPublic (aman, tanpa token bot atau rekening bank)
    let doc = await db.collection('meta').doc('shopPublic').get().catch(() => null);
    if (!doc || !doc.exists) {
      // Fallback backward-compatible ke meta/shopInfo jika shopPublic belum di-generate
      doc = await db.collection('meta').doc('shopInfo').get().catch(() => null);
    }
    if (doc && doc.exists) {
      const data = doc.data() || {};
      if (data.name) {
        shopInfo.name = data.name;
        const shopNameEl = document.getElementById('portalShopName');
        if (shopNameEl) shopNameEl.textContent = data.name.toUpperCase();
        document.title = `${data.name} — Bengkel Motor | Booking Servis Online`;
      }
      if (data.phone) {
        shopInfo.phone = data.phone;
        const phoneEl = document.getElementById('shopLocationPhone');
        const footerPhone = document.getElementById('footerShopPhone');
        if (phoneEl) phoneEl.textContent = data.phone;
        if (footerPhone) footerPhone.textContent = data.phone;

        const floatWa = document.getElementById('floatingWaBtn');
        if (floatWa) {
          floatWa.href = `https://wa.me/${cleanPhoneNumber(data.phone)}?text=${encodeURIComponent(`Halo ${data.name || 'FRDR Garage'}, saya ingin konsultasi mengenai servis kendaraan saya.`)}`;
        }

        const heroWa = document.getElementById('heroWaBtn');
        if (heroWa) {
          heroWa.href = `https://wa.me/${cleanPhoneNumber(data.phone)}?text=${encodeURIComponent(`Halo ${data.name || 'FRDR Garage'}, saya ingin konsultasi mengenai servis kendaraan saya.`)}`;
        }

        const navWa = document.getElementById('navWaBtn');
        if (navWa) {
          navWa.href = `https://wa.me/${cleanPhoneNumber(data.phone)}?text=${encodeURIComponent(`Halo ${data.name || 'FRDR Garage'}, saya ingin konsultasi mengenai servis kendaraan saya.`)}`;
        }
      }
      if (data.address) {
        shopInfo.address = data.address;
        const addrEl = document.getElementById('shopLocationAddress');
        const footerAddr = document.getElementById('footerShopAddress');
        if (addrEl) addrEl.textContent = data.address;
        if (footerAddr) footerAddr.textContent = data.address;

        const btnMaps = document.getElementById('btnOpenMaps');
        if (btnMaps) {
          btnMaps.href = `https://maps.google.com/?q=${encodeURIComponent(data.name)}`;
        }
      }
      if (data.bookingPortalUrl) shopInfo.bookingPortalUrl = data.bookingPortalUrl;
    }
  } catch (e) {
    console.warn('Gagal memuat profil toko publik:', e);
  }
}

function listenBookingSchedule() {
  if (!db) return;
  db.collection('meta').doc('bookingSchedule').onSnapshot((doc) => {
    if (doc.exists) {
      const scheduleData = doc.data() || {};
      const hasModernStructure = Boolean(scheduleData.workshop || scheduleData.homeService);

      if (scheduleData.workshop && typeof scheduleData.workshop === 'object') {
        rawBookingScheduleConfig.workshop.isClosed = Boolean(scheduleData.workshop.isClosed);
        rawBookingScheduleConfig.workshop.openDates = Array.isArray(scheduleData.workshop.openDates)
          ? [...scheduleData.workshop.openDates]
          : [];
        rawBookingScheduleConfig.workshop.dailyHours = scheduleData.workshop.dailyHours || null;
      } else {
        rawBookingScheduleConfig.workshop = { isClosed: false, openDates: [], dailyHours: null };
      }

      if (scheduleData.homeService && typeof scheduleData.homeService === 'object') {
        rawBookingScheduleConfig.homeService.isClosed = Boolean(scheduleData.homeService.isClosed);
        rawBookingScheduleConfig.homeService.openDates = Array.isArray(scheduleData.homeService.openDates)
          ? [...scheduleData.homeService.openDates]
          : [];
        rawBookingScheduleConfig.homeService.dailyHours = scheduleData.homeService.dailyHours || null;
      } else {
        rawBookingScheduleConfig.homeService = { isClosed: false, openDates: [], dailyHours: null };
      }

      // Backward compatibility HANYA untuk dokumen format lama sebelum adanya objek workshop / homeService
      if (!hasModernStructure && Array.isArray(scheduleData.openDates) && scheduleData.openDates.length > 0) {
        const legacyDates = scheduleData.openDates
          .map(item => (typeof item === 'string' ? item : (item && item.active !== false ? item.date : null)))
          .filter(Boolean);

        rawBookingScheduleConfig.workshop.openDates = [...legacyDates];
        rawBookingScheduleConfig.homeService.openDates = [...legacyDates];
      }
    } else {
      rawBookingScheduleConfig = {
        workshop: { isClosed: false, openDates: [], dailyHours: null },
        homeService: { isClosed: false, openDates: [], dailyHours: null }
      };
    }

    renderDateOptions();
  }, (err) => {
    console.warn('Gagal mendengarkan bookingSchedule:', err);
  });
}

function renderDateOptions() {
  const select = document.getElementById('bookingDateSelect');
  const alertBox = document.getElementById('noDatesAlert');
  const submitBtn = document.getElementById('btnSubmitBooking');
  if (!select) return;

  const isHome = selectedBookingType === 'home_service';
  const targetConfig = isHome ? rawBookingScheduleConfig.homeService : rawBookingScheduleConfig.workshop;
  const isTargetClosed = Boolean(targetConfig && targetConfig.isClosed);
  const targetDates = (!isTargetClosed && targetConfig && Array.isArray(targetConfig.openDates))
    ? targetConfig.openDates
    : [];

  const todayStr = getTodayString();
  const todaySlots = getAvailableTimeSlotsForDate(todayStr, selectedBookingType);

  availableDates = targetDates
    .filter(dateStr => {
      if (!dateStr) return false;
      if (dateStr < todayStr) return false;
      const slotsForDate = getAvailableTimeSlotsForDate(dateStr, selectedBookingType);
      if (slotsForDate.length === 0) {
        return false;
      }
      return true;
    })
    .sort();

  if (availableDates.length === 0) {
    const isTodayConfigured = targetDates.includes(todayStr);
    const isTodayClosedDueToTime = isTodayConfigured && todaySlots.length === 0;

    if (isTodayClosedDueToTime) {
      select.innerHTML = '<option value="">-- Pemesanan Hari Ini Ditutup (Minimal 3 Jam) --</option>';
      if (alertBox) {
        const timeLimitText = isHome ? 'slot malam' : 'jam operasional bengkel';
        alertBox.innerHTML = `
          <div>⏰</div>
          <div>
            <strong>Pemesanan servis untuk hari ini sudah ditutup.</strong><br>
            Khusus pemesanan di hari yang sama wajib minimal 3 jam sebelum ${timeLimitText}.<br>
            Silakan hubungi bengkel langsung melalui WhatsApp atau pilih jadwal hari berikutnya.
          </div>
        `;
        alertBox.style.display = 'flex';
      }
    } else {
      select.innerHTML = '<option value="">-- Jadwal Booking Penuh / Belum Dibuka --</option>';
      if (alertBox) {
        alertBox.innerHTML = `
          <div>⚠️</div>
          <div>
            <strong>Saat ini jadwal booking untuk layanan ${isHome ? 'Home Service' : 'Servis Bengkel'} sedang penuh atau belum dibuka.</strong><br>
            Silakan hubungi bengkel langsung melalui WhatsApp untuk konsultasi atau servis langsung.
          </div>
        `;
        alertBox.style.display = 'flex';
      }
    }
    select.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
    updateTimeSlotDropdown('');
  } else {
    select.disabled = false;
    if (alertBox) alertBox.style.display = 'none';
    if (submitBtn) submitBtn.disabled = false;

    let html = '<option value="">-- Pilih Salah Satu Tanggal Servis --</option>';
    availableDates.forEach(dateStr => {
      const isToday = dateStr === todayStr;
      const todayTag = isToday ? ' [Hari Ini]' : '';
      const label = formatIndonesianDate(dateStr) + todayTag;
      html += `<option value="${dateStr}">${label}</option>`;
    });
    select.innerHTML = html;
    updateTimeSlotDropdown('');
  }
}

function generateBookingCode(dateStr) {
  const cleanDate = (dateStr || getTodayString()).replace(/-/g, '').substring(2);
  const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BK-${cleanDate}-${randomChars}`;
}

// =====================================================================
// SUBMIT BOOKING SERVIS
// =====================================================================
async function handleBookingSubmit(event) {
  event.preventDefault();

  // 1. Cek Honeypot Anti-Spam
  const hp = document.getElementById('website_hp');
  if (hp && hp.value.trim() !== '') {
    console.warn('Bot submission dropped silently.');
    return;
  }

  const customerName = document.getElementById('bookingCustomerName').value.trim();
  const customerPhone = document.getElementById('bookingCustomerPhone').value.trim();
  const vehiclePlate = document.getElementById('bookingVehiclePlate').value.trim().toUpperCase();
  const vehicleModel = document.getElementById('bookingVehicleModel').value.trim();
  const bookingDate = document.getElementById('bookingDateSelect').value;
  const bookingTimeEl = document.getElementById('bookingTimeSelect');
  const bookingType = selectedBookingType || 'workshop';
  const bookingTime = bookingTimeEl ? bookingTimeEl.value : '10:00';
  const complaint = document.getElementById('bookingComplaint').value.trim();

  const customerAddress = (document.getElementById('bookingCustomerAddress')?.value || '').trim();
  const mapsUrl = (document.getElementById('bookingMapsUrl')?.value || '').trim();

  if (!customerName || !customerPhone || !vehiclePlate || !vehicleModel || !bookingDate || !bookingTime || !complaint) {
    alert('Harap lengkapi semua isian formulir yang bertanda bintang (*).');
    return;
  }

  if (bookingType === 'home_service' && (!customerAddress || customerAddress.length < 8)) {
    alert('Harap masukkan alamat lengkap dan patokan rumah untuk kunjungan teknisi (minimal 8 karakter).');
    const addrField = document.getElementById('bookingCustomerAddress');
    if (addrField) addrField.focus();
    return;
  }

  if (complaint.length < 5) {
    alert('Catatan keluhan minimal 5 karakter agar mekanik dapat memahami kebutuhan servis.');
    return;
  }

  // Validasi Aturan Kedatangan Minimal +3 Jam Jika Booking Hari Ini
  const todayStr = getTodayString();
  if (bookingDate === todayStr) {
    const validSlots = getAvailableTimeSlotsForDate(todayStr, bookingType);
    const isSlotValid = validSlots.some(s => s.value === bookingTime);
    if (!isSlotValid) {
      if (bookingType === 'home_service') {
        alert('Khusus pemesanan Home Service di hari yang sama, kunjungan minimal 3 jam setelah waktu pemesanan.\n\nSilakan pilih jam kunjungan lain yang tersedia atau jadwalkan untuk hari berikutnya.');
      } else {
        alert('Untuk pemesanan servis di hari yang sama, kedatangan minimal 3 jam setelah waktu pemesanan untuk persiapan teknisi bengkel.\n\nSilakan pilih jam kedatangan lain yang tersedia atau jadwalkan untuk hari berikutnya.');
      }
      return;
    }
  }

  const submitBtn = document.getElementById('btnSubmitBooking');
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> <span>Mengirim Booking...</span>';

  const bookingId = 'bk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  const bookingCode = generateBookingCode(bookingDate);
  const now = Date.now();

  const bookingData = {
    id: bookingId,
    code: bookingCode,
    bookingType: bookingType,
    customerAddress: bookingType === 'home_service' ? customerAddress : '',
    mapsUrl: bookingType === 'home_service' ? mapsUrl : '',
    customerName,
    customerPhone,
    vehiclePlate,
    vehicleModel,
    bookingDate,
    bookingTime,
    complaint,
    status: 'menunggu',
    telegramNotified: false,
    createdAt: now,
    updatedAt: now
  };

  try {
    if (db) {
      // 1. Simpan PRIMER ke meta/bookingsList (100% diizinkan rules)
      try {
        const metaDoc = await db.collection('meta').doc('bookingsList').get();
        let list = (metaDoc.exists && Array.isArray(metaDoc.data().list)) ? metaDoc.data().list : [];
        list.unshift(bookingData);
        if (list.length > 500) list = list.slice(0, 500);
        await db.collection('meta').doc('bookingsList').set({ 
          list: list,
          updatedAt: now,
          lastBookingCode: bookingCode
        }, { merge: true });
      } catch (metaErr) {
        console.warn('Gagal simpan ke meta/bookingsList:', metaErr);
        await db.collection('meta').doc('booking_' + bookingId).set(bookingData, { merge: true });
      }

      // 2. Simpan SEKUNDER NON-BLOCKING ke root bookings
      db.collection('bookings').doc(bookingId).set(bookingData).catch(() => {});

      // 3. Kirim notifikasi instan ke Bot Telegram HP Owner (Non-blocking)
      sendTelegramBookingAlert(bookingData).catch(e => console.warn('Telegram alert skipped:', e));
    }

    displaySuccessTicket(bookingData);
  } catch (error) {
    console.error('Gagal mengirim booking:', error);
    alert('Terjadi kendala saat mengirim booking: ' + (error.message || 'Koneksi gagal') + '\nSilakan coba lagi atau hubungi bengkel via WhatsApp.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

// Kirim Notifikasi ke Telegram Bot Owner (Aman: via serverless endpoint atau didelegasikan ke Kasir Desktop)
async function sendTelegramBookingAlert(b) {
  const payload = JSON.stringify({ booking: b });
  const headers = { 'Content-Type': 'application/json' };

  // 1. Coba relative endpoint (jika di-hosting satu domain dengan reverse proxy)
  try {
    const res = await fetch('/api/send-telegram', {
      method: 'POST',
      headers,
      body: payload
    });
    if (res.ok) return;
  } catch (_) {
    // Abaikan kegagalan relative fetch dan coba endpoint VPS publik
  }

  // 2. Coba endpoint VPS gateway FRDR (api.frdrgarage.com)
  try {
    const vpsRes = await fetch('https://api.frdrgarage.com/api/send-telegram', {
      method: 'POST',
      headers,
      body: payload
    });
    if (vpsRes.ok) return;
  } catch (_) {
    // Jika endpoint VPS tidak dapat dijangkau, notifikasi akan dikirimkan secara otomatis
    // oleh aplikasi kasir bengkel (desktop Electron) saat mendeteksi booking masuk di Firestore.
  }
}

// Konfirmasi Booking via Link Tombol Telegram
async function handleTelegramDirectConfirm(id, code) {
  const formView = document.getElementById('portalFormView');
  const statusView = document.getElementById('portalStatusView');
  const confirmView = document.getElementById('portalConfirmView');
  const loadingBox = document.getElementById('confirmLoadingBox');
  const successBox = document.getElementById('confirmSuccessBox');
  const errorBox = document.getElementById('confirmErrorBox');

  const bookingSec = document.getElementById('booking');
  if (bookingSec) bookingSec.scrollIntoView({ behavior: 'smooth' });

  if (formView) formView.style.display = 'none';
  if (statusView) statusView.style.display = 'none';
  if (confirmView) confirmView.style.display = 'block';
  if (loadingBox) loadingBox.style.display = 'block';
  if (successBox) successBox.style.display = 'none';
  if (errorBox) errorBox.style.display = 'none';

  try {
    if (!db) {
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      await firebase.auth().signInAnonymously();
    }

    const metaDoc = await db.collection('meta').doc('bookingsList').get();
    let list = (metaDoc.exists && Array.isArray(metaDoc.data().list)) ? metaDoc.data().list : [];
    const idx = list.findIndex(item => item.id === id || item.code === code);

    if (idx === -1) {
      if (loadingBox) loadingBox.style.display = 'none';
      if (errorBox) {
        errorBox.style.display = 'block';
        document.getElementById('confirmErrorText').textContent = `Tiket booking ${code || id} tidak ditemukan di sistem.`;
      }
      return;
    }

    const b = list[idx];
    b.status = 'dikonfirmasi';
    b.confirmedAt = Date.now();
    b.confirmedBy = 'Owner (Telegram)';
    b.updatedAt = Date.now();
    list[idx] = b;

    await db.collection('meta').doc('bookingsList').set({ list }, { merge: true });
    db.collection('bookings').doc(b.id).set({ 
      status: 'dikonfirmasi', 
      confirmedAt: b.confirmedAt, 
      confirmedBy: b.confirmedBy, 
      updatedAt: b.updatedAt 
    }, { merge: true }).catch(() => {});

    if (loadingBox) loadingBox.style.display = 'none';
    if (successBox) successBox.style.display = 'block';

    document.getElementById('confirmTicketCode').textContent = b.code;
    document.getElementById('confirmTicketType').textContent = (b.bookingType === 'home_service') ? '🏠 Home Service' : '🏢 Servis Bengkel';
    document.getElementById('confirmTicketCustomer').textContent = b.customerName;
    document.getElementById('confirmTicketPhone').textContent = b.customerPhone;
    document.getElementById('confirmTicketVehicle').textContent = `${b.vehicleModel} (${b.vehiclePlate})`;
    document.getElementById('confirmTicketSchedule').textContent = `${formatIndonesianDate(b.bookingDate)} • ${b.bookingTime || '-'} WIB`;
    document.getElementById('confirmTicketComplaint').textContent = b.complaint || '-';

    const addrRow = document.getElementById('confirmAddressRow');
    if (b.bookingType === 'home_service' && b.customerAddress) {
      if (addrRow) addrRow.style.display = 'flex';
      document.getElementById('confirmTicketAddress').textContent = b.customerAddress;
    } else if (addrRow) {
      addrRow.style.display = 'none';
    }

    const cleanPhone = cleanPhoneNumber(b.customerPhone);
    const waText = `Halo Kak ${b.customerName}, booking servis motor ${b.vehicleModel} (${b.vehiclePlate}) di FRDR Garage untuk jadwal ${formatIndonesianDate(b.bookingDate)} jam ${b.bookingTime || '-'} WIB sudah kami konfirmasi ya. Ditunggu kedatangannya! 🙏`;
    const waBtn = document.getElementById('confirmWaBtn');
    if (waBtn) {
      waBtn.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`;
    }
  } catch (err) {
    console.error('Gagal konfirmasi booking:', err);
    if (loadingBox) loadingBox.style.display = 'none';
    if (errorBox) {
      errorBox.style.display = 'block';
      document.getElementById('confirmErrorText').textContent = 'Terjadi kendala sistem: ' + err.message;
    }
  }
}

// Cetak Tiket Booking via Link Tombol Telegram
async function handleTelegramRemotePrint(type, code, id) {
  const formView = document.getElementById('portalFormView');
  const statusView = document.getElementById('portalStatusView');
  const confirmView = document.getElementById('portalConfirmView');
  const loadingBox = document.getElementById('confirmLoadingBox');
  const successBox = document.getElementById('confirmSuccessBox');
  const errorBox = document.getElementById('confirmErrorBox');

  const bookingSec = document.getElementById('booking');
  if (bookingSec) bookingSec.scrollIntoView({ behavior: 'smooth' });

  if (formView) formView.style.display = 'none';
  if (statusView) statusView.style.display = 'none';
  if (confirmView) confirmView.style.display = 'block';
  if (loadingBox) loadingBox.style.display = 'block';
  if (successBox) successBox.style.display = 'none';
  if (errorBox) errorBox.style.display = 'none';

  try {
    if (!db) {
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      await firebase.auth().signInAnonymously();
    }

    const metaDoc = await db.collection('meta').doc('bookingsList').get();
    let list = (metaDoc.exists && Array.isArray(metaDoc.data().list)) ? metaDoc.data().list : [];
    const b = list.find(item => item.id === id || item.code === code);

    // Kirim antrean cetak ke meta/printQueue
    const printJobId = 'job_' + Date.now();
    const newJob = {
      id: printJobId,
      type: type || 'booking',
      code: code || (b && b.code) || '',
      targetId: id || (b && b.id) || '',
      status: 'pending',
      requestedAt: Date.now(),
      requestedBy: 'Telegram Direct Button'
    };

    const qRef = db.collection('meta').doc('printQueue');
    const qSnap = await qRef.get();
    let queue = (qSnap.exists && Array.isArray(qSnap.data().jobs)) ? qSnap.data().jobs : [];
    queue.unshift(newJob);
    if (queue.length > 50) queue = queue.slice(0, 50);

    await qRef.set({
      jobs: queue,
      lastJob: newJob,
      updatedAt: Date.now()
    }, { merge: true });

    if (loadingBox) loadingBox.style.display = 'none';
    if (successBox) successBox.style.display = 'block';

    const titleEl = successBox.querySelector('h3') || successBox.querySelector('h2');
    if (titleEl) titleEl.textContent = '🖨️ Perintah Cetak Dikirim ke Bengkel!';
    const descEl = successBox.querySelector('p');
    if (descEl) descEl.innerHTML = `Perintah cetak tiket <strong>${escapeHtml(code || 'Reservasi')}</strong> telah dikirim ke printer kasir bengkel. Struk akan otomatis keluar di printer fisik bengkel.`;

    if (b) {
      document.getElementById('confirmTicketCode').textContent = b.code;
      document.getElementById('confirmTicketType').textContent = (b.bookingType === 'home_service') ? '🏠 Home Service' : '🏢 Servis Bengkel';
      document.getElementById('confirmTicketCustomer').textContent = b.customerName;
      document.getElementById('confirmTicketPhone').textContent = b.customerPhone;
      document.getElementById('confirmTicketVehicle').textContent = `${b.vehicleModel} (${b.vehiclePlate})`;
      document.getElementById('confirmTicketSchedule').textContent = `${formatIndonesianDate(b.bookingDate)} • ${b.bookingTime || '-'} WIB`;
      document.getElementById('confirmTicketComplaint').textContent = b.complaint || '-';
    }
  } catch (err) {
    console.error('Remote print trigger error:', err);
    if (loadingBox) loadingBox.style.display = 'none';
    if (errorBox) {
      errorBox.style.display = 'block';
      document.getElementById('confirmErrorText').textContent = 'Gagal mengirim perintah cetak ke bengkel: ' + err.message;
    }
  }
}

// Tampilkan Tiket Sukses di Layar
function displaySuccessTicket(b) {
  document.getElementById('portalFormView').style.display = 'none';
  document.getElementById('portalSuccessView').style.display = 'block';

  document.getElementById('ticketCode').textContent = b.code;
  document.getElementById('ticketDate').textContent = formatIndonesianDate(b.bookingDate);
  const isHome = b.bookingType === 'home_service';
  const timeEl = document.getElementById('ticketTime');
  if (timeEl) {
    timeEl.textContent = b.bookingTime ? `${b.bookingTime} WIB${isHome ? ' (Malam)' : ''}` : '-';
  }
  document.getElementById('ticketVehicle').textContent = b.vehicleModel;
  document.getElementById('ticketPlate').textContent = b.vehiclePlate;
  document.getElementById('ticketCustomer').textContent = b.customerName;
  document.getElementById('ticketPhone').textContent = b.customerPhone;
  document.getElementById('ticketComplaint').textContent = b.complaint;
  document.getElementById('ticketCreatedAt').textContent = new Date(b.createdAt).toLocaleString('id-ID');

  const typeEl = document.getElementById('ticketType');
  const addrRow = document.getElementById('ticketAddressRow');
  const addrEl = document.getElementById('ticketAddress');
  const mapsRow = document.getElementById('ticketMapsRow');
  const mapsLinkEl = document.getElementById('ticketMapsLink');

  if (typeEl) {
    typeEl.textContent = isHome ? '🏠 Home Service (Buka Setiap Hari 16:00 - 23:00 WIB)' : '🏢 Servis di Bengkel';
    typeEl.style.color = isHome ? 'var(--primary-on-dark)' : 'var(--text-white)';
  }
  if (addrRow) {
    addrRow.style.display = isHome && b.customerAddress ? 'flex' : 'none';
    if (addrEl) addrEl.textContent = b.customerAddress || '-';
  }
  if (mapsRow) {
    mapsRow.style.display = isHome && b.mapsUrl ? 'flex' : 'none';
    if (mapsLinkEl) {
      mapsLinkEl.innerHTML = b.mapsUrl ? `<a href="${escapeHtml(b.mapsUrl)}" target="_blank" rel="noopener" style="color:var(--primary-on-dark); text-decoration:underline;">🗺️ Buka Google Maps</a>` : '';
    }
  }

  const cleanPhone = cleanPhoneNumber(shopInfo.phone || '628123456789');
  const serviceDetail = isHome ? 
`*Tipe Layanan:* 🏠 Home Service (Buka Setiap Hari 16:00 - 23:00 WIB)
*Alamat Kunjungan:* ${b.customerAddress}
${b.mapsUrl ? `*Lokasi Maps:* ${b.mapsUrl}\n` : ''}` : `*Tipe Layanan:* 🏢 Servis di Bengkel\n`;

  const timeText = b.bookingTime ? `${b.bookingTime} WIB` : '10:00 WIB';
  const waMessage = 
`Halo ${shopInfo.name || 'FRDR Garage'}, saya sudah melakukan booking servis online:

*No. Tiket:* ${b.code}
${serviceDetail}*Tanggal Servis:* ${formatIndonesianDate(b.bookingDate)}
*Estimasi Jam ${isHome ? 'Kunjungan' : 'Kedatangan'}:* ${timeText}
*Kendaraan:* ${b.vehicleModel} (${b.vehiclePlate})
*Nama:* ${b.customerName} (${b.customerPhone})
*Keluhan:* ${b.complaint}

Mohon konfirmasi jadwal ${isHome ? 'kunjungan mekanik' : 'kedatangan saya'} ya kak. Terima kasih!`;

  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMessage)}`;
  const waBtn = document.getElementById('ticketWaBtn');
  if (waBtn) {
    waBtn.href = waUrl;
  }

  const bookingSec = document.getElementById('booking');
  if (bookingSec) bookingSec.scrollIntoView({ behavior: 'smooth' });
}

function resetToNewBookingForm() {
  document.getElementById('bookingForm').reset();
  selectedBookingType = 'workshop';
  const switchEl = document.getElementById('bookingTypeSwitch');
  if (switchEl) {
    switchEl.querySelectorAll('.type-btn').forEach(b => {
      const isWorkshop = b.dataset.type === 'workshop';
      b.classList.toggle('active', isWorkshop);
      b.style.background = '';
      b.style.color = '';
    });
  }
  const homeFields = document.getElementById('homeServiceFields');
  if (homeFields) homeFields.style.display = 'none';

  document.getElementById('portalSuccessView').style.display = 'none';
  document.getElementById('portalConfirmView').style.display = 'none';
  document.getElementById('portalFormView').style.display = 'block';

  const bookingSec = document.getElementById('booking');
  if (bookingSec) bookingSec.scrollIntoView({ behavior: 'smooth' });
}

function switchPortalTab(tab) {
  const formView = document.getElementById('portalFormView');
  const successView = document.getElementById('portalSuccessView');
  const statusView = document.getElementById('portalStatusView');
  const tabFormBtn = document.getElementById('tabNewBookingBtn');
  const tabStatusBtn = document.getElementById('tabCheckStatusBtn');

  if (tab === 'form') {
    tabFormBtn.classList.add('active');
    tabStatusBtn.classList.remove('active');
    formView.style.display = 'block';
    successView.style.display = 'none';
    statusView.style.display = 'none';
  } else {
    tabStatusBtn.classList.add('active');
    tabFormBtn.classList.remove('active');
    formView.style.display = 'none';
    successView.style.display = 'none';
    statusView.style.display = 'block';
  }
}

// Cek Status Booking via Kode Tiket atau Nomor WhatsApp
async function handleCheckStatus(event) {
  event.preventDefault();
  const q = document.getElementById('searchQuery').value.trim();
  if (!q) return;

  const resultArea = document.getElementById('searchResultArea');
  resultArea.style.display = 'block';
  resultArea.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-muted);"><span class="spinner"></span> Mencari data tiket...</div>';

  if (!db) {
    resultArea.innerHTML = '<div class="alert-box alert-warn">Koneksi database tidak tersedia.</div>';
    return;
  }

  try {
    let matched = [];
    const qUpper = q.toUpperCase();
    const qCleanPhone = q.replace(/[^0-9]/g, '');

    const metaDoc = await db.collection('meta').doc('bookingsList').get();
    if (metaDoc.exists && Array.isArray(metaDoc.data().list)) {
      metaDoc.data().list.forEach(b => {
        const codeMatch = b.code && b.code.toUpperCase().includes(qUpper);
        const phoneMatch = qCleanPhone && b.customerPhone && b.customerPhone.replace(/[^0-9]/g, '').includes(qCleanPhone);
        const plateMatch = b.vehiclePlate && b.vehiclePlate.toUpperCase().includes(qUpper);
        if (codeMatch || phoneMatch || plateMatch) {
          matched.push(b);
        }
      });
    }

    if (matched.length === 0) {
      resultArea.innerHTML = `
        <div class="alert-box alert-warn">
          Tiket tidak ditemukan dengan kata kunci "<strong>${escapeHtml(q)}</strong>". Pastikan kode tiket atau nomor WhatsApp sesuai saat pendaftaran.
        </div>
      `;
      return;
    }

    let html = `<div style="font-size:13px; font-weight:700; margin-bottom:12px; color:var(--text-white);">Ditemukan ${matched.length} Tiket Booking:</div>`;
    matched.forEach(b => {
      html += renderBookingTicketCard(b);
    });
    resultArea.innerHTML = html;
  } catch (err) {
    console.error('Gagal cari status:', err);
    resultArea.innerHTML = `<div class="alert-box alert-danger">Terjadi kesalahan: ${err.message}</div>`;
  }
}

// =====================================================================
// PENGATURAN TEMA GELAP & TERANG (DARK / LIGHT MODE)
// =====================================================================
function initTheme() {
  let theme = localStorage.getItem('frdr_theme');
  if (!theme) {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = prefersDark ? 'dark' : 'light';
  }
  applyTheme(theme);

  // Listener perubahan preferensi OS jika belum ada setting manual
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('frdr_theme')) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
}

function applyTheme(theme) {
  const currentTheme = (theme === 'light') ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);

  // Update theme-color meta tag untuk browser bar HP
  let metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', currentTheme === 'light' ? '#f5f5f7' : '#000000');
  }

  // Update desktop toggle icon & title
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) {
    toggleBtn.textContent = currentTheme === 'light' ? '🌙' : '☀️';
    toggleBtn.setAttribute('title', currentTheme === 'light' ? 'Beralih ke Mode Gelap' : 'Beralih ke Mode Terang');
    toggleBtn.setAttribute('aria-label', currentTheme === 'light' ? 'Beralih ke Mode Gelap' : 'Beralih ke Mode Terang');
  }

  // Update mobile drawer pill button
  const mobileBtn = document.getElementById('mobileThemeToggleBtn');
  if (mobileBtn) {
    const icon = currentTheme === 'light' ? '🌙' : '☀️';
    const label = currentTheme === 'light' ? 'Gelap' : 'Terang';
    mobileBtn.innerHTML = `<span class="mobile-theme-icon">${icon}</span> <span class="mobile-theme-text">${label}</span>`;
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const nextTheme = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('frdr_theme', nextTheme);
  applyTheme(nextTheme);
}

// Ekspos toggleTheme ke window agar dapat dipanggil dari onclick
window.toggleTheme = toggleTheme;

// Jalankan inisialisasi saat dokumen siap
window.addEventListener('DOMContentLoaded', () => {
  initPublicPortal();
});
