// ~/Planes/backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { Expo } = require('expo-server-sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

const expo = new Expo();
const DB_FILE = path.join(__dirname, 'database.json');

// Clave maestra AES-256 para cifrar credenciales de AeroWeb (nunca en texto plano)
const SECRET_KEY = crypto
  .createHash('sha256')
  .update(process.env.ENCRYPTION_SECRET || 'planes-aerolineas-master-key-2026')
  .digest();

function encryptText(plainText) {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SECRET_KEY, iv);
  let encrypted = cipher.update(String(plainText), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decryptText(cipherText) {
  if (!cipherText || !cipherText.includes(':')) return '';
  const [ivHex, tagHex, contentHex] = cipherText.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', SECRET_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(contentHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = { users: {}, groups: {}, avatars: {}, phoneDirectory: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ============================================================================
// PARSER OFICIAL EN EL SERVIDOR (Extrae vuelos, horarios, matrículas, pickup y tripulación real)
// ============================================================================
function extractTimeOnly(str) {
  if (!str) return '-';
  const m = String(str).match(/(\d{2}:\d{2})/);
  return m ? m[1] : '-';
}

function extractDateCode(str) {
  if (!str) return '';
  const m = String(str).match(/(\d{1,2})\s*([A-Z]{3})/i);
  return m ? `${m[1].padStart(2, '0')}${m[2].toUpperCase()}` : '';
}

function sanitizeCrewName(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/,\s*\d{3,6}\b/g, '')
    .replace(/\b\d{4,6}\b/g, '')
    .split(/\||\[|\b(?:MON|TUE|WED|THU|FRI|SAT|SUN|LUN|MAR|MIE|MIÉ|JUE|VIE|SAB|SÁB|DOM)\b|\b\d{1,2}[A-Z]{3}\b|\d{2}:\d{2}|\bSB[A-Z0-9]*\b|\bAR\s*\d{3,4}|\bBUE\b|\bAEP\b|\bEZE\b|\bTripulaci|\bMensajes|\bEstado|\bCheckin|\bActividad/i)[0]
    .trim()
    .replace(/^[,.\s-]+|[,.\s-]+$/g, '')
    .replace(/\s+/g, ' ');
}

function parseCrewFromRawText(rawText) {
  const crew = [];
  if (!rawText) return crew;

  const clean = String(rawText)
    .replace(/Tripulaci[oó]n del vuelo\s*[-:]?\s*(?:AR\s*)?\d+[A-Z]?/gi, ' | ')
    .replace(/\bCAT\s+DUTY\s+TRIPULANTE\b/gi, ' | ')
    .replace(/\s+/g, ' ')
    .trim();

  const markerRegex = /\b(CP|FO|CM|TC|AX|JP)(?:\s+(OP|DH))?\s+/gi;
  const markers = [];
  let m;
  while ((m = markerRegex.exec(clean)) !== null) {
    markers.push({
      rol: m[1].toUpperCase(),
      duty: (m[2] || 'OP').toUpperCase(),
      startIndex: m.index,
      nameStartIndex: markerRegex.lastIndex
    });
  }

  for (let i = 0; i < markers.length; i++) {
    const current = markers[i];
    const nextStart = i + 1 < markers.length ? markers[i + 1].startIndex : clean.length;
    const nombre = sanitizeCrewName(clean.slice(current.nameStartIndex, nextStart));
    const rol = current.rol === 'JP' ? 'CM' : current.rol;
    if (nombre.length > 2 && !crew.some(c => c.nombre === nombre && c.rol === rol)) {
      crew.push({
        rol,
        duty: current.duty,
        nombre,
        label: rol === 'CP' ? 'Comandante' : (rol === 'FO' ? 'Primer Oficial' : (rol === 'CM' ? 'Comisario' : 'Tripulante')),
        rangType: rol === 'CP' ? '4_gold' : (rol === 'FO' ? '3_gold' : (rol === 'CM' ? '2_silver' : 'dots'))
      });
    }
  }
  const orden = { CP: 1, FO: 2, CM: 3, TC: 4, AX: 5 };
  crew.sort((a, b) => (orden[a.rol] || 99) - (orden[b.rol] || 99));
  return crew;
}

function parseCwpPageText(fullText, crewMapByDate = {}, cobList = []) {
  if (!fullText) return [];
  const cleanText = fullText.replace(/\s+/g, ' ');
  const pattern = /(?:([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})\s+)?(AR\s*\d+[A-Z]?|RPT|D\/L|VAC|SB[A-Z0-9]*|\*|OF|MED|LIC|S\/G|SIM|GUA|ELD|CUR|INS)\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})\s+([A-Z]{3})\s+([A-Z]{3})\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})(?:\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2}))?(?:\s+(73[A-Z0-9]+|33[A-Z0-9]+|E190|B73[A-Z0-9]+|B38M|FO|CP))?(?:\s+(LV-?[A-Z]{3}))?/gi;

  const matches = [];
  let match;
  while ((match = pattern.exec(cleanText)) !== null) {
    matches.push({ index: match.index, lastIndex: pattern.lastIndex, groups: match });
  }

  const parsed = [];
  let lastCheckinTime = '-';
  let lastDateCode = '';
  let flightCounter = 0;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i].groups;
    const nextStartIndex = i + 1 < matches.length ? matches[i + 1].index : cleanText.length;
    const betweenText = cleanText.slice(matches[i].lastIndex, nextStartIndex);

    const rawChk = m[1] ? m[1].trim() : '';
    const act = m[2].replace(/\s+/g, '').toUpperCase();
    const comStr = m[3].trim();
    const desStr = m[4].trim().toUpperCase();
    const hacStr = m[5].trim().toUpperCase();
    const finStr = m[6].trim();
    const outStr = m[7] ? m[7].trim() : '';
    const rawEq = m[8] ? m[8].trim().toUpperCase() : 'B738';
    const eqStr = (rawEq === 'FO' || rawEq === 'CP') ? 'B738' : rawEq;
    const inlineMat = m[9] ? m[9].trim().toUpperCase() : null;

    const startDateCode = extractDateCode(comStr) || extractDateCode(rawChk) || lastDateCode;
    const endDateCode = extractDateCode(finStr) || extractDateCode(outStr) || startDateCode;

    if (startDateCode !== lastDateCode) {
      lastCheckinTime = '-';
      lastDateCode = startDateCode;
    }

    const isFlight = act.startsWith('AR');
    const flightNumOnly = act.replace(/^AR/i, '');
    const chkTime = extractTimeOnly(rawChk);
    if (chkTime !== '-') lastCheckinTime = chkTime;

    let cobTextForFlight = '';
    if (isFlight) {
      const exactKey = `${startDateCode}_${flightNumOnly}`;
      if (crewMapByDate[exactKey]) cobTextForFlight = crewMapByDate[exactKey];
      else if (crewMapByDate[startDateCode]) cobTextForFlight = crewMapByDate[startDateCode];
      else if (cobList[flightCounter]) cobTextForFlight = cobList[flightCounter].text;
      flightCounter++;
    }

    const crewSource = [cobTextForFlight, betweenText].filter(Boolean).join(' | ');
    const directMatMatch = crewSource.match(/\b(LV-[A-Z]{3})\b/i);

    parsed.push({
      fechaAsignada: startDateCode,
      fechaFinAsignada: endDateCode,
      checkin: chkTime !== '-' ? chkTime : lastCheckinTime,
      actividad: act,
      comienzo: extractTimeOnly(comStr),
      desde: desStr,
      hacia: hacStr,
      fin: extractTimeOnly(finStr),
      checkout: extractTimeOnly(outStr),
      tipoAvion: eqStr,
      matricula: inlineMat || (directMatMatch ? directMatMatch[1].toUpperCase() : null),
      tripulacion: isFlight ? parseCrewFromRawText(crewSource) : []
    });
  }
  return parsed;
}

// ============================================================================
// MOTOR DE DETECCIÓN DE CAMBIOS Y ENVÍO DE NOTIFICACIONES PUSH (APNs / FCM)
// ============================================================================
function detectChangesBetweenRosters(previousRaw = [], newRaw = []) {
  if (!previousRaw || previousRaw.length === 0) return [];
  const diffs = [];

  const groupByDate = (list) => {
    const map = {};
    list.forEach(item => {
      if (!map[item.fechaAsignada]) map[item.fechaAsignada] = [];
      map[item.fechaAsignada].push(item);
    });
    return map;
  };

  const prevByDate = groupByDate(previousRaw);
  const newByDate = groupByDate(newRaw);

  Object.keys(newByDate).forEach(dateKey => {
    const prevItems = prevByDate[dateKey] || [];
    const currItems = newByDate[dateKey] || [];
    if (prevItems.length === 0) return;

    const prevActs = prevItems.map(i => i.actividad).join(' · ');
    const currActs = currItems.map(i => i.actividad).join(' · ');

    // 1. Nuevo vuelo, cancelación o cambio de actividad
    if (prevActs !== currActs) {
      diffs.push({
        fechaDia: dateKey,
        mensaje: `🔄 Cambio de programación (${dateKey}): Antes ${prevActs} → Ahora ${currActs}`
      });
    }

    currItems.forEach(currLeg => {
      if (!currLeg.actividad.startsWith('AR')) return;
      const prevLeg = prevItems.find(p => p.actividad === currLeg.actividad);
      if (!prevLeg) return;

      // 2. Cambio de origen o destino
      if (`${prevLeg.desde} → ${prevLeg.hacia}` !== `${currLeg.desde} → ${currLeg.hacia}`) {
        diffs.push({
          fechaDia: dateKey,
          mensaje: `🔄 Cambio de aeropuerto (${currLeg.actividad} ${dateKey}): Orig ${prevLeg.desde} → ${prevLeg.hacia} → Nuevo ${currLeg.desde} → ${currLeg.hacia}`
        });
      }

      // 3. Cambio de ETD / ETA
      if (prevLeg.comienzo !== currLeg.comienzo || prevLeg.fin !== currLeg.fin) {
        diffs.push({
          fechaDia: dateKey,
          mensaje: `⚠️ Horario modificado (${currLeg.actividad} ${dateKey}): Orig ${prevLeg.comienzo}→${prevLeg.fin} → Nuevo ${currLeg.comienzo}→${currLeg.fin}`
        });
      }

      // 4. Cambio de aeronave o matrícula
      if (prevLeg.tipoAvion !== currLeg.tipoAvion) {
        diffs.push({
          fechaDia: dateKey,
          mensaje: `✈️ Cambio de aeronave (${currLeg.actividad} ${dateKey}): ${prevLeg.tipoAvion} → ${currLeg.tipoAvion}`
        });
      }
      if (prevLeg.matricula && currLeg.matricula && prevLeg.matricula !== currLeg.matricula) {
        diffs.push({
          fechaDia: dateKey,
          mensaje: `✈️ Cambio de matrícula (${currLeg.actividad} ${dateKey}): ${prevLeg.matricula} → ${currLeg.matricula}`
        });
      }

      // 5. Cambios de tripulación
      const prevCrew = (prevLeg.tripulacion || []).map(c => `${c.rol} ${c.nombre}`);
      const currCrew = (currLeg.tripulacion || []).map(c => `${c.rol} ${c.nombre}`);
      if (prevCrew.length > 0 && currCrew.length > 0) {
        prevCrew.filter(x => !currCrew.includes(x)).forEach(s => {
          diffs.push({ fechaDia: dateKey, mensaje: `❌ Salió de tripulación (${dateKey}): ${s}` });
        });
        currCrew.filter(x => !prevCrew.includes(x)).forEach(e => {
          diffs.push({ fechaDia: dateKey, mensaje: `✅ Entró a tripulación (${dateKey}): ${e}` });
        });
      }
    });
  });

  return diffs;
}

async function sendPushNotificationToUser(user, diffs) {
  if (!user.expoPushToken || !Expo.isExpoPushToken(user.expoPushToken) || diffs.length === 0) return;
  const bodyText = diffs.map(d => d.mensaje).slice(0, 4).join('\n');
  try {
    await expo.sendPushNotificationsAsync([
      {
        to: user.expoPushToken,
        sound: 'default',
        title: '✈️ Cambio detectado en tu programación AeroWeb',
        body: bodyText,
        data: { diffs, timestamp: new Date().toISOString() }
      }
    ]);
    console.log(`[PUSH ENVIADO] Legajo ${user.aerowebUser}: ${bodyText}`);
  } catch (err) {
    console.error(`[ERROR PUSH] Legajo ${user.aerowebUser}:`, err.message);
  }
}

// ============================================================================
// WORKER DE AUTOMATIZACIÓN AISLADO POR USUARIO (Sin compartir sesiones ni cookies)
// ============================================================================
async function syncSingleUserWithAeroweb(legajo, forceHistoricalYear = false) {
  const db = loadDb();
  const user = db.users[legajo];
  if (!user || !user.encryptedDni) return { ok: false, error: 'Usuario sin credenciales' };

  const dniPlain = decryptText(user.encryptedDni);
  let browser = null;

  try {
    // Contexto de navegador 100% aislado para este legajo (cero cookies compartidas)
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://portalar.aerolineas.com.ar/CWP_WA/CWPLogin.aspx?ReturnUrl=/cwp_wa/CWP_RosterTW.aspx', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.fill('input[type="text"]', String(legajo));
    await page.fill('input[type="password"]', String(dniPlain));
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {}),
      page.click('input[type="submit"], button')
    ]);

    // Seleccionar día 01, "Con detalles" y todos los checkboxes de tripulación/mensajes
    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      selects.forEach(s => {
        const opts = Array.from(s.options || []);
        if (opts.length >= 28 && opts.length <= 32) {
          const idx = opts.findIndex(o => o.value === '1' || o.value === '01' || o.text.trim() === '01');
          if (idx !== -1) {
            s.selectedIndex = idx;
            s.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      const conDet = radios.find(r => r.parentElement && r.parentElement.innerText.toLowerCase().includes('con detalle'));
      if (conDet) { conDet.checked = true; conDet.click(); }
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (!cb.checked) { cb.checked = true; cb.click(); }
      });
    });

    const btnMostrar = await page.$('input[value="Mostrar"], input[value="Ver"], input[type="submit"]');
    if (btnMostrar) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {}),
        btnMostrar.click()
      ]);
    }

    // Expandir todas las estructuras cob_ de tripulación
    const extracted = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="openStructure"]');
      links.forEach(l => {
        const href = l.getAttribute('href') || '';
        const m = href.match(/openStructure\(['"]([^'"]+)['"]\)/);
        if (m && m[1] && typeof window.openStructure === 'function') {
          try { window.openStructure(m[1]); } catch (e) {}
        }
      });

      const crewMapByDate = {};
      const cobList = [];
      document.querySelectorAll('[id^="cob_"]').forEach(cobEl => {
        const cobId = cobEl.id;
        const rawCobText = (cobEl.textContent || '').replace(/\s+/g, ' ').trim();
        let foundDate = '';
        let foundFlightNum = '';
        const flMatch = rawCobText.match(/vuelo\s*[-:]?\s*(?:AR\s*)?(\d{3,4})/i);
        if (flMatch) foundFlightNum = flMatch[1];

        const imgBtn = document.getElementById('img_' + cobId);
        let scanRow = imgBtn ? imgBtn.closest('tr') : cobEl.closest('tr');
        let steps = 0;
        while (scanRow && steps < 6) {
          const rText = scanRow.textContent || '';
          const dm = rText.match(/(\d{2}[A-Z]{3})/i);
          if (dm && !foundDate) foundDate = dm[1].toUpperCase();
          const fm = rText.match(/\bAR\s*(\d{3,4})\b/i);
          if (fm && !foundFlightNum) foundFlightNum = fm[1];
          if (foundDate && foundFlightNum) break;
          scanRow = scanRow.previousElementSibling;
          steps++;
        }
        if (foundDate && foundFlightNum && rawCobText) crewMapByDate[`${foundDate}_${foundFlightNum}`] = rawCobText;
        if (foundDate && rawCobText) crewMapByDate[foundDate] = (crewMapByDate[foundDate] || '') + ' | ' + rawCobText;
        if (rawCobText) cobList.push({ id: cobId, date: foundDate, flightNum: foundFlightNum, text: rawCobText });
      });

      return {
        text: document.body ? document.body.innerText : '',
        crewMap: crewMapByDate,
        cobList
      };
    });

    const parsedRecords = parseCwpPageText(extracted.text, extracted.crewMap, extracted.cobList);

    if (parsedRecords.length > 0) {
      const freshDb = loadDb();
      const targetUser = freshDb.users[legajo];
      const previousRecords = targetUser.currentRosterRaw || [];

      // Comparar con el estado anterior y enviar Push si hubo cambios
      const detectedDiffs = detectChangesBetweenRosters(previousRecords, parsedRecords);
      if (detectedDiffs.length > 0) {
        targetUser.changesHistory = [...(targetUser.changesHistory || []), ...detectedDiffs];
        await sendPushNotificationToUser(targetUser, detectedDiffs);
      }

      if (!targetUser.originalRosterRaw || targetUser.originalRosterRaw.length === 0) {
        targetUser.originalRosterRaw = parsedRecords;
      }
      targetUser.currentRosterRaw = parsedRecords;
      targetUser.lastSyncAt = new Date().toISOString();
      targetUser.lastSyncStatus = 'OK';
      saveDb(freshDb);
    }

    await browser.close();
    return { ok: true, count: parsedRecords.length };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    const errDb = loadDb();
    if (errDb.users[legajo]) {
      errDb.users[legajo].lastSyncStatus = `ERROR: ${err.message}`;
      saveDb(errDb);
    }
    return { ok: false, error: err.message };
  }
}

// ============================================================================
// ENDPOINTS REST PARA LA APP MÓVIL
// ============================================================================
app.post('/api/users/register-sync', async (req, res) => {
  const { aerowebUser, dni, aerowebPass, nombre, rank, fleet, telefono, avatarUri, expoPushToken } = req.body;
  if (!aerowebUser || !dni) return res.status(400).json({ error: 'Legajo y DNI requeridos' });

  const db = loadDb();
  const isNewUser = !db.users[aerowebUser];

  db.users[aerowebUser] = {
    ...(db.users[aerowebUser] || {}),
    aerowebUser: String(aerowebUser).trim(),
    nombre: (nombre || '').toUpperCase().trim(),
    rank: rank || 'Primer Oficial',
    fleet: fleet || 'B737',
    telefono: telefono || '',
    encryptedDni: encryptText(dni),
    encryptedPass: encryptText(aerowebPass || dni),
    expoPushToken: expoPushToken || db.users[aerowebUser]?.expoPushToken || null,
    updatedAt: new Date().toISOString()
  };

  if (avatarUri) {
    db.avatars[aerowebUser] = avatarUri;
    db.avatars[nombre.toUpperCase().trim()] = avatarUri;
  }

  saveDb(db);

  // Ejecutar sincronización inmediata en el servidor
  const syncRes = await syncSingleUserWithAeroweb(String(aerowebUser).trim(), isNewUser);
  const updatedUser = loadDb().users[aerowebUser];

  return res.json({
    ok: syncRes.ok,
    lastSyncAt: updatedUser.lastSyncAt,
    currentRosterRaw: updatedUser.currentRosterRaw || [],
    originalRosterRaw: updatedUser.originalRosterRaw || [],
    changesHistory: updatedUser.changesHistory || []
  });
});

app.get('/api/users/:legajo/roster', (req, res) => {
  const db = loadDb();
  const user = db.users[req.params.legajo];
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  return res.json({
    lastSyncAt: user.lastSyncAt,
    lastSyncStatus: user.lastSyncStatus,
    currentRosterRaw: user.currentRosterRaw || [],
    originalRosterRaw: user.originalRosterRaw || [],
    changesHistory: user.changesHistory || [],
    avatars: db.avatars || {}
  });
});

// Endpoint para probar la PRUEBA B y PRUEBA C en cualquier momento
app.post('/api/test/simulate-change/:legajo', async (req, res) => {
  const db = loadDb();
  const user = db.users[req.params.legajo];
  if (!user) return res.status(404).json({ error: 'Usuario no registrado en el backend' });

  const simulatedDiffs = [
    {
      fechaDia: '08NOV',
      mensaje: req.body.mensaje || '🔄 Cambio detectado por monitoreo automático (AR1286): ETD actualizado en AeroWeb'
    }
  ];
  await sendPushNotificationToUser(user, simulatedDiffs);
  return res.json({ ok: true, sentTo: user.expoPushToken, diffs: simulatedDiffs });
});

// ============================================================================
// MONITOREO AUTOMÁTICO CADA 15 MINUTOS EN EL SERVIDOR (PRUEBA B y PRUEBA C)
// Corre independientemente de que el usuario tenga la aplicación cerrada
// ============================================================================
cron.schedule('*/15 * * * *', async () => {
  const db = loadDb();
  const legajos = Object.keys(db.users);
  console.log(`[CRON 15 MIN] Iniciando monitoreo automático para ${legajos.length} tripulantes...`);
  for (const legajo of legajos) {
    await syncSingleUserWithAeroweb(legajo, false);
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor Backend PLANES corriendo en http://0.0.0.0:${PORT}`);
  console.log(`⏱️  Monitoreo automático de AeroWeb activo cada 15 minutos.`);
});