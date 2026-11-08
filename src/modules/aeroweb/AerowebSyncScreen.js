import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../theme/colors';
import { getEncryptedData } from '../../services/storage';

const DIRECT_CWP_ROSTER_URL = 'https://portalar.aerolineas.com.ar/CWP_WA/CWPLogin.aspx?ReturnUrl=/cwp_wa/CWP_RosterTW.aspx';
const DIRECT_CWP_REPORTS_URL = 'https://aeroweb.aerolineas.com.ar/es-ar/aplicacionesintegradas/open/crew_prod?KeyEncrypted=jo2cutip6vplspd3l7wzjsc7kypumsfmvlg5qh5n2sooxipwgr6temtkxvradobzbpc3slb5d56ea3km6wfw5kw4naqtdk55idy6jki';

const MONTHS_EN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function extractTimeOnly(str) {
  if (!str) return '-';
  const m = String(str).match(/(\d{2}:\d{2})/);
  return m ? m[1] : '-';
}

function extractDateCode(str, rmDateDay = '') {
  const dayFromRm = String(rmDateDay).match(/^(\d{2})/);
  const usSlash = String(str).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usSlash) {
    const p1 = parseInt(usSlash[1], 10);
    const p2 = parseInt(usSlash[2], 10);
    if (dayFromRm) {
      const rmDayNum = parseInt(dayFromRm[1], 10);
      const monthIdx = (rmDayNum === p2 ? p1 : p2) - 1;
      return `${dayFromRm[1]}${MONTHS_EN[monthIdx] || 'OCT'}`;
    }
    const monthIdx = (p1 <= 12 ? p1 : p2) - 1;
    const dayNum = p1 <= 12 ? p2 : p1;
    return `${String(dayNum).padStart(2, '0')}${MONTHS_EN[monthIdx] || 'OCT'}`;
  }
  const m = String(str).match(/(\d{1,2})\s*([A-Z]{3})/i);
  if (m) return `${m[1].padStart(2, '0')}${m[2].toUpperCase()}`;
  const iso = String(str).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const mIdx = parseInt(iso[2], 10) - 1;
    return `${iso[3]}${MONTHS_EN[mIdx] || 'OCT'}`;
  }
  return '';
}

export function normalizeCrewKey(nameStr) {
  if (!nameStr) return '';
  return String(nameStr)
    .replace(/\b\d+\b/g, ' ')
    .replace(/[^A-ZÁÉÍÓÚÑa-záéíóúñ\s]/g, ' ')
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1 && !['CP','FO','CM','AX','TC','JP','OP','DH'].includes(w))
    .sort()
    .join(' ');
}

export function sanitizeCrewName(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/,\s*\d{3,6}\b/g, '')
    .replace(/\b\d{4,6}\b/g, '')
    .split(/\||\[|\b(?:MON|TUE|WED|THU|FRI|SAT|SUN|LUN|MAR|MIE|MIÉ|JUE|VIE|SAB|SÁB|DOM)\b|\b\d{1,2}[A-Z]{3}\b|\d{2}:\d{2}|\bSB[A-Z0-9]*\b|\bAR\s*\d{3,4}|\bBUE\b|\bAEP\b|\bEZE\b|\bTripulaci|\bMensajes|\bEstado|\bCheckin|\bActividad/i)[0]
    .trim()
    .replace(/^[,.\s-]+|[,.\s-]+$/g, '')
    .replace(/\s+/g, ' ');
}

function formatCrewMember(rolRaw, nombreRaw, dutyRaw = 'OP', photoUrl = null) {
  let rol = (rolRaw || '').toUpperCase().trim();
  if (rol === 'JP') rol = 'CM';
  const nombre = sanitizeCrewName(nombreRaw);

  return {
    rol,
    duty: (dutyRaw || 'OP').toUpperCase().trim(),
    nombre,
    photoUrl: photoUrl || null,
    label: rol === 'CP' ? 'Comandante' : (rol === 'FO' ? 'Primer Oficial' : (rol === 'CM' ? 'Comisario' : 'Tripulante')),
    rangType: rol === 'CP' ? '4_gold' : (rol === 'FO' ? '3_gold' : (rol === 'CM' ? '2_silver' : 'dots'))
  };
}

export function parseCrewFromRawText(rawText, userProfile, photoMap = {}) {
  const crew = [];

  if (rawText) {
    const lines = String(rawText).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const lineMatch = line.match(/^(CP|FO|CM|TC|AX|JP)(?:\s+(OP|DH))?\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ,\s.-]{3,40}?)(?:,\s*(\d{3,6}))?$/i);
      if (lineMatch) {
        const rol = lineMatch[1].toUpperCase();
        const duty = (lineMatch[2] || 'OP').toUpperCase();
        const rawName = lineMatch[3].trim();
        const normKey = normalizeCrewKey(rawName);
        const directKey = sanitizeCrewName(rawName).replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
        const matchedPhoto = photoMap[normKey] || photoMap[directKey] || null;
        const member = formatCrewMember(rol, rawName, duty, matchedPhoto);
        if (member.nombre.length > 2 && !crew.some(c => normalizeCrewKey(c.nombre) === normKey && c.rol === member.rol)) {
          crew.push(member);
        }
      }
    }

    const clean = String(rawText)
      .replace(/Tripulaci[oó]n del vuelo\s*[-:]?\s*(?:AR\s*)?\d+[A-Z]?/gi, ' | ')
      .replace(/AR\s*\d{3,4}\s+[A-Z]{3}-[A-Z]{3}\s+\d{6}/gi, ' | ')
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
      const rawName = clean.slice(current.nameStartIndex, nextStart);
      const normKey = normalizeCrewKey(rawName);
      const directKey = sanitizeCrewName(rawName).replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
      const matchedPhoto = photoMap[normKey] || photoMap[directKey] || null;
      const member = formatCrewMember(current.rol, rawName, current.duty, matchedPhoto);

      if (
        member.nombre.length > 2 &&
        !/^(DEL|VUELO|CAT|DUTY|TRIPULANTE|MOSTRAR|SUFIJO)$/i.test(member.nombre) &&
        !crew.some(c => normalizeCrewKey(c.nombre) === normKey && c.rol === member.rol)
      ) {
        crew.push(member);
      }
    }
  }

  const ordenJerarquia = { CP: 1, FO: 2, CM: 3, TC: 4, AX: 5 };
  crew.sort((a, b) => (ordenJerarquia[a.rol] || 99) - (ordenJerarquia[b.rol] || 99));

  return crew;
}

function extractMatricula(textSlice) {
  if (!textSlice) return null;
  const directMatch = String(textSlice).match(/\b(LV-[A-Z]{3}|LV[A-Z]{3}|LQ-[A-Z]{3})\b/i);
  if (directMatch) {
    const raw = directMatch[1].toUpperCase();
    return raw.includes('-') ? raw : `${raw.slice(0, 2)}-${raw.slice(2)}`;
  }
  const labeledMatch = String(textSlice).match(/(?:Matr[ií]cula|Avión|Reg|Tail|A\/C)\s*[:=-]?\s*([A-Z]{3})\b/i);
  if (labeledMatch) return `LV-${labeledMatch[1].toUpperCase()}`;
  return null;
}

export function parseAerowebCWPXml(xmlString, userProfile) {
  if (!xmlString || !xmlString.includes('<CWPReportRoster')) return [];
  const records = [];
  const blockRegex = /<CWPReportRoster\b[^>]*>([\s\S]*?)<\/CWPReportRoster>/gi;
  let blockMatch;

  const getTag = (block, tagName) => {
    const r = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const m = block.match(r);
    return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
  };

  let lastDateCode = '';
  let lastCheckin = '-';

  while ((blockMatch = blockRegex.exec(xmlString)) !== null) {
    const block = blockMatch[1];
    const rmDateDay = getTag(block, 'RMDateDay');
    const activityDate = getTag(block, 'ActivityDate');
    const category = getTag(block, 'Category');
    const checkInTime = getTag(block, 'CheckInTime');
    const checkoutTime = getTag(block, 'CheckoutTime');
    const atd = getTag(block, 'ATD');
    const ata = getTag(block, 'ATA');
    const actype = getTag(block, 'Actype');
    const flightNo = getTag(block, 'FlightNo');
    const origin = getTag(block, 'Origin');
    const destination = getTag(block, 'Destination');
    const dutyDesign = getTag(block, 'DutyDesign');
    const activityInfo = getTag(block, 'ActivityInfo');
    const activityDesc = getTag(block, 'ActivityDesc');
    const pickup = getTag(block, 'Pickup');
    const department = getTag(block, 'Department');
    const endPeriod = getTag(block, 'EndPeriod');
    const value1 = getTag(block, 'Value1');
    const value2 = getTag(block, 'Value2');
    const value3 = getTag(block, 'Value3');

    const dateCode = extractDateCode(activityDate, rmDateDay) || lastDateCode;
    if (!dateCode) continue;
    if (dateCode !== lastDateCode) {
      lastDateCode = dateCode;
      lastCheckin = '-';
    }

    const chk = extractTimeOnly(checkInTime);
    if (chk !== '-') lastCheckin = chk;

    let rawAct = (activityInfo || flightNo || activityDesc || '').replace(/\s+/g, '').toUpperCase();
    if (/^\d{3,4}[A-Z]?$/.test(rawAct)) rawAct = `AR${rawAct}`;
    if (!rawAct || rawAct === 'HTL') continue;

    const isFlight = rawAct.startsWith('AR') || rawAct === 'DHD';
    const combinedNotes = [activityInfo, activityDesc, value1, value2, value3].filter(Boolean).join(' | ');
    const matricula = extractMatricula(combinedNotes);

    records.push({
      fechaAsignada: dateCode,
      fechaFinAsignada: extractDateCode(endPeriod, rmDateDay) || dateCode,
      checkin: chk !== '-' ? chk : lastCheckin,
      pickupTime: extractTimeOnly(pickup) !== '-' ? extractTimeOnly(pickup) : (pickup || null),
      actividad: rawAct === 'DHD' ? 'AR-DHD' : rawAct,
      comienzo: extractTimeOnly(atd),
      fin: extractTimeOnly(ata),
      atdReal: extractTimeOnly(atd),
      ataReal: extractTimeOnly(ata),
      checkout: extractTimeOnly(checkoutTime),
      desde: (origin || 'BUE').toUpperCase(),
      hacia: (destination || 'BUE').toUpperCase(),
      tipoAvion: (actype || (rawAct === 'DHD' ? 'DHD' : 'B738')).toUpperCase(),
      dutyDesign: dutyDesign || 'OP',
      matricula: matricula || null,
      activityDesc: activityDesc || null,
      activityInfo: activityInfo || null,
      department: department || category || null,
      tripulacion: isFlight ? parseCrewFromRawText(combinedNotes, userProfile) : []
    });
  }

  return records;
}

export function extractRosterForApp(fullText, crewMapByDate, cobList, userProfile) {
  if (!fullText) return [];
  if (fullText.includes('<CWPReportRoster') || fullText.includes('<NewDataSet')) {
    return parseAerowebCWPXml(fullText, userProfile);
  }

  const cleanText = fullText.replace(/\s+/g, ' ');
  const pattern = /(?:([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})\s+)?(AR\s*\d+[A-Z]?|RPT|D\/L|VAC|SB[A-Z0-9]*|\*|OF|MED|LIC|S\/G|SIM|GUA|ELD|CUR|INS)\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})\s+([A-Z]{3})\s+([A-Z]{3})\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})(?:\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2}))?(?:\s+(73[A-Z0-9]+|33[A-Z0-9]+|E190|B73[A-Z0-9]+|B38M|FO|CP))?(?:\s+(LV-?[A-Z]{3}))?/gi;

  const matches = [];
  let match;
  while ((match = pattern.exec(cleanText)) !== null) {
    matches.push({ index: match.index, lastIndex: pattern.lastIndex, groups: match });
  }

  let parsed = [];
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

    const comTime = extractTimeOnly(comStr);
    const finTime = extractTimeOnly(finStr);
    const outTime = extractTimeOnly(outStr);

    let cobTextForFlight = '';
    if (isFlight) {
      const exactDateFlightKey = `${startDateCode}_${flightNumOnly}`;
      if (crewMapByDate && crewMapByDate[exactDateFlightKey]) {
        cobTextForFlight = crewMapByDate[exactDateFlightKey];
      } else if (crewMapByDate && crewMapByDate[startDateCode]) {
        cobTextForFlight = crewMapByDate[startDateCode];
      } else {
        const flightRegex = new RegExp(`\\b(?:AR\\s*)?${flightNumOnly}\\b`, 'i');
        const matchingCob = (cobList || []).find(c => c.text && flightRegex.test(c.text));
        if (matchingCob) cobTextForFlight = matchingCob.text;
        else if (cobList && cobList[flightCounter]) cobTextForFlight = cobList[flightCounter].text;
      }
      flightCounter++;
    }

    const crewSource = [cobTextForFlight, betweenText].filter(Boolean).join(' | ');
    const matricula =
      (inlineMat ? (inlineMat.includes('-') ? inlineMat : `LV-${inlineMat.slice(2)}`) : null) ||
      extractMatricula(crewSource) ||
      extractMatricula(cleanText.slice(Math.max(0, matches[i].index - 40), matches[i].lastIndex + 100));

    parsed.push({
      fechaAsignada: startDateCode,
      fechaFinAsignada: endDateCode,
      checkin: chkTime !== '-' ? chkTime : lastCheckinTime,
      actividad: act,
      comienzo: comTime,
      desde: desStr,
      hacia: hacStr,
      fin: finTime,
      atdReal: comTime,
      ataReal: finTime,
      checkout: outTime,
      tipoAvion: eqStr,
      matricula: matricula || null,
      tripulacion: isFlight ? parseCrewFromRawText(crewSource, userProfile) : []
    });
  }

  return parsed;
}

export default function AerowebSyncScreen({ onClose, onDataParsed, silentMode = false, fullYearSync = false }) {
  const [credentials, setCredentials] = useState(null);
  const [currentUrl, setCurrentUrl] = useState(DIRECT_CWP_ROSTER_URL);
  const [showInteractiveWebView, setShowInteractiveWebView] = useState(false);
  const [syncErrorMsg, setSyncErrorMsg] = useState(null);
  const [progressLabel, setProgressLabel] = useState('Sincronizando programación desde AeroWeb...');
  const webViewRef = useRef(null);

  useEffect(() => {
    async function fetchCredentials() {
      try {
        let profile = await getEncryptedData('user_profile');
        if (!profile) {
          const raw = await AsyncStorage.getItem('user_profile');
          if (raw) profile = JSON.parse(raw);
        }
        if (profile && profile.aerowebUser) {
          setCredentials(profile);
          setCurrentUrl(fullYearSync ? DIRECT_CWP_REPORTS_URL : DIRECT_CWP_ROSTER_URL);
        } else {
          if (onClose) onClose();
        }
      } catch (err) {
        if (onClose) onClose();
      }
    }
    fetchCredentials();
  }, [fullYearSync]);

  // Se inyecta en TODOS los frames (incluyendo el iframe cross-origin de portalar donde vive la tabla de Reportes)
  const injectedCode = `
    (function() {
      window.open = function(url) {
        if (url && typeof url === 'string' && url.trim().length > 1 && url !== 'about:blank') {
          window.location.href = url;
        }
        return window;
      };

      function triggerClick(el) {
        if (!el) return;
        el.removeAttribute && el.removeAttribute('target');
        var href = el.getAttribute ? (el.getAttribute('href') || '') : '';
        if (href && href.toLowerCase().startsWith('javascript:')) {
          try { window.eval(href.slice(11)); return; } catch(e) {}
        }
        try { el.click(); } catch(e) {}
        try {
          var ev = document.createEvent('MouseEvents');
          ev.initEvent('click', true, true);
          el.dispatchEvent(ev);
        } catch(e) {}
      }

      function fillNativeInput(input, val) {
        if (!input || !val || input.value === val) return;
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, val); else input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      function selectStrictlyAerolineas() {
        var selects = Array.from(document.querySelectorAll('select'));
        for (var i = 0; i < selects.length; i++) {
          var s = selects[i];
          var opts = Array.from(s.options || []);
          var cur = (opts[s.selectedIndex]?.text || '').toUpperCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
          if (cur.includes('AEROLINEAS ARGENTINAS')) return false;
          for (var j = 0; j < opts.length; j++) {
            var txt = (opts[j].text || '').toUpperCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").trim();
            if (txt.includes('AEROLINEAS ARGENTINAS') && !txt.includes('JUBILADO')) {
              s.selectedIndex = j;
              opts[j].selected = true;
              s.dispatchEvent(new Event('input', { bubbles: true }));
              s.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
        }
        return false;
      }

      function findAllVerButtons(root) {
        return Array.from((root || document).querySelectorAll('input[type="submit"], input[type="button"], input[type="image"], button, a')).filter(function(el) {
          var v = (el.value || el.innerText || el.textContent || el.alt || '').replace(/\\s+/g, ' ').trim().toLowerCase();
          return v === 'ver' || v.includes('ver');
        });
      }

      function extractPageAndCobs() {
        var links = document.querySelectorAll('a[href*="openStructure"]');
        for (var i = 0; i < links.length; i++) {
          var href = links[i].getAttribute('href') || '';
          var m = href.match(/openStructure\\(['"]([^'"]+)['"]\\)/);
          if (m && m[1] && typeof window.openStructure === 'function') {
            try { window.openStructure(m[1]); } catch(err) {}
          }
        }

        var crewMapByDate = {};
        var cobList = [];
        var allCobElements = document.querySelectorAll('[id^="cob_"]');

        for (var j = 0; j < allCobElements.length; j++) {
          var cobEl = allCobElements[j];
          var cobId = cobEl.id;
          var rawCobText = (cobEl.textContent || cobEl.innerText || '').replace(/\\s+/g, ' ').trim();

          var foundDate = '';
          var foundFlightNum = '';
          var flMatch = rawCobText.match(/vuelo\\s*[-:]?\\s*(?:AR\\s*)?(\\d{3,4})/i);
          if (flMatch) foundFlightNum = flMatch[1];

          var imgBtn = document.getElementById('img_' + cobId);
          var rowEl = imgBtn ? (imgBtn.closest ? imgBtn.closest('tr') : imgBtn.parentElement) : (cobEl.closest ? cobEl.closest('tr') : null);
          var scanRow = rowEl;
          var steps = 0;
          while (scanRow && steps < 6) {
            var rText = scanRow.textContent || '';
            var dm = rText.match(/(\\d{2}[A-Z]{3})/i);
            if (dm && !foundDate) foundDate = dm[1].toUpperCase();
            var fm = rText.match(/\\bAR\\s*(\\d{3,4})\\b/i);
            if (fm && !foundFlightNum) foundFlightNum = fm[1];
            if (foundDate && foundFlightNum) break;
            scanRow = scanRow.previousElementSibling;
            steps++;
          }

          if (foundDate && foundFlightNum && rawCobText) {
            crewMapByDate[foundDate + '_' + foundFlightNum] = rawCobText;
          }
          if (foundDate && rawCobText) {
            crewMapByDate[foundDate] = (crewMapByDate[foundDate] || '') + ' | ' + rawCobText;
          }
          if (rawCobText) {
            cobList.push({ id: cobId, date: foundDate, flightNum: foundFlightNum, text: rawCobText });
          }
        }

        return {
          text: document.body ? document.body.innerText : '',
          crewMap: crewMapByDate,
          cobList: cobList
        };
      }

      function runFrameAutomation() {
        try {
          if (window._waitingNavigation) return;

          var url = window.location.href.toLowerCase();
          var bodyTxt = document.body ? (document.body.innerText || '') : '';

          // Si estamos en el frame padre de Aeroweb y hay un iframe de portalar/CWP, dejar que el script corra adentro del iframe
          var childIframes = document.querySelectorAll('iframe');
          if (childIframes.length > 0 && !bodyTxt.includes('Actividad realizada') && !bodyTxt.includes('Checkin')) {
            for (var f = 0; f < childIframes.length; f++) {
              var fSrc = childIframes[f].getAttribute('src') || '';
              if (fSrc && (fSrc.toLowerCase().includes('portalar') || fSrc.toLowerCase().includes('cwp'))) {
                return;
              }
            }
          }

          // 1. Auto-Login en CWP o Aeroweb
          var passInputs = Array.from(document.querySelectorAll('input[type="password"]')).filter(function(el) {
            return el.offsetParent !== null;
          });
          if (passInputs.length > 0) {
            if (selectStrictlyAerolineas()) return;
            var pass = passInputs[0];
            var form = pass.closest('form') || document.body;
            var user = Array.from(form.querySelectorAll('input')).find(function(el) {
              var t = (el.getAttribute('type') || '').toLowerCase();
              return el.offsetParent !== null && t !== 'password' && t !== 'hidden' && t !== 'submit' && t !== 'button';
            });
            var isAerowebMain = bodyTxt.includes('INICIAR SESIÓN') || bodyTxt.includes('REGISTRATE');
            var passVal = isAerowebMain
              ? "${credentials?.aerowebPass || credentials?.dni || ''}"
              : "${credentials?.dni || credentials?.aerowebPass || ''}";
            fillNativeInput(user, "${credentials?.aerowebUser || ''}");
            fillNativeInput(pass, passVal);

            if (!window._loginSubmitted && user?.value && pass?.value) {
              window._loginSubmitted = true;
              setTimeout(function() {
                selectStrictlyAerolineas();
                var btn = form.querySelector('input[type="submit"], button[type="submit"], .btn-warning, button:not([type="button"])');
                if (btn) triggerClick(btn); else if (typeof form.submit === 'function') form.submit();
              }, 450);
            }
            return;
          }

          // 2. Detectar desplegables de Reportes ("01NOV26 --- 30NOV26" o cualquier período con año 26)
          var allSelects = Array.from(document.querySelectorAll('select'));
          var periodSelects = allSelects.filter(function(s) {
            var opts = Array.from(s.options || []);
            return opts.some(function(o) { return /\\d{2}[A-Z]{3}26/i.test(o.text || ''); });
          });

          // Si estamos viendo la tabla corta del Reporte Anual ("TSV 840:49 | TV 350:38")
          if (periodSelects.length === 0 && (bodyTxt.includes('Reportes Reporte de actividad') || (bodyTxt.includes('Contador de:') && bodyTxt.includes('TSV') && !bodyTxt.includes('Checkin')))) {
            sessionStorage.removeItem('waiting_report_type');
            sessionStorage.setItem('annual_rep_done_v20', '1');
            window.ReactNativeWebView.postMessage(JSON.stringify({ status: 'annual_summary_text', text: bodyTxt }));
            window._waitingNavigation = true;
            var backLinkA = Array.from(document.querySelectorAll('a')).find(function(a) { return (a.innerText || '').toLowerCase().includes('volver'); });
            if (backLinkA) triggerClick(backLinkA); else window.history.back();
            setTimeout(function() { window._waitingNavigation = false; }, 1200);
            return;
          }

          var waitingRepType = sessionStorage.getItem('waiting_report_type');

          if (periodSelects.length > 0 && !waitingRepType) {
            var actRealizadaSelect = periodSelects[0];
            var opts2026 = [];
            var allOpts = Array.from(actRealizadaSelect.options || []);
            for (var k = 0; k < allOpts.length; k++) {
              if (/26/i.test(allOpts[k].text || '')) {
                opts2026.push({ index: k, label: allOpts[k].text.replace(/\\s+/g, ' ').trim() });
              }
            }

            var currentPeriodPointer = parseInt(sessionStorage.getItem('rep_period_ptr_v20') || '0', 10);
            if (currentPeriodPointer >= opts2026.length) {
              // Al terminar los meses, leer el 4to renglón (Reporte Anual TV/TSV) si aún no se leyó
              var annualReportDone = sessionStorage.getItem('annual_rep_done_v20');
              var allVerBtnsEnd = findAllVerButtons(document);
              if (!annualReportDone && allVerBtnsEnd.length >= 4) {
                sessionStorage.setItem('annual_rep_done_v20', '1');
                sessionStorage.setItem('waiting_report_type', 'anual');
                window._waitingNavigation = true;
                window.ReactNativeWebView.postMessage(JSON.stringify({ status: 'progress', label: 'Leyendo totales anuales 2026 (TV y TSV)...' }));
                triggerClick(allVerBtnsEnd[3]);
                setTimeout(function() { window._waitingNavigation = false; }, 1500);
                return;
              }
              window.ReactNativeWebView.postMessage(JSON.stringify({ status: 'all_done' }));
              return;
            }

            var targetOpt = opts2026[currentPeriodPointer];
            window.ReactNativeWebView.postMessage(JSON.stringify({
              status: 'progress',
              label: 'Descargando ' + targetOpt.label + ' (' + (currentPeriodPointer + 1) + '/' + opts2026.length + ')'
            }));

            var selSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
            if (selSetter && actRealizadaSelect.options[targetOpt.index]) {
              selSetter.call(actRealizadaSelect, actRealizadaSelect.options[targetOpt.index].value);
            }
            actRealizadaSelect.selectedIndex = targetOpt.index;
            if (actRealizadaSelect.options[targetOpt.index]) actRealizadaSelect.options[targetOpt.index].selected = true;
            actRealizadaSelect.dispatchEvent(new Event('input', { bubbles: true }));
            actRealizadaSelect.dispatchEvent(new Event('change', { bubbles: true }));

            var parentRow = actRealizadaSelect.closest ? actRealizadaSelect.closest('tr') : actRealizadaSelect.parentElement;
            var verBtn = null;
            if (parentRow) {
              var rowCbs = parentRow.querySelectorAll('input[type="checkbox"]');
              rowCbs.forEach(function(cb) { if (!cb.checked) { cb.checked = true; triggerClick(cb); } });
              var rowVers = findAllVerButtons(parentRow);
              if (rowVers.length > 0) verBtn = rowVers[0];
            }
            if (!verBtn) {
              var pageVers = findAllVerButtons(document);
              verBtn = pageVers[0];
            }

            sessionStorage.setItem('waiting_report_type', 'realizada');
            window._waitingNavigation = true;
            if (verBtn) triggerClick(verBtn);
            setTimeout(function() { window._waitingNavigation = false; }, 1500);
            return;
          }

          if (waitingRepType === 'realizada') {
            if (periodSelects.length === 0 && (bodyTxt.includes('Actividad') || bodyTxt.includes('Checkin') || /\\d{2}[A-Z]{3}\\s+\\d{2}:\\d{2}/.test(bodyTxt))) {
              sessionStorage.removeItem('waiting_report_type');
              var extracted = extractPageAndCobs();
              var ptr = parseInt(sessionStorage.getItem('rep_period_ptr_v20') || '0', 10);

              window.ReactNativeWebView.postMessage(JSON.stringify({
                status: 'month_data',
                reportType: 'realizada',
                text: extracted.text,
                crewMap: extracted.crewMap,
                cobList: extracted.cobList,
                isLastStep: false
              }));

              sessionStorage.setItem('rep_period_ptr_v20', String(ptr + 1));
              window._waitingNavigation = true;
              var backLink = Array.from(document.querySelectorAll('a')).find(function(a) { return (a.innerText || '').toLowerCase().includes('volver'); });
              if (backLink) triggerClick(backLink); else window.history.back();
              setTimeout(function() { window._waitingNavigation = false; }, 1200);
              return;
            }
          }

          // 3. Roster del mes en curso (CWP_RosterTW.aspx)
          if (url.includes('rostertw') && !waitingRepType) {
            var rosterShown = sessionStorage.getItem('cwp_roster_detalles_shown');
            if (!rosterShown) {
              var allSels = Array.from(document.querySelectorAll('select'));
              for (var sIdx = 0; sIdx < allSels.length; sIdx++) {
                var s = allSels[sIdx];
                var opts = Array.from(s.options || []);
                if (opts.length >= 28 && opts.length <= 32) {
                  for (var oIdx = 0; oIdx < opts.length; oIdx++) {
                    if (opts[oIdx].value === '1' || opts[oIdx].value === '01' || opts[oIdx].text.trim() === '01' || opts[oIdx].text.trim() === '1') {
                      s.selectedIndex = oIdx;
                      s.dispatchEvent(new Event('change', { bubbles: true }));
                      break;
                    }
                  }
                  break;
                }
              }

              var radios = Array.from(document.querySelectorAll('input[type="radio"]'));
              var conDetalles = radios.find(function(r) { return r.parentElement && r.parentElement.innerText.toLowerCase().includes('con detalle'); });
              if (conDetalles && !conDetalles.checked) { conDetalles.checked = true; triggerClick(conDetalles); }
              var checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
              checkboxes.forEach(function(cb) { if (!cb.checked) { cb.checked = true; triggerClick(cb); } });

              var btnMostrar = document.querySelector('input[value="Mostrar"], input[value="Ver"], input[type="submit"]');
              if (btnMostrar) {
                sessionStorage.setItem('cwp_roster_detalles_shown', '1');
                window._waitingNavigation = true;
                triggerClick(btnMostrar);
                setTimeout(function() { window._waitingNavigation = false; }, 1500);
                return;
              }
            }

            if (bodyTxt.includes('Checkin') && bodyTxt.includes('Actividad') && !window._sentRosterCur) {
              window._sentRosterCur = true;
              var dataCur = extractPageAndCobs();
              window.ReactNativeWebView.postMessage(JSON.stringify({
                status: 'month_data',
                reportType: 'realizada',
                text: dataCur.text,
                crewMap: dataCur.crewMap,
                cobList: dataCur.cobList,
                isLastStep: true
              }));
            }
          }
        } catch(e) {}
      }

      if (window._syncInterval) clearInterval(window._syncInterval);
      window._syncInterval = setInterval(runFrameAutomation, 700);
    })();
    true;
  `;

  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.status === 'progress') {
        if (data.label) setProgressLabel(data.label);
        return;
      }

      if (data.status === 'annual_summary_text' && data.text) {
        if (onDataParsed) await onDataParsed({ type: 'annual_summary', rawText: data.text });
        return;
      }

      if (data.status === 'all_done') {
        await AsyncStorage.setItem('synced_full_year_2026_v20', 'true');
        if (onClose) onClose();
        return;
      }

      if (data.status === 'month_data') {
        let userProfile = await getEncryptedData('user_profile');
        if (!userProfile) {
          const raw = await AsyncStorage.getItem('user_profile');
          if (raw) userProfile = JSON.parse(raw);
        }
        const rawList = extractRosterForApp(data.text, data.crewMap, data.cobList, userProfile);

        if (rawList.length > 0 && onDataParsed) {
          await onDataParsed({
            type: data.reportType || 'realizada',
            raw: rawList,
            isHistoricalBatch: !data.isLastStep
          });
        }

        if (data.isLastStep && onClose) onClose();
      }
    } catch (e) {
      setSyncErrorMsg('Error al procesar el reporte. Podés tocar Reintentar.');
    }
  };

  if (silentMode) {
    return credentials ? (
      <View style={styles.hiddenWebView}>
        <WebView
          ref={webViewRef}
          source={{ uri: DIRECT_CWP_ROSTER_URL }}
          injectedJavaScript={injectedCode}
          injectedJavaScriptBeforeContentLoaded={injectedCode}
          injectedJavaScriptForMainFrameOnly={false}
          onMessage={handleMessage}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          domStorageEnabled={true}
        />
      </View>
    ) : null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ACTUALIZANDO</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => setShowInteractiveWebView(!showInteractiveWebView)}
            style={styles.toggleWebBtn}
          >
            <Text style={styles.toggleWebBtnText}>
              {showInteractiveWebView ? 'Ocultar Web' : 'Ver Web'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!showInteractiveWebView && (
        <View style={styles.cardContainer}>
          <View style={styles.iconCircle}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
          <Text style={styles.syncTitle}>ACTUALIZANDO</Text>
          <Text style={styles.syncSubTitle}>{syncErrorMsg || progressLabel}</Text>
          {syncErrorMsg && (
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => {
                setSyncErrorMsg(null);
                webViewRef.current?.reload();
              }}
            >
              <Text style={styles.retryBtnText}>↻ Reintentar Sincronización</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {credentials && (
        <View style={showInteractiveWebView ? styles.flexOne : styles.hiddenWebView}>
          <WebView
            ref={webViewRef}
            source={{ uri: currentUrl }}
            injectedJavaScript={injectedCode}
            injectedJavaScriptBeforeContentLoaded={injectedCode}
            injectedJavaScriptForMainFrameOnly={false}
            onMessage={handleMessage}
            onError={() => setSyncErrorMsg('Error de conexión con AeroWeb. Tocá Reintentar.')}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            setSupportMultipleWindows={false}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  flexOne: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, backgroundColor: COLORS.cardBg },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  toggleWebBtn: { backgroundColor: '#E0F2FE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  toggleWebBtnText: { fontSize: 12, fontWeight: 'bold', color: COLORS.primary },
  closeBtn: { backgroundColor: '#f1f5f9', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark },
  cardContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.cardBg, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: COLORS.borderLight },
  syncTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.textDark, textAlign: 'center', marginTop: 10 },
  syncSubTitle: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 8 },
  retryBtn: { marginTop: 18, backgroundColor: COLORS.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  retryBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  hiddenWebView: { width: 0, height: 0, opacity: 0, overflow: 'hidden' }
});