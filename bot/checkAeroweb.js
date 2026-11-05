const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LOGIN_URL = 'https://portalar.aerolineas.com.ar/CWP_WA/CWPLogin.aspx?ReturnUrl=/cwp_wa/CWP_RosterTW.aspx';
const SNAPSHOT_FILE = path.join(__dirname, 'last_roster.json');

const AEROWEB_USER = process.env.AEROWEB_USER;
const AEROWEB_PASS = process.env.AEROWEB_PASS;
const EXPO_PUSH_TOKEN = process.env.EXPO_PUSH_TOKEN;

function parseCrewClean(rawText) {
  const crew = [];
  if (!rawText) return crew;

  const clean = rawText
    .replace(/Tripulaci[oó]n del vuelo\s*[-:]?\s*(?:AR\s*)?\d+[A-Z]?/gi, ' | ')
    .replace(/\bCAT\s+DUTY\s+TRIPULANTE\b/gi, ' | ')
    .replace(/\s+/g, ' ')
    .trim();

  const markerRegex = /\b(CP|FO|CM|TC|AX|JP)\s*(OP|DH)\b/gi;
  const markers = [];
  let m;
  while ((m = markerRegex.exec(clean)) !== null) {
    markers.push({
      rol: m[1].toUpperCase() === 'JP' ? 'CM' : m[1].toUpperCase(),
      startIndex: m.index,
      nameStartIndex: markerRegex.lastIndex
    });
  }

  for (let i = 0; i < markers.length; i++) {
    const current = markers[i];
    const nextStart = i + 1 < markers.length ? markers[i + 1].startIndex : clean.length;
    let rawName = clean.slice(current.nameStartIndex, nextStart);

    rawName = rawName
      .split(/\||\[|\b(?:MON|TUE|WED|THU|FRI|SAT|SUN|LUN|MAR|MIE|MIÉ|JUE|VIE|SAB|SÁB|DOM)\b|\b\d{1,2}[A-Z]{3}\b|\d{2}:\d{2}|\bSB[A-Z0-9]*\b|\bAR\s*\d{3,4}|\bTripulaci|\bMensajes|\bEstado|\bCheckin|\bActividad/i)[0]
      .trim()
      .replace(/^[,.\s-]+|[,.\s-]+$/g, '')
      .replace(/\s+/g, ' ');

    if (rawName.length > 2) {
      const fullTag = `${current.rol} ${rawName}`;
      if (!crew.includes(fullTag)) crew.push(fullTag);
    }
  }
  return crew;
}

function parseRosterText(fullText, crewMapByDate) {
  const cleanText = (fullText || '').replace(/\s+/g, ' ');
  const pattern = /(?:([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})\s+)?(AR\s*\d+[A-Z]?|RPT|D\/L|VAC|SB[A-Z0-9]*|\*|OF|MED|LIC|S\/G|SIM|GUA|ELD|CUR|INS)\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})\s+([A-Z]{3})\s+([A-Z]{3})\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})(?:\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2}))?(?:\s+(73[A-Z0-9]+|33[A-Z0-9]+|E190|B73[A-Z0-9]+|B38M|FO|CP))?/gi;

  const days = {};
  let match;
  while ((match = pattern.exec(cleanText)) !== null) {
    const act = match[2].replace(/\s+/g, '').toUpperCase();
    const comStr = match[3].trim();
    const des = match[4].trim().toUpperCase();
    const hac = match[5].trim().toUpperCase();
    const rawEq = match[8] ? match[8].trim().toUpperCase() : 'B738';
    const eq = (rawEq === 'FO' || rawEq === 'CP') ? 'B738' : rawEq;

    const dm = comStr.match(/(\d{1,2})\s*([A-Z]{3})/i);
    const dateCode = dm ? `${dm[1].padStart(2, '0')}${dm[2].toUpperCase()}` : 'DESC';
    const etdMatch = comStr.match(/(\d{2}:\d{2})/);
    const etd = etdMatch ? etdMatch[1] : '-';

    if (!days[dateCode]) {
      days[dateCode] = {
        fechaDia: dateCode,
        vuelos: [],
        etdPrimerVuelo: etd,
        flota: eq,
        tripulacion: parseCrewClean(crewMapByDate[dateCode] || '')
      };
    }
    days[dateCode].vuelos.push(`${act} (${des}-${hac})`);
    if (eq && eq !== 'B737') days[dateCode].flota = eq;
  }
  return days;
}

async function sendExpoPush(title, body) {
  if (!EXPO_PUSH_TOKEN) {
    console.log('Sin EXPO_PUSH_TOKEN configurado. Mensaje:', title, body);
    return;
  }
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: EXPO_PUSH_TOKEN,
      sound: 'default',
      title,
      body,
      priority: 'high'
    })
  });
}

(async () => {
  if (!AEROWEB_USER || !AEROWEB_PASS) {
    console.error('Faltan secrets AEROWEB_USER o AEROWEB_PASS');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const userField = await page.locator('input[type="text"], input:not([type="hidden"]):not([type="password"])').first();
    const passField = await page.locator('input[type="password"]').first();
    await userField.fill(AEROWEB_USER);
    await passField.fill(AEROWEB_PASS);
    await page.locator('input[type="submit"], button').first().click();

    await page.waitForTimeout(3000);

    // Seleccionar día 1, "Con detalles" y tildar checkboxes
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const sel of selects) {
        const idName = ((sel.id || '') + (sel.name || '')).toLowerCase();
        if (idName.includes('day') || idName.includes('dia') || idName.includes('from')) {
          for (let o = 0; o < sel.options.length; o++) {
            if (sel.options[o].value === '1' || sel.options[o].value === '01') {
              sel.selectedIndex = o;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
      }
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      const conDetalles = radios.find(r => r.parentElement && r.parentElement.innerText.toLowerCase().includes('con detalle'));
      if (conDetalles && !conDetalles.checked) conDetalles.click();

      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
      checkboxes.forEach(cb => { if (!cb.checked) cb.click(); });

      const btnMostrar = document.querySelector('input[value="Mostrar"], input[value="Ver"], input[type="submit"]');
      if (btnMostrar) btnMostrar.click();
    });

    await page.waitForTimeout(4000);

    const extracted = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="openStructure"]');
      for (const l of links) {
        const href = l.getAttribute('href') || '';
        const m = href.match(/openStructure\(['"]([^'"]+)['"]\)/);
        if (m && m[1] && typeof window.openStructure === 'function') {
          try { window.openStructure(m[1]); } catch (e) {}
        }
      }

      const crewMapByDate = {};
      const allCobElements = document.querySelectorAll('[id^="cob_"]');
      for (const cobEl of allCobElements) {
        const cobId = cobEl.id;
        const rawCobText = (cobEl.textContent || cobEl.innerText || '').replace(/\s+/g, ' ').trim();
        const imgBtn = document.getElementById('img_' + cobId);
        let foundDate = '';
        if (imgBtn) {
          const parentRow = imgBtn.closest ? imgBtn.closest('tr') : imgBtn.parentElement;
          if (parentRow) {
            const dm = (parentRow.textContent || '').match(/(\d{2}[A-Z]{3})/);
            if (dm) foundDate = dm[1];
          }
        }
        if (foundDate && rawCobText) {
          crewMapByDate[foundDate] = (crewMapByDate[foundDate] || '') + ' | ' + rawCobText;
        }
      }

      return {
        fullText: document.body ? document.body.innerText : '',
        crewMapByDate
      };
    });

    const currentRoster = parseRosterText(extracted.fullText, extracted.crewMapByDate);

    if (fs.existsSync(SNAPSHOT_FILE)) {
      const prevRoster = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));

      for (const dateCode of Object.keys(currentRoster)) {
        const curr = currentRoster[dateCode];
        const prev = prevRoster[dateCode];
        const novedades = [];

        if (!prev) {
          novedades.push(`🆕 Nueva actividad asignada: ${curr.vuelos.join(', ')}`);
        } else {
          if (prev.vuelos.join(',') !== curr.vuelos.join(',')) {
            novedades.push(`🔄 Cambio de actividad: ${prev.vuelos.join(', ')} → ${curr.vuelos.join(', ')}`);
          } else if (prev.etdPrimerVuelo !== curr.etdPrimerVuelo && prev.etdPrimerVuelo !== '-' && curr.etdPrimerVuelo !== '-') {
            novedades.push(`⚠️ Horario de salida (ETD) modificado: ${prev.etdPrimerVuelo} → ${curr.etdPrimerVuelo}`);
          }

          if (prev.flota && curr.flota && prev.flota !== curr.flota) {
            novedades.push(`✈️ Cambio de avión: ${prev.flota} → ${curr.flota}`);
          }

          if (prev.tripulacion && prev.tripulacion.length > 0 && curr.tripulacion && curr.tripulacion.length > 0) {
            const salieron = prev.tripulacion.filter(x => !curr.tripulacion.includes(x));
            const entraron = curr.tripulacion.filter(x => !prev.tripulacion.includes(x));
            salieron.forEach(s => novedades.push(`❌ Salió: ${s}`));
            entraron.forEach(e => novedades.push(`✅ Entró: ${e}`));
          }
        }

        if (novedades.length > 0) {
          await sendExpoPush(`✈️ Cambio en Aeroweb (${dateCode})`, novedades.join('\n'));
        }
      }
    }

    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(currentRoster, null, 2));
  } finally {
    await browser.close();
  }
})();