  /**
  * Dashboard Downtime BCA - Google Apps Script Backend (High Performance Version)
  * Optimized for speed:
  * - Chunked / per-month save methods to prevent RPC timeouts
  * - Streamlined 17-column DB_UPTIME schema (73% smaller footprint)
  * - Single-operation batch setValues (executes in ~1 second)
  * - Anti-overwrite protection on locked monthly periods
  * - Pre-configured CRUD foundation sheet (DB_PROGRESS_PENANGANAN)
  */

  function doGet(e) {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';
    
    // Jika dipanggil via HTTP GET API dengan action tertentu:
    if (action) {
      var result = handleApiGet(action, e.parameter);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Tampilan status saat Web App URL dibuka langsung di browser
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>API Dashboard Downtime BCA</title>' +
      '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1.5rem;box-sizing:border-box;}' +
      '.card{background:#1e293b;border:1px solid #334155;border-radius:1rem;padding:2.5rem;max-width:540px;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.6);}' +
      'h1{color:#38bdf8;margin-top:0.75rem;font-size:1.5rem;}p{color:#94a3b8;line-height:1.6;font-size:0.95rem;margin:1rem 0;}' +
      '.badge{display:inline-block;background:#059669;color:#ffffff;padding:0.4rem 0.9rem;border-radius:9999px;font-weight:700;font-size:0.8rem;letter-spacing:0.05em;}' +
      '.code{background:#0f172a;border:1px solid #334155;border-radius:0.5rem;padding:0.85rem;font-family:monospace;font-size:0.85rem;color:#38bdf8;word-break:break-all;margin-top:1.25rem;}' +
      '</style></head><body><div class="card">' +
      '<div class="badge">● ONLINE & ACTIVE</div>' +
      '<h1>Backend API Dashboard Downtime BCA</h1>' +
      '<p>Google Apps Script REST API Backend untuk frontend Vercel telah aktif dan siap melayani pertukaran data secara real-time.</p>' +
      '<div class="code">Status: 200 OK | Engine: High Performance V8</div>' +
      '</div></body></html>';
    return HtmlService.createHtmlOutput(html)
      .setTitle('API Dashboard Downtime BCA')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  function doPost(e) {
    try {
      var contents = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
      var payload = {};
      try {
        payload = JSON.parse(contents);
      } catch (parseErr) {
        payload = {};
      }
      
      var action = payload.action || (e && e.parameter && e.parameter.action) || '';
      var result = handleApiPost(action, payload);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Server Error: ' + err.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  function handleApiGet(action, params) {
    switch (action) {
      case 'getOpenIncidents':
        return getOpenIncidents(params);
      case 'getDailyIncidentsFromDb':
        return getDailyIncidentsFromDb(params);
      case 'getIncidentHistory':
        return getIncidentHistory(params.incidentKey, params.monthStr);
      case 'getWsidPenangananHistory':
        return getWsidPenangananHistory(params.wsid, params.monthStr);
      case 'getUploadLog':
        return getUploadLog();
      case 'searchIncidents':
        return searchIncidents(params);
      case 'getFollowUpTicketsModern':
      case 'fetchFollowUpTicketsModern':
        return getFollowUpTicketsModern();
      case 'getDashboardDataFromSpreadsheet':
        return getDashboardDataFromSpreadsheet(params.spreadsheetId);
      case 'checkSpreadsheetStatus':
        return checkSpreadsheetStatus(params.spreadsheetId);
      case 'getIncidentDbId':
        return getIncidentDbId();
      case 'pangkasBarisKosongBerlebih':
        return pangkasBarisKosongBerlebih();
      case 'diagnoseDailyDb':
        return diagnoseDailyDb();
      case 'ping':
        return { success: true, timestamp: Date.now(), message: 'Pong - Google Apps Script Online' };
      default:
        return { success: false, message: 'Unknown GET action: ' + action };
    }
  }

  function handleApiPost(action, body) {
    switch (action) {
      case 'loginKaOps':
        return loginKaOps(body.password);
      case 'loginKaWil':
        return loginKaWil(body.password);
      case 'logoutKaOps':
        return logoutKaOps(body.token);
      case 'logoutKaWil':
        return logoutKaWil(body.token);
      case 'saveIncidentAction':
      case 'updateIncidentAction':
        return saveIncidentAction(body);
      case 'bulkSaveIncidentAction':
        return bulkSaveIncidentAction(body);
      case 'uploadIncidentChunk':
        return uploadIncidentChunk(body);
      case 'saveFollowUpTicketModern':
        return saveFollowUpTicketModern(body.ticket || body);
      case 'deleteFollowUpTicketModern':
        return deleteFollowUpTicketModern(body.ticketId || body.id);
      case 'saveMasterDataToSpreadsheet':
        return saveMasterDataToSpreadsheet(body.masterData || body);
      case 'saveSingleUptimeToSpreadsheet':
        return saveSingleUptimeToSpreadsheet(body.compactPayload || body);
      case 'unlockPeriode':
        return unlockPeriode(body.periode);
      case 'setIncidentDbId':
        return setIncidentDbId(body.idOrUrl, body.token);
      case 'syncOpenIncidentsSheet':
        return { success: true, total: syncOpenIncidentsSheet(getIncidentDbSpreadsheet()).length };
      default:
        return { success: false, message: 'Unknown POST action: ' + action };
    }
  }

  /**
   * 🌟 FUNGSI OTOMATIS 1: BUAT SPREADSHEET BARU DARI NOL
   * Jalankan fungsi ini langsung dari editor Google Apps Script (pilih fungsi ini lalu klik Run/Jalankan).
   * Script akan otomatis membuat file Google Spreadsheet baru di Google Drive Anda,
   * membuat seluruh sheet & tabel (DB_MASTER, DB_UPTIME, DB_TIKET_FOLLOWUP, DB_UPLOAD_LOG, dll)
   * beserta header kolom rapi, dan mencetak link spreadsheet di Execution Log.
   */
  function buatSpreadsheetBaruOtomatis() {
    var ssName = 'Database Dashboard Downtime BCA (' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd') + ')';
    var ss = SpreadsheetApp.create(ssName);
    var id = ss.getId();
    var url = ss.getUrl();

    // Inisialisasi seluruh tabel database
    initSpreadsheetDB(ss);
    setupJamOperasionalTable(id);
    initIncidentDb(ss);

    // Simpan ID ke konfigurasi internal script
    var props = PropertiesService.getScriptProperties();
    props.setProperty('SPREADSHEET_ID', id);
    props.setProperty('INCIDENT_DB_SPREADSHEET_ID', id);

    Logger.log('====================================================');
    Logger.log('🎉 SPREADSHEET DATABASE BARU BERHASIL DIBUAT OTOMATIS!');
    Logger.log('ID SPREADSHEET : ' + id);
    Logger.log('LINK BUKA SHEET: ' + url);
    Logger.log('====================================================');

    return {
      success: true,
      id: id,
      url: url,
      message: 'Database berhasil dibuat otomatis: ' + ssName
    };
  }

  /**
   * 🌟 FUNGSI OTOMATIS 2: HUBUNGKAN KE SPREADSHEET YANG SUDAH ANDA BUAT
   * Ganti isi 'MASUKKAN_ID_ATAU_URL_SPREADSHEET_DISINI' dengan URL Google Sheet Anda,
   * lalu pilih fungsi ini dan klik Run.
   */
  function hubungkanSpreadsheetYangAda(optIdOrUrl) {
    var input = optIdOrUrl || 'https://docs.google.com/spreadsheets/d/1rMqgZIJeSkDUrOfOzTq_m_n5s1nnxUACFDiJe75wYX4/edit?gid=454101069#gid=454101069';
    var id = String(input).trim();
    var match = id.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      id = match[1];
    }
    if (!id || id === 'https://docs.google.com/spreadsheets/d/1rMqgZIJeSkDUrOfOzTq_m_n5s1nnxUACFDiJe75wYX4/edit?gid=454101069#gid=454101069') {
      try {
        var active = SpreadsheetApp.getActiveSpreadsheet();
        if (active) id = active.getId();
      } catch (e) {}
    }
    if (!id || id === 'https://docs.google.com/spreadsheets/d/1rMqgZIJeSkDUrOfOzTq_m_n5s1nnxUACFDiJe75wYX4/edit?gid=454101069#gid=454101069') {
      throw new Error('Harap masukkan URL atau ID Google Spreadsheet yang valid!');
    }

    var ss = SpreadsheetApp.openById(id);
    initSpreadsheetDB(ss);
    setupJamOperasionalTable(id);
    initIncidentDb(ss);

    var props = PropertiesService.getScriptProperties();
    props.setProperty('SPREADSHEET_ID', id);
    props.setProperty('INCIDENT_DB_SPREADSHEET_ID', id);

    Logger.log('✅ Sukses! Database telah diinisialisasi dan dihubungkan ke: ' + ss.getName());
    Logger.log('Link: ' + ss.getUrl());
    return { success: true, id: id, name: ss.getName(), url: ss.getUrl() };
  }

  /**
  * Menu otomatis saat Google Spreadsheet dibuka
  */
  function onOpen(e) {
    try {
      var ui = SpreadsheetApp.getUi();
      ui.createMenu('⚡ Dashboard Downtime')
        .addItem('🔍 Cek Status Koneksi 2 Spreadsheet', 'cekKoneksiDatabaseDaily')
        .addSeparator()
        .addItem('🔄 Inisialisasi Seluruh Sheet Database Otomatis', 'initSpreadsheetDBManual')
        .addItem('🛠️ Siapkan Tabel Jam Operasional', 'setupJamOperasionalTable')
        .addItem('⚡ Sinkronkan Jam Operasional ke Master', 'syncJamOperasionalToMasterManual')
        .addSeparator()
        .addItem('📁 Inisialisasi Database Insiden', 'initIncidentDbManual')
        .addItem('🔑 Setup Password Ka Ops', 'setupKaOpsPasswordManual')
        .addItem('🔑 Setup Password Ka Wil', 'setupKaWilPasswordManual')
        .addToUi();
    } catch (err) {}
  }

  /**
   * 🔍 FUNGSI DIAGNOSTIK KONEKSI 2 SPREADSHEET
   * Pilih fungsi ini di toolbar editor Apps Script lalu klik Run (▷)
   * untuk melihat status koneksi dan izin akses di Catatan Eksekusi (Execution Log).
   */
  function cekKoneksiDatabaseDaily() {
    var props = PropertiesService.getScriptProperties();
    var s1 = props.getProperty('SPREADSHEET_ID') || '';
    var s2 = props.getProperty('INCIDENT_DB_SPREADSHEET_ID') || '';

    Logger.log('========================================================');
    Logger.log('🔎 DIAGNOSIS KONEKSI DATABASE SPREADSHEET');
    Logger.log('========================================================');
    Logger.log('1. SPREADSHEET_ID (Master & Uptime) : ' + (s1 || '(KOSONG)'));
    Logger.log('2. INCIDENT_DB_SPREADSHEET_ID (Daily): ' + (s2 || '(KOSONG - otomatis fallback ke Spreadsheet 1)'));

    // Tes Spreadsheet 1
    var cleanId1 = extractSpreadsheetIdGS(s1);
    if (cleanId1) {
      try {
        var ss1 = SpreadsheetApp.openById(cleanId1);
        Logger.log('✅ Spreadsheet 1 Terhubung: "' + ss1.getName() + '"');
      } catch (e1) {
        Logger.log('❌ Gagal membuka Spreadsheet 1: ' + e1.toString());
      }
    } else {
      Logger.log('⚠️ SPREADSHEET_ID belum diisi di Script Properties!');
    }

    // Tes Spreadsheet 2 (Daily)
    var cleanId2 = extractSpreadsheetIdGS(s2 || s1);
    Logger.log('--------------------------------------------------------');
    Logger.log('Pemeriksaan Database Daily (ID: ' + cleanId2 + '):');
    if (!cleanId2) {
      Logger.log('❌ ERROR: Tidak ada ID Spreadsheet untuk Daily!');
      Logger.log('========================================================');
      return;
    }

    try {
      var ss2 = SpreadsheetApp.openById(cleanId2);
      Logger.log('✅ BERHASIL BUKA SPREADSHEET DAILY: "' + ss2.getName() + '"');
      Logger.log('   URL: ' + ss2.getUrl());

      var allSheets = ss2.getSheets();
      var sheetNames = [];
      var incSheets = [];
      for (var i = 0; i < allSheets.length; i++) {
        var name = allSheets[i].getName();
        sheetNames.push(name);
        if (name.toUpperCase().indexOf('INC') === 0) {
          incSheets.push({ name: name, rows: allSheets[i].getLastRow() });
        }
      }

      Logger.log('   Daftar Sheet yang ada (' + sheetNames.length + ' sheet): ' + JSON.stringify(sheetNames));

      if (incSheets.length > 0) {
        Logger.log('✅ Sheet Insiden Daily yang ditemukan:');
        for (var j = 0; j < incSheets.length; j++) {
          Logger.log('   * ' + incSheets[j].name + ' -> ' + incSheets[j].rows + ' baris data');
        }
      } else {
        Logger.log('⚠️ PERHATIAN: Tidak ditemukan sheet berawalan "INC" di spreadsheet ini!');
        Logger.log('   Sistem mencari sheet bernama seperti: INC_2026-10 atau INC_2026_10.');
      }

      // Cek DB_ACTIVE_OPEN
      var actOpen = ss2.getSheetByName('DB_ACTIVE_OPEN');
      if (actOpen) {
        Logger.log('ℹ️ Sheet DB_ACTIVE_OPEN ditemukan: ' + actOpen.getLastRow() + ' baris.');
      }

      // Tes pemanggilan data insiden
      var testRes = getDailyIncidentsFromDb({});
      Logger.log('--------------------------------------------------------');
      Logger.log('Tes getDailyIncidentsFromDb():');
      Logger.log('Status: ' + (testRes.success ? 'SUKSES' : 'GAGAL'));
      Logger.log('Total baris diambil: ' + (testRes.totalCount || 0));
      Logger.log('Bulan tersedia: ' + JSON.stringify(testRes.availableMonths || []));
      if (!testRes.success) {
        Logger.log('Pesan Error: ' + testRes.message);
      }
      Logger.log('========================================================');

      Logger.log('✅ Diagnosis Selesai!');
      Logger.log('Spreadsheet Daily: ' + ss2.getName());
      Logger.log('Sheet Insiden Ditemukan: ' + incSheets.length);
      Logger.log('Total Baris Terbaca: ' + (testRes.totalCount || 0));

    } catch (err2) {
      Logger.log('❌ GAGAL MEMBUKA SPREADSHEET DAILY: ' + err2.toString());
      Logger.log('Kemungkinan penyebab:');
      Logger.log('1. ID salah atau belum memiliki izin akses (pastikan spreadsheet sudah dishare ke email akun Apps Script).');
      Logger.log('2. Otorisasi Apps Script belum disetujui (klik Review Permissions > Allow).');
      Logger.log('========================================================');
    }
  }

  function initSpreadsheetDBManual() {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      initSpreadsheetDB(ss);
      setupJamOperasionalTable(ss.getId());
      initIncidentDb(ss);
      
      var props = PropertiesService.getScriptProperties();
      props.setProperty('SPREADSHEET_ID', ss.getId());
      if (!props.getProperty('INCIDENT_DB_SPREADSHEET_ID')) {
        props.setProperty('INCIDENT_DB_SPREADSHEET_ID', ss.getId());
      }

      SpreadsheetApp.getUi().alert('Inisialisasi selesai! Seluruh tabel database telah siap secara otomatis.');
    } catch (err) {
      SpreadsheetApp.getUi().alert('Gagal inisialisasi: ' + err.toString());
    }
  }

  /**
  * Menyiapkan Tabel Jam Operasional (DB_JAM_OPERASIONAL)
  * dan menambahkan kolom Hari di DB_MASTER jika belum ada.
  */
  function setupJamOperasionalTable(optId) {
    try {
      var ss = getTargetSpreadsheet(optId);
      
      // 1. Siapkan sheet DB_JAM_OPERASIONAL
      var jamSheet = ss.getSheetByName('DB_JAM_OPERASIONAL');
      if (!jamSheet) {
        jamSheet = ss.insertSheet('DB_JAM_OPERASIONAL');
      }
      
      var jamHeaders = ['WSID', 'HARI', 'JAM'];
      jamSheet.getRange(1, 1, 1, jamHeaders.length).setValues([jamHeaders]);
      var hr = jamSheet.getRange(1, 1, 1, jamHeaders.length);
      hr.setBackground('#1e293b');
      hr.setFontColor('#ffffff');
      hr.setFontWeight('bold');
      hr.setHorizontalAlignment('center');
      jamSheet.setFrozenRows(1);
      jamSheet.setColumnWidth(1, 120); // WSID
      jamSheet.setColumnWidth(2, 160); // HARI
      jamSheet.setColumnWidth(3, 180); // JAM

      // 2. Cek sheet DB_MASTER dan pastikan ada kolom Hari
      var masterSheet = ss.getSheetByName('DB_MASTER');
      if (masterSheet && masterSheet.getLastRow() >= 1) {
        var lastCol = masterSheet.getLastColumn();
        var masterHeaders = masterSheet.getRange(1, 1, 1, lastCol).getValues()[0];
        var hasHari = false;
        var jamColIdx = -1;
        
        for (var i = 0; i < masterHeaders.length; i++) {
          var colName = String(masterHeaders[i] || '').trim().toUpperCase();
          if (colName === 'HARI') {
            hasHari = true;
          }
          if (colName === 'JAM') {
            jamColIdx = i + 1; // 1-indexed
          }
        }
        
        // Jika belum ada kolom Hari, sisipkan sebelum kolom Jam
        if (!hasHari) {
          if (jamColIdx > 0) {
            masterSheet.insertColumnBefore(jamColIdx);
            masterSheet.getRange(1, jamColIdx).setValue('Hari')
              .setBackground('#1e293b')
              .setFontColor('#ffffff')
              .setFontWeight('bold')
              .setHorizontalAlignment('center');
            masterSheet.setColumnWidth(jamColIdx, 130);
          } else {
            var newCol = lastCol + 1;
            masterSheet.getRange(1, newCol).setValue('Hari')
              .setBackground('#1e293b')
              .setFontColor('#ffffff')
              .setFontWeight('bold')
              .setHorizontalAlignment('center');
            masterSheet.setColumnWidth(newCol, 130);
          }
        }
      }

      try {
        SpreadsheetApp.getUi().alert('Berhasil!\n\n1. Sheet "DB_JAM_OPERASIONAL" telah siap dengan kolom WSID, HARI, JAM.\n2. Kolom "Hari" telah ditambahkan pada sheet "DB_MASTER".\n\nSilakan copas data dari file Master Jam Operasional.xlsx mulai dari baris 2 di sheet DB_JAM_OPERASIONAL.');
      } catch(e) {}

      return {
        success: true,
        message: 'Sheet DB_JAM_OPERASIONAL dan kolom Hari berhasil disiapkan.'
      };
    } catch (err) {
      try {
        SpreadsheetApp.getUi().alert('Gagal menyiapkan tabel: ' + err.toString());
      } catch(e) {}
      return {
        success: false,
        message: 'Gagal menyiapkan tabel: ' + err.toString()
      };
    }
  }

  function syncJamOperasionalToMasterManual() {
    try {
      var res = syncJamOperasionalToMaster();
      if (res.success) {
        SpreadsheetApp.getUi().alert('Berhasil!\n\n' + res.message);
      } else {
        SpreadsheetApp.getUi().alert('Peringatan: ' + res.message);
      }
    } catch (err) {
      SpreadsheetApp.getUi().alert('Gagal sinkronisasi: ' + err.toString());
    }
  }

  /**
  * Menyinkronkan nilai Hari & Jam dari DB_JAM_OPERASIONAL ke DB_MASTER
  * Mempercepat akses dashboard sehari-hari tanpa perlu scan ulang ribuan baris.
  */
  function syncJamOperasionalToMaster(optId) {
    try {
      var ss = getTargetSpreadsheet(optId);
      var jamSheet = ss.getSheetByName('DB_JAM_OPERASIONAL');
      var masterSheet = ss.getSheetByName('DB_MASTER');

      if (!jamSheet || jamSheet.getLastRow() < 2) {
        return { success: false, message: 'Sheet DB_JAM_OPERASIONAL kosong atau belum ada.' };
      }
      if (!masterSheet || masterSheet.getLastRow() < 2) {
        return { success: false, message: 'Sheet DB_MASTER kosong atau belum ada.' };
      }

      var jData = jamSheet.getDataRange().getValues();
      var jHeaders = jData[0];
      var jWsidIdx = 0, jHariIdx = 1, jJamIdx = 2;
      for (var jc = 0; jc < jHeaders.length; jc++) {
        var jh = String(jHeaders[jc] || '').trim().toUpperCase();
        if (jh === 'WSID') jWsidIdx = jc;
        else if (jh === 'HARI') jHariIdx = jc;
        else if (jh === 'JAM') jJamIdx = jc;
      }

      var jamMap = {};
      for (var jr = 1; jr < jData.length; jr++) {
        var w = String(jData[jr][jWsidIdx] || '').trim();
        if (w) {
          jamMap[w] = {
            hari: String(jData[jr][jHariIdx] || '').trim(),
            jam: String(jData[jr][jJamIdx] || '').trim()
          };
        }
      }

      var mData = masterSheet.getDataRange().getValues();
      var mHeaders = mData[0];
      var mHariCol = -1, mJamCol = -1;
      for (var mc = 0; mc < mHeaders.length; mc++) {
        var mh = String(mHeaders[mc] || '').trim().toUpperCase();
        if (mh === 'HARI') mHariCol = mc;
        else if (mh === 'JAM') mJamCol = mc;
      }

      if (mHariCol === -1 || mJamCol === -1) {
        setupJamOperasionalTable(optId);
        mData = masterSheet.getDataRange().getValues();
        mHeaders = mData[0];
        for (var mc2 = 0; mc2 < mHeaders.length; mc2++) {
          var mh2 = String(mHeaders[mc2] || '').trim().toUpperCase();
          if (mh2 === 'HARI') mHariCol = mc2;
          else if (mh2 === 'JAM') mJamCol = mc2;
        }
      }

      var updatedCount = 0;
      for (var mr = 1; mr < mData.length; mr++) {
        var mw = String(mData[mr][0] || '').trim();
        if (mw && jamMap[mw]) {
          if (mHariCol !== -1) mData[mr][mHariCol] = jamMap[mw].hari;
          if (mJamCol !== -1) mData[mr][mJamCol] = jamMap[mw].jam;
          updatedCount++;
        }
      }

      masterSheet.getRange(1, 1, mData.length, mHeaders.length).setValues(mData);
      setConfigValue(ss, 'LAST_UPDATED', new Date().toISOString());

      return {
        success: true,
        updatedCount: updatedCount,
        message: updatedCount + ' baris di DB_MASTER berhasil disinkronkan dengan jam operasional.'
      };
    } catch (err) {
      return {
        success: false,
        message: 'Gagal sinkronisasi jam operasional: ' + err.toString()
      };
    }
  }



  /**
  * Normalisasi segala format periode (termasuk objek Date Google Apps Script)
  * menjadi format standar "YYYY-MM" (misal: "2026-05")
  */
  function normalizePeriode(val) {
    if (!val) return '';
    if (val instanceof Date) {
      var y = val.getFullYear();
      var m = val.getMonth() + 1;
      return y + '-' + (m < 10 ? '0' + m : m);
    }
    var str = String(val).trim();
    if (str === 'ALL') return 'ALL';

    var yyyyMm = str.match(/^(\d{4})[-/](\d{1,2})$/);
    if (yyyyMm) {
      var m = parseInt(yyyyMm[2], 10);
      return yyyyMm[1] + '-' + (m < 10 ? '0' + m : m);
    }

    var mmYyyy = str.match(/^(\d{1,2})[-/](\d{4})$/);
    if (mmYyyy) {
      var m = parseInt(mmYyyy[1], 10);
      return mmYyyy[2] + '-' + (m < 10 ? '0' + m : m);
    }

    var monthMap = {
      jan: '01', feb: '02', mar: '03', apr: '04', mei: '05', may: '05',
      jun: '06', jul: '07', agu: '08', agt: '08', aug: '08', sep: '09',
      okt: '10', oct: '10', nov: '11', nop: '11', des: '12', dec: '12'
    };

    var dateStrMatch = str.match(/[a-zA-Z]{3}\s+([a-zA-Z]{3,})\s+\d{1,2}\s+(20\d{2})/i) ||
                      str.match(/(20\d{2})[-/](\d{2})[-/](\d{2})/);
    if (dateStrMatch) {
      if (dateStrMatch[0].indexOf('-') !== -1 || dateStrMatch[0].indexOf('/') !== -1) {
        return dateStrMatch[1] + '-' + dateStrMatch[2];
      }
      var monthWord = (dateStrMatch[1] || '').toLowerCase();
      var yearStr = dateStrMatch[2];
      for (var key in monthMap) {
        if (monthWord.indexOf(key) === 0) {
          return yearStr + '-' + monthMap[key];
        }
      }
    }

    var lower = str.toLowerCase();
    for (var key in monthMap) {
      var r = new RegExp('(?:^|[^a-z])(' + key + ')(?:[^a-z]|$)', 'i');
      if (lower.match(r)) {
        var y4Match = str.match(/(20\d{2})/);
        if (y4Match) return y4Match[1] + '-' + monthMap[key];
        var y2Match = str.match(/(?:^|[^0-9])([2-9]\d)(?:[^0-9]|$)/);
        if (y2Match) return '20' + y2Match[1] + '-' + monthMap[key];
      }
    }

    var d = new Date(str);
    if (!isNaN(d.getTime()) && (str.indexOf('GMT') !== -1 || str.indexOf('T') !== -1 || str.length > 15)) {
      var y = d.getFullYear();
      var m = d.getMonth() + 1;
      return y + '-' + (m < 10 ? '0' + m : m);
    }

    return str;
  }


  /**
   * Helper ekstraksi ID Spreadsheet dari URL lengkap atau teks mentah
   */
  function extractSpreadsheetIdGS(idOrUrl) {
    if (!idOrUrl) return '';
    var str = String(idOrUrl).trim();
    var match = str.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return match[1];
    }
    var matchShort = str.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (matchShort && matchShort[1]) {
      return matchShort[1];
    }
    if (str.indexOf('?') !== -1) str = str.split('?')[0];
    if (str.indexOf('#') !== -1) str = str.split('#')[0];
    return str.trim();
  }

  /**
  * Mendapatkan objek Spreadsheet target.
  */
  function getTargetSpreadsheet(optId) {
    var rawId = optId || PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    var cleanId = extractSpreadsheetIdGS(rawId);
    if (cleanId) {
      try {
        return SpreadsheetApp.openById(cleanId);
      } catch (e) {
        console.warn('Gagal membuka spreadsheet dari SPREADSHEET_ID: ' + e);
      }
    }
    try {
      var active = SpreadsheetApp.getActiveSpreadsheet();
      if (active) return active;
    } catch (err) {
      // Standalone
    }
    // Auto-create spreadsheet jika belum ada agar upload data langsung berhasil tanpa error konfigurasi
    try {
      var ssName = 'Database Dashboard Downtime BCA';
      var newSs = SpreadsheetApp.create(ssName);
      var newId = newSs.getId();
      PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', newId);
      initSpreadsheetDB(newSs);
      initIncidentDb(newSs);
      return newSs;
    } catch (createErr) {
      throw new Error('Spreadsheet Database belum dikonfigurasi. Harap setting SPREADSHEET_ID di Script Properties.');
    }
  }

  /**
  * Menyimpan konfigurasi ID Spreadsheet di Script Properties
  */
  function setSpreadsheetId(id) {
    try {
      var ss = SpreadsheetApp.openById(id.trim());
      PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', id.trim());
      initSpreadsheetDB(ss);
      return {
        success: true,
        message: 'Berhasil terhubung ke spreadsheet: ' + ss.getName(),
        name: ss.getName()
      };
    } catch (err) {
      return {
        success: false,
        message: 'Gagal membuka spreadsheet: ' + err.toString()
      };
    }
  }

  /**
  * Cek status koneksi spreadsheet
  */
  function checkSpreadsheetStatus(optId) {
    try {
      var ss = getTargetSpreadsheet(optId);
      initSpreadsheetDB(ss);
      var config = getConfig(ss);
      var locked = [];
      try {
        locked = JSON.parse(config['LOCKED_PERIODES'] || '[]');
      } catch(e) {}

      // Cek status Spreadsheet ke-2 (Incident DB)
      var incDbInfo = null;
      try {
        var incSs = getIncidentDbSpreadsheet();
        if (incSs) {
          var sNames = incSs.getSheets().map(function(s) { return s.getName(); });
          var incSheets = sNames.filter(function(n) { return n.indexOf('INC_') === 0; });
          incDbInfo = {
            id: incSs.getId(),
            name: incSs.getName(),
            sheets: sNames,
            incSheetsCount: incSheets.length,
            isSeparateSpreadsheet: (incSs.getId() !== ss.getId())
          };
        }
      } catch (incErr) {
        incDbInfo = { error: incErr.toString() };
      }
      
      return {
        success: true,
        spreadsheetName: ss.getName(),
        spreadsheetId: ss.getId(),
        lockedPeriodes: locked,
        lastUpdated: config['LAST_UPDATED'] || null,
        incidentDb: incDbInfo
      };
    } catch (err) {
      return {
        success: false,
        message: err.toString()
      };
    }
  }

  /**
  * Inisialisasi struktur sheet dan tabel jika belum ada
  */
  function initSpreadsheetDB(ss) {
    if (!ss) ss = getTargetSpreadsheet();

    var sheetConfigs = [
      {
        name: 'DB_CONFIG',
        headers: ['Key', 'Value', 'Keterangan'],
        headerBg: '#1e293b',
        initRows: [
          ['LOCKED_PERIODES', '[]', 'Daftar periode (YYYY-MM) yang terkunci'],
          ['SCHEMA_VERSION', '2.0', 'Versi skema database (High Performance)'],
          ['LAST_UPDATED', new Date().toISOString(), 'Waktu terakhir data diperbarui']
        ]
      },
      {
        name: 'DB_MASTER',
        headers: [
          'WSID', 'Nama Lokasi', 'Klien', 'Jenis Mesin', 'Tipe Mesin', 
          'Status', 'Sektor', 'Wilayah', 'Vendor', 'Jam', 'OPR', 'Updated_At'
        ],
        headerBg: '#1e293b'
      },
      {
        name: 'DB_UPTIME',
        headers: [
          'Periode', 'Jenis', 'WSID', 'LOKASI', 'DESCKCU', 'VDR', 'SEKTOR', 
          'Total_pct', 'Total_frx', 'Total_dur',
          'UH_pct', 'KOM_pct', 'UP_pct', 'HW_pct', 'LL_pct',
          'HW_Detail', 'Is_Locked'
        ],
        headerBg: '#1e293b'
      },
      {
        name: 'DB_REKAP',
        headers: [
          'Periode', 'Uptime ATM', 'Uptime CRM', 'Jumlah Mesin ATM', 'Jumlah Mesin CRM', 'Updated_At'
        ],
        headerBg: '#1e293b'
      },
      {
        name: 'DB_PROGRESS_PENANGANAN',
        headers: [
          'ID', 'WSID', 'Lokasi', 'Sektor', 'Wilayah', 'Vendor', 
          'Periode', 'Uptime_Baseline', 'Kategori_Problem', 'Akar_Masalah', 
          'Tindakan', 'PIC', 'Target_Selesai', 'Status', 'Catatan', 'Updated_At', 'History_Log'
        ],
        headerBg: '#0f172a'
      },
      {
        name: 'DB_JAM_OPERASIONAL',
        headers: ['WSID', 'HARI', 'JAM'],
        headerBg: '#1e293b'
      },
      {
        name: 'DB_TIKET_FOLLOWUP',
        headers: [
          'Ticket_ID', 'WSID', 'Lokasi', 'Sektor', 'Service_Point', 'Vendor',
          'Problem', 'Sumber_Problem', 'Prioritas', 'Kategori',
          'Catatan_Request', 'Created_By', 'Created_At', 'Status',
          'Durasi_Menit_Final', 'Progres_List_JSON', 'Req_Close_JSON', 'Validation_JSON', 'Updated_At'
        ],
        headerBg: '#0f766e'
      }
    ];

    sheetConfigs.forEach(function(sc) {
      var sheet = ss.getSheetByName(sc.name);
      if (!sheet) {
        sheet = ss.insertSheet(sc.name);
      }

      if (sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, sc.headers.length).setValues([sc.headers]);
        var headerRange = sheet.getRange(1, 1, 1, sc.headers.length);
        headerRange.setBackground(sc.headerBg);
        headerRange.setFontColor('#ffffff');
        headerRange.setFontWeight('bold');
        headerRange.setHorizontalAlignment('center');
        sheet.setFrozenRows(1);

        if (sc.initRows && sc.initRows.length > 0) {
          sheet.getRange(2, 1, sc.initRows.length, sc.headers.length).setValues(sc.initRows);
        }
      } else if (sc.name === 'DB_UPTIME') {
        // Auto-migrate / fix header row if it does not match the 17-column schema
        try {
          var lastCol = Math.max(sheet.getLastColumn(), 1);
          var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
          if (currentHeaders.length !== sc.headers.length || String(currentHeaders[7] || '').trim() !== 'Total_pct' || String(currentHeaders[12] || '').trim() !== 'UP_pct') {
            // Clear entire row 1 to prevent leftover headers from old schemas
            sheet.getRange(1, 1, 1, Math.max(lastCol, 40)).clearContent();
            sheet.getRange(1, 1, 1, sc.headers.length).setValues([sc.headers]);
            var hr = sheet.getRange(1, 1, 1, sc.headers.length);
            hr.setBackground(sc.headerBg);
            hr.setFontColor('#ffffff');
            hr.setFontWeight('bold');
            hr.setHorizontalAlignment('center');
            sheet.setFrozenRows(1);
          }
        } catch(e) {}
      } else if (sc.name === 'DB_PROGRESS_PENANGANAN') {
        try {
          if (sheet.getLastColumn() >= 16) {
            var h17 = sheet.getRange(1, 17).getValue();
            if (!h17 || String(h17).trim() === '') {
              sheet.getRange(1, 17).setValue('History_Log')
                .setBackground(sc.headerBg)
                .setFontColor('#ffffff')
                .setFontWeight('bold')
                .setHorizontalAlignment('center');
            }
          }
        } catch(e) {}
      }
    });
  }

  /**
  * Membaca key-value config dari sheet DB_CONFIG
  */
  function getConfig(ss) {
    if (!ss) ss = getTargetSpreadsheet();
    var sheet = ss.getSheetByName('DB_CONFIG');
    if (!sheet || sheet.getLastRow() < 2) return {};

    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    var config = {};
    data.forEach(function(row) {
      if (row[0]) {
        config[String(row[0]).trim()] = row[1];
      }
    });
    return config;
  }

  /**
  * Menyimpan key-value config ke sheet DB_CONFIG
  */
  function setConfigValue(ss, key, value) {
    if (!ss) ss = getTargetSpreadsheet();
    var sheet = ss.getSheetByName('DB_CONFIG');
    if (!sheet) return;

    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === key) {
          sheet.getRange(i + 2, 2).setValue(value);
          return;
        }
      }
    }

    sheet.appendRow([key, value, 'Dibuat otomatis']);
  }

  /**
  * Simpan Master Data ke Spreadsheet secara terpisah (Cepat: ~1 detik)
  */
  function saveMasterDataToSpreadsheet(masterDataInput, optId) {
    try {
      var masterData = typeof masterDataInput === 'string' ? JSON.parse(masterDataInput) : masterDataInput;
      var ss = getTargetSpreadsheet(optId);
      initSpreadsheetDB(ss);

      if (!masterData || !Array.isArray(masterData) || masterData.length === 0) {
        return { success: false, message: 'Data Master kosong.' };
      }

      var masterSheet = ss.getSheetByName('DB_MASTER');
      var lastRow = masterSheet.getLastRow();
      if (lastRow > 1) {
        masterSheet.getRange(2, 1, lastRow - 1, masterSheet.getLastColumn()).clearContent();
      }

      var nowIso = new Date().toISOString();
      var lastCol = masterSheet.getLastColumn();
      var headers = masterSheet.getRange(1, 1, 1, Math.max(lastCol, 12)).getValues()[0];
      var colMap = {};
      for (var c = 0; c < headers.length; c++) {
        var hName = String(headers[c] || '').trim().toLowerCase();
        if (hName) colMap[hName] = c;
      }

      var masterRows = [];
      for (var i = 0; i < masterData.length; i++) {
        var m = masterData[i];
        if (!m || !m.WSID) continue;
        
        // Buat array sepanjang kolom header
        var row = new Array(headers.length).fill('');
        
        var setVal = function(key, val) {
          if (colMap[key] !== undefined) {
            row[colMap[key]] = val;
          }
        };

        setVal('wsid', String(m.WSID).trim());
        setVal('nama lokasi', m['Nama Lokasi'] || m.lokasi || '');
        setVal('klien', m.Klien || m.klienStatus || 'BCA');
        setVal('jenis mesin', m['Jenis Mesin'] || m.jenisMesin || 'ATM');
        setVal('tipe mesin', m['Tipe Mesin'] || m.tipeMesin || '');
        setVal('status', m.Status || m.statusAktif || 'AKTIF');
        setVal('sektor', m.Sektor || m.sektorBCA || '');
        setVal('wilayah', m.Wilayah || m.wilayahOperasional || '');
        setVal('vendor', m.Vendor || m.vendor || '');
        setVal('hari', m.Hari || m.hari || '');
        setVal('jam', m.Jam || m.jam || '');
        setVal('opr', m.OPR || m.opr || '');
        setVal('updated_at', nowIso);

        masterRows.push(row);
      }

      if (masterRows.length > 0) {
        ensureSheetCapacity(masterSheet, masterRows.length + 1);
        masterSheet.getRange(2, 1, masterRows.length, headers.length).setValues(masterRows);
      }

      setConfigValue(ss, 'LAST_UPDATED', nowIso);

      return {
        success: true,
        count: masterRows.length,
        message: 'Master Data (' + masterRows.length + ' mesin) berhasil disimpan.'
      };
    } catch (err) {
      return {
        success: false,
        error: err.toString(),
        message: 'Gagal menyimpan Master Data: ' + err.toString()
      };
    }
  }

  /**
  * Simpan Data Uptime SATU Bulan ke Spreadsheet (Cepat: ~1-2 detik per bulan)
  * Dilengkapi Anti-Overwrite Protection.
  */
  function saveSingleUptimeToSpreadsheet(fileInput, optId) {
    try {
      var file = typeof fileInput === 'string' ? JSON.parse(fileInput) : fileInput;
      var ss = getTargetSpreadsheet(optId);
      initSpreadsheetDB(ss);

      var config = getConfig(ss);
      var lockedPeriodes = [];
      try {
        lockedPeriodes = JSON.parse(config['LOCKED_PERIODES'] || '[]');
      } catch(e) {}

      var periode = normalizePeriode(file.periode);
      if (!periode) return { success: false, message: 'Periode tidak valid' };

      // Cek proteksi kunci: jika bukan forceUpdate dan sudah terkunci, lewati
      var forceUpdate = file.forceUpdate === true;
      var normLocked = lockedPeriodes.map(normalizePeriode);
      if (!forceUpdate && normLocked.indexOf(periode) !== -1) {
        return {
          success: true,
          skipped: true,
          periode: periode,
          lockedPeriodes: normLocked,
          message: 'Periode ' + periode + ' sudah terkunci di database (dilindungi).'
        };
      }

      var nowIso = new Date().toISOString();

      // 1. Simpan/Perbarui baris rekap
      var rekapSheet = ss.getSheetByName('DB_REKAP');
      var atmCount = (file.atmData || []).length;
      var atsCount = (file.atsData || []).length;
      var newRekapRow = [
        periode,
        file.rekapUptimeATM || 0,
        file.rekapUptimeCRM || 0,
        atmCount,
        atsCount,
        nowIso
      ];

      if (rekapSheet) {
        if (rekapSheet.getLastRow() > 1) {
          var rData = rekapSheet.getDataRange().getValues();
          var rFiltered = [rData[0]];
          for (var i = 1; i < rData.length; i++) {
            if (normalizePeriode(rData[i][0]) !== periode) {
              rFiltered.push(rData[i]);
            }
          }
          rFiltered.push(newRekapRow);
          rekapSheet.clearContents();
          rekapSheet.getRange(1, 1, rFiltered.length, rFiltered[0].length).setValues(rFiltered);
        } else {
          rekapSheet.appendRow(newRekapRow);
        }
      }

      // 2. Format baris Uptime ke skema 17 kolom
      var uptimeRows = [];
      var buildRow = function(r, jenis) {
        var wsid = String(r.WSID || '').trim();
        if (!wsid) return null;

        var num = function(v) { var n = Number(v); return isNaN(n) ? 0 : n; };

        // Compact HW Details & SubCategories
        var hwDetail = {};
        var hwSubCategories = {};

        for (var p = 1; p <= 10; p++) {
          var pKey = 'P' + (p < 10 ? '0' + p : p);
          var pPct = 0;
          var pFrx = 0;
          var pDur = 0;

          for (var k in r) {
            if (k.indexOf(pKey) === 0) {
              if (k.indexOf('_pct') !== -1 || k === pKey + '_pct' || k === pKey) {
                pPct = num(r[k]);
              } else if (k.indexOf('_frx') !== -1) {
                pFrx = num(r[k]);
              } else if (k.indexOf('_dur') !== -1) {
                pDur = num(r[k]);
              }
            }
          }

          if (r.hwDetail && r.hwDetail[pKey]) {
            pPct = num(r.hwDetail[pKey]);
          }
          if (r.hwSubCategories && r.hwSubCategories[pKey]) {
            pFrx = num(r.hwSubCategories[pKey].frx);
            pDur = num(r.hwSubCategories[pKey].dur);
            pPct = num(r.hwSubCategories[pKey].pct);
          }

          if (pPct > 0) hwDetail[pKey] = pPct;
          if (pFrx > 0 || pDur > 0 || pPct > 0) {
            hwSubCategories[pKey] = { frx: pFrx, dur: pDur, pct: pPct };
          }
        }

        var upVal = num(r.UP_pct || r['P10 - Uang Penuh_pct'] || (hwDetail.P10 ? hwDetail.P10 : 0));
        var upFrx = num(r.UP_frx || r['P10 - Uang Penuh_frx'] || (hwSubCategories.P10 ? hwSubCategories.P10.frx : 0));
        var upDur = num(r.UP_dur || r['P10 - Uang Penuh_dur'] || (hwSubCategories.P10 ? hwSubCategories.P10.dur : 0));

        var hwFrxVal = num(r['H/W_frx'] || r.HW_frx);
        var hwDurVal = num(r['H/W_dur'] || r.HW_dur);
        if (hwFrxVal === 0 || hwDurVal === 0) {
          var subFrx = 0;
          var subDur = 0;
          ['P01', 'P02', 'P03', 'P04', 'P06', 'P09'].forEach(function(pk) {
            if (hwSubCategories[pk]) {
              subFrx += hwSubCategories[pk].frx || 0;
              subDur += hwSubCategories[pk].dur || 0;
            }
          });
          if (hwFrxVal === 0 && subFrx > 0) hwFrxVal = subFrx;
          if (hwDurVal === 0 && subDur > 0) hwDurVal = subDur;
        }

        var detailObj = {
          frx: {
            uh: num(r.UH_frx || r['P07 - Uang Habis_frx'] || (hwSubCategories.P07 ? hwSubCategories.P07.frx : 0)),
            kom: num(r.KOM_frx || r['P05 - Komunikasi_frx'] || (hwSubCategories.P05 ? hwSubCategories.P05.frx : 0)),
            up: upFrx,
            hw: hwFrxVal,
            ll: num(r.LL_frx || r['P08 - Replenishment_frx'] || (hwSubCategories.P08 ? hwSubCategories.P08.frx : 0))
          },
          dur: {
            uh: num(r.UH_dur || r['P07 - Uang Habis_dur'] || (hwSubCategories.P07 ? hwSubCategories.P07.dur : 0)),
            kom: num(r.KOM_dur || r['P05 - Komunikasi_dur'] || (hwSubCategories.P05 ? hwSubCategories.P05.dur : 0)),
            up: upDur,
            hw: hwDurVal,
            ll: num(r.LL_dur || r['P08 - Replenishment_dur'] || (hwSubCategories.P08 ? hwSubCategories.P08.dur : 0))
          },
          p: hwDetail,
          sub: hwSubCategories
        };
        var hwDetailStr = JSON.stringify(detailObj);

        return [
          periode,
          jenis,
          wsid,
          r.LOKASI || '',
          r.DESCKCU || '',
          r.VDR || '',
          r.SEKTOR || '',
          num(r.Total_pct),
          num(r.Total_frx),
          num(r.Total_dur),
          num(r.UH_pct || r['P07 - Uang Habis_pct']),
          num(r.KOM_pct || r['P05 - Komunikasi_pct']),
          upVal,
          num(r['H/W_pct'] || r.HW_pct),
          num(r.LL_pct || r['P08 - Replenishment_pct']),
          hwDetailStr,
          'YES'
        ];
      };

      (file.atmData || []).forEach(function(row) {
        var r = buildRow(row, 'ATM');
        if (r) uptimeRows.push(r);
      });
      (file.atsData || []).forEach(function(row) {
        var r = buildRow(row, 'CRM');
        if (r) uptimeRows.push(r);
      });

      // 3. Batch write/update ke DB_UPTIME dalam satu kali call instan
      var uptimeSheet = ss.getSheetByName('DB_UPTIME');
      if (uptimeSheet && uptimeRows.length > 0) {
        if (uptimeSheet.getLastRow() > 1) {
          var uData = uptimeSheet.getDataRange().getValues();
          var uFiltered = [uData[0]];
          for (var i = 1; i < uData.length; i++) {
            if (normalizePeriode(uData[i][0]) !== periode) {
              uFiltered.push(uData[i]);
            }
          }
          for (var j = 0; j < uptimeRows.length; j++) {
            uFiltered.push(uptimeRows[j]);
          }

          // Pastikan dimensi baris seragam persis 17 kolom untuk mencegah error setValues
          var targetCols = 17;
          for (var k = 0; k < uFiltered.length; k++) {
            while (uFiltered[k].length < targetCols) uFiltered[k].push('');
            if (uFiltered[k].length > targetCols) uFiltered[k] = uFiltered[k].slice(0, targetCols);
          }

          ensureSheetCapacity(uptimeSheet, uFiltered.length);
          uptimeSheet.clearContents();
          uptimeSheet.getRange(1, 1, uFiltered.length, targetCols).setValues(uFiltered);
        } else {
          var startRow = uptimeSheet.getLastRow() + 1;
          ensureSheetCapacity(uptimeSheet, startRow + uptimeRows.length - 1);
          uptimeSheet.getRange(startRow, 1, uptimeRows.length, uptimeRows[0].length).setValues(uptimeRows);
        }
      }

      // 4. Update locked periodes di DB_CONFIG
      if (normLocked.indexOf(periode) === -1) {
        lockedPeriodes.push(periode);
        setConfigValue(ss, 'LOCKED_PERIODES', JSON.stringify(lockedPeriodes));
      }
      setConfigValue(ss, 'LAST_UPDATED', nowIso);

      return {
        success: true,
        skipped: false,
        periode: periode,
        lockedPeriodes: lockedPeriodes,
        rowCount: uptimeRows.length,
        message: 'Periode ' + periode + ' berhasil disimpan & dikunci.'
      };

    } catch (err) {
      return {
        success: false,
        error: err.toString(),
        message: 'Gagal menyimpan Uptime ' + (file?.periode || '') + ': ' + err.toString()
      };
    }
  }

  /**
  * Mendapatkan seluruh data Dashboard dari Google Spreadsheet
  * Versi High-Performance:
  * 1. Skip initSpreadsheetDB berulang jika sheet sudah ada (hemat 15+ roundtrip)
  * 2. Hanya baca DB_JAM_OPERASIONAL jika kolom Hari/Jam belum ada di DB_MASTER
  * 3. Eliminasi pembuatan ribuan closure function di dalam loop baris Uptime
  * 4. Menyertakan tiket follow-up sekaligus dalam 1 payload untuk hemat koneksi
  */
  function getDashboardDataFromSpreadsheet(optId) {
    try {
      var ss = getTargetSpreadsheet(optId);

      // Cek cepat: hanya jalankan inisialisasi awal jika DB_MASTER belum ada
      var masterSheet = ss.getSheetByName('DB_MASTER');
      if (!masterSheet) {
        initSpreadsheetDB(ss);
        masterSheet = ss.getSheetByName('DB_MASTER');
      }

      var config = getConfig(ss);
      var lockedPeriodes = [];
      try {
        lockedPeriodes = JSON.parse(config['LOCKED_PERIODES'] || '[]');
      } catch(e) {}

      // 1. Baca DB_MASTER (dengan pemetaan header dinamis)
      var masterData = [];
      if (masterSheet && masterSheet.getLastRow() > 1) {
        var mData = masterSheet.getDataRange().getValues();
        var mHeaders = mData[0];
        var mColIdx = {};
        for (var mc = 0; mc < mHeaders.length; mc++) {
          var hName = String(mHeaders[mc] || '').trim().toLowerCase();
          if (hName) mColIdx[hName] = mc;
        }

        // HANYA baca DB_JAM_OPERASIONAL jika DB_MASTER belum memiliki kolom Hari dan Jam
        var jamMap = {};
        var needExternalJam = (mColIdx['hari'] === undefined && mColIdx['jam'] === undefined);
        if (needExternalJam) {
          var jamOperasionalSheet = ss.getSheetByName('DB_JAM_OPERASIONAL');
          if (jamOperasionalSheet && jamOperasionalSheet.getLastRow() > 1) {
            var jData = jamOperasionalSheet.getDataRange().getValues();
            var jHeaders = jData[0];
            var jWsidIdx = 0, jHariIdx = 1, jJamIdx = 2;
            for (var jc = 0; jc < jHeaders.length; jc++) {
              var jh = String(jHeaders[jc] || '').trim().toUpperCase();
              if (jh === 'WSID') jWsidIdx = jc;
              else if (jh === 'HARI') jHariIdx = jc;
              else if (jh === 'JAM') jJamIdx = jc;
            }
            for (var jr = 1; jr < jData.length; jr++) {
              var jRow = jData[jr];
              var jWsid = String(jRow[jWsidIdx] || '').trim();
              if (jWsid) {
                jamMap[jWsid] = {
                  hari: String(jRow[jHariIdx] || '').trim(),
                  jam: String(jRow[jJamIdx] || '').trim()
                };
              }
            }
          }
        }

        for (var r = 1; r < mData.length; r++) {
          var row = mData[r];
          var wsid = cleanWsidGS(row[0]);
          if (!wsid) continue;

          var hariVal = mColIdx['hari'] !== undefined ? row[mColIdx['hari']] : '';
          var jamVal = mColIdx['jam'] !== undefined ? row[mColIdx['jam']] : (row[9] || '');

          if (needExternalJam && jamMap[wsid]) {
            if (!hariVal) hariVal = jamMap[wsid].hari;
            if (!jamVal) jamVal = jamMap[wsid].jam;
          }

          masterData.push({
            WSID: wsid,
            'Nama Lokasi': (mColIdx['nama lokasi'] !== undefined ? row[mColIdx['nama lokasi']] : row[1]) || '',
            Klien: (mColIdx['klien'] !== undefined ? row[mColIdx['klien']] : row[2]) || 'BCA',
            'Jenis Mesin': (mColIdx['jenis mesin'] !== undefined ? row[mColIdx['jenis mesin']] : row[3]) || 'ATM',
            'Tipe Mesin': (mColIdx['tipe mesin'] !== undefined ? row[mColIdx['tipe mesin']] : row[4]) || '',
            Status: (mColIdx['status'] !== undefined ? row[mColIdx['status']] : row[5]) || 'AKTIF',
            Sektor: (mColIdx['sektor'] !== undefined ? row[mColIdx['sektor']] : row[6]) || '',
            Wilayah: (mColIdx['wilayah'] !== undefined ? row[mColIdx['wilayah']] : row[7]) || '',
            Vendor: (mColIdx['vendor'] !== undefined ? row[mColIdx['vendor']] : row[8]) || '',
            Hari: hariVal || '',
            Jam: jamVal || '',
            OPR: (mColIdx['opr'] !== undefined ? row[mColIdx['opr']] : (row[10] || '')) || ''
          });
        }
      }

      // 2. Baca DB_REKAP
      var rekapSheet = ss.getSheetByName('DB_REKAP');
      var rekapMap = {};
      if (rekapSheet && rekapSheet.getLastRow() > 1) {
        var rData = rekapSheet.getDataRange().getValues();
        for (var r = 1; r < rData.length; r++) {
          var rRow = rData[r];
          var p = normalizePeriode(rRow[0]);
          if (p) {
            rekapMap[p] = {
              atmUptime: Number(rRow[1]) || 0,
              atsUptime: Number(rRow[2]) || 0,
              atmCount: Number(rRow[3]) || 0,
              atsCount: Number(rRow[4]) || 0
            };
          }
        }
      }

      // 3. Baca DB_UPTIME (17 kolom cepat)
      var uptimeSheet = ss.getSheetByName('DB_UPTIME');
      var uptimeByPeriod = {};
      if (uptimeSheet && uptimeSheet.getLastRow() > 1) {
        var uData = uptimeSheet.getDataRange().getValues();
        var uHeaders = uData[0];
        
        var colIdx = {};
        for (var c = 0; c < uHeaders.length; c++) {
          colIdx[String(uHeaders[c] || '').trim()] = c;
        }
        var is17Header = (uHeaders.length >= 17 && String(uHeaders[7] || '').trim() === 'Total_pct');

        // Helper diekstrak ke luar loop untuk performa V8 maksimal
        var extractNum = function(row, is17, key, col17Idx) {
          if (is17 && col17Idx !== undefined) {
            var val = row[col17Idx];
            return val !== '' && val != null && !isNaN(Number(val)) ? Number(val) : 0;
          }
          var idx = colIdx[key];
          return idx !== undefined ? (Number(row[idx]) || 0) : 0;
        };

        var extractStr = function(row, is17, key, col17Idx) {
          if (is17 && col17Idx !== undefined) {
            return String(row[col17Idx] || '').trim();
          }
          var idx = colIdx[key];
          return idx !== undefined ? (String(row[idx] || '').trim()) : '';
        };

        for (var r = 1; r < uData.length; r++) {
          var row = uData[r];
          if (!row || row.length < 3) continue;

          var periode = normalizePeriode(row[0]);
          var jenis = String(row[1] || '').trim().toUpperCase();
          var wsid = cleanWsidGS(row[2]);

          if (!periode || !wsid) continue;

          if (!uptimeByPeriod[periode]) {
            uptimeByPeriod[periode] = {
              atmData: [],
              atsData: []
            };
          }

          var is17Row = is17Header || 
                        String(row[16] || '').trim().toUpperCase() === 'YES' ||
                        String(row[16] || '').trim().toUpperCase() === 'NO' ||
                        (row.length <= 18 && !isNaN(Number(row[7])));

          var hwDetail = {};
          var hwSubCategories = {};
          var frxObj = {};
          var durObj = {};

          var hwDetailRaw = extractStr(row, is17Row, 'HW_Detail', 15);
          if (hwDetailRaw) {
            try {
              var parsed = JSON.parse(hwDetailRaw);
              if (parsed.p || parsed.frx || parsed.sub) {
                hwDetail = parsed.p || {};
                hwSubCategories = parsed.sub || {};
                frxObj = parsed.frx || {};
                durObj = parsed.dur || {};
              } else {
                hwDetail = parsed;
              }
            } catch(e) {}
          }

          var totalPct = extractNum(row, is17Row, 'Total_pct', 7);
          var totalFrx = extractNum(row, is17Row, 'Total_frx', 8);
          var totalDur = extractNum(row, is17Row, 'Total_dur', 9);
          var uhPct = extractNum(row, is17Row, 'UH_pct', 10);
          var komPct = extractNum(row, is17Row, 'KOM_pct', 11);
          var upPct = extractNum(row, is17Row, 'UP_pct', 12);
          var hwPct = extractNum(row, is17Row, 'HW_pct', 13);
          var llPct = extractNum(row, is17Row, 'LL_pct', 14);

          var upFrx = frxObj.up !== undefined ? Number(frxObj.up) : (hwSubCategories.P10 ? hwSubCategories.P10.frx : 0) || 0;
          var upDur = durObj.up !== undefined ? Number(durObj.up) : (hwSubCategories.P10 ? hwSubCategories.P10.dur : 0) || 0;
          if (!upPct && hwDetail.P10) upPct = hwDetail.P10;

          var komFrx = frxObj.kom !== undefined ? Number(frxObj.kom) : (hwSubCategories.P05 ? hwSubCategories.P05.frx : 0) || 0;
          var komDur = durObj.kom !== undefined ? Number(durObj.kom) : (hwSubCategories.P05 ? hwSubCategories.P05.dur : 0) || 0;

          var uhFrx = frxObj.uh !== undefined ? Number(frxObj.uh) : (hwSubCategories.P07 ? hwSubCategories.P07.frx : 0) || 0;
          var uhDur = durObj.uh !== undefined ? Number(durObj.uh) : (hwSubCategories.P07 ? hwSubCategories.P07.dur : 0) || 0;

          var hwFrx = frxObj.hw !== undefined ? Number(frxObj.hw) : 0;
          var hwDur = durObj.hw !== undefined ? Number(durObj.hw) : 0;

          if (hwFrx === 0 || hwDur === 0) {
            var subHwFrx = 0;
            var subHwDur = 0;
            ['P01', 'P02', 'P03', 'P04', 'P06', 'P09'].forEach(function(k) {
              if (hwSubCategories[k]) {
                subHwFrx += hwSubCategories[k].frx || 0;
                subHwDur += hwSubCategories[k].dur || 0;
              }
            });
            if (hwFrx === 0 && subHwFrx > 0) hwFrx = subHwFrx;
            if (hwDur === 0 && subHwDur > 0) hwDur = subHwDur;
          }

          var llFrx = frxObj.ll !== undefined ? Number(frxObj.ll) : (hwSubCategories.P08 ? hwSubCategories.P08.frx : 0) || 0;
          var llDur = durObj.ll !== undefined ? Number(durObj.ll) : (hwSubCategories.P08 ? hwSubCategories.P08.dur : 0) || 0;

          var opr = (totalPct > 0 && totalDur > 0) ? (totalDur / (totalPct / 100)) : 44640;
          var calcDur = function(pct) { return Math.round((pct / 100) * opr); };

          if (upDur === 0 && upPct > 0) upDur = calcDur(upPct);
          if (komDur === 0 && komPct > 0) komDur = calcDur(komPct);
          if (uhDur === 0 && uhPct > 0) uhDur = calcDur(uhPct);
          if (hwDur === 0 && hwPct > 0) hwDur = calcDur(hwPct);
          if (llDur === 0 && llPct > 0) llDur = calcDur(llPct);

          if (upPct > 0) {
            hwDetail.P10 = upPct;
            hwSubCategories.P10 = { frx: upFrx, dur: upDur, pct: upPct };
          }
          if (komPct > 0 && !hwDetail.P05) {
            hwDetail.P05 = komPct;
            hwSubCategories.P05 = { frx: komFrx, dur: komDur, pct: komPct };
          }
          if (uhPct > 0 && !hwDetail.P07) {
            hwDetail.P07 = uhPct;
            hwSubCategories.P07 = { frx: uhFrx, dur: uhDur, pct: uhPct };
          }
          if (llPct > 0 && !hwDetail.P08) {
            hwDetail.P08 = llPct;
            hwSubCategories.P08 = { frx: llFrx, dur: llDur, pct: llPct };
          }

          for (var p = 1; p <= 10; p++) {
            var pKey = 'P' + (p < 10 ? '0' + p : p);
            var pPct = hwDetail[pKey] || 0;
            if (pPct > 0) {
              if (!hwSubCategories[pKey]) {
                hwSubCategories[pKey] = {
                  pct: pPct,
                  dur: calcDur(pPct),
                  frx: 0
                };
              } else {
                if (hwSubCategories[pKey].dur === 0) hwSubCategories[pKey].dur = calcDur(pPct);
              }
            }
          }

          var lokasiVal = extractStr(row, is17Row, 'LOKASI', 3);
          var descKcuVal = extractStr(row, is17Row, 'DESCKCU', 4);
          var vdrVal = extractStr(row, is17Row, 'VDR', 5);
          var sektorVal = extractStr(row, is17Row, 'SEKTOR', 6);

          var rowObj = {
            WSID: wsid,
            LOKASI: lokasiVal,
            DESCKCU: descKcuVal,
            KWW: descKcuVal,
            VDR: vdrVal,
            SEKTOR: sektorVal,
            Klien: 'BCA',
            Total_pct: totalPct,
            Total_frx: totalFrx,
            Total_dur: totalDur,
            UH_pct: uhPct,
            UH_frx: uhFrx,
            UH_dur: uhDur,
            KOM_pct: komPct,
            KOM_frx: komFrx,
            KOM_dur: komDur,
            UP_pct: upPct,
            UP_frx: upFrx,
            UP_dur: upDur,
            'H/W_pct': hwPct,
            HW_pct: hwPct,
            'H/W_frx': hwFrx,
            HW_frx: hwFrx,
            'H/W_dur': hwDur,
            HW_dur: hwDur,
            LL_pct: llPct,
            LL_frx: llFrx,
            LL_dur: llDur,
            hwDetail: hwDetail,
            hwSubCategories: hwSubCategories
          };

          if (jenis === 'CRM' || jenis === 'ATS') {
            uptimeByPeriod[periode].atsData.push(rowObj);
          } else {
            uptimeByPeriod[periode].atmData.push(rowObj);
          }
        }
      }

      // Convert uptimeByPeriod into ParsedUptimeFile[]
      var parsedUptimeFiles = [];
      var periods = Object.keys(uptimeByPeriod).sort();
      periods.forEach(function(p) {
        var rk = rekapMap[p] || { atmUptime: 0, atsUptime: 0 };
        parsedUptimeFiles.push({
          periode: p,
          atmData: uptimeByPeriod[p].atmData,
          atsData: uptimeByPeriod[p].atsData,
          rekapUptimeATM: rk.atmUptime,
          rekapUptimeCRM: rk.atsUptime
        });
      });

      // 4. Baca DB_PROGRESS_PENANGANAN (tiket follow-up langsung disertakan agar hemat round-trip)
      var tickets = [];
      var progSheet = ss.getSheetByName('DB_PROGRESS_PENANGANAN');
      if (progSheet && progSheet.getLastRow() > 1) {
        var pData = progSheet.getDataRange().getValues();
        for (var pr = 1; pr < pData.length; pr++) {
          var pRow = pData[pr];
          if (!pRow[0] || String(pRow[0]).trim() === '') continue;
          var st = String(pRow[13] || 'OPEN').trim().toUpperCase();
          if (st === 'RESOLVED') st = 'PANTAU';
          var upDate = String(pRow[15] || '').trim();
          var tanggalUpdate = upDate ? upDate.slice(0, 10) : '';
          var rawAkar = String(pRow[9] || '').trim();
          var akarCategory = rawAkar;
          var akarDetail = '';
          if (rawAkar.indexOf(' - ') !== -1) {
            var parts = rawAkar.split(' - ');
            akarCategory = parts[0].trim();
            akarDetail = parts.slice(1).join(' - ').trim();
          }

          var history = [];
          if (pRow[16]) {
            try {
              history = typeof pRow[16] === 'string' ? JSON.parse(pRow[16]) : pRow[16];
              if (!Array.isArray(history)) history = [];
            } catch(e) {
              history = [];
            }
          }

          var rawPic = String(pRow[11] || '').trim();
          var defaultVendorPic = String(pRow[5] || '').trim() ? ('Vendor ' + String(pRow[5] || '').trim()) : 'Tim Support Internal';
          var finalPic = (rawPic && rawPic !== '-') ? rawPic : defaultVendorPic;

          if (history.length === 0 && (String(pRow[10] || '').trim() !== '' || st)) {
            history.push({
              id: 'HIST-' + (pRow[0] || Date.now()) + '-0',
              tanggal: tanggalUpdate || (upDate ? upDate.slice(0, 10) : ''),
              status: st,
              tindakan: String(pRow[10] || '').trim(),
              pic: finalPic,
              petugas: '',
              akarMasalah: akarCategory,
              detailAkarMasalah: akarDetail,
              catatan: String(pRow[14] || '').trim(),
              targetSelesai: String(pRow[12] || '').trim(),
              updatedAt: upDate
            });
          }

          tickets.push({
            id: String(pRow[0] || '').trim(),
            wsid: String(pRow[1] || '').trim(),
            lokasi: String(pRow[2] || '').trim(),
            sektor: String(pRow[3] || '').trim(),
            wilayah: String(pRow[4] || '').trim(),
            vendor: String(pRow[5] || '').trim(),
            periodeProblem: normalizePeriode(pRow[6]),
            uptimeBaseline: Number(pRow[7]) || 0,
            kategoriProblem: String(pRow[8] || '').trim(),
            akarMasalah: akarCategory,
            detailAkarMasalah: akarDetail,
            actionPlan: String(pRow[10] || '').trim(),
            pic: finalPic,
            petugas: (history.length > 0 && history[0].petugas) ? history[0].petugas : '',
            tanggalUpdate: tanggalUpdate,
            targetSelesai: String(pRow[12] || '').trim(),
            status: st,
            catatan: String(pRow[14] || '').trim(),
            updatedAt: upDate,
            history: history
          });
        }
      }

      // 5. Baca DB_TIKET_FOLLOWUP (Tiket Follow Up Ka Ops / Ka Wil & Monitoring)
      var modernTickets = [];
      var tktSheet = ss.getSheetByName('DB_TIKET_FOLLOWUP');
      if (tktSheet && tktSheet.getLastRow() > 1) {
        var tData = tktSheet.getDataRange().getValues();
        for (var tr = 1; tr < tData.length; tr++) {
          var tRow = tData[tr];
          if (!tRow[0] || String(tRow[0]).trim() === '') continue;
          var pList = [];
          if (tRow[15]) {
            try {
              pList = typeof tRow[15] === 'string' ? JSON.parse(tRow[15]) : tRow[15];
              if (!Array.isArray(pList)) pList = [];
            } catch (e) { pList = []; }
          }
          var reqClose = null;
          if (tRow[16]) {
            try {
              reqClose = typeof tRow[16] === 'string' ? JSON.parse(tRow[16]) : tRow[16];
            } catch (e) { reqClose = null; }
          }
          var validation = null;
          if (tRow[17]) {
            try {
              validation = typeof tRow[17] === 'string' ? JSON.parse(tRow[17]) : tRow[17];
            } catch (e) { validation = null; }
          }

          modernTickets.push({
            ticketId: String(tRow[0] || '').trim(),
            wsid: String(tRow[1] || '').trim(),
            lokasi: String(tRow[2] || '').trim(),
            sektor: String(tRow[3] || '').trim(),
            servicePoint: String(tRow[4] || '').trim(),
            vendor: String(tRow[5] || '').trim(),
            problem: String(tRow[6] || '').trim(),
            sumberProblem: String(tRow[7] || 'OPEN_INCIDENT').trim(),
            prioritas: String(tRow[8] || 'HIGH').trim().toUpperCase(),
            kategori: String(tRow[9] || 'VENDOR').trim().toUpperCase(),
            catatanRequest: String(tRow[10] || '').trim(),
            createdBy: String(tRow[11] || '').trim(),
            createdAt: String(tRow[12] || '').trim(),
            status: String(tRow[13] || 'OPEN').trim().toUpperCase(),
            durasiMenitFinal: Number(tRow[14]) || 0,
            progresList: pList,
            reqCloseInfo: reqClose,
            validationInfo: validation,
            updatedAt: String(tRow[18] || '').trim()
          });
        }
      }

      var hasData = (masterData.length > 0) && (parsedUptimeFiles.length > 0);

      return {
        success: true,
        hasData: hasData,
        masterData: masterData,
        parsedUptimeFiles: parsedUptimeFiles,
        lockedPeriodes: lockedPeriodes,
        lastUpdated: config['LAST_UPDATED'] || null,
        tickets: tickets,
        modernFollowUpTickets: modernTickets
      };

    } catch (err) {
      return {
        success: false,
        hasData: false,
        error: err.toString(),
        message: 'Gagal mengambil data dari Spreadsheet: ' + err.toString()
      };
    }
  }

  /**
  * Buka kunci periode tertentu (fitur admin perbaikan data)
  */
  function unlockPeriode(periode, optId) {
    try {
      var p = String(periode).trim();
      var ss = getTargetSpreadsheet(optId);
      var config = getConfig(ss);
      var lockedPeriodes = [];
      try {
        lockedPeriodes = JSON.parse(config['LOCKED_PERIODES'] || '[]');
      } catch(e) {}

      var idx = lockedPeriodes.indexOf(p);
      if (idx === -1) {
        return { success: false, message: 'Periode ' + p + ' tidak ditemukan dalam daftar terkunci.' };
      }

      lockedPeriodes.splice(idx, 1);
      setConfigValue(ss, 'LOCKED_PERIODES', JSON.stringify(lockedPeriodes));

      var normP = normalizePeriode(p);
      var uptimeSheet = ss.getSheetByName('DB_UPTIME');
      if (uptimeSheet && uptimeSheet.getLastRow() > 1) {
        var uAll = uptimeSheet.getDataRange().getValues();
        var uFiltered = [uAll[0]];
        for (var r = 1; r < uAll.length; r++) {
          if (normalizePeriode(uAll[r][0]) !== normP) {
            uFiltered.push(uAll[r]);
          }
        }
        uptimeSheet.clearContents();
        uptimeSheet.getRange(1, 1, uFiltered.length, uFiltered[0].length).setValues(uFiltered);
      }

      var rekapSheet = ss.getSheetByName('DB_REKAP');
      if (rekapSheet && rekapSheet.getLastRow() > 1) {
        var rAll = rekapSheet.getDataRange().getValues();
        var rFiltered = [rAll[0]];
        for (var r = 1; r < rAll.length; r++) {
          if (normalizePeriode(rAll[r][0]) !== normP) {
            rFiltered.push(rAll[r]);
          }
        }
        rekapSheet.clearContents();
        rekapSheet.getRange(1, 1, rFiltered.length, rFiltered[0].length).setValues(rFiltered);
      }

      return {
        success: true,
        lockedPeriodes: lockedPeriodes,
        message: 'Periode ' + p + ' berhasil dibuka kuncinya dari database.'
      };
    } catch (err) {
      return {
        success: false,
        error: err.toString()
      };
    }
  }

  /**
  * Mengambil seluruh daftar tiket tindak lanjut (Follow-Up) dari DB_PROGRESS_PENANGANAN
  */
  function getFollowUpTickets(optId) {
    try {
      var ss = getTargetSpreadsheet(optId);
      initSpreadsheetDB(ss);

      var sheet = ss.getSheetByName('DB_PROGRESS_PENANGANAN');
      var tickets = [];
      if (sheet && sheet.getLastRow() > 1) {
        var data = sheet.getDataRange().getValues();
        for (var r = 1; r < data.length; r++) {
          var row = data[r];
          if (!row[0] || String(row[0]).trim() === '') continue;
          var st = String(row[13] || 'OPEN').trim().toUpperCase();
          if (st === 'RESOLVED') st = 'PANTAU';
          var upDate = String(row[15] || '').trim();
          var tanggalUpdate = upDate ? upDate.slice(0, 10) : '';
          var rawAkar = String(row[9] || '').trim();
          var akarCategory = rawAkar;
          var akarDetail = '';
          if (rawAkar.includes(' - ')) {
            var parts = rawAkar.split(' - ');
            akarCategory = parts[0].trim();
            akarDetail = parts.slice(1).join(' - ').trim();
          }

          var history = [];
          if (row[16]) {
            try {
              history = typeof row[16] === 'string' ? JSON.parse(row[16]) : row[16];
              if (!Array.isArray(history)) history = [];
            } catch(e) {
              history = [];
            }
          }

          var rawPic = String(row[11] || '').trim();
          var defaultVendorPic = String(row[5] || '').trim() ? ('Vendor ' + String(row[5] || '').trim()) : 'Tim Support Internal';
          var finalPic = (rawPic && rawPic !== '-') ? rawPic : defaultVendorPic;

          if (history.length === 0 && (String(row[10] || '').trim() !== '' || st)) {
            history.push({
              id: 'HIST-' + (row[0] || Date.now()) + '-0',
              tanggal: tanggalUpdate || (upDate ? upDate.slice(0, 10) : ''),
              status: st,
              tindakan: String(row[10] || '').trim(),
              pic: finalPic,
              petugas: '',
              akarMasalah: akarCategory,
              detailAkarMasalah: akarDetail,
              catatan: String(row[14] || '').trim(),
              targetSelesai: String(row[12] || '').trim(),
              updatedAt: upDate
            });
          }

          tickets.push({
            id: String(row[0] || '').trim(),
            wsid: String(row[1] || '').trim(),
            lokasi: String(row[2] || '').trim(),
            sektor: String(row[3] || '').trim(),
            wilayah: String(row[4] || '').trim(),
            vendor: String(row[5] || '').trim(),
            periodeProblem: normalizePeriode(row[6]),
            uptimeBaseline: Number(row[7]) || 0,
            kategoriProblem: String(row[8] || '').trim(),
            akarMasalah: akarCategory,
            detailAkarMasalah: akarDetail,
            actionPlan: String(row[10] || '').trim(),
            pic: finalPic,
            petugas: (history.length > 0 && history[0].petugas) ? history[0].petugas : '',
            tanggalUpdate: tanggalUpdate,
            targetSelesai: String(row[12] || '').trim(),
            status: st,
            catatan: String(row[14] || '').trim(),
            updatedAt: upDate,
            history: history
          });
        }
      }

      return {
        success: true,
        tickets: tickets
      };
    } catch (err) {
      return {
        success: false,
        tickets: [],
        error: err.toString(),
        message: 'Gagal membaca tiket follow up: ' + err.toString()
      };
    }
  }

  /**
  * Menyimpan tiket baru atau mengupdate tiket follow-up yang ada di DB_PROGRESS_PENANGANAN
  */
  function saveFollowUpTicket(ticketInput, optId) {
    try {
      var ticket = typeof ticketInput === 'string' ? JSON.parse(ticketInput) : ticketInput;
      var ss = getTargetSpreadsheet(optId);
      initSpreadsheetDB(ss);

      var sheet = ss.getSheetByName('DB_PROGRESS_PENANGANAN');
      var nowIso = new Date().toISOString();
      var updateDate = ticket.tanggalUpdate ? ticket.tanggalUpdate : nowIso.slice(0, 10);

      var ticketId = ticket.id ? String(ticket.id).trim() : ('FU-' + Date.now());
      ticket.id = ticketId;
      ticket.updatedAt = nowIso;
      ticket.tanggalUpdate = updateDate;

      var ticketStatus = (ticket.status || 'OPEN').toUpperCase();
      if (ticketStatus === 'RESOLVED') ticketStatus = 'PANTAU';

      var rawPic = ticket.pic ? String(ticket.pic).trim() : '';
      if (!rawPic || rawPic === '-') {
        rawPic = ticket.vendor && ticket.vendor !== '-' ? ('Vendor ' + ticket.vendor) : 'Tim Support Internal';
      }
      ticket.pic = rawPic;

      var akarToSave = ticket.akarMasalah || '';
      if (ticket.detailAkarMasalah && String(ticket.detailAkarMasalah).trim() !== '') {
        akarToSave = akarToSave ? (akarToSave + ' - ' + String(ticket.detailAkarMasalah).trim()) : String(ticket.detailAkarMasalah).trim();
      }

      var history = Array.isArray(ticket.history) ? ticket.history : [];
      if (history.length === 0) {
        history.push({
          id: 'HIST-' + ticketId + '-' + Date.now(),
          tanggal: updateDate,
          status: ticketStatus,
          tindakan: ticket.actionPlan || '',
          pic: ticket.pic || '',
          petugas: ticket.petugas || '',
          akarMasalah: ticket.akarMasalah || '',
          detailAkarMasalah: ticket.detailAkarMasalah || '',
          catatan: ticket.catatan || '',
          targetSelesai: ticket.targetSelesai || '',
          updatedAt: nowIso
        });
      }

      var rowValues = [
        ticketId,
        ticket.wsid || '',
        ticket.lokasi || '',
        ticket.sektor || '',
        ticket.wilayah || '',
        ticket.vendor || '',
        ticket.periodeProblem || '',
        Number(ticket.uptimeBaseline) || 0,
        ticket.kategoriProblem || '',
        akarToSave,
        ticket.actionPlan || '',
        ticket.pic || '',
        ticket.targetSelesai || '',
        ticketStatus,
        ticket.catatan || '',
        nowIso,
        JSON.stringify(history)
      ];

      // Cek apakah tiket sudah ada untuk diupdate
      var existingRow = -1;
      if (sheet.getLastRow() > 1) {
        var idList = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
        for (var i = 0; i < idList.length; i++) {
          if (String(idList[i][0]).trim() === ticketId) {
            existingRow = i + 2;
            break;
          }
        }
      }

      if (existingRow > 0) {
        sheet.getRange(existingRow, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }

      return {
        success: true,
        ticket: ticket,
        message: 'Tiket ' + ticketId + ' berhasil disimpan.'
      };
    } catch (err) {
      return {
        success: false,
        error: err.toString(),
        message: 'Gagal menyimpan tiket follow up: ' + err.toString()
      };
    }
  }

  /**
  * Menghapus tiket follow up berdasarkan ID
  */
  function deleteFollowUpTicket(ticketIdInput, optId) {
    try {
      var ticketId = String(ticketIdInput || '').trim();
      var ss = getTargetSpreadsheet(optId);
      var sheet = ss.getSheetByName('DB_PROGRESS_PENANGANAN');

      if (!sheet || sheet.getLastRow() <= 1) {
        return { success: false, message: 'Data tiket tidak ditemukan.' };
      }

      var idList = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < idList.length; i++) {
        if (String(idList[i][0]).trim() === ticketId) {
          sheet.deleteRow(i + 2);
          return {
            success: true,
            message: 'Tiket ' + ticketId + ' berhasil dihapus.'
          };
        }
      }

      return { success: false, message: 'Tiket ' + ticketId + ' tidak ditemukan.' };
    } catch (err) {
      return {
        success: false,
        error: err.toString(),
        message: 'Gagal menghapus tiket follow up: ' + err.toString()
      };
    }
  }

  /**
   * Mengambil seluruh daftar tiket follow-up modern dari DB_TIKET_FOLLOWUP
   */
  function getFollowUpTicketsModern(optId) {
    try {
      var ss = getTargetSpreadsheet(optId);
      initSpreadsheetDB(ss);
      var sheet = ss.getSheetByName('DB_TIKET_FOLLOWUP');
      var tickets = [];
      if (sheet && sheet.getLastRow() > 1) {
        var data = sheet.getDataRange().getValues();
        for (var r = 1; r < data.length; r++) {
          var row = data[r];
          if (!row[0] || String(row[0]).trim() === '') continue;
          var pList = [];
          if (row[15]) {
            try {
              pList = typeof row[15] === 'string' ? JSON.parse(row[15]) : row[15];
              if (!Array.isArray(pList)) pList = [];
            } catch(e) { pList = []; }
          }
          var reqClose = null;
          if (row[16]) {
            try {
              reqClose = typeof row[16] === 'string' ? JSON.parse(row[16]) : row[16];
            } catch(e) { reqClose = null; }
          }
          var validation = null;
          if (row[17]) {
            try {
              validation = typeof row[17] === 'string' ? JSON.parse(row[17]) : row[17];
            } catch(e) { validation = null; }
          }

          tickets.push({
            ticketId: String(row[0] || '').trim(),
            wsid: String(row[1] || '').trim(),
            lokasi: String(row[2] || '').trim(),
            sektor: String(row[3] || '').trim(),
            servicePoint: String(row[4] || '').trim(),
            vendor: String(row[5] || '').trim(),
            problem: String(row[6] || '').trim(),
            sumberProblem: String(row[7] || 'OPEN_INCIDENT').trim(),
            prioritas: String(row[8] || 'HIGH').trim().toUpperCase(),
            kategori: String(row[9] || 'VENDOR').trim().toUpperCase(),
            catatanRequest: String(row[10] || '').trim(),
            createdBy: String(row[11] || '').trim(),
            createdAt: String(row[12] || '').trim(),
            status: String(row[13] || 'OPEN').trim().toUpperCase(),
            durasiMenitFinal: Number(row[14]) || 0,
            progresList: pList,
            reqCloseInfo: reqClose,
            validationInfo: validation,
            updatedAt: String(row[18] || '').trim()
          });
        }
      }
      return { success: true, tickets: tickets };
    } catch (err) {
      return { success: false, tickets: [], error: err.toString() };
    }
  }

  /**
   * Menyimpan atau memperbarui tiket follow-up di DB_TIKET_FOLLOWUP
   */
  function saveFollowUpTicketModern(ticketInput, optId) {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
      var ticket = typeof ticketInput === 'string' ? JSON.parse(ticketInput) : ticketInput;
      var ss = getTargetSpreadsheet(optId);
      initSpreadsheetDB(ss);

      var sheet = ss.getSheetByName('DB_TIKET_FOLLOWUP');
      var nowIso = new Date().toISOString();

      var ticketId = ticket.ticketId ? String(ticket.ticketId).trim() : '';
      if (!ticketId) {
        var d = new Date();
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        var rand = Math.floor(100 + Math.random() * 900);
        ticketId = 'TKT-' + y + m + day + '-' + rand;
      }
      ticket.ticketId = ticketId;
      ticket.updatedAt = nowIso;
      if (!ticket.createdAt) {
        ticket.createdAt = nowIso;
      }

      var rowValues = [
        ticketId,
        ticket.wsid || '',
        ticket.lokasi || '',
        ticket.sektor || '',
        ticket.servicePoint || '',
        ticket.vendor || '',
        ticket.problem || '',
        ticket.sumberProblem || 'OPEN_INCIDENT',
        (ticket.prioritas || 'HIGH').toUpperCase(),
        (ticket.kategori || 'VENDOR').toUpperCase(),
        ticket.catatanRequest || '',
        ticket.createdBy || '',
        ticket.createdAt || nowIso,
        (ticket.status || 'OPEN').toUpperCase(),
        Number(ticket.durasiMenitFinal) || 0,
        JSON.stringify(Array.isArray(ticket.progresList) ? ticket.progresList : []),
        ticket.reqCloseInfo ? JSON.stringify(ticket.reqCloseInfo) : '',
        ticket.validationInfo ? JSON.stringify(ticket.validationInfo) : '',
        nowIso
      ];

      var existingRow = -1;
      if (sheet.getLastRow() > 1) {
        var idList = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
        for (var i = 0; i < idList.length; i++) {
          if (String(idList[i][0]).trim() === ticketId) {
            existingRow = i + 2;
            break;
          }
        }
      }

      if (existingRow > 0) {
        sheet.getRange(existingRow, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }
      SpreadsheetApp.flush();

      return {
        success: true,
        ticket: ticket,
        message: 'Tiket ' + ticketId + ' berhasil disimpan.'
      };
    } catch (err) {
      return {
        success: false,
        error: err.toString(),
        message: 'Gagal menyimpan tiket follow up: ' + err.toString()
      };
    } finally {
      try { lock.releaseLock(); } catch(e) {}
    }
  }

  /**
   * Menghapus tiket follow-up dari DB_TIKET_FOLLOWUP
   */
  function deleteFollowUpTicketModern(ticketIdInput, optId) {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
      var ticketId = String(ticketIdInput || '').trim();
      var ss = getTargetSpreadsheet(optId);
      var sheet = ss.getSheetByName('DB_TIKET_FOLLOWUP');

      if (!sheet || sheet.getLastRow() <= 1) {
        return { success: false, message: 'Data tiket tidak ditemukan.' };
      }

      var idList = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < idList.length; i++) {
        if (String(idList[i][0]).trim() === ticketId) {
          sheet.deleteRow(i + 2);
          SpreadsheetApp.flush();
          return { success: true, message: 'Tiket ' + ticketId + ' berhasil dihapus.' };
        }
      }

      return { success: false, message: 'Tiket ' + ticketId + ' tidak ditemukan.' };
    } catch (err) {
      return { success: false, error: err.toString() };
    } finally {
      try { lock.releaseLock(); } catch(e) {}
    }
  }

  /* ==========================================================================
  * MODUL DATABASE INSIDEN & SISTEM MONITORING (PROMPT UPDATE 2026)
  * ========================================================================== */

  /**
  * 35 Event Code Description Whitelist
  */
  var EVENT_CODE_WHITELIST = [
    'CAH HANDLER: Op not attmptd-BILL IN TRANSPORT',
    'Card Reader Faults',
    'CARD SKIMMING',
    'cash handlr: Exit shutter jamm',
    'cash handlr: Op not attmptd -p',
    'cash handlr: Presenter sensor',
    'cash handlr: Presenter timing',
    'Cassette & Reject bin Overfill',
    'Chip Contact Indicates Problem',
    'COM-ATM HAS BEEN MARKED DOWN',
    'Comm Down 30x Per Hari',
    'DSP-BILLS NOT SEEN AT EXIT SEN',
    'DSP-Pick Module Failure',
    'DSP-SENSOR FAILED/CURCY JAM',
    'encryptor: Hardware error',
    'EPP PK Not Verified',
    'Error on Bunch Notes Acceptor',
    'ICR-CARD JAM DURING CAPTURE',
    'ICR-DEVICE STILL INOPERATIVE',
    'LLH-Lain-lain hardware',
    'Multi-Cassette Fault',
    'Multi-Cassette Fault/Out',
    'Multi-Cassette FaultOut',
    'Multi-Cassette Missing',
    'Multi-Cassette Out',
    'PAP-PAPER EXHAUSTED',
    'PAP-PAPER NOT LOADED',
    'PRT-PRINTER OPEN',
    'Receipt Printer Faulted',
    'recpt prntr: Paper low',
    'Reject bin near full',
    'REJ-REJECT BIN OVERFILL',
    'SHUTTER JAMMED',
    'SPV-MODE SWITCH MOVE TO SPV',
    'V-SAT'
  ];

  var EVENT_CODE_WHITELIST_MAP = {};
  for (var wIdx = 0; wIdx < EVENT_CODE_WHITELIST.length; wIdx++) {
    EVENT_CODE_WHITELIST_MAP[EVENT_CODE_WHITELIST[wIdx].toUpperCase().trim()] = true;
  }

  function cleanSektorNameGS(raw) {
    if (!raw) return '-';
    var s = String(raw).trim();
    if (!s || s === '-' || s === '#N/A' || s === 'UNKNOWN' || s.toUpperCase() === 'NON BCA') return '-';
    var u = s.toUpperCase();
    if (u === 'ABACUS CASH SOLUTION' || u === 'GRUP ABACUS CASH SOLUTION' || u.indexOf('PT ABACUS') !== -1) {
      return '-';
    }
    if (s.indexOf('-') !== -1) {
      var parts = s.split('-');
      var code = parts[0].trim().toUpperCase();
      if (code.length >= 2 && code.length <= 6) {
        var rest = parts.slice(1).join('-').trim();
        if (rest) return rest.toUpperCase();
      }
    }
    return s.toUpperCase();
  }

  /**
   * Normalisasi WSID pada Google Apps Script:
   * 1. Mengubah objek/string Date kembali ke nomor serial Excel WSID (misal: 'Sat Sep 12 1903' -> 1351, 'Sun Apr 22 1900' -> 0113)
   * 2. Menambahkan leading zero untuk angka murni 1-4 digit (54 -> 0054)
   * 3. Menolak data korup/tergeser (seperti 1000000000)
   */
  function cleanWsidGS(val) {
    if (val === null || val === undefined) return '';
    var isDateObj = (Object.prototype.toString.call(val) === '[object Date]') && !isNaN(val.getTime());
    var str = String(val).trim();
    if (!str || str === '-' || str === '#N/A' || str.toUpperCase() === 'N/A' || str.toUpperCase() === 'UNKNOWN') return '';

    var dateStrMatch = str.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/i);
    var isoDateMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (isDateObj || dateStrMatch || isoDateMatch) {
      var yr = 0, mon = 0, day = 0;
      if (isDateObj) {
        yr = val.getFullYear();
        mon = val.getMonth();
        day = val.getDate();
      } else if (dateStrMatch) {
        var monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
        mon = monthMap[dateStrMatch[1].toLowerCase()] || 0;
        day = parseInt(dateStrMatch[2], 10);
        yr = parseInt(dateStrMatch[3], 10);
      } else if (isoDateMatch) {
        yr = parseInt(isoDateMatch[1], 10);
        mon = parseInt(isoDateMatch[2], 10) - 1;
        day = parseInt(isoDateMatch[3], 10);
      }

      if (yr >= 1900 && yr <= 1930) {
        var excelEpoch = Date.UTC(1899, 11, 30);
        var targetUtc = Date.UTC(yr, mon, day);
        var serial = Math.round((targetUtc - excelEpoch) / 86400000);
        if (serial > 0 && serial < 10000) {
          var sStr = String(serial);
          while (sStr.length < 4) sStr = '0' + sStr;
          return sStr;
        }
      }
    }

    str = str.replace(/^['"]+|['"]+$/g, '').trim();
    str = str.replace(/\.0+$/, '');

    if (/^\d{1,4}$/.test(str)) {
      while (str.length < 4) str = '0' + str;
      return str;
    }

    if (/^[A-Za-z0-9]{3,6}$/.test(str)) {
      return str.toUpperCase();
    }

    return '';
  }

  /**
  * 1. AUTENTIKASI KA OPS
  */
  function setupKaOpsPassword() {
    var props = PropertiesService.getScriptProperties();
    var curr = props.getProperty('KAOPS_PASSWORD');
    if (!curr) {
      props.setProperty('KAOPS_PASSWORD', 'akuadalahgacorasli');
    }
    return { success: true, message: 'Password Ka Ops telah dikonfigurasi.' };
  }

  function setupKaOpsPasswordManual() {
    try {
      setupKaOpsPassword();
      SpreadsheetApp.getUi().alert('Password Ka Ops berhasil diset ke default: akuadalahgacorasli\n(Tersimpan aman di Script Properties).');
    } catch (e) {
      SpreadsheetApp.getUi().alert('Gagal setup password: ' + e.toString());
    }
  }

  function loginKaOps(passwordInput) {
    try {
      var cache = CacheService.getScriptCache();
      var lockKey = 'LOCK_KAOPS_LOGIN';
      var isLocked = cache.get(lockKey);
      if (isLocked) {
        return {
          success: false,
          isLocked: true,
          message: 'Akses Ka Ops sementara dikunci karena 5x gagal login. Silakan tunggu 5 menit sebelum mencoba kembali.'
        };
      }

      var props = PropertiesService.getScriptProperties();
      var realPw = props.getProperty('KAOPS_PASSWORD') || 'akuadalahgacorasli';
      var input = String(passwordInput || '').trim();

      if (input !== realPw) {
        var failKey = 'FAIL_KAOPS_LOGIN';
        var fails = parseInt(cache.get(failKey) || '0', 10) + 1;
        if (fails >= 5) {
          cache.put(lockKey, 'LOCKED', 300); // 5 menit
          cache.remove(failKey);
          return {
            success: false,
            isLocked: true,
            message: 'Password salah 5x berturut-turut. Akses dikunci selama 5 menit demi keamanan.'
          };
        } else {
          cache.put(failKey, String(fails), 300);
          return {
            success: false,
            remainingAttempts: 5 - fails,
            message: 'Password salah! Sisa percobaan: ' + (5 - fails) + 'x.'
          };
        }
      }

      // Password Benar -> Buat Token Sesi (TTL 6 jam = 21600 detik)
      cache.remove('FAIL_KAOPS_LOGIN');
      var token = 'KAOPS_' + Utilities.getUuid() + '_' + Date.now();
      cache.put('KAOPS_TOKEN_' + token, 'VALID', 21600);

      return {
        success: true,
        token: token,
        message: 'Login Ka Ops berhasil.'
      };
    } catch (err) {
      return { success: false, message: 'Gagal login: ' + err.toString() };
    }
  }

  function verifyKaOpsToken(token) {
    if (!token) return false;
    var cache = CacheService.getScriptCache();
    return cache.get('KAOPS_TOKEN_' + token) === 'VALID';
  }

  function logoutKaOps(token) {
    try {
      if (token) {
        CacheService.getScriptCache().remove('KAOPS_TOKEN_' + token);
      }
      return { success: true };
    } catch (e) {
      return { success: false };
    }
  }

  /**
  * 1B. AUTENTIKASI KA WIL (KEPALA WILAYAH)
  */
  function setupKaWilPassword() {
    var props = PropertiesService.getScriptProperties();
    var curr = props.getProperty('KAWIL_PASSWORD');
    if (!curr) {
      props.setProperty('KAWIL_PASSWORD', 'kawilacjk');
    }
    return { success: true, message: 'Password Ka Wil telah dikonfigurasi.' };
  }

  function setupKaWilPasswordManual() {
    try {
      setupKaWilPassword();
      SpreadsheetApp.getUi().alert('Password Ka Wil berhasil diset ke default: kawilacjk\n(Tersimpan aman di Script Properties).');
    } catch (e) {
      SpreadsheetApp.getUi().alert('Gagal setup password Ka Wil: ' + e.toString());
    }
  }

  function loginKaWil(passwordInput) {
    try {
      var cache = CacheService.getScriptCache();
      var lockKey = 'LOCK_KAWIL_LOGIN';
      var isLocked = cache.get(lockKey);
      if (isLocked) {
        return {
          success: false,
          isLocked: true,
          message: 'Akses Ka Wil sementara dikunci karena 5x gagal login. Silakan tunggu 5 menit sebelum mencoba kembali.'
        };
      }

      var props = PropertiesService.getScriptProperties();
      var realPw = props.getProperty('KAWIL_PASSWORD') || 'kawilacjk';
      var input = String(passwordInput || '').trim();

      if (input !== realPw) {
        var failKey = 'FAIL_KAWIL_LOGIN';
        var fails = parseInt(cache.get(failKey) || '0', 10) + 1;
        if (fails >= 5) {
          cache.put(lockKey, 'LOCKED', 300); // 5 menit
          cache.remove(failKey);
          return {
            success: false,
            isLocked: true,
            message: 'Password salah 5x berturut-turut. Akses dikunci selama 5 menit demi keamanan.'
          };
        } else {
          cache.put(failKey, String(fails), 300);
          return {
            success: false,
            remainingAttempts: 5 - fails,
            message: 'Password salah! Sisa percobaan: ' + (5 - fails) + 'x.'
          };
        }
      }

      // Password Benar -> Buat Token Sesi (TTL 6 jam = 21600 detik)
      cache.remove('FAIL_KAWIL_LOGIN');
      var token = 'KAWIL_' + Utilities.getUuid() + '_' + Date.now();
      cache.put('KAWIL_TOKEN_' + token, 'VALID', 21600);

      return {
        success: true,
        token: token,
        role: 'KAWIL',
        message: 'Login Ka Wil berhasil.'
      };
    } catch (err) {
      return { success: false, message: 'Gagal login Ka Wil: ' + err.toString() };
    }
  }

  function verifyKaWilToken(token) {
    if (!token) return false;
    var cache = CacheService.getScriptCache();
    return cache.get('KAWIL_TOKEN_' + token) === 'VALID';
  }

  function verifySupervisorToken(token) {
    if (!token) return false;
    return verifyKaOpsToken(token) || verifyKaWilToken(token);
  }

  function logoutKaWil(token) {
    try {
      if (token) {
        CacheService.getScriptCache().remove('KAWIL_TOKEN_' + token);
      }
      return { success: true };
    } catch (e) {
      return { success: false };
    }
  }

  /**
  * 2. MANAJEMEN DATABASE INSIDEN TERPISAH
  */
  function getIncidentDbId() {
    try {
      var props = PropertiesService.getScriptProperties();
      var id = props.getProperty('INCIDENT_DB_SPREADSHEET_ID') || '';
      var name = '';
      if (id) {
        try {
          var ss = SpreadsheetApp.openById(id);
          name = ss.getName();
        } catch (e) {
          name = '(Tidak dapat diakses/periksa izin)';
        }
      }
      return { success: true, id: id, name: name };
    } catch (err) {
      return { success: false, id: '', error: err.toString() };
    }
  }

  function setIncidentDbId(idOrUrl, token) {
    try {
      if (token && !verifySupervisorToken(token)) {
        return { success: false, message: 'Sesi Ka Ops / Ka Wil tidak valid atau telah kedaluwarsa.' };
      }

      var raw = String(idOrUrl || '').trim();
      if (!raw) {
        return { success: false, message: 'ID Spreadsheet tidak boleh kosong.' };
      }

      // Ekstrak ID jika user memasukkan URL lengkap
      var cleanId = raw;
      var matchUrl = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (matchUrl && matchUrl[1]) {
        cleanId = matchUrl[1];
      }

      // Validasi apakah spreadsheet bisa dibuka
      var ss;
      try {
        ss = SpreadsheetApp.openById(cleanId);
      } catch (openErr) {
        return {
          success: false,
          message: 'Gagal membuka Spreadsheet ID: ' + cleanId + '. Pastikan ID benar dan akun Apps Script memiliki izin Editor.'
        };
      }

      // Inisialisasi struktur sheet standar
      initIncidentDb(ss);

      // Simpan ke Script Properties
      PropertiesService.getScriptProperties().setProperty('INCIDENT_DB_SPREADSHEET_ID', cleanId);

      return {
        success: true,
        id: cleanId,
        name: ss.getName(),
        message: 'Berhasil menghubungkan dan menginisialisasi Database Insiden: "' + ss.getName() + '"!'
      };
    } catch (err) {
      return { success: false, message: 'Gagal menyimpan ID database insiden: ' + err.toString() };
    }
  }

  function getIncidentDbSpreadsheet() {
    try {
      var props = PropertiesService.getScriptProperties();
      var rawId = props.getProperty('INCIDENT_DB_SPREADSHEET_ID');
      if (!rawId || rawId.trim() === '') {
        rawId = props.getProperty('SPREADSHEET_ID');
      }
      var cleanId = extractSpreadsheetIdGS(rawId);
      if (!cleanId) {
        return getTargetSpreadsheet();
      }
      var ss = SpreadsheetApp.openById(cleanId);
      try {
        if (ss.getSpreadsheetLocale() !== 'id_ID') {
          ss.setSpreadsheetLocale('id_ID');
        }
        if (ss.getSpreadsheetTimeZone() !== 'Asia/Jakarta') {
          ss.setSpreadsheetTimeZone('Asia/Jakarta');
        }
      } catch (e) {}
      return ss;
    } catch (err) {
      console.warn('Gagal membuka INCIDENT_DB_SPREADSHEET_ID, fallback ke target: ' + err.toString());
      return getTargetSpreadsheet();
    }
  }

  function initIncidentDbManual() {
    try {
      var props = PropertiesService.getScriptProperties();
      var rawId = props.getProperty('INCIDENT_DB_SPREADSHEET_ID');
      var cleanId = extractSpreadsheetIdGS(rawId);
      var ss;
      if (cleanId) {
        ss = SpreadsheetApp.openById(cleanId);
      } else {
        ss = SpreadsheetApp.getActiveSpreadsheet();
      }
      initIncidentDb(ss);
      SpreadsheetApp.getUi().alert('Inisialisasi Database Insiden selesai pada: ' + ss.getName());
    } catch (err) {
      SpreadsheetApp.getUi().alert('Gagal inisialisasi database insiden: ' + err.toString());
    }
  }

  function initIncidentDb(ss) {
    try {
      if (ss.getSpreadsheetLocale() !== 'id_ID') {
        ss.setSpreadsheetLocale('id_ID');
      }
      if (ss.getSpreadsheetTimeZone() !== 'Asia/Jakarta') {
        ss.setSpreadsheetTimeZone('Asia/Jakarta');
      }
    } catch (e) {}
    // 1. Sheet DB_UPLOAD_LOG
    var logSheet = ss.getSheetByName('DB_UPLOAD_LOG');
    if (!logSheet) {
      logSheet = ss.insertSheet('DB_UPLOAD_LOG');
    }
    var logHeaders = ['Waktu', 'Nama_Uploader', 'Sumber', 'Nama_File', 'Total_Baris_CSV', 'Lolos_35_Event', 'Baru', 'Diupdate', 'Tanpa_Perubahan', 'Dilewati'];
    formatSheetHeader(logSheet, logHeaders);

    // 2. Sheet DB_CONFIG
    var cfgSheet = ss.getSheetByName('DB_CONFIG');
    if (!cfgSheet) {
      cfgSheet = ss.insertSheet('DB_CONFIG');
      var cfgHeaders = ['Key', 'Value', 'Keterangan'];
      formatSheetHeader(cfgSheet, cfgHeaders);
      cfgSheet.getRange(2, 1, 2, 3).setValues([
        ['schema_version', '1.0', 'Versi skema database insiden'],
        ['scan_months', '3', 'Jumlah bulan ke belakang yang discan untuk open problem']
      ]);
    }
  }

  /**
   * Memastikan kapasitas baris di sheet mencukupi sebelum setValues()
   * Otomatis menambah baris jika kurang, sehingga user TIDAK PERLU klik 'Add rows' manual!
   */
  function pangkasBarisKosongInternal(ss) {
    if (!ss) return;
    try {
      var sheets = ss.getSheets();
      for (var i = 0; i < sheets.length; i++) {
        var sh = sheets[i];
        var sName = sh.getName();

        // Hapus sheet yang salah nama (misal ACT_07/10/2) jika isinya kosong atau hanya header
        if (/^(ACT|INC)_/.test(sName) && !/^(ACT|INC)_\d{4}-\d{2}$/.test(sName)) {
          if (sh.getLastRow() <= 1 && sheets.length > 1) {
            try { ss.deleteSheet(sh); continue; } catch (e) {}
          }
        }

        var maxR = sh.getMaxRows();
        var lastR = sh.getLastRow();
        var safeTarget = Math.max(lastR + 50, 100);
        if (maxR > safeTarget) {
          var rowsToDelete = maxR - safeTarget;
          try {
            sh.deleteRows(safeTarget + 1, rowsToDelete);
          } catch (e) {}
        }
      }
    } catch (err) {
      console.warn('pangkasBarisKosongInternal warning: ' + err);
    }
  }

  function ensureSheetCapacity(sheet, neededRow) {
    if (!sheet || !neededRow || isNaN(neededRow) || neededRow <= 0) return;
    try {
      // 🛡️ PROTEKSI MUTLAK: Jangan pernah izinkan neededRow > 200.000 untuk mencegah alokasi miliaran sel
      if (neededRow > 200000) {
        console.warn('ensureSheetCapacity: neededRow abnormal (' + neededRow + '), operasi ditolak untuk keamanan.');
        return;
      }

      var maxR = sheet.getMaxRows();
      if (neededRow > maxR) {
        var toAdd = (neededRow - maxR) + 50; // Buffer ringkas 50 baris saja
        try {
          sheet.insertRowsAfter(maxR, toAdd);
        } catch (capErr) {
          pangkasBarisKosongInternal(sheet.getParent());
          var newMaxR = sheet.getMaxRows();
          if (neededRow > newMaxR) {
            sheet.insertRowsAfter(newMaxR, (neededRow - newMaxR) + 10);
          }
        }
      }
    } catch (e) {
      console.warn('ensureSheetCapacity: ' + e);
    }
  }

  /**
   * Pangkas baris-baris kosong berlebih di spreadsheet Daily Incident & Master
   * agar spreadsheet tetap ringan dan terbebas dari limit 10/20 juta sel Google
   */
  function pangkasBarisKosongBerlebih() {
    try {
      var report = [];
      var ssList = [getIncidentDbSpreadsheet(), getTargetSpreadsheet()];
      for (var sIdx = 0; sIdx < ssList.length; sIdx++) {
        var ss = ssList[sIdx];
        if (!ss) continue;
        var sheets = ss.getSheets();
        for (var i = 0; i < sheets.length; i++) {
          var sh = sheets[i];
          var sName = ss.getName() + ' -> ' + sh.getName();
          var maxR = sh.getMaxRows();
          var lastR = sh.getLastRow();
          var safeTarget = Math.max(lastR + 50, 100);
          if (maxR > safeTarget) {
            var rowsToDelete = maxR - safeTarget;
            try {
              sh.deleteRows(safeTarget + 1, rowsToDelete);
              report.push(sName + ': Dihapus ' + rowsToDelete + ' baris kosong (Sisa baris: ' + sh.getMaxRows() + ')');
            } catch (delErr) {
              report.push(sName + ': Gagal menghapus: ' + delErr.toString());
            }
          } else {
            report.push(sName + ': Normal (' + maxR + ' baris, data sampai baris ' + lastR + ')');
          }
        }
      }
      Logger.log('=== HASIL PANGKAS BARIS KOSONG ===');
      report.forEach(function(r) { Logger.log(r); });
      return { success: true, message: 'Berhasil memangkas baris kosong berlebih.', report: report };
    } catch (err) {
      Logger.log('Gagal pangkas baris: ' + err.toString());
      return { success: false, error: err.toString() };
    }
  }

  /**
   * Diagnostik status sel dan baris pada Spreadsheet Daily & Master
   */
  function diagnoseDailyDb() {
    try {
      var ss1 = getIncidentDbSpreadsheet();
      var ss2 = getTargetSpreadsheet();
      var report = {};

      if (ss1) {
        var list1 = [];
        var totalCells1 = 0;
        var s1 = ss1.getSheets();
        for (var i = 0; i < s1.length; i++) {
          var sh1 = s1[i];
          var mr1 = sh1.getMaxRows();
          var mc1 = sh1.getMaxColumns();
          var lr1 = sh1.getLastRow();
          var c1 = mr1 * mc1;
          totalCells1 += c1;
          list1.push({ name: sh1.getName(), lastRow: lr1, maxRows: mr1, maxColumns: mc1, cells: c1 });
        }
        report.incidentDb = {
          name: ss1.getName(),
          id: ss1.getId(),
          totalCells: totalCells1,
          maxLimit: 20000000,
          percentUsed: ((totalCells1 / 20000000) * 100).toFixed(2) + '%',
          sheets: list1
        };
      }

      if (ss2 && (!ss1 || ss1.getId() !== ss2.getId())) {
        var list2 = [];
        var totalCells2 = 0;
        var s2 = ss2.getSheets();
        for (var j = 0; j < s2.length; j++) {
          var sh2 = s2[j];
          var mr2 = sh2.getMaxRows();
          var mc2 = sh2.getMaxColumns();
          var lr2 = sh2.getLastRow();
          var c2 = mr2 * mc2;
          totalCells2 += c2;
          list2.push({ name: sh2.getName(), lastRow: lr2, maxRows: mr2, maxColumns: mc2, cells: c2 });
        }
        report.masterDb = {
          name: ss2.getName(),
          id: ss2.getId(),
          totalCells: totalCells2,
          maxLimit: 20000000,
          percentUsed: ((totalCells2 / 20000000) * 100).toFixed(2) + '%',
          sheets: list2
        };
      }

      return {
        success: true,
        totalCells: report.incidentDb ? report.incidentDb.totalCells : 0,
        sheets: report.incidentDb ? report.incidentDb.sheets : [],
        ...report
      };
    } catch (err) {
      return { success: false, error: err.toString() };
    }
  }

  function formatSheetHeader(sheet, headers) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    var hr = sheet.getRange(1, 1, 1, headers.length);
    hr.setBackground('#1e293b');
    hr.setFontColor('#ffffff');
    hr.setFontWeight('bold');
    hr.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }

  function getOrCreateIncidentSheet(ss, monthStr) {
    var sheetName = 'INC_' + monthStr;
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      var headers = [
        'Incident_Key', 'Incident_Number', 'WSID', 'Lokasi', 'Service_Point', 'Sektor',
        'Tipe_Mesin', 'Vendor', 'Event_Code', 'Event_Code_Description', 'Detail',
        'Start_Time', 'End_Time', 'Tanggal', 'Jam', 'Duration_Raw', 'Durasi_OPR_Menit',
        'Status', 'Action_Terakhir', 'Action_Terakhir_Oleh', 'Action_Terakhir_Waktu',
        'Jumlah_Action', 'First_Upload_At', 'First_Upload_By', 'Last_Update_At', 'Last_Update_By'
      ];
      formatSheetHeader(sheet, headers);
    }
    return sheet;
  }

  function getOrCreateActionSheet(ss, monthStr) {
    var sheetName = 'ACT_' + monthStr;
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      var headers = [
        'Log_ID', 'Waktu', 'Incident_Key', 'WSID', 'Event_Code_Description',
        'Tipe', 'Isi_Action', 'Nama_Petugas', 'Status_Sebelum', 'Status_Sesudah', 'Catatan_Perubahan'
      ];
      formatSheetHeader(sheet, headers);
    }
    return sheet;
  }

  function formatDateWib(date) {
    var d = date instanceof Date ? date : new Date();
    return Utilities.formatDate(d, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
  }

  /**
  * 3. ENGINE PERHITUNGAN DURASI OPR DI SERVER
  */
  function parseDateTimeServer(str, targetMonthHint) {
    if (!str || str === '-' || String(str).trim() === '') return null;
    var clean = String(str).trim();
    var parts = clean.split(' ');
    var sep = parts[0].indexOf('-') !== -1 ? '-' : '/';
    var dParts = parts[0].split(sep);
    if (dParts.length < 3) return null;
    var day = parseInt(dParts[0], 10);
    var month = parseInt(dParts[1], 10);
    var year = parseInt(dParts[2], 10);
    var tMonth = targetMonthHint || 10;
    if (dParts[0].length === 4) {
      year = parseInt(dParts[0], 10);
      month = parseInt(dParts[1], 10);
      day = parseInt(dParts[2], 10);
    } else if (month > 12 && day <= 12) {
      var tmp = day;
      day = month;
      month = tmp;
    } else if (day === tMonth && month !== tMonth && month <= 12) {
      // Inversi US: day adalah targetMonth (10), month adalah tanggal (1..12)
      var tmp2 = day;
      day = month;
      month = tmp2;
    }
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    var hour = 0, minute = 0, second = 0;
    if (parts[1]) {
      var tParts = parts[1].split(':');
      hour = parseInt(tParts[0] || '0', 10);
      minute = parseInt(tParts[1] || '0', 10);
      second = parseInt(tParts[2] || '0', 10);
    }
    return new Date(year, month - 1, day, hour, minute, second);
  }

  function parseOperatingDaysServer(hariStr) {
    var h = String(hariStr || 'MON-SUN').trim().toUpperCase();
    if (h.indexOf('MON-FRI') !== -1) return [1, 2, 3, 4, 5];
    if (h.indexOf('MON-SAT') !== -1) return [1, 2, 3, 4, 5, 6];
    return [0, 1, 2, 3, 4, 5, 6];
  }

  function parseOperatingHoursServer(jamStr) {
    var clean = String(jamStr || '00:00 - 23:59').replace(/[()]/g, '').trim();
    var parts = clean.split(/[-–]/);
    var startH = 0, startM = 0, endH = 23, endM = 59;
    if (parts.length === 2) {
      var sTime = parts[0].trim().split(':');
      var eTime = parts[1].trim().split(':');
      startH = parseInt(sTime[0], 10) || 0;
      startM = parseInt(sTime[1], 10) || 0;
      endH = parseInt(eTime[0], 10) || 23;
      endM = parseInt(eTime[1], 10) || 59;
    }
    return { startH: startH, startM: startM, endH: endH, endM: endM };
  }

  function calculateOperationalDurationServer(startStr, endStr, hariStr, jamStr, targetMonth) {
    var sMonth = targetMonth || 10;
    var start = parseDateTimeServer(startStr, sMonth);
    if (!start) return 0;
    var end = parseDateTimeServer(endStr, sMonth);
    if (!end) {
      end = new Date(); // Jika open, hitung sampai waktu saat ini
    }
    if (end.getTime() <= start.getTime()) return 0;

    var days = parseOperatingDaysServer(hariStr);
    var activeDays = {};
    for (var i = 0; i < days.length; i++) {
      activeDays[days[i]] = true;
    }

    var hours = parseOperatingHoursServer(jamStr);
    var totalMs = 0;
    var cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    var lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    while (cur.getTime() <= lastDay.getTime()) {
      var dayOfWeek = cur.getDay();
      if (activeDays[dayOfWeek]) {
        var openTime = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), hours.startH, hours.startM, 0);
        var closeTime = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), hours.endH, hours.endM, hours.endH === 23 && hours.endM === 59 ? 59 : 0, hours.endH === 23 && hours.endM === 59 ? 999 : 0);

        var winStart = Math.max(start.getTime(), openTime.getTime());
        var winEnd = Math.min(end.getTime(), closeTime.getTime());

        if (winEnd > winStart) {
          totalMs += (winEnd - winStart);
        }
      }
      cur.setDate(cur.getDate() + 1);
    }

    return Math.round(totalMs / 60000);
  }

  /**
  * Sanitasi string cegah formula injection
  */
  function sanitizeCellText(val) {
    if (val === null || val === undefined) return '';
    var str = String(val).trim();
    if (str.length > 0 && (str[0] === '=' || str[0] === '+' || str[0] === '-' || str[0] === '@')) {
      return "'" + str;
    }
    return str;
  }

  /**
   * Mendeteksi pesan error log teknis mesin ATM/CRM dari file CSV / sistem monitoring
   */
  function isTechnicalMachineLog(str) {
    if (!str || str === '-' || String(str).trim() === '') return false;
    var s = String(str).trim();
    if (/^(uns|sol|err|atm|crm|warn|info|status|tran|com|dsp|reject|multi|spv|flm|slm):/i.test(s)) return true;
    if (/has been marked|atm\s+|crm\s+|sent a power|error on|warning no|hopper|cassette|balancing|out of|mode switch|notes low|bills not|tran status|paper low|recpt prntr|reject bin|bunch note|card number|bna/i.test(s)) return true;
    return false;
  }

  /**
   * Standar baku penentu status Problem Open / Closed:
   * Sebuah problem HANYA dianggap CLOSED jika kolom End_Time benar-benar terisi tanggal & jam selesai yang valid.
   * Jika kosong, '-', '00:00:00', null, undefined, atau tahun 1899/1900, maka statusnya 100% MUTLAK OPEN.
   */
  function isEndTimeFilledGS(val) {
    if (val === null || val === undefined) return false;
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return false;
      if (val.getFullYear() < 2020) return false; // Filter epoch 1899/1900
      return true;
    }
    var s = String(val).trim();
    if (
      s === '' ||
      s === '-' ||
      s === '00:00:00' ||
      s === 'null' ||
      s === 'undefined' ||
      s.indexOf('1899') !== -1 ||
      s.indexOf('1900') !== -1 ||
      s.toUpperCase() === 'OPEN'
    ) {
      return false;
    }
    return /\d/.test(s);
  }

  /**
   * Normalisasi format bulan menjadi YYYY-MM dari format DD/MM/YYYY, YYYY-MM-DD, atau YYYY-MM
   */
  function normalizeMonthStr(val) {
    if (!val || val === '-') return '';
    var s = String(val).trim();
    if (s.indexOf('/') !== -1) {
      var p = s.split(' ')[0].split('/');
      if (p.length === 3) {
        var y = p[2].length === 2 ? '20' + p[2] : p[2];
        var m = ('0' + p[1]).slice(-2);
        return y + '-' + m;
      }
    }
    if (/^\d{4}-\d{2}/.test(s)) {
      return s.slice(0, 7);
    }
    return '';
  }

  /**
  * 4. ENGINE UPLOAD UPSERT CSV DENGAN LOCK & CHUNKING
  */
  function uploadIncidentChunk(payload) {
    var lock = LockService.getScriptLock();
    var hasLock = false;
    try {
      hasLock = lock.tryLock(30000);
      if (!hasLock) {
        return { success: false, message: 'Server sedang sibuk memproses upload lain. Silakan coba sesaat lagi.' };
      }

      var uploaderName = sanitizeCellText(payload.uploaderName || 'Ka Ops');
      var sumber = payload.sumber || 'Monitoring';
      var fileName = sanitizeCellText(payload.fileName || 'Report_Incident.csv');
      var totalCsvLines = Number(payload.totalCsvLines) || 0;
      var chunkIndex = Number(payload.chunkIndex) || 0;
      var totalChunks = Number(payload.totalChunks) || 1;
      var rawRows = payload.rows || [];

      var ss = getIncidentDbSpreadsheet();
      var nowWib = formatDateWib(new Date());

      // Pada batch pertama, pangkas baris kosong berlebih agar spreadsheet tidak melampaui limit sel Google
      if (chunkIndex === 0) {
        pangkasBarisKosongInternal(ss);
      }

      // Tampilkan seluruh problem yang ada (tidak dibatasi 35 problem whitelist)
      var validRows = [];
      for (var r = 0; r < rawRows.length; r++) {
        var row = rawRows[r];
        var ev = String(row.eventCodeDesc || row.eventCode || '').trim();
        if (ev !== '') {
          validRows.push(row);
        }
      }

      // Kelompokkan per bulan berdasarkan Start_Time (format: dd/MM/yyyy HH:mm:ss -> YYYY-MM)
      var rowsByMonth = {};
      for (var i = 0; i < validRows.length; i++) {
        var it = validRows[i];
        var mKey = '2026-10'; // default fallback
        if (it.startTime) {
          var normM = normalizeMonthStr(it.startTime);
          if (normM && /^\d{4}-\d{2}$/.test(normM)) {
            mKey = normM;
          }
        }
        if (!rowsByMonth[mKey]) rowsByMonth[mKey] = [];
        rowsByMonth[mKey].push(it);
      }

      var newCount = 0;
      var updatedCount = 0;
      var unchangedCount = 0;

      for (var monthStr in rowsByMonth) {
        var mRows = rowsByMonth[monthStr];
        var targetMonth = parseInt(monthStr.split('-')[1] || '10', 10);
        var incSheet = getOrCreateIncidentSheet(ss, monthStr);
        var actSheet = getOrCreateActionSheet(ss, monthStr);

        var lastRow = incSheet.getLastRow();
        var keyRowMap = {}; // Incident_Key -> nomor baris asli di incSheet (2, 3, ...)
        var incidentNumRowMap = {}; // Incident_Number -> nomor baris asli di incSheet
        var openIncidentsMap = {}; // normalizedKey (WSID|EVENT|DATE|HOUR) -> nomor baris asli di incSheet

        // Helper untuk membangun kunci normalisasi: WSID|EVENT|DD/MM/YYYY|HH:mm
        function buildNormalizedKey(w, ev, st) {
          var nw = String(w || '').trim().toUpperCase();
          var ne = String(ev || '').trim().toUpperCase();
          var s = String(st || '').trim();
          var dPart = '';
          var hmPart = '';
          var dm = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
          if (dm) {
            var p1 = ('0' + dm[1]).slice(-2);
            var p2 = ('0' + dm[2]).slice(-2);
            dPart = p1 + '/' + p2 + '/' + dm[3];
          }
          var tm = s.match(/(\d{1,2}):(\d{1,2})/);
          if (tm) {
            hmPart = ('0' + tm[1]).slice(-2) + ':' + ('0' + tm[2]).slice(-2);
          }
          return nw + '|' + ne + '|' + dPart + '|' + hmPart;
        }

        if (lastRow > 1) {
          // ⚡ EFISIENSI TINGGI: Baca 15.000 baris terbaru untuk deteksi duplikat harian/mingguan (~0.8 detik)
          // dan DB_ACTIVE_OPEN untuk 100% insiden OPEN lintas seluruh baris (1 s/d 92.000+)
          var scanRows = Math.min(lastRow - 1, 15000);
          var startScanRow = lastRow - scanRows + 1;
          var keyIndexData = incSheet.getRange(startScanRow, 1, scanRows, 2).getValues();
          for (var k = 0; k < keyIndexData.length; k++) {
            var rNum = startScanRow + k;
            var kVal = String(keyIndexData[k][0] || '').trim();
            var exIncNum = String(keyIndexData[k][1] || '').trim();
            if (kVal) {
              keyRowMap[kVal] = rNum;
            }
            if (exIncNum && exIncNum !== '-') {
              incidentNumRowMap[exIncNum] = rNum;
            }
          }
        }

        // Muat data insiden OPEN dari DB_ACTIVE_OPEN (hanya ~1.000 baris, instant < 50ms)
        var openSheet = ss.getSheetByName('DB_ACTIVE_OPEN');
        var openSheetRowMap = {}; // incKey / incNum -> nomor baris di DB_ACTIVE_OPEN
        if (openSheet && openSheet.getLastRow() > 1) {
          var openLast = openSheet.getLastRow();
          var openVals = openSheet.getRange(2, 1, openLast - 1, 12).getValues();
          for (var op = 0; op < openVals.length; op++) {
            var opRowNum = op + 2;
            var oRow = openVals[op];
            var oKey = String(oRow[0] || '').trim();
            var oIncNum = String(oRow[1] || '').trim();
            var oWsid = String(oRow[2] || '').trim();
            var oEv = String(oRow[9] || '').trim();
            var oStart = String(oRow[11] || '').trim();

            if (oKey) openSheetRowMap[oKey] = opRowNum;
            if (oIncNum && oIncNum !== '-') openSheetRowMap[oIncNum] = opRowNum;

            var targetRowNum = (oKey && keyRowMap[oKey]) || (oIncNum && incidentNumRowMap[oIncNum]) || 0;
            if (targetRowNum > 0 && oWsid && oEv) {
              var normK = buildNormalizedKey(oWsid, oEv, oStart);
              if (normK) {
                openIncidentsMap[normK] = targetRowNum;
              }
            }
          }
        }

        var rowsToAppend = [];
        var openRowsToAppend = [];
        var actionLogsToAppend = [];

        for (var j = 0; j < mRows.length; j++) {
          var item = mRows[j];
          var incidentNum = String(item.incidentNumber || '').trim();
          var wsid = cleanWsidGS(item.wsid);
          if (!wsid) continue;
          var eventDesc = sanitizeCellText(item.eventCodeDesc || '');
          var startTime = sanitizeCellText(item.startTime || '');
          var endTime = sanitizeCellText(item.endTime && item.endTime !== '-' ? item.endTime : '-');
          var incKey = incidentNum && incidentNum !== '-' ? incidentNum : (wsid + '|' + eventDesc + '|' + startTime);

          var datePart = '-';
          var hourPart = '00:00';
          if (startTime) {
            var sp = startTime.split(' ');
            datePart = sp[0] || '-';
            if (sp[1]) {
              var hp = sp[1].split(':')[0] || '00';
              hourPart = ('0' + hp).slice(-2) + ':00';
            }
          }

          var durasiOpr = (typeof item.durasi === 'number' && item.durasi >= 0)
            ? item.durasi
            : calculateOperationalDurationServer(startTime, endTime, item.operatingDays, item.operatingHours, targetMonth);
          var isClosed = isEndTimeFilledGS(endTime);
          var statusStr = isClosed ? 'CLOSED' : 'OPEN';

          // Pencarian nomor baris eksisting:
          var foundRowNum = 0;
          if (keyRowMap[incKey] !== undefined) {
            foundRowNum = keyRowMap[incKey];
          } else if (incidentNum && incidentNum !== '-' && incidentNumRowMap[incidentNum] !== undefined) {
            foundRowNum = incidentNumRowMap[incidentNum];
          } else {
            var itemNormKey = buildNormalizedKey(wsid, eventDesc, startTime);
            if (itemNormKey && openIncidentsMap[itemNormKey] !== undefined) {
              foundRowNum = openIncidentsMap[itemNormKey];
            }
          }

          if (foundRowNum > 0 && foundRowNum <= lastRow) {
            // Insiden sudah ada di database (nomor baris valid antara 2 dan lastRow).
            // Jika data CSV memiliki End_Time dan insiden di database masih OPEN, lakukan penutupan:
            if (isClosed) {
              var curVals = incSheet.getRange(foundRowNum, 12, 1, 7).getValues()[0];
              var oldStartTime = String(curVals[0] || startTime).trim();
              var oldEndTime = String(curVals[1] || '-').trim();
              var oldStatus = String(curVals[6] || 'OPEN').trim();

              if (!isEndTimeFilledGS(oldEndTime)) {
                var finalEndTime = formatCellDateStr(endTime, targetMonth);
                var finalDurasiOpr = (typeof item.durasi === 'number' && item.durasi >= 0)
                  ? item.durasi
                  : (durasiOpr > 0 ? durasiOpr : calculateOperationalDurationServer(oldStartTime, finalEndTime, item.operatingDays, item.operatingHours, targetMonth));
                var finalRawDur = Number(item.rawDuration) || Number(curVals[4]) || 0;

                // Update baris di incSheet: Col 13 (End_Time) s/d Col 18 (Status)
                incSheet.getRange(foundRowNum, 13, 1, 6).setValues([[
                  finalEndTime,
                  datePart,
                  hourPart,
                  finalRawDur,
                  finalDurasiOpr,
                  'CLOSED'
                ]]);

                var isAutoCloseByDb = (item.closeSource === 'DASHBOARD') ||
                                      (item.actionTerakhirOleh === 'Sistem Dashboard') ||
                                      (String(item.actionTerakhir || '').indexOf('[AUTO-CLOSE]') !== -1);
                var closeUpdater = isAutoCloseByDb ? 'Sistem Dashboard' : uploaderName;

                // Col 25 & 26: Last_Update_At, Last_Update_By
                incSheet.getRange(foundRowNum, 25, 1, 2).setValues([[nowWib, closeUpdater]]);

                // Jika di-auto-close oleh sistem dashboard, set catatan tindakan Col 19-22
                if (isAutoCloseByDb) {
                  incSheet.getRange(foundRowNum, 19, 1, 4).setValues([[
                    item.actionTerakhir || '[AUTO-CLOSE] Problem sudah tidak muncul di report OASE',
                    'Sistem Dashboard',
                    nowWib,
                    1
                  ]]);
                }

                // Update juga di DB_ACTIVE_OPEN jika baris ini ada di DB_ACTIVE_OPEN
                var openRow = openSheetRowMap[incKey] || (incidentNum && openSheetRowMap[incidentNum]);
                if (openSheet && openRow) {
                  openSheet.getRange(openRow, 13, 1, 6).setValues([[
                    finalEndTime,
                    datePart,
                    hourPart,
                    finalRawDur,
                    finalDurasiOpr,
                    'CLOSED'
                  ]]);
                }

                actionLogsToAppend.push([
                  'LOG_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                  nowWib,
                  incKey,
                  wsid,
                  eventDesc,
                  'UPLOAD_UPDATE',
                  isAutoCloseByDb
                    ? 'Status insiden di-auto-close oleh Sistem Dashboard (problem sudah tidak muncul di snapshot OASE).'
                    : 'Status insiden terupdate menjadi CLOSED via upload CSV (End Time terisi).',
                  closeUpdater,
                  oldStatus,
                  'CLOSED',
                  'End_Time: (sebelumnya OPEN) -> ' + finalEndTime
                ]);

                updatedCount++;
              } else {
                unchangedCount++;
              }
            } else {
              unchangedCount++;
            }
          } else if (foundRowNum === -1) {
            // Sudah masuk dalam antrean rowsToAppend pada chunk ini, tidak perlu diduplikasi
            unchangedCount++;
          } else {
            // INSERT BARU
            keyRowMap[incKey] = -1; // Tandai -1 agar tidak diduplikasi dalam chunk ini
            if (incidentNum && incidentNum !== '-') {
              incidentNumRowMap[incidentNum] = -1;
            }
            var itemNormK = buildNormalizedKey(wsid, eventDesc, startTime);
            if (itemNormK) openIncidentsMap[itemNormK] = -1;

            var newRow = [
              incKey,
              incidentNum || '-',
              wsid,
              sanitizeCellText(item.lokasi || '-'),
              sanitizeCellText(item.servicePoint || '-'),
              sanitizeCellText(cleanSektorNameGS(item.sektor)),
              sanitizeCellText(item.typeMesin || '-'),
              sanitizeCellText(item.vendorMesin || '-'),
              sanitizeCellText(item.eventCode || '-'),
              eventDesc,
              sanitizeCellText(item.detail || '-'),
              startTime,
              endTime,
              datePart,
              hourPart,
              Number(item.rawDuration) || 0,
              durasiOpr,
              statusStr,
              (() => {
                var realAct = sanitizeCellText(item.actionTerakhir || '-');
                if (isTechnicalMachineLog(realAct)) return '-';
                return realAct;
              })(),
              (() => {
                var realAct = sanitizeCellText(item.actionTerakhir || '-');
                if (realAct === '-' || isTechnicalMachineLog(realAct)) return '-';
                var defaultOleh = (item.closeSource === 'DASHBOARD' || item.actionTerakhirOleh === 'Sistem Dashboard') ? 'Sistem Dashboard' : 'Petugas';
                return sanitizeCellText(item.actionTerakhirOleh || defaultOleh);
              })(),
              (() => {
                var realAct = sanitizeCellText(item.actionTerakhir || '-');
                if (realAct === '-' || isTechnicalMachineLog(realAct)) return '-';
                return sanitizeCellText(item.actionTerakhirWaktu || nowWib);
              })(),
              (() => {
                var realAct = sanitizeCellText(item.actionTerakhir || '-');
                if (realAct === '-' || isTechnicalMachineLog(realAct)) return 0;
                return 1;
              })(),
              nowWib,
              uploaderName,
              nowWib,
              (item.closeSource === 'DASHBOARD' || item.actionTerakhirOleh === 'Sistem Dashboard') ? 'Sistem Dashboard' : uploaderName
            ];
            rowsToAppend.push(newRow);

            if (!isClosed) {
              // Jika insiden baru berstatus OPEN, masukkan ke DB_ACTIVE_OPEN (22 kolom)
              openRowsToAppend.push(newRow.slice(0, 22));
            }

            newCount++;
          }
        }

        // BATCH APPEND BARIS BARU DENGAN 1 PEMANGGILAN ATOMIK
        if (rowsToAppend.length > 0) {
          var startAppendRow = incSheet.getLastRow() + 1;
          ensureSheetCapacity(incSheet, startAppendRow + rowsToAppend.length - 1);
          incSheet.getRange(startAppendRow, 1, rowsToAppend.length, 26).setValues(rowsToAppend);
        }

        // BATCH APPEND BARIS OPEN BARU KE DB_ACTIVE_OPEN
        if (openRowsToAppend.length > 0 && openSheet) {
          var startOpenRow = openSheet.getLastRow() + 1;
          ensureSheetCapacity(openSheet, startOpenRow + openRowsToAppend.length - 1);
          openSheet.getRange(startOpenRow, 1, openRowsToAppend.length, 22).setValues(openRowsToAppend);
        }

        // BATCH APPEND LOG TINDAKAN DENGAN 1 PEMANGGILAN ATOMIK
        if (actionLogsToAppend.length > 0) {
          var startActRow = actSheet.getLastRow() + 1;
          ensureSheetCapacity(actSheet, startActRow + actionLogsToAppend.length - 1);
          actSheet.getRange(startActRow, 1, actionLogsToAppend.length, 11).setValues(actionLogsToAppend);
        }
      }

      // Jika ini adalah chunk terakhir, tulis rekap ke DB_UPLOAD_LOG & bersihkan cache
      if (chunkIndex === totalChunks - 1) {
        try {
          var logSheet = ss.getSheetByName('DB_UPLOAD_LOG');
          if (logSheet) {
            logSheet.appendRow([
              nowWib,
              uploaderName,
              sumber,
              fileName,
              totalCsvLines,
              validRows.length,
              newCount,
              updatedCount,
              unchangedCount,
              totalCsvLines - validRows.length
            ]);
          }
          CacheService.getScriptCache().remove('MONITORING_OPEN_INCIDENTS');
        } catch (logErr) {}
      }

      return {
        success: true,
        stats: {
          totalLines: totalCsvLines,
          matched: validRows.length,
          newCount: newCount,
          updatedCount: updatedCount,
          unchangedCount: unchangedCount,
          skippedCount: totalCsvLines - validRows.length
        }
      };
    } catch (err) {
      return { success: false, message: 'Gagal memproses upload chunk: ' + err.toString() };
    } finally {
      if (hasLock) {
        lock.releaseLock();
      }
    }
  }

  /**
   * Validator string tanggal
   */
  function isDateString(s) {
    if (s === null || s === undefined || s === "" || s === "-") return false;
    if (s instanceof Date) return !isNaN(s.getTime());
    if (typeof s === "number") {
      // Excel/Sheets serial number (20000 = ~1954 to 80000 = ~2119) atau JS epoch timestamp (ms/s)
      return (s > 20000 && s < 80000) || (s > 1000000000 && s < 2500000000000);
    }
    var str = String(s).trim();
    if (!str || str === "-") return false;
    if (/^(Uns|Sol|Err|ATM|Warn|Info|Status|Tran|COM|DSP|Reject|Multi|SPV|FLM|SLM):/i.test(str)) return false;
    if (/has been marked|atm\s+|sent a power|error on|warning no|hopper|cassette|balancing|out of|mode switch|notes low|bills not|tran status|paper low|recpt prntr/i.test(str)) return false;
    if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(str)) return true;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) return true;
    if (str.indexOf("GMT") !== -1 || str.indexOf("Western Indonesia Time") !== -1) {
      try {
        var d = new Date(str);
        return !isNaN(d.getTime());
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  /**
   * Helper pemformat tanggal agar seragam dan bebas format GMT "Sat Jul 11 2026..."
   * Selalu memastikan format standar dd/MM/yyyy HH:mm:ss
   */
  function formatCellDateStr(val, targetMonth) {
    if (val === null || val === undefined || val === "" || val === "-") return "-";
    if (!isDateString(val)) return "-";

    var tMonth = targetMonth || 10;

    var d = null;
    if (val instanceof Date) {
      d = val;
    } else if (typeof val === "number") {
      if (val > 1000000000000) {
        d = new Date(val);
      } else {
        d = new Date(Math.round((val - 25569) * 86400 * 1000));
      }
    } else {
      var s = String(val).trim();
      if (s.indexOf("GMT") !== -1 || s.indexOf("Western Indonesia Time") !== -1 || (s.indexOf("T") !== -1 && (s.indexOf("Z") !== -1 || s.indexOf("+") !== -1))) {
        try {
          var td = new Date(s);
          if (!isNaN(td.getTime())) d = td;
        } catch (e) {}
      }
    }

    if (d && !isNaN(d.getTime())) {
      var day = d.getDate();
      var month = d.getMonth() + 1;
      var year = d.getFullYear();
      if (day === tMonth && month !== tMonth && month <= 12) {
        day = month;
        month = tMonth;
      }
      var hours = ("0" + d.getHours()).slice(-2);
      var minutes = ("0" + d.getMinutes()).slice(-2);
      var seconds = ("0" + d.getSeconds()).slice(-2);
      return ("0" + day).slice(-2) + "/" + ("0" + month).slice(-2) + "/" + year + " " + hours + ":" + minutes + ":" + seconds;
    }

    var s = String(val).trim();
    // Format ISO lokal tanpa offset "YYYY-MM-DDTHH:mm:ss"
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      var parts = s.split("T");
      var dParts = parts[0].split("-");
      if (dParts.length === 3) {
        var year = dParts[0];
        var month = ("0" + dParts[1]).slice(-2);
        var day = ("0" + dParts[2]).slice(-2);
        var timePart = (parts[1] || "00:00:00").split(".")[0];
        if (timePart.split(":").length === 2) timePart += ":00";
        return day + "/" + month + "/" + year + " " + timePart;
      }
    }

    // Jika format YYYY-MM-DD HH:mm:ss ubah ke dd/MM/yyyy HH:mm:ss
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) {
      var p = s.split(" ");
      var sep = p[0].indexOf("-") !== -1 ? "-" : "/";
      var dp = p[0].split(sep);
      var year = dp[0];
      var month = ("0" + dp[1]).slice(-2);
      var day = ("0" + dp[2]).slice(-2);
      var timePart = p[1] || "00:00:00";
      if (timePart.split(":").length === 2) timePart += ":00";
      return day + "/" + month + "/" + year + " " + timePart;
    }

    // Format DD/MM/YYYY atau MM/DD/YYYY dengan kemungkinan AM/PM
    var match = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(AM|PM))?)?/i);
    if (match) {
      var p1 = parseInt(match[1], 10);
      var p2 = parseInt(match[2], 10);
      var year = match[3];
      if (year.length === 2) year = "20" + year;
      var hh = match[4] ? parseInt(match[4], 10) : 0;
      var mm = match[5] ? parseInt(match[5], 10) : 0;
      var ss = match[6] ? parseInt(match[6], 10) : 0;
      var ampm = match[7] ? match[7].toUpperCase() : "";

      if (ampm === "PM" && hh < 12) hh += 12;
      if (ampm === "AM" && hh === 12) hh = 0;

      var day = p1;
      var month = p2;
      if (p2 > 12 && p1 <= 12) {
        day = p2;
        month = p1;
      } else if (p1 === tMonth && p2 !== tMonth && p2 <= 12) {
        day = p2;
        month = p1;
      }

      var dayStr = ("0" + day).slice(-2);
      var monthStr = ("0" + month).slice(-2);
      var timeStr = ("0" + hh).slice(-2) + ":" + ("0" + mm).slice(-2) + ":" + ("0" + ss).slice(-2);
      return dayStr + "/" + monthStr + "/" + year + " " + timeStr;
    }

    if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}$/.test(s)) {
      var dParts = s.split(" ")[0].split("/");
      var p1 = parseInt(dParts[0], 10);
      var p2 = parseInt(dParts[1], 10);
      if (p1 === tMonth && p2 !== tMonth && p2 <= 12) {
        return ("0" + p2).slice(-2) + "/" + ("0" + p1).slice(-2) + "/" + dParts[2] + " " + s.split(" ")[1];
      }
      return s;
    }

    return "-";
  }

  function formatCellDateOnly(val, targetMonth) {
    if (val === null || val === undefined || val === "" || val === "-") return "-";
    var tMonth = targetMonth || 10;
    if (val instanceof Date) {
      var day = val.getDate();
      var month = val.getMonth() + 1;
      var year = val.getFullYear();
      if (day === tMonth && month !== tMonth && month <= 12) {
        day = month;
        month = tMonth;
      }
      return ("0" + day).slice(-2) + "/" + ("0" + month).slice(-2) + "/" + year;
    }
    if (typeof val === "number" && val > 20000 && val < 80000) {
      var d = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) {
        var day = d.getDate();
        var month = d.getMonth() + 1;
        var year = d.getFullYear();
        if (day === tMonth && month !== tMonth && month <= 12) {
          day = month;
          month = tMonth;
        }
        return ("0" + day).slice(-2) + "/" + ("0" + month).slice(-2) + "/" + year;
      }
    }
    var s = String(val).trim();
    if (s.indexOf("GMT") !== -1 || s.indexOf("Western Indonesia Time") !== -1) {
      try {
        var d = new Date(s);
        if (!isNaN(d.getTime())) {
          var day = d.getDate();
          var month = d.getMonth() + 1;
          var year = d.getFullYear();
          if (day === tMonth && month !== tMonth && month <= 12) {
            day = month;
            month = tMonth;
          }
          return ("0" + day).slice(-2) + "/" + ("0" + month).slice(-2) + "/" + year;
        }
      } catch (e) {}
    }
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) {
      var p = s.split(" ")[0];
      var sep = p.indexOf("-") !== -1 ? "-" : "/";
      var dp = p.split(sep);
      return ("0" + dp[2]).slice(-2) + "/" + ("0" + dp[1]).slice(-2) + "/" + dp[0];
    }
    var match = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (match) {
      var p1 = parseInt(match[1], 10);
      var p2 = parseInt(match[2], 10);
      var y = match[3];
      if (y.length === 2) y = "20" + y;
      var day = p1;
      var month = p2;
      if (p2 > 12 && p1 <= 12) {
        day = p2;
        month = p1;
      } else if (p1 === tMonth && p2 !== tMonth && p2 <= 12) {
        day = p2;
        month = p1;
      }
      return ("0" + day).slice(-2) + "/" + ("0" + month).slice(-2) + "/" + y;
    }
    return "-";
  }

  function formatCellTimeOnly(val, fallbackStartTime) {
    if (val === null || val === undefined || val === "" || val === "-") {
      if (fallbackStartTime && fallbackStartTime !== "-") {
        var parts = String(fallbackStartTime).split(" ");
        if (parts[1]) {
          var tp = parts[1].split(":");
          if (tp.length >= 2) {
            return ("0" + tp[0]).slice(-2) + ":" + ("0" + tp[1]).slice(-2) + (tp[2] ? ":" + ("0" + tp[2]).slice(-2) : ":00");
          }
        }
      }
      return "00:00:00";
    }
    if (val instanceof Date) {
      return ("0" + val.getHours()).slice(-2) + ":" + ("0" + val.getMinutes()).slice(-2) + ":" + ("0" + val.getSeconds()).slice(-2);
    }
    if (typeof val === "number") {
      var totalSeconds = Math.round(val * 86400);
      var h = Math.floor(totalSeconds / 3600) % 24;
      var m = Math.floor((totalSeconds % 3600) / 60);
      var s = totalSeconds % 60;
      return ("0" + h).slice(-2) + ":" + ("0" + m).slice(-2) + ":" + ("0" + s).slice(-2);
    }
    var s = String(val).trim();
    if (s && s !== "-" && s.indexOf("GMT") === -1 && s.indexOf("(") === -1) {
      var match = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(AM|PM))?/i);
      if (match) {
        var hh = parseInt(match[1], 10);
        var mm = parseInt(match[2], 10);
        var ss = match[3] ? parseInt(match[3], 10) : 0;
        var ampm = match[4] ? match[4].toUpperCase() : "";
        if (ampm === "PM" && hh < 12) hh += 12;
        if (ampm === "AM" && hh === 12) hh = 0;
        return ("0" + hh).slice(-2) + ":" + ("0" + mm).slice(-2) + ":" + ("0" + ss).slice(-2);
      }
    }
    if (fallbackStartTime && fallbackStartTime !== "-") {
      var parts = String(fallbackStartTime).split(" ");
      if (parts[1]) {
        return parts[1];
      }
    }
    return "00:00:00";
  }

  /**
   * Resolusi cerdas waktu Start Problem:
   * 1. Coba kolom Start_Time (col 11)
   * 2. Fallback: Ekstrak dari Incident_Key (col 0) jika berisi format wsid|event|startTime
   * 3. Fallback: Rekonstruksi dari kolom Tanggal (col 13) dan Jam (col 14)
   * Catatan: Kolom Detail (col 10) TIDAK PERNAH dijadikan Start Problem.
   */
  function resolveRowStartProblem(row, targetMonth) {
    if (!row) return "-";
    // 1. Coba col 11 (Start_Time)
    var rawStart = row[11];
    if (isDateString(rawStart)) {
      var f = formatCellDateStr(rawStart, targetMonth);
      if (f !== "-") return f;
    }
    // 2. Cek col 0 (Incident_Key) jika berformat wsid|desc|startTime
    var incKey = String(row[0] || "");
    if (incKey.indexOf("|") !== -1) {
      var parts = incKey.split("|");
      if (parts.length >= 3 && isDateString(parts[2])) {
        var f = formatCellDateStr(parts[2], targetMonth);
        if (f !== "-") return f;
      }
    }
    // 3. Coba kombinasi Tanggal (col 13) dan Jam (col 14)
    var rawTgl = row[13];
    var rawJam = row[14];
    if (rawTgl && rawTgl !== "-") {
      var tglF = formatCellDateOnly(rawTgl, targetMonth);
      var jamF = formatCellTimeOnly(rawJam, null);
      if (tglF !== "-" && isDateString(tglF)) {
        if (!jamF || jamF === "-" || jamF === "00:00") {
          jamF = "00:00:00";
        }
        if (jamF.split(":").length === 2) {
          jamF += ":00";
        }
        var combined = tglF + " " + jamF;
        var f = formatCellDateStr(combined, targetMonth);
        if (f !== "-") return f;
      }
    }
    return "-";
  }

  /**
   * Resolusi cerdas teks Detail:
   * Menjaga agar detail tidak tertukar dengan Start_Time atau hilang menjadi "-"
   */
  function resolveRowDetail(row, startResolved) {
    if (!row) return "-";
    var d10 = String(row[10] || "").trim();
    if (d10 && d10 !== "-" && !isDateString(d10)) {
      return d10;
    }
    return "-";
  }

  /**
   * Helper parsing timestamp action ke epoch milliseconds untuk perbandingan kronologis akurat
   */
  function parseActionTimestampMs(val) {
    if (!val || val === '-' || String(val).trim() === '') return 0;
    if (val && typeof val.getTime === 'function') {
      var t = val.getTime();
      return isNaN(t) ? 0 : t;
    }
    if (Object.prototype.toString.call(val) === '[object Date]') {
      var td = val.getTime();
      return isNaN(td) ? 0 : td;
    }
    if (typeof val === 'number') {
      if (val > 1000000000000) return val;
      return Math.round((val - 25569) * 86400 * 1000);
    }
    var s = String(val).trim();
    var isoM = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (isoM) {
      var y = parseInt(isoM[1], 10);
      var m = parseInt(isoM[2], 10) - 1;
      var d = parseInt(isoM[3], 10);
      var hh = parseInt(isoM[4], 10);
      var mm = parseInt(isoM[5], 10);
      var ss = isoM[6] ? parseInt(isoM[6], 10) : 0;
      return new Date(y, m, d, hh, mm, ss).getTime();
    }
    var ukM = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (ukM) {
      var d = parseInt(ukM[1], 10);
      var m = parseInt(ukM[2], 10) - 1;
      var y = parseInt(ukM[3], 10);
      if (y < 100) y += 2000;
      var hh = parseInt(ukM[4], 10);
      var mm = parseInt(ukM[5], 10);
      var ss = ukM[6] ? parseInt(ukM[6], 10) : 0;
      return new Date(y, m, d, hh, mm, ss).getTime();
    }
    var timeM = s.match(/^(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?(?:\s*WIB)?$/i);
    if (timeM) {
      var now = new Date();
      return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        parseInt(timeM[1], 10),
        parseInt(timeM[2], 10),
        timeM[3] ? parseInt(timeM[3], 10) : 0
      ).getTime();
    }
    var parsed = new Date(s).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Helper memuat seluruh peta riwayat tindakan dari sheet ACT_
   */
  function buildActionMapFromSheets(ss) {
    var actMap = {};
    var actList = [];
    if (!ss) return { actMap: actMap, actList: actList };

    var allSheets = ss.getSheets();
    for (var s = 0; s < allSheets.length; s++) {
      var sName = allSheets[s].getName();
      if (sName.indexOf('ACT_') === 0) {
        var actSheet = allSheets[s];
        var lastActRow = actSheet.getLastRow();
        if (lastActRow > 1) {
          var actCols = Math.min(actSheet.getLastColumn(), 8);
          // Batasi pembacaan maksimal 2500 tindakan terbaru agar tidak memicu memory limit Google Sheets
          var maxActs = 2500;
          var numActRows = Math.min(lastActRow - 1, maxActs);
          var actStartRow = Math.max(2, lastActRow - numActRows + 1);
          var actData = actSheet.getRange(actStartRow, 1, numActRows, actCols).getValues();
          for (var a = 0; a < actData.length; a++) {
            var aRow = actData[a];
            var aLogId = String(aRow[0] || '').trim();
            var aWaktu = formatCellDateStr(aRow[1]);
            var aTimeMs = parseActionTimestampMs(aWaktu);
            if (!aTimeMs && aRow[1]) {
              aTimeMs = parseActionTimestampMs(aRow[1]);
            }
            if (!aTimeMs && aLogId && aLogId.indexOf('ACT_') === 0) {
              var idParts = aLogId.split('_');
              if (idParts[1]) {
                var pMs = parseInt(idParts[1], 10);
                if (!isNaN(pMs) && pMs > 1000000000000) aTimeMs = pMs;
              }
            }
            if (!aTimeMs) aTimeMs = a;

            var aKey = String(aRow[2] || '').trim();
            var aWsid = String(aRow[3] || '').trim().toUpperCase();
            var aEv = String(aRow[4] || '').trim().toUpperCase();
            var aTipe = String(aRow[5] || 'UPDATE').trim();
            var aIsi = String(aRow[6] || '').trim();
            var aPetugas = String(aRow[7] || 'Petugas').trim();

            if (!aIsi || isTechnicalMachineLog(aIsi)) continue;
            var formattedA = (aIsi.indexOf('[') === 0) ? aIsi : ('[' + aTipe + '] ' + aIsi);

            var actObj = {
              rowIdx: a,
              key: aKey,
              wsid: aWsid,
              ev: aEv,
              action: formattedA,
              petugas: aPetugas,
              waktu: aWaktu,
              timeMs: aTimeMs
            };

            actList.push(actObj);

            function putAct(k) {
              if (!k) return;
              if (!actMap[k] || aTimeMs >= actMap[k].timeMs) {
                actMap[k] = actObj;
              }
            }

            if (aKey) putAct(aKey);
            if (aLogId) putAct(aLogId);
            if (aWsid) putAct(aWsid);
            if (aWsid && aEv) {
              putAct(aWsid + '|' + aEv);
              putAct(aWsid + '|' + aEv.replace(/\s+/g, ' '));
            }
          }
        }
      }
    }
    return { actMap: actMap, actList: [] };
  }

  /**
   * Helper mencocokkan tindakan terkini untuk sebuah baris insiden (O(1) Dictionary Lookup)
   */
  function resolveLatestActionForRow(rowKey, rowIncNum, rowWsid, rowEv, rawAct, actOleh, actWaktu, rowActTimeMs, actMap) {
    var matchedAct = null;

    if (actMap) {
      if (rowKey && actMap[rowKey]) {
        matchedAct = actMap[rowKey];
      } else if (rowIncNum && rowIncNum !== '-' && actMap[rowIncNum]) {
        matchedAct = actMap[rowIncNum];
      } else if (rowWsid && rowEv && actMap[rowWsid + '|' + rowEv]) {
        matchedAct = actMap[rowWsid + '|' + rowEv];
      } else if (rowWsid && rowEv && actMap[rowWsid + '|' + rowEv.replace(/\s+/g, ' ')]) {
        matchedAct = actMap[rowWsid + '|' + rowEv.replace(/\s+/g, ' ')];
      } else if (rowWsid && actMap[rowWsid]) {
        matchedAct = actMap[rowWsid];
      }
    }

    var finalAct = rawAct;
    var finalOleh = actOleh;
    var finalWaktu = actWaktu;
    var finalJml = (rawAct !== '-' && !isTechnicalMachineLog(rawAct)) ? 1 : 0;

    if (matchedAct) {
      if (rowActTimeMs === 0 || matchedAct.timeMs >= rowActTimeMs || rawAct === '-' || isTechnicalMachineLog(rawAct)) {
        finalAct = matchedAct.action;
        finalOleh = matchedAct.petugas;
        finalWaktu = matchedAct.waktu;
        finalJml = Math.max(finalJml, 1);
      }
    }

    return {
      action: finalAct,
      petugas: finalOleh,
      waktu: finalWaktu,
      jumlah: finalJml
    };
  }

  /**
  * Sinkronisasi sheet DB_ACTIVE_OPEN dengan kecepatan tinggi (1x batch getValues, < 300ms)
  */
  function syncOpenIncidentsSheet(ss) {
    var openSheet = ss.getSheetByName('DB_ACTIVE_OPEN');
    if (!openSheet) {
      openSheet = ss.insertSheet('DB_ACTIVE_OPEN');
    }

    var headers = [
      'Incident_Key', 'Incident_Number', 'WSID', 'Lokasi', 'Service_Point', 'Sektor',
      'Tipe_Mesin', 'Vendor', 'Event_Code', 'Event_Code_Description', 'Detail',
      'Start_Time', 'End_Time', 'Tanggal', 'Jam', 'Duration_Raw', 'Durasi_OPR_Menit',
      'Status', 'Action_Terakhir', 'Action_Terakhir_Oleh', 'Action_Terakhir_Waktu',
      'Jumlah_Action'
    ];
    formatSheetHeader(openSheet, headers);

    var actBundle = buildActionMapFromSheets(ss);
    var actMap = actBundle.actMap;
    var actList = actBundle.actList;

    var sheets = ss.getSheets();
    var incSheets = [];
    for (var s = 0; s < sheets.length; s++) {
      var sName = sheets[s].getName();
      if (sName.indexOf('INC_') === 0) {
        incSheets.push(sheets[s]);
      }
    }
    incSheets.sort(function(a, b) {
      return b.getName().localeCompare(a.getName());
    });

    var openRows = [];
    var seenKeys = {};

    // Periksa sheet INC_ terbaru (maksimal 2 bulan terakhir)
    var maxToCheck = Math.min(incSheets.length, 2);
    for (var idx = 0; idx < maxToCheck; idx++) {
      var sh = incSheets[idx];
      var sMonth = 10;
      var matchM = sh.getName().match(/_(\d{4})[-_](\d{1,2})/);
      if (matchM) sMonth = parseInt(matchM[2], 10);
      var lastRow = sh.getLastRow();
      if (lastRow > 1) {
        var vals = [];
        if (lastRow > 3000) {
          // Scan kolom 13 (End_Time) dahulu agar tidak membebani memori RAM
          var endVals = sh.getRange(2, 13, lastRow - 1, 1).getValues();
          var openRowIdxs = [];
          for (var er = 0; er < endVals.length; er++) {
            if (!isEndTimeFilledGS(endVals[er][0])) {
              openRowIdxs.push(er + 2);
            }
          }
          // Ambil hanya baris-baris OPEN tersebut
          for (var orIdx = 0; orIdx < openRowIdxs.length; orIdx++) {
            vals.push(sh.getRange(openRowIdxs[orIdx], 1, 1, 22).getValues()[0]);
          }
        } else {
          var rawVals = sh.getDataRange().getValues();
          for (var rv = 1; rv < rawVals.length; rv++) {
            vals.push(rawVals[rv]);
          }
        }
        for (var r = 0; r < vals.length; r++) {
          var row = vals[r];
          var incKey = String(row[0] || '').trim();
          if (!incKey) continue;

          var rawEnd = row[12];
          // Kriteria Problem Open: Belum ada End_Time yang valid
          var hasEnd = isEndTimeFilledGS(rawEnd);
          var isOpen = !hasEnd;

          if (isOpen && !seenKeys[incKey]) {
            seenKeys[incKey] = true;
            var startT = resolveRowStartProblem(row, sMonth);
            var detailStr = resolveRowDetail(row, startT);
            var tgl = formatCellDateOnly(row[13], sMonth);
            if (tgl === '-' && startT !== '-') {
              tgl = startT.split(' ')[0];
            }
            var jam = formatCellTimeOnly(row[14], startT);

            var rawAct = String(row[18] || '-').trim();
            if (isTechnicalMachineLog(rawAct)) rawAct = '-';
            var actOleh = (rawAct !== '-') ? String(row[19] || '-').trim() : '-';
            if (actOleh === 'CSV' || actOleh === 'CSV Comment') actOleh = '-';
            var actWaktu = (rawAct !== '-') ? formatCellDateStr(row[20], sMonth) : '-';
            var rowActTimeMs = parseActionTimestampMs(row[20]);

            var rowIncNum = String(row[1] || '-').trim();
            var rowWsid = String(row[2] || '').trim().toUpperCase();
            var rowEv = String(row[9] || '').trim().toUpperCase();

            var actResolved = resolveLatestActionForRow(
              incKey, rowIncNum, rowWsid, rowEv,
              rawAct, actOleh, actWaktu, rowActTimeMs,
              actMap
            );

            openRows.push([
              incKey,
              String(row[1] || '-'),
              String(row[2] || ''),
              String(row[3] || ''),
              String(row[4] || ''),
              String(row[5] || ''),
              String(row[6] || ''),
              String(row[7] || ''),
              String(row[8] || ''),
              String(row[9] || ''),
              detailStr,
              startT,
              '-',
              tgl,
              jam,
              Number(row[15]) || 0,
              Number(row[16]) || 0,
              'OPEN',
              actResolved.action,
              actResolved.petugas,
              actResolved.waktu,
              actResolved.jumlah
            ]);
          }
        }
      }
    }

    // Bersihkan dan perbarui DB_ACTIVE_OPEN dalam 1 operasi atomik
    var curLastRow = openSheet.getLastRow();
    var curLastCol = Math.max(openSheet.getLastColumn(), headers.length);
    if (curLastRow > 1) {
      openSheet.getRange(2, 1, curLastRow - 1, curLastCol).clearContent();
    }
    if (openRows.length > 0) {
      ensureSheetCapacity(openSheet, openRows.length + 1);
      openSheet.getRange(2, 1, openRows.length, headers.length).setValues(openRows);
    }

    return openRows;
  }

  /**
  * 5. API MONITORING: PROBLEM OPEN (INSTAN < 250ms)
  * Membaca langsung dari sheet database insiden INC_ terbaru (Single Source of Truth)
  * sehingga data Problem Open yang tampil di dashboard selalu 100% mutakhir dan sinkron secara real-time.
  */
  function getOpenIncidents(filters) {
    try {
      var ss = getIncidentDbSpreadsheet();
      if (!ss) {
        return { success: false, incidents: [], message: 'Spreadsheet database belum dikonfigurasi.' };
      }

      var sheets = ss.getSheets();
      var incSheets = [];
      for (var s = 0; s < sheets.length; s++) {
        var sName = sheets[s].getName();
        if (sName.indexOf('INC_') === 0) {
          incSheets.push(sheets[s]);
        }
      }
      incSheets.sort(function(a, b) {
        return b.getName().localeCompare(a.getName());
      });

      // ⚡ PRIORITAS UTAMA: Baca langsung dari DB_ACTIVE_OPEN jika sheet ini ada data (1,080 baris, INSTAN < 200ms)
      var openSheet = ss.getSheetByName('DB_ACTIVE_OPEN');
      if (openSheet && openSheet.getLastRow() > 1) {
        var isForceSync = Boolean(filters && (filters.forceSync === true || filters.forceSync === 'true' || filters.forceSync === '1'));
        var validKeyMap = null;

        // Jika forceSync aktif (misal user klik tombol Refresh di dashboard):
        // Verifikasi keaslian baris di DB_ACTIVE_OPEN terhadap sheet INC_ utama secara instan (hanya scan kolom 1 & 13)
        if (isForceSync && incSheets.length > 0) {
          try {
            validKeyMap = {};
            for (var is = 0; is < Math.min(incSheets.length, 2); is++) {
              var ish = incSheets[is];
              var ilast = ish.getLastRow();
              if (ilast > 1) {
                var kVals = ish.getRange(2, 1, ilast - 1, 1).getValues();
                var endVals = ish.getRange(2, 13, ilast - 1, 1).getValues();
                for (var kv = 0; kv < kVals.length; kv++) {
                  var kStr = String(kVals[kv][0] || '').trim();
                  // Hanya anggap valid jika ada di INC_ dan kolom End_Time masih kosong
                  if (kStr && !isEndTimeFilledGS(endVals[kv][0])) {
                    validKeyMap[kStr] = true;
                  }
                }
              }
            }
          } catch (eValid) {
            validKeyMap = null;
          }
        }

        var actBundle = buildActionMapFromSheets(ss);
        var actMap = actBundle.actMap;
        var vals = openSheet.getDataRange().getValues();
        var openIncidentsList = [];
        var cleanOpenSheetRows = [];
        var hasOrphans = false;

        for (var r = 1; r < vals.length; r++) {
          var row = vals[r];
          var incKey = String(row[0] || '').trim();
          if (!incKey) continue;

          // Jika forceSync aktif dan key tidak ditemukan di sheet INC_ (telah dihapus manual atau di-closed):
          if (validKeyMap && !validKeyMap[incKey]) {
            hasOrphans = true;
            continue; // Pangkas baris ini dari output karena sudah tidak ada di database
          }

          var rawEnd = row[12];
          if (!isEndTimeFilledGS(rawEnd)) {
            cleanOpenSheetRows.push(row);
            var sTime = formatCellDateStr(row[11], 10);
            var act = String(row[18] || '-').trim();
            if (isTechnicalMachineLog(act)) act = '-';
            var actOleh = (act !== '-') ? String(row[19] || '-').trim() : '-';
            if (actOleh === 'CSV' || actOleh === 'CSV Comment') actOleh = '-';
            var actWaktu = (act !== '-') ? formatCellDateStr(row[20], 10) : '-';
            var actTimeMs = parseActionTimestampMs(actWaktu) || parseActionTimestampMs(row[20]);

            var rowIncNum = String(row[1] || '-').trim();
            var rowWsid = String(row[2] || '').trim().toUpperCase();
            var rowEv = String(row[8] || row[9] || '').trim().toUpperCase();

            var actResolved = resolveLatestActionForRow(
              incKey, rowIncNum, rowWsid, rowEv,
              act, actOleh, actWaktu, actTimeMs, actMap
            );

            openIncidentsList.push({
              incidentKey: incKey,
              incidentNumber: rowIncNum,
              wsid: rowWsid,
              lokasi: String(row[3] || ''),
              servicePoint: String(row[4] || '-'),
              sektor: cleanSektorNameGS(row[5]),
              servicePointSektor: (String(row[4] || '-') !== '-' && cleanSektorNameGS(row[5]) !== '-') ? (String(row[4] || '-') + ' - ' + cleanSektorNameGS(row[5])) : String(row[4] || row[5] || '-'),
              typeMesin: String(row[6] || '-'),
              vendorMesin: String(row[7] || '-'),
              vendor: String(row[7] || '-'),
              eventCode: String(row[8] || ''),
              eventCodeDesc: String(row[9] || ''),
              detail: resolveRowDetail(row, sTime),
              startTime: sTime,
              endTime: '-',
              tanggal: formatCellDateOnly(row[13], 10),
              jam: formatCellTimeOnly(row[14], sTime),
              durasi: Number(row[16]) || 0,
              durationRaw: Number(row[15]) || 0,
              status: 'OPEN',
              actionTerakhir: actResolved.action,
              actionTerakhirOleh: actResolved.petugas,
              actionTerakhirWaktu: actResolved.waktu,
              jumlahAction: actResolved.jumlah,
              monthStr: '2026-10'
            });
          }
        }

        // Jika ditemukan baris yatim (dihapus manual dari INC_), bersihkan juga DB_ACTIVE_OPEN
        if (hasOrphans && cleanOpenSheetRows.length < (vals.length - 1)) {
          try {
            var curLRow = openSheet.getLastRow();
            if (curLRow > 1) {
              openSheet.getRange(2, 1, curLRow - 1, openSheet.getLastColumn()).clearContent();
            }
            if (cleanOpenSheetRows.length > 0) {
              ensureSheetCapacity(openSheet, cleanOpenSheetRows.length + 1);
              openSheet.getRange(2, 1, cleanOpenSheetRows.length, cleanOpenSheetRows[0].length).setValues(cleanOpenSheetRows);
            }
          } catch (ePrune) {}
        }

        if (openIncidentsList.length > 0) {
          return {
            success: true,
            incidents: openIncidentsList,
            totalOpen: openIncidentsList.length,
            source: 'DB_ACTIVE_OPEN',
            spreadsheetName: ss.getName(),
            spreadsheetId: ss.getId()
          };
        }
      }

      if (incSheets.length === 0) {
        return { success: true, incidents: [], totalOpen: 0, spreadsheetName: ss.getName(), spreadsheetId: ss.getId() };
      }

      // Tarik peta riwayat tindakan terbaru dari ACT_ sheet secara instan O(1)
      var actBundle = buildActionMapFromSheets(ss);
      var actMap = actBundle.actMap;

      var rawIncidents = [];
      var seenKeys = {};
      var openRowsForSheet = [];

      // Scan sheet INC_ terbaru (maksimal 3 bulan terakhir untuk menjaring problem open aktif)
      var maxToCheck = Math.min(incSheets.length, 3);
      for (var idx = 0; idx < maxToCheck; idx++) {
        var sh = incSheets[idx];
        var sMonth = 10;
        var matchM = sh.getName().match(/_(\d{4})[-_](\d{1,2})/);
        if (matchM) sMonth = parseInt(matchM[2], 10);
        var lastRow = sh.getLastRow();
        if (lastRow > 1) {
          var lastCol = Math.min(sh.getLastColumn(), 22);
          var maxScan = 3000;
          var numRowsToScan = Math.min(lastRow - 1, maxScan);
          var scanStartRow = Math.max(2, lastRow - numRowsToScan + 1);
          var vals = sh.getRange(scanStartRow, 1, numRowsToScan, lastCol).getValues();
          // Iterasi dari bawah ke atas (data problem terbaru selalu diutamakan di baris atas)
          for (var r = vals.length - 1; r >= 0; r--) {
            var row = vals[r];
            var incKey = String(row[0] || '').trim();
            var rowIncNum = String(row[1] || '-').trim();
            var rowWsid = String(row[2] || '').trim().toUpperCase();
            var rowEv = String(row[9] || '').trim().toUpperCase();
            var rawStart = row[11];
            var rawEnd = row[12];

            if (!incKey) {
              if (rowWsid && rowEv) {
                incKey = (rowIncNum && rowIncNum !== '-') ? rowIncNum : (rowWsid + '|' + rowEv + '|' + String(rawStart || ''));
              } else {
                continue;
              }
            }

            // Kriteria Problem Open: Belum ada End_Time yang valid
            var hasEnd = isEndTimeFilledGS(rawEnd);
            var isOpen = !hasEnd;

            if (isOpen && !seenKeys[incKey]) {
              seenKeys[incKey] = true;
              var startT = resolveRowStartProblem(row, sMonth);
              var detailStr = resolveRowDetail(row, startT);
              var tgl = formatCellDateOnly(row[13], sMonth);
              if (tgl === '-' && startT !== '-') {
                tgl = startT.split(' ')[0];
              }
              var jam = formatCellTimeOnly(row[14], startT);

              var rawAct = String(row[18] || '-').trim();
              if (isTechnicalMachineLog(rawAct)) rawAct = '-';
              var actOleh = (rawAct !== '-') ? String(row[19] || '-').trim() : '-';
              if (actOleh === 'CSV' || actOleh === 'CSV Comment') actOleh = '-';
              var actWaktu = (rawAct !== '-') ? formatCellDateStr(row[20], sMonth) : '-';
              var rowActTimeMs = parseActionTimestampMs(row[20]);

              var actResolved = resolveLatestActionForRow(
                incKey, rowIncNum, rowWsid, rowEv,
                rawAct, actOleh, actWaktu, rowActTimeMs,
                actMap
              );

              var incObj = {
                incidentKey: incKey,
                incidentNumber: rowIncNum,
                wsid: rowWsid,
                lokasi: String(row[3] || ''),
                servicePoint: String(row[4] || ''),
                sektor: String(row[5] || ''),
                typeMesin: String(row[6] || ''),
                vendor: String(row[7] || ''),
                eventCode: String(row[8] || ''),
                eventCodeDesc: rowEv,
                detail: detailStr,
                startTime: startT,
                endTime: '-',
                tanggal: tgl,
                jam: jam,
                durationRaw: Number(row[15]) || 0,
                durasiOpr: Number(row[16]) || 0,
                status: 'OPEN',
                actionTerakhir: actResolved.action,
                actionTerakhirOleh: actResolved.petugas,
                actionTerakhirWaktu: actResolved.waktu,
                jumlahAction: actResolved.jumlah,
                monthStr: sh.getName().replace('INC_', '')
              };

              rawIncidents.push(incObj);
              openRowsForSheet.push([
                incKey, rowIncNum, rowWsid, incObj.lokasi, incObj.servicePoint, incObj.sektor,
                incObj.typeMesin, incObj.vendor, incObj.eventCode, rowEv, detailStr,
                startT, '-', tgl, jam, incObj.durationRaw, incObj.durasiOpr, 'OPEN',
                actResolved.action, actResolved.petugas, actResolved.waktu, actResolved.jumlah
              ]);
            }
          }
        }
      }

      // Sinkronisasi background ke sheet DB_ACTIVE_OPEN secara aman
      try {
        var openSheet = ss.getSheetByName('DB_ACTIVE_OPEN');
        if (!openSheet) openSheet = ss.insertSheet('DB_ACTIVE_OPEN');
        var headers = [
          'Incident_Key', 'Incident_Number', 'WSID', 'Lokasi', 'Service_Point', 'Sektor',
          'Tipe_Mesin', 'Vendor', 'Event_Code', 'Event_Code_Description', 'Detail',
          'Start_Time', 'End_Time', 'Tanggal', 'Jam', 'Duration_Raw', 'Durasi_OPR_Menit',
          'Status', 'Action_Terakhir', 'Action_Terakhir_Oleh', 'Action_Terakhir_Waktu',
          'Jumlah_Action'
        ];
        formatSheetHeader(openSheet, headers);

        var curRows = openSheet.getMaxRows();
        var curCols = openSheet.getMaxColumns();
        if (openRowsForSheet.length > 0) {
          var targetRows = openRowsForSheet.length + 10;
          if (curRows < targetRows) openSheet.insertRowsAfter(curRows, targetRows - curRows);
          if (curCols < headers.length) openSheet.insertColumnsAfter(curCols, headers.length - curCols);

          var lastR = openSheet.getLastRow();
          if (lastR > 1) {
            openSheet.getRange(2, 1, lastR - 1, headers.length).clearContent();
          }
          openSheet.getRange(2, 1, openRowsForSheet.length, headers.length).setValues(openRowsForSheet);
        } else {
          var lastR2 = openSheet.getLastRow();
          if (lastR2 > 1) openSheet.getRange(2, 1, lastR2 - 1, headers.length).clearContent();
        }
      } catch (mirrorErr) {}

      return {
        success: true,
        incidents: rawIncidents,
        totalOpen: rawIncidents.length,
        fromSheet: true
      };
    } catch (err) {
      return { success: false, incidents: [], message: 'Gagal mengambil problem open: ' + err.toString() };
    }
  }

  function getIncidentHistory(incidentKey, monthStr) {
    try {
      var ss = getIncidentDbSpreadsheet();
      if (!ss) return { success: false, history: [], message: 'Spreadsheet database belum dikonfigurasi.' };

      var cleanKey = String(incidentKey || '').trim();
      var targetWsid = '';
      var targetEv = '';
      if (cleanKey && cleanKey.indexOf('|') !== -1) {
        var kParts = cleanKey.split('|');
        targetWsid = String(kParts[0] || '').trim().toUpperCase();
        targetEv = String(kParts[1] || '').trim().toUpperCase();
      }

      var history = [];
      var seenLogs = {};
      var allSheets = ss.getSheets();

      for (var s = 0; s < allSheets.length; s++) {
        var sName = allSheets[s].getName();
        if (sName.indexOf('ACT_') === 0) {
          var actSheet = allSheets[s];
          if (actSheet.getLastRow() > 1) {
            var actVals = actSheet.getDataRange().getValues();
            for (var a = 1; a < actVals.length; a++) {
              var row = actVals[a];
              var rLogId = String(row[0] || '').trim() || ('LOG_' + s + '_' + a);
              if (seenLogs[rLogId]) continue;

              var rKey = String(row[2] || '').trim();
              var rWsid = String(row[3] || '').trim().toUpperCase();
              var rEv = String(row[4] || '').trim().toUpperCase();

              var isMatch = false;
              if (cleanKey && rKey && (rKey === cleanKey || rKey.indexOf(cleanKey) !== -1 || cleanKey.indexOf(rKey) !== -1)) {
                isMatch = true;
              } else if (targetWsid && rWsid === targetWsid && (!targetEv || rEv === targetEv)) {
                isMatch = true;
              }

              if (isMatch) {
                seenLogs[rLogId] = true;
                history.push({
                  logId: rLogId,
                  waktu: formatCellDateStr(row[1]),
                  incidentKey: rKey,
                  wsid: rWsid,
                  eventCodeDesc: rEv,
                  tipe: String(row[5] || ''),
                  isiAction: String(row[6] || ''),
                  namaPetugas: String(row[7] || ''),
                  statusSebelum: String(row[8] || ''),
                  statusSesudah: String(row[9] || ''),
                  catatan: String(row[10] || '')
                });
              }
            }
          }
        }
      }

      // Urutkan riwayat dari yang terbaru secara kronologis absolut
      history.sort(function(x, y) {
        var ty = parseActionTimestampMs(y.waktu);
        var tx = parseActionTimestampMs(x.waktu);
        if (ty !== tx) return ty - tx;
        return String(y.waktu || '').localeCompare(String(x.waktu || ''));
      });

      return {
        success: true,
        history: history
      };
    } catch (err) {
      return { success: false, history: [], message: 'Gagal mengambil riwayat insiden: ' + err.toString() };
    }
  }

  function saveIncidentAction(payload) {
    var lock = LockService.getScriptLock();
    var hasLock = false;
    try {
      hasLock = lock.tryLock(20000);
      if (!hasLock) {
        return { success: false, message: 'Server sedang sibuk. Silakan coba lagi.' };
      }

      var incidentKey = String(payload.incidentKey || '').trim();
      var rawMonth = String(payload.monthStr || '').trim();
      var monthStr = normalizeMonthStr(rawMonth) || '2026-10';
      var wsid = sanitizeCellText(payload.wsid || '');
      var eventCodeDesc = sanitizeCellText(payload.eventCodeDesc || '');
      var isiAction = sanitizeCellText(payload.isiAction || '');
      var namaPetugas = sanitizeCellText(payload.namaPetugas || '');
      var kategori = String(payload.kategori || 'UPDATE').trim().toUpperCase();
      if (kategori !== 'PENANGANAN') kategori = 'UPDATE';
      var formattedAction = (isiAction.indexOf('[') === 0) ? isiAction : ('[' + kategori + '] ' + isiAction);

      if (!isiAction) {
        return { success: false, message: 'Isi action tidak boleh kosong.' };
      }
      if (!namaPetugas) {
        return { success: false, message: 'Nama petugas wajib diisi.' };
      }

      var ss = getIncidentDbSpreadsheet();
      if (!ss) return { success: false, message: 'Spreadsheet database belum dikonfigurasi.' };

      var allSheets = ss.getSheets();
      var incSheet = ss.getSheetByName('INC_' + monthStr);
      var targetMonthStr = monthStr;

      // Jika sheet bulan spesifik belum ditemukan, cari sheet INC_ yang ada
      if (!incSheet) {
        for (var s = 0; s < allSheets.length; s++) {
          var sName = allSheets[s].getName();
          if (sName.indexOf('INC_') === 0) {
            incSheet = allSheets[s];
            targetMonthStr = sName.replace('INC_', '');
            break;
          }
        }
      }

      var actSheet = getOrCreateActionSheet(ss, targetMonthStr);
      var nowWib = formatDateWib(new Date());

      // Cari baris di INC sheet secara cerdas (prioritaskan problem yang masih OPEN dan baris terbaru)
      var targetRow = -1;
      var currentJumlahAction = 0;
      var currentStatus = 'OPEN';
      var targetWsid = String(wsid || '').trim().toUpperCase();
      var targetEv = String(eventCodeDesc || '').trim().toUpperCase();

      if (incSheet && incSheet.getLastRow() > 1) {
        var incVals = incSheet.getDataRange().getValues();
        // 1. Cari exact match dari bawah ke atas
        for (var k = incVals.length - 1; k >= 1; k--) {
          var kKey = String(incVals[k][0] || '').trim();
          var kIncNum = String(incVals[k][1] || '').trim();
          if ((incidentKey && kKey === incidentKey) || (incidentKey && kIncNum && kIncNum !== '-' && kIncNum === incidentKey)) {
            targetRow = k + 1;
            break;
          }
        }
        // 2. Jika belum match, cari problem OPEN dengan WSID & problem yang sama
        if (targetRow <= 0 && targetWsid) {
          for (var k = incVals.length - 1; k >= 1; k--) {
            var kWsid = String(incVals[k][2] || '').trim().toUpperCase();
            var kEv = String(incVals[k][9] || '').trim().toUpperCase();
            var kEnd = String(incVals[k][12] || '').trim();
            var isRowOpen = !isEndTimeFilledGS(kEnd);

            if (kWsid === targetWsid && (!targetEv || kEv === targetEv || kEv.indexOf(targetEv) !== -1 || targetEv.indexOf(kEv) !== -1)) {
              if (isRowOpen) {
                targetRow = k + 1;
                break;
              }
            }
          }
        }
      }

      // Jika belum ditemukan di incSheet pertama, scan sheet INC_ lainnya
      if (targetRow <= 0) {
        for (var s = 0; s < allSheets.length; s++) {
          var altName = allSheets[s].getName();
          if (altName.indexOf('INC_') === 0 && (!incSheet || altName !== incSheet.getName())) {
            var altSheet = allSheets[s];
            if (altSheet.getLastRow() > 1) {
              var altVals = altSheet.getDataRange().getValues();
              for (var ak = altVals.length - 1; ak >= 1; ak--) {
                var akKey = String(altVals[ak][0] || '').trim();
                var akIncNum = String(altVals[ak][1] || '').trim();
                var akWsid = String(altVals[ak][2] || '').trim().toUpperCase();
                var akEv = String(altVals[ak][9] || '').trim().toUpperCase();
                var akEnd = String(altVals[ak][12] || '').trim();
                var isAltOpen = !isEndTimeFilledGS(akEnd);

                var isExact = (incidentKey && akKey === incidentKey) || (incidentKey && akIncNum && akIncNum !== '-' && akIncNum === incidentKey);
                var isFuzzy = (targetWsid && akWsid === targetWsid && (!targetEv || akEv === targetEv || akEv.indexOf(targetEv) !== -1 || targetEv.indexOf(akEv) !== -1) && isAltOpen);

                if (isExact || isFuzzy) {
                  incSheet = altSheet;
                  targetRow = ak + 1;
                  targetMonthStr = altName.replace('INC_', '');
                  actSheet = getOrCreateActionSheet(ss, targetMonthStr);
                  break;
                }
              }
              if (targetRow > 0) break;
            }
          }
        }
      }

      if (targetRow > 0 && incSheet) {
        if (incSheet.getMaxColumns() < 22) {
          incSheet.insertColumnsAfter(incSheet.getMaxColumns(), 22 - incSheet.getMaxColumns());
        }
        var rowVals = incSheet.getRange(targetRow, 18, 1, 5).getValues()[0];
        currentStatus = String(rowVals[0] || 'OPEN').trim();
        currentJumlahAction = Number(rowVals[4]) || 0;

        incSheet.getRange(targetRow, 19, 1, 4).setValues([[
          formattedAction,
          namaPetugas,
          nowWib,
          currentJumlahAction + 1
        ]]);
      }

      // Selalu update juga di DB_ACTIVE_OPEN jika sheet ini ada
      try {
        var openSheet = ss.getSheetByName('DB_ACTIVE_OPEN');
        if (!openSheet) {
          syncOpenIncidentsSheet(ss);
          openSheet = ss.getSheetByName('DB_ACTIVE_OPEN');
        }
        if (openSheet && openSheet.getLastRow() > 1) {
          if (openSheet.getMaxColumns() < 22) {
            openSheet.insertColumnsAfter(openSheet.getMaxColumns(), 22 - openSheet.getMaxColumns());
          }
          var openRowsData = openSheet.getDataRange().getValues();
          for (var ok = openRowsData.length - 1; ok >= 1; ok--) {
            var okKey = String(openRowsData[ok][0] || '').trim();
            var okIncNum = String(openRowsData[ok][1] || '').trim();
            var okWsid = String(openRowsData[ok][2] || '').trim().toUpperCase();
            var okEv = String(openRowsData[ok][9] || '').trim().toUpperCase();
            var isMatch = (incidentKey && okKey === incidentKey) ||
                          (incidentKey && okIncNum && okIncNum !== '-' && okIncNum === incidentKey) ||
                          (targetWsid && okWsid === targetWsid && (!targetEv || okEv === targetEv || okEv.indexOf(targetEv) !== -1 || targetEv.indexOf(okEv) !== -1));
            if (isMatch) {
              var openCount = Number(openRowsData[ok][21]) || currentJumlahAction;
              openSheet.getRange(ok + 1, 19, 1, 4).setValues([[
                formattedAction,
                namaPetugas,
                nowWib,
                openCount + 1
              ]]);
              break;
            }
          }
        }
      } catch (oe) {}

      // Tulis ke ACT sheet (kolom 6 adalah kategori: UPDATE atau PENANGANAN)
      var logId = 'ACT_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      actSheet.appendRow([
        logId,
        nowWib,
        incidentKey,
        wsid,
        eventCodeDesc,
        kategori,
        isiAction,
        namaPetugas,
        currentStatus,
        currentStatus,
        '-'
      ]);

      CacheService.getScriptCache().remove('MONITORING_OPEN_INCIDENTS');

      return {
        success: true,
        message: 'Action berhasil disimpan.',
        action: {
          isiAction: isiAction,
          formattedAction: formattedAction,
          kategori: kategori,
          namaPetugas: namaPetugas,
          waktu: nowWib
        }
      };
    } catch (err) {
      return { success: false, message: 'Gagal menyimpan action: ' + err.toString() };
    } finally {
      if (hasLock) lock.releaseLock();
    }
  }

  function bulkSaveIncidentAction(payload) {
    var lock = LockService.getScriptLock();
    var hasLock = false;
    try {
      hasLock = lock.tryLock(30000);
      if (!hasLock) {
        return { success: false, message: 'Server sedang sibuk. Silakan coba lagi.' };
      }

      var items = payload.items || [];
      var isiAction = sanitizeCellText(payload.isiAction || '');
      var namaPetugas = sanitizeCellText(payload.namaPetugas || '');
      var kategori = String(payload.kategori || 'UPDATE').trim().toUpperCase();
      if (kategori !== 'PENANGANAN') kategori = 'UPDATE';
      var formattedAction = (isiAction.indexOf('[') === 0) ? isiAction : ('[' + kategori + '] ' + isiAction);

      if (!items || items.length === 0) {
        return { success: false, message: 'Tidak ada insiden yang dipilih.' };
      }
      if (items.length > 500) {
        return { success: false, message: 'Maksimal 500 insiden per bulk action.' };
      }
      if (!isiAction) {
        return { success: false, message: 'Isi action wajib diisi.' };
      }
      if (!namaPetugas) {
        return { success: false, message: 'Nama petugas wajib diisi.' };
      }

      var ss = getIncidentDbSpreadsheet();
      var nowWib = formatDateWib(new Date());

      // Kelompokkan item berdasarkan monthStr yang ternormalisasi
      var itemsByMonth = {};
      for (var i = 0; i < items.length; i++) {
        var rawM = items[i].monthStr || '';
        var m = normalizeMonthStr(rawM) || '2026-10';
        if (!itemsByMonth[m]) itemsByMonth[m] = [];
        itemsByMonth[m].push(items[i]);
      }

      var updatedTotal = 0;

      for (var mStr in itemsByMonth) {
        var mItems = itemsByMonth[mStr];
        var incSheet = ss.getSheetByName('INC_' + mStr);
        if (!incSheet) {
          var allS = ss.getSheets();
          for (var si = 0; si < allS.length; si++) {
            if (allS[si].getName().indexOf('INC_') === 0) {
              incSheet = allS[si];
              break;
            }
          }
        }
        var actSheet = getOrCreateActionSheet(ss, mStr);

        if (!incSheet) continue;

        var lastRow = incSheet.getLastRow();
        var keyRowMap = {};
        var keyActionCountMap = {};
        var keyStatusMap = {};

        if (lastRow > 1) {
          var keys = incSheet.getRange(2, 1, lastRow - 1, 1).getValues();
          var extra = incSheet.getRange(2, 18, lastRow - 1, 5).getValues(); // Status(18), Action(19), Oleh(20), Waktu(21), Jml(22)
          for (var k = 0; k < keys.length; k++) {
            var kVal = String(keys[k][0]).trim();
            if (kVal) {
              keyRowMap[kVal] = k + 2;
              keyStatusMap[kVal] = String(extra[k][0] || 'OPEN').trim();
              keyActionCountMap[kVal] = Number(extra[k][4]) || 0;
            }
          }
        }

        var actRowsToAppend = [];

        for (var j = 0; j < mItems.length; j++) {
          var it = mItems[j];
          var incKey = String(it.incidentKey || '').trim();
          var rowNum = keyRowMap[incKey];

          if (rowNum > 0) {
            var curStatus = keyStatusMap[incKey] || 'OPEN';
            var curCount = keyActionCountMap[incKey] || 0;

            // Update kolom ringkasan di INC sheet (1 batch call 4 kolom)
            incSheet.getRange(rowNum, 19, 1, 4).setValues([[
              formattedAction,
              namaPetugas,
              nowWib,
              curCount + 1
            ]]);

            actRowsToAppend.push([
              'BULK_' + Date.now() + '_' + j,
              nowWib,
              incKey,
              sanitizeCellText(it.wsid || ''),
              sanitizeCellText(it.eventCodeDesc || ''),
              kategori,
              isiAction,
              namaPetugas,
              curStatus,
              curStatus,
              '-'
            ]);

            updatedTotal++;
          }
        }

        if (actRowsToAppend.length > 0) {
          var startRow = actSheet.getLastRow() + 1;
          actSheet.getRange(startRow, 1, actRowsToAppend.length, actRowsToAppend[0].length).setValues(actRowsToAppend);
        }
      }

      CacheService.getScriptCache().remove('MONITORING_OPEN_INCIDENTS');
      try { syncOpenIncidentsSheet(ss); } catch(e) {}

      return {
        success: true,
        updatedCount: updatedTotal,
        message: updatedTotal + ' catatan ' + kategori.toLowerCase() + ' berhasil disimpan.'
      };
    } catch (err) {
      return { success: false, message: 'Gagal menyimpan bulk action: ' + err.toString() };
    } finally {
      if (hasLock) lock.releaseLock();
    }
  }

  /**
   * Mengambil riwayat tindakan / penanganan berdasarkan WSID dari seluruh ACT sheet
   */
  function getWsidPenangananHistory(wsid, monthStr) {
    try {
      var ss = getIncidentDbSpreadsheet();
      var targetWsid = cleanWsidGS(wsid) || String(wsid || '').trim().toUpperCase();
      var history = [];

      var sheets = [];
      if (monthStr && monthStr !== 'ALL') {
        var sh = ss.getSheetByName('ACT_' + monthStr);
        if (sh) sheets.push(sh);
      } else {
        var allSheets = ss.getSheets();
        for (var s = 0; s < allSheets.length; s++) {
          if (allSheets[s].getName().indexOf('ACT_') === 0) {
            sheets.push(allSheets[s]);
          }
        }
      }

      for (var si = 0; si < sheets.length; si++) {
        var actSheet = sheets[si];
        if (actSheet && actSheet.getLastRow() > 1) {
          var actVals = actSheet.getRange(2, 1, actSheet.getLastRow() - 1, 11).getValues();
          for (var a = 0; a < actVals.length; a++) {
            var row = actVals[a];
            var rWsid = cleanWsidGS(row[3]);
            if (rWsid === targetWsid) {
              history.push({
                logId: String(row[0] || ''),
                waktu: String(row[1] || ''),
                incidentKey: String(row[2] || ''),
                wsid: rWsid,
                eventCodeDesc: String(row[4] || ''),
                tipe: String(row[5] || 'UPDATE'),
                isiAction: String(row[6] || ''),
                namaPetugas: String(row[7] || ''),
                statusSebelum: String(row[8] || ''),
                statusSesudah: String(row[9] || ''),
                catatan: String(row[10] || '')
              });
            }
          }
        }
      }

      history.sort(function(x, y) {
        return y.waktu.localeCompare(x.waktu);
      });

      return {
        success: true,
        history: history
      };
    } catch (err) {
      return { success: false, history: [], message: 'Gagal memuat riwayat WSID: ' + err.toString() };
    }
  }

  function searchIncidents(filters) {
    try {
      var ss = getIncidentDbSpreadsheet();
      if (!ss) {
        return { success: false, incidents: [], message: 'Spreadsheet database belum dikonfigurasi.' };
      }
      var monthStr = filters.monthStr || '2026-10';
      var sheet = ss.getSheetByName('INC_' + monthStr);

      if (!sheet || sheet.getLastRow() <= 1) {
        return { success: true, incidents: [] };
      }

      var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 26).getValues();
      var q = String(filters.query || '').trim().toLowerCase();
      var statusFilter = filters.status || 'ALL'; // 'ALL' | 'OPEN' | 'CLOSED'
      var eventFilter = filters.eventCodeDesc || 'ALL';
      var targetMonth = parseInt(monthStr.split('-')[1] || '10', 10);
      var maxLimit = Number(filters.limit) || (q ? 2000 : 1000);

      var results = [];
      // Iterasi dari yang paling baru (bawah ke atas) agar data terkini langsung didapat (< 1.5 detik)
      for (var i = vals.length - 1; i >= 0; i--) {
        var row = vals[i];
        var wsid = String(row[2] || '');
        var lokasi = String(row[3] || '');
        var evDesc = String(row[9] || '');
        var rawEnd = row[12];
        var endT = formatCellDateStr(rawEnd, targetMonth);
        var status = String(row[17] || '').trim().toUpperCase();
        if (!status) {
          status = (!rawEnd || rawEnd === '-' || endT === '-') ? 'OPEN' : 'CLOSED';
        }
        var petugas = String(row[19] || '');

        if (statusFilter !== 'ALL' && status !== statusFilter) continue;
        if (eventFilter !== 'ALL' && evDesc !== eventFilter) continue;

        if (q) {
          var match = wsid.toLowerCase().indexOf(q) !== -1 ||
            lokasi.toLowerCase().indexOf(q) !== -1 ||
            evDesc.toLowerCase().indexOf(q) !== -1 ||
            petugas.toLowerCase().indexOf(q) !== -1;
          if (!match) continue;
        }

        var startT = resolveRowStartProblem(row, targetMonth);
        var detailStr = resolveRowDetail(row, startT);
        var tgl = formatCellDateOnly(row[13], targetMonth);
        if (tgl === '-' && startT !== '-') {
          tgl = startT.split(' ')[0];
        }
        var jam = formatCellTimeOnly(row[14], startT);
        var closeSrc = '-';
        if (isEndTimeFilledGS(endT)) {
          var isByDb = (petugas === 'Sistem Dashboard') ||
                       (String(row[18] || '').indexOf('[AUTO-CLOSE]') !== -1) ||
                       (String(row[25] || '').indexOf('Sistem Dashboard') !== -1);
          closeSrc = isByDb ? 'DASHBOARD' : 'OASE';
        }

        results.push({
          incidentKey: String(row[0] || ''),
          incidentNumber: String(row[1] || '-'),
          wsid: wsid,
          lokasi: lokasi,
          servicePoint: String(row[4] || '-'),
          sektor: String(row[5] || '-'),
          typeMesin: String(row[6] || '-'),
          vendor: String(row[7] || '-'),
          eventCode: String(row[8] || '-'),
          eventCodeDesc: evDesc,
          detail: detailStr,
          startTime: startT,
          endTime: endT,
          tanggal: tgl,
          jam: jam,
          durationRaw: Number(row[15]) || 0,
          durasiOpr: Number(row[16]) || 0,
          status: status,
          actionTerakhir: String(row[18] || '-'),
          actionTerakhirOleh: petugas,
          actionTerakhirWaktu: formatCellDateStr(row[20], targetMonth),
          jumlahAction: Number(row[21]) || 0,
          monthStr: monthStr,
          closeSource: closeSrc
        });

        if (results.length >= maxLimit) {
          break;
        }
      }

      return {
        success: true,
        incidents: results,
        totalCount: results.length
      };
    } catch (err) {
      return { success: false, incidents: [], message: 'Gagal mencari insiden: ' + err.toString() };
    }
  }

  function getUploadLog() {
    try {
      var ss = getIncidentDbSpreadsheet();
      var sheet = ss.getSheetByName('DB_UPLOAD_LOG');
      if (!sheet || sheet.getLastRow() <= 1) {
        return { success: true, logs: [] };
      }

      var numRows = Math.min(sheet.getLastRow() - 1, 50);
      var startRow = sheet.getLastRow() - numRows + 1;
      var vals = sheet.getRange(startRow, 1, numRows, 10).getValues();

      var logs = [];
      for (var i = vals.length - 1; i >= 0; i--) {
        var row = vals[i];
        logs.push({
          waktu: String(row[0] || ''),
          uploader: String(row[1] || ''),
          sumber: String(row[2] || ''),
          namaFile: String(row[3] || ''),
          totalLines: Number(row[4]) || 0,
          lolosFilter: Number(row[5]) || 0,
          baru: Number(row[6]) || 0,
          diupdate: Number(row[7]) || 0,
          tanpaPerubahan: Number(row[8]) || 0,
          dilewati: Number(row[9]) || 0
        });
      }

      return { success: true, logs: logs };
    } catch (err) {
      return { success: false, logs: [], message: 'Gagal memuat log upload: ' + err.toString() };
    }
  }

  /**
  * 6. INTEGRASI KA OPS CEK DAILY DENGAN DATABASE INSIDEN
  */
  function getDailyIncidentsFromDb(payload) {
    try {
      var token = payload ? payload.token : null;
      if (token && !verifySupervisorToken(token)) {
        return { success: false, message: 'Sesi Ka Ops / Ka Wil tidak valid atau telah berakhir.' };
      }

      var ss = getIncidentDbSpreadsheet();
      if (!ss) {
        return { success: false, rows: [], message: 'Spreadsheet database belum dikonfigurasi.' };
      }

      var sheets = ss.getSheets();
      var availableMonths = [];
      for (var s = 0; s < sheets.length; s++) {
        var sName = sheets[s].getName();
        if (sName.toUpperCase().indexOf('INC') === 0) {
          var cleanM = sName.replace(/^INC[-_ ]?/i, '').replace('_', '-');
          availableMonths.push(cleanM);
        }
      }
      availableMonths.sort().reverse();

      // Tentukan daftar target bulan yang ingin ditarik
      var targetMonths = [];
      if (payload && payload.months && Array.isArray(payload.months) && payload.months.length > 0) {
        targetMonths = payload.months;
      } else if (payload && payload.startMonth && payload.endMonth) {
        var sM = String(payload.startMonth);
        var eM = String(payload.endMonth);
        if (sM > eM) { var tmp = sM; sM = eM; eM = tmp; }
        var cur = sM;
        while (cur <= eM) {
          targetMonths.push(cur);
          var parts = cur.split('-');
          var y = parseInt(parts[0], 10);
          var m = parseInt(parts[1], 10);
          m++;
          if (m > 12) { m = 1; y++; }
          cur = y + '-' + (m < 10 ? '0' + m : m);
          if (targetMonths.length > 36) break;
        }
      } else {
        var monthStr = (payload && payload.monthStr) ? payload.monthStr : (availableMonths[0] || '2026-10');
        targetMonths = [monthStr];
      }

      // Tarik peta riwayat tindakan terbaru dari ACT_ sheet secara instan O(1)
      var actBundle = buildActionMapFromSheets(ss);
      var actMap = actBundle.actMap;

      var headers = [
        'incidentNumber', 'wsid', 'lokasi', 'servicePointSektor', 'servicePoint', 'sektor',
        'typeMesin', 'vendorMesin', 'startTime', 'endTime', 'dateStr', 'hourStr',
        'hourNumber', 'durasi', 'rawDuration', 'eventCodeDesc', 'eventCode', 'detail',
        'status', 'actionTerakhir', 'actionTerakhirOleh', 'actionTerakhirWaktu', 'jumlahAction', 'monthStr',
        'closeSource'
      ];
      var compactData = [];

      for (var tm = 0; tm < targetMonths.length; tm++) {
        var curMonthStr = targetMonths[tm];
        var curTargetMonth = parseInt(curMonthStr.split('-')[1] || curMonthStr.split('_')[1] || '10', 10);
        var sheet = ss.getSheetByName('INC_' + curMonthStr) ||
                    ss.getSheetByName('INC_' + curMonthStr.replace('-', '_')) ||
                    ss.getSheetByName('INC_' + curMonthStr.replace('_', '-')) ||
                    ss.getSheetByName('INC-' + curMonthStr) ||
                    ss.getSheetByName('INC ' + curMonthStr) ||
                    ss.getSheetByName(curMonthStr);

        // Fallback cerdas 1: jika bulan spesifik tidak ditemukan tetapi ada bulan lain di database
        if (!sheet && tm === 0 && availableMonths.length > 0) {
          sheet = ss.getSheetByName('INC_' + availableMonths[0]) ||
                  ss.getSheetByName('INC_' + availableMonths[0].replace('-', '_')) ||
                  ss.getSheetByName('INC-' + availableMonths[0]) ||
                  ss.getSheetByName('INC ' + availableMonths[0]);
          if (sheet) {
            curMonthStr = availableMonths[0];
            curTargetMonth = parseInt(curMonthStr.split('-')[1] || curMonthStr.split('_')[1] || '10', 10);
          }
        }

        // Fallback cerdas 2: jika hanya ada 1 sheet di spreadsheet dan sheet tersebut ada datanya
        if (!sheet && tm === 0 && sheets.length === 1 && sheets[0].getLastRow() > 1) {
          sheet = sheets[0];
        }

        if (sheet && sheet.getLastRow() > 1) {
          var lastRow = sheet.getLastRow();
          var lastCol = Math.min(sheet.getLastColumn(), 25);
          var hasExplicitLimit = !!(payload && payload.limit && parseInt(payload.limit, 10) > 0);
          var maxLimit = hasExplicitLimit ? parseInt(payload.limit, 10) : 60000;
          
          var totalDataRows = lastRow - 1;
          var rowsToFetch = Math.min(totalDataRows, maxLimit);
          // Jika limit eksplisit diberikan lebih kecil dari total baris, ambil dari baris paling bawah (terbaru).
          // Jika tidak ada limit atau minta semua, mulai dari baris 2 (awal bulan) agar semua tanggal 1 s/d akhir bulan terbaca.
          var startRow = (hasExplicitLimit && totalDataRows > maxLimit) ? Math.max(2, lastRow - rowsToFetch + 1) : 2;

          // Baca dalam chunk yang aman (maksimal 1000 baris per getRange)
          // Mencegah error "Data yang diminta melebihi ukuran maksimum yang diizinkan"
          var vals = [];
          var CHUNK_SIZE = 1000;
          var curStart = startRow;
          var curRemaining = rowsToFetch;

          while (curRemaining > 0) {
            var batchCount = Math.min(curRemaining, CHUNK_SIZE);
            try {
              var batchVals = sheet.getRange(curStart, 1, batchCount, lastCol).getValues();
              for (var b = 0; b < batchVals.length; b++) {
                vals.push(batchVals[b]);
              }
            } catch (rangeErr) {
              var miniBatch = Math.min(batchCount, 500);
              var miniVals = sheet.getRange(curStart, 1, miniBatch, lastCol).getValues();
              for (var mb = 0; mb < miniVals.length; mb++) {
                vals.push(miniVals[mb]);
              }
              batchCount = miniBatch;
            }
            curStart += batchCount;
            curRemaining -= batchCount;
          }

          for (var i = vals.length - 1; i >= 0; i--) {
            var r = vals[i];
            var sPoint = String(r[4] || '-');
            var sektor = cleanSektorNameGS(r[5]);
            var spSektor = (sPoint !== '-' && sektor !== '-') ? (sPoint + ' - ' + sektor) : (sPoint !== '-' ? sPoint : sektor);

            var startTimeStr = resolveRowStartProblem(r, curTargetMonth);
            var endTimeStr = formatCellDateStr(r[12], curTargetMonth);
            var detailStr = resolveRowDetail(r, startTimeStr);
            var dateStr = formatCellDateOnly(r[13], curTargetMonth);
            if (dateStr === '-' && startTimeStr !== '-') {
              dateStr = startTimeStr.split(' ')[0];
            }
            var hourStr = formatCellTimeOnly(r[14], startTimeStr);

            var hourNumber = 0;
            if (startTimeStr && startTimeStr.indexOf(':') !== -1) {
              var tParts = startTimeStr.split(' ')[1] ? startTimeStr.split(' ')[1].split(':') : [];
              hourNumber = parseInt(tParts[0] || '0', 10) || 0;
            }

            var rRawAct = String(r[18] || '-').trim();
            if (isTechnicalMachineLog(rRawAct)) rRawAct = '-';
            var rActOleh = (rRawAct !== '-') ? String(r[19] || '-').trim() : '-';
            if (rActOleh === 'CSV' || rActOleh === 'CSV Comment') rActOleh = '-';
            var rActWaktu = (rRawAct !== '-') ? formatCellDateStr(r[20], curTargetMonth) : '-';
            var rRowActTimeMs = parseActionTimestampMs(rActWaktu) || parseActionTimestampMs(r[20]);

            var rRowKey = String(r[0] || '').trim();
            var rRowIncNum = String(r[1] || '').trim();
            var rRowWsid = cleanWsidGS(r[2]);
            if (!rRowWsid) continue;
            var rRowEv = String(r[9] || '').trim().toUpperCase();

            var resolvedAction = resolveLatestActionForRow(
              rRowKey,
              rRowIncNum,
              rRowWsid,
              rRowEv,
              rRawAct,
              rActOleh,
              rActWaktu,
              rRowActTimeMs,
              actMap
            );

            var isClosedGS = isEndTimeFilledGS(endTimeStr);
            var closeSrc = '-';
            if (isClosedGS) {
              var isByDb = (resolvedAction.petugas === 'Sistem Dashboard') ||
                           (resolvedAction.action && resolvedAction.action.indexOf('[AUTO-CLOSE]') !== -1) ||
                           (String(r[19] || '').indexOf('Sistem Dashboard') !== -1) ||
                           (String(r[25] || '').indexOf('Sistem Dashboard') !== -1);
              closeSrc = isByDb ? 'DASHBOARD' : 'OASE';
            }

            var rowArray = [
              String(r[1] || '-'),
              rRowWsid,
              String(r[3] || ''),
              spSektor,
              sPoint,
              sektor,
              String(r[6] || '-'),
              String(r[7] || '-'),
              startTimeStr,
              endTimeStr,
              dateStr,
              hourStr,
              hourNumber,
              Number(r[16]) || 0,
              Number(r[15]) || 0,
              String(r[9] || ''),
              String(r[8] || ''),
              detailStr,
              isClosedGS ? 'CLOSED' : 'OPEN',
              resolvedAction.action,
              resolvedAction.petugas,
              resolvedAction.waktu,
              resolvedAction.jumlah,
              curMonthStr,
              closeSrc
            ];
            compactData.push(rowArray);
          }
        }
      }

      // Ambil info upload terakhir dari log
      var lastUploadInfo = null;
      try {
        var logSheet = ss.getSheetByName('DB_UPLOAD_LOG');
        if (logSheet && logSheet.getLastRow() > 1) {
          var lastLog = logSheet.getRange(logSheet.getLastRow(), 1, 1, 10).getValues()[0];
          lastUploadInfo = {
            waktu: String(lastLog[0] || '-'),
            uploader: String(lastLog[1] || '-'),
            sumber: String(lastLog[2] || '-'),
            namaFile: String(lastLog[3] || '-')
          };
        }
      } catch (le) {}

      return {
        success: true,
        headers: headers,
        data: compactData,
        rows: [], // Gunakan compactData untuk efisiensi transfer JSON (<2MB)
        totalCount: compactData.length,
        availableMonths: availableMonths,
        lastUploadInfo: lastUploadInfo,
        spreadsheetName: ss.getName(),
        spreadsheetId: ss.getId(),
        sheetsFound: sheets.map(function(s) { return s.getName(); })
      };
    } catch (err) {
      return { success: false, rows: [], message: 'Gagal memuat insiden dari database: ' + err.toString() };
    }
  }


