import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../theme/colors';
import { getEncryptedData } from '../../services/storage';

const DIRECT_LOGIN_URL = 'https://portalar.aerolineas.com.ar/CWP_WA/CWPLogin.aspx?ReturnUrl=/cwp_wa/CWP_RosterTW.aspx';
const AEROWEB_MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function extractTimeOnly(str) {
  if (!str) return '-';
  const m = str.match(/(\d{2}:\d{2})/);
  return m ? m[1] : '-';
}

function extractDateCode(str) {
  if (!str) return '';
  const m = str.match(/(\d{1,2})\s*([A-Z]{3})/i);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}${m[2].toUpperCase()}`;
}

export function sanitizeCrewName(raw) {
  if (!raw) return '';
  return raw
    .split(/\||\[|\b(?:MON|TUE|WED|THU|FRI|SAT|SUN|LUN|MAR|MIE|MIÉ|JUE|VIE|SAB|SÁB|DOM)\b|\b\d{1,2}[A-Z]{3}\b|\d{2}:\d{2}|\bSB[A-Z0-9]*\b|\bAR\s*\d{3,4}|\bBUE\b|\bAEP\b|\bEZE\b|\bTripulaci|\bMensajes|\bEstado|\bCheckin|\bActividad/i)[0]
    .trim()
    .replace(/^[,.\s-]+|[,.\s-]+$/g, '')
    .replace(/\s+/g, ' ');
}

function formatCrewMember(rolRaw, nombreRaw, dutyRaw = 'OP') {
  let rol = (rolRaw || '').toUpperCase().trim();
  if (rol === 'JP') rol = 'CM';
  const nombre = sanitizeCrewName(nombreRaw);

  return {
    rol,
    duty: (dutyRaw || 'OP').toUpperCase().trim(),
    nombre,
    label: rol === 'CP' ? 'Comandante' : (rol === 'FO' ? 'Primer Oficial' : (rol === 'CM' ? 'Comisario' : 'Tripulante')),
    rangType: rol === 'CP' ? '4_gold' : (rol === 'FO' ? '3_gold' : (rol === 'CM' ? '2_silver' : 'dots'))
  };
}

function parseCrewFromRawText(rawText, userProfile) {
  const crew = [];

  if (rawText) {
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
        rol: m[1].toUpperCase(),
        duty: m[2].toUpperCase(),
        startIndex: m.index,
        nameStartIndex: markerRegex.lastIndex
      });
    }

    for (let i = 0; i < markers.length; i++) {
      const current = markers[i];
      const nextStart = i + 1 < markers.length ? markers[i + 1].startIndex : clean.length;
      const rawName = clean.slice(current.nameStartIndex, nextStart);

      const member = formatCrewMember(current.rol, rawName, current.duty);
      if (
        member.nombre.length > 2 &&
        !crew.some(c => c.nombre === member.nombre && c.rol === member.rol)
      ) {
        crew.push(member);
      }
    }
  }

  const profileName = userProfile?.nombre || userProfile?.fullName;
  if (crew.length === 0 && profileName) {
    const isCmd = userProfile.rank === 'Comandante';
    crew.push({
      rol: isCmd ? 'CP' : 'FO',
      duty: 'OP',
      nombre: profileName.toUpperCase(),
      label: isCmd ? 'Comandante' : 'Primer Oficial',
      rangType: isCmd ? '4_gold' : '3_gold'
    });
  }

  const ordenJerarquia = { CP: 1, FO: 2, CM: 3, TC: 4, AX: 5 };
  crew.sort((a, b) => (ordenJerarquia[a.rol] || 99) - (ordenJerarquia[b.rol] || 99));

  return crew;
}

function extractMatricula(textSlice) {
  if (!textSlice) return null;
  const m = textSlice.match(/\b(LV-[A-Z]{3}|LV[A-Z]{3})\b/i);
  if (!m) return null;
  const raw = m[1].toUpperCase();
  return raw.includes('-') ? raw : `LV-${raw.slice(2)}`;
}

function extractRosterForApp(fullText, crewMapByDate, cobList, userProfile) {
  if (!fullText) return [];
  const cleanText = fullText.replace(/\s+/g, ' ');

  const pattern = /(?:([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})\s+)?(AR\s*\d+[A-Z]?|RPT|D\/L|VAC|SB[A-Z0-9]*|\*|OF|MED|LIC|S\/G|SIM|GUA|ELD|CUR|INS)\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})\s+([A-Z]{3})\s+([A-Z]{3})\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})(?:\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2}))?(?:\s+(73[A-Z0-9]+|33[A-Z0-9]+|E190|B73[A-Z0-9]+|B38M|FO|CP))?/gi;

  const matches = [];
  let match;
  while ((match = pattern.exec(cleanText)) !== null) {
    matches.push({
      index: match.index,
      lastIndex: pattern.lastIndex,
      groups: match
    });
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

    const startDateCode = extractDateCode(comStr) || extractDateCode(rawChk) || lastDateCode;
    const endDateCode = extractDateCode(finStr) || extractDateCode(outStr) || startDateCode;

    if (startDateCode !== lastDateCode) {
      lastCheckinTime = '-';
      lastDateCode = startDateCode;
    }

    const isFlight = act.startsWith('AR');
    const flightNumOnly = act.replace(/^AR/i, '');

    const chkTime = extractTimeOnly(rawChk);
    if (chkTime !== '-') {
      lastCheckinTime = chkTime;
    }

    const comTime = extractTimeOnly(comStr);
    const finTime = extractTimeOnly(finStr);
    const outTime = extractTimeOnly(outStr);

    let cobTextForFlight = '';
    if (isFlight) {
      const flightRegex = new RegExp(`\\b(?:AR\\s*)?${flightNumOnly}\\b`, 'i');
      const matchingCobByDate = (cobList || []).find(c => c.date === startDateCode && c.text && flightRegex.test(c.text));
      const matchingCob = matchingCobByDate || (cobList || []).find(c => c.text && flightRegex.test(c.text));

      if (matchingCob) {
        cobTextForFlight = matchingCob.text;
      } else if (crewMapByDate && crewMapByDate[startDateCode]) {
        cobTextForFlight = crewMapByDate[startDateCode];
      } else if (cobList && cobList[flightCounter]) {
        cobTextForFlight = cobList[flightCounter].text;
      }
      flightCounter++;
    }

    const crewSource = [cobTextForFlight, betweenText].filter(Boolean).join(' | ');
    const matricula = extractMatricula(crewSource) || extractMatricula(cleanText.slice(Math.max(0, matches[i].index - 60), matches[i].lastIndex + 120));

    parsed.push({
      fechaAsignada: startDateCode,
      fechaFinAsignada: endDateCode,
      checkin: chkTime !== '-' ? chkTime : lastCheckinTime,
      actividad: act,
      comienzo: comTime,
      desde: desStr,
      hacia: hacStr,
      fin: finTime,
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
  const [needFullYear2026, setNeedFullYear2026] = useState(false);
  const [progressLabel, setProgressLabel] = useState('Sincronizando Plan de Vuelo y Tripulaciones...');
  const webViewRef = useRef(null);

  useEffect(() => {
    async function fetchCredentials() {
      try {
        let profile = await getEncryptedData('user_profile');
        if (!profile) {
          const raw = await AsyncStorage.getItem('user_profile');
          if (raw) profile = JSON.parse(raw);
        }
        const alreadySynced2026 = await AsyncStorage.getItem('synced_full_year_2026_v1');
        if (fullYearSync || !alreadySynced2026) {
          setNeedFullYear2026(true);
        }
        if (profile && profile.aerowebUser) {
          setCredentials(profile);
        } else {
          if (onClose) onClose();
        }
      } catch (err) {
        if (onClose) onClose();
      }
    }
    fetchCredentials();
  }, [fullYearSync]);

  const currentMonth1Based = new Date().getMonth() + 1;

  const injectedCode = `
    (function() {
      function runAutomation() {
        try {
          var url = window.location.href.toLowerCase();

          if (url.includes('cwplogin')) {
            sessionStorage.removeItem('roster_mostrado');
            var pass = document.querySelector('input[type="password"]');
            var inputs = document.querySelectorAll('input');
            var user = null;
            for (var i = 0; i < inputs.length; i++) {
              var type = (inputs[i].getAttribute('type') || '').toLowerCase();
              if ((type === 'text' || type === '') && inputs[i].type !== 'hidden') {
                user = inputs[i]; break;
              }
            }
            if (user && pass && !window._loginDone) {
              window._loginDone = true;
              user.value = "${credentials?.aerowebUser || ''}";
              user.dispatchEvent(new Event('change', { bubbles: true }));
              pass.value = "${credentials?.dni || credentials?.aerowebPass || ''}";
              pass.dispatchEvent(new Event('change', { bubbles: true }));
              setTimeout(function() {
                var btn = document.querySelector('input[type="submit"], button');
                if (btn) btn.click();
              }, 500);
            }
          }

          if (url.includes('roster')) {
            var fullYearMode = ${needFullYear2026 && !silentMode ? 'true' : 'false'};
            var maxMonth = ${currentMonth1Based};
            var currentStepMonth = parseInt(sessionStorage.getItem('sync_month_step') || (fullYearMode ? '1' : String(maxMonth)), 10);

            var yaMostro = sessionStorage.getItem('roster_mostrado_' + currentStepMonth);
            if (!yaMostro) {
              var selects = document.querySelectorAll('select');
              for (var s = 0; s < selects.length; s++) {
                var sel = selects[s];
                var idName = ((sel.id || '') + (sel.name || '')).toLowerCase();

                // Día desde = 1
                if (idName.includes('day') || idName.includes('dia') || idName.includes('from')) {
                  for (var o = 0; o < sel.options.length; o++) {
                    if (sel.options[o].value === '1' || sel.options[o].value === '01') {
                      sel.selectedIndex = o;
                      sel.dispatchEvent(new Event('change', { bubbles: true }));
                      break;
                    }
                  }
                }

                // Mes = currentStepMonth (cuando descarga todo 2026 barre de Enero al mes actual)
                if (fullYearMode && (idName.includes('month') || idName.includes('mes'))) {
                  for (var m = 0; m < sel.options.length; m++) {
                    var val = parseInt(sel.options[m].value, 10);
                    if (val === currentStepMonth || sel.options[m].index + 1 === currentStepMonth) {
                      sel.selectedIndex = m;
                      sel.dispatchEvent(new Event('change', { bubbles: true }));
                      break;
                    }
                  }
                }
              }

              var radios = Array.from(document.querySelectorAll('input[type="radio"]'));
              var conDetalles = radios.find(function(r) {
                return r.parentElement && r.parentElement.innerText.toLowerCase().includes('con detalle');
              });
              if (conDetalles && !conDetalles.checked) {
                conDetalles.checked = true;
                conDetalles.click();
              }

              var checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
              checkboxes.forEach(function(cb) {
                if (!cb.checked) {
                  cb.checked = true;
                  cb.click();
                }
              });

              var btnMostrar = document.querySelector('input[value="Mostrar"], input[value="Ver"], input[type="submit"]');
              if (btnMostrar) {
                sessionStorage.setItem('roster_mostrado_' + currentStepMonth, 'true');
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  status: 'progress',
                  monthStep: currentStepMonth,
                  maxMonth: maxMonth,
                  fullYearMode: fullYearMode
                }));
                btnMostrar.click();
                return;
              }
            }

            var bodyCheck = document.body ? document.body.innerText : '';
            if (bodyCheck.includes('Checkin') && bodyCheck.includes('Actividad') && !window._dataSentForMonth) {
              window._dataSentForMonth = true;

              var links = document.querySelectorAll('a[href*="openStructure"]');
              for (var i = 0; i < links.length; i++) {
                var href = links[i].getAttribute('href') || '';
                var m = href.match(/openStructure\\(['"]([^'"]+)['"]\\)/);
                if (m && m[1]) {
                  try {
                    if (typeof window.openStructure === 'function') {
                      window.openStructure(m[1]);
                    }
                  } catch(err) {}
                }
              }

              var crewMapByDate = {};
              var cobList = [];
              var allCobElements = document.querySelectorAll('[id^="cob_"]');

              for (var j = 0; j < allCobElements.length; j++) {
                var cobEl = allCobElements[j];
                var cobId = cobEl.id;
                var rawCobText = (cobEl.textContent || cobEl.innerText || '').replace(/\\s+/g, ' ').trim();

                var imgBtn = document.getElementById('img_' + cobId);
                var foundDate = '';
                if (imgBtn) {
                  var parentRow = imgBtn.closest ? imgBtn.closest('tr') : imgBtn.parentElement;
                  if (parentRow) {
                    var rowTxt = parentRow.textContent || '';
                    var dm = rowTxt.match(/(\\d{2}[A-Z]{3})/);
                    if (dm) foundDate = dm[1];
                  }
                }

                if (foundDate && rawCobText) {
                  crewMapByDate[foundDate] = (crewMapByDate[foundDate] || '') + ' | ' + rawCobText;
                }

                if (rawCobText) {
                  cobList.push({ id: cobId, date: foundDate, text: rawCobText });
                }
              }

              var fullVisibleText = document.body ? document.body.innerText : '';
              var isLastStep = (!fullYearMode) || (currentStepMonth >= maxMonth);

              window.ReactNativeWebView.postMessage(JSON.stringify({ 
                status: 'month_data', 
                text: fullVisibleText,
                crewMap: crewMapByDate,
                cobList: cobList,
                monthStep: currentStepMonth,
                isLastStep: isLastStep
              }));

              if (!isLastStep) {
                var nextM = currentStepMonth + 1;
                sessionStorage.setItem('sync_month_step', String(nextM));
                setTimeout(function() {
                  window._dataSentForMonth = false;
                }, 400);
              }
            }
          }
        } catch(e) {}
      }
      
      if (window._syncInterval) clearInterval(window._syncInterval);
      window._syncInterval = setInterval(runAutomation, 850);
    })();
    true;
  `;

  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.status === 'progress') {
        if (data.fullYearMode) {
          setProgressLabel(`Descargando historial 2026 (${AEROWEB_MONTHS[data.monthStep - 1] || data.monthStep}/${data.maxMonth})...`);
        }
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
            type: 'realizada',
            raw: rawList,
            isHistoricalBatch: !data.isLastStep
          });
        }

        if (data.isLastStep) {
          if (needFullYear2026) {
            await AsyncStorage.setItem('synced_full_year_2026_v1', 'true');
          }
          if (onClose) onClose();
        }
      }
    } catch (e) {
      if (onClose) onClose();
    }
  };

  if (silentMode) {
    return credentials ? (
      <View style={styles.hiddenWebView}>
        <WebView
          ref={webViewRef}
          source={{ uri: DIRECT_LOGIN_URL }}
          injectedJavaScript={injectedCode}
          injectedJavaScriptBeforeContentLoaded={injectedCode}
          injectedJavaScriptForMainFrameOnly={false}
          onMessage={handleMessage}
          cacheEnabled={false}
          incognito={true}
        />
      </View>
    ) : null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ACTUALIZANDO</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cardContainer}>
        <View style={styles.iconCircle}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
        <Text style={styles.syncTitle}>ACTUALIZANDO</Text>
        <Text style={styles.syncSubTitle}>{progressLabel}</Text>
      </View>

      {credentials && (
        <View style={styles.hiddenWebView}>
          <WebView
            ref={webViewRef}
            source={{ uri: DIRECT_LOGIN_URL }}
            injectedJavaScript={injectedCode}
            injectedJavaScriptBeforeContentLoaded={injectedCode}
            injectedJavaScriptForMainFrameOnly={false}
            onMessage={handleMessage}
            cacheEnabled={false}
            incognito={true}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, backgroundColor: COLORS.cardBg },
  title: { fontSize: 18, fontWeight: 'bold', color: COLORS.primary },
  closeBtn: { backgroundColor: '#f1f5f9', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark },
  cardContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.cardBg, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: COLORS.borderLight },
  syncTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.textDark, textAlign: 'center', marginTop: 10 },
  syncSubTitle: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 8 },
  hiddenWebView: { width: 0, height: 0, opacity: 0, overflow: 'hidden' }
});