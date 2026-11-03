import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS } from '../../theme/colors';
import { getEncryptedData } from '../../services/storage';

const DIRECT_LOGIN_URL = 'https://portalar.aerolineas.com.ar/CWP_WA/CWPLogin.aspx?ReturnUrl=/cwp_wa/CWP_RosterTW.aspx';

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

function parseCrewFromRawText(rawText, userProfile) {
  const crew = [];

  if (rawText) {
    const clean = rawText
      .replace(/Tripulaci[oó]n del vuelo\s*-\s*AR\d+[A-Z]?/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Captura el formato exacto sin espacios de Aeroweb: (CP|FO|CM|TC|AX|JP) + (OP|DH) + APELLIDO, NOMBRE
    const tokenRegex = /(CP|FO|CM|TC|AX|JP)(?:OP|DH)\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s,.'-]+?)(?=(?:CP|FO|CM|TC|AX|JP)(?:OP|DH)|\[|\bAR\d|\bTripulaci|$)/gi;

    let m;
    while ((m = tokenRegex.exec(clean)) !== null) {
      let rol = m[1].toUpperCase();
      if (rol === 'JP') rol = 'CM';
      let nombre = m[2].trim().replace(/^[,.\s-]+|[,.\s-]+$/g, '').replace(/\s+/g, ' ');

      if (
        nombre.length > 3 &&
        !nombre.includes('CHECKIN') &&
        !nombre.includes('ACTIVIDAD') &&
        !crew.some(c => c.nombre === nombre && c.rol === rol)
      ) {
        crew.push({
          rol,
          nombre,
          label: rol === 'CP' ? 'Comandante' : (rol === 'FO' ? 'Primer Oficial' : (rol === 'CM' ? 'Comisario' : 'Tripulante')),
          rangType: rol === 'CP' ? '4_gold' : (rol === 'FO' ? '3_gold' : (rol === 'CM' ? '2_silver' : 'dots'))
        });
      }
    }
  }

  if (crew.length === 0 && userProfile && userProfile.fullName) {
    const isCmd = userProfile.rank === 'Comandante';
    crew.push({
      rol: isCmd ? 'CP' : 'FO',
      nombre: userProfile.fullName.toUpperCase(),
      label: isCmd ? 'Comandante' : 'Primer Oficial',
      rangType: isCmd ? '4_gold' : '3_gold'
    });
  }

  // Orden jerárquico estricto: CP -> FO -> CM -> TC -> AX
  const ordenJerarquia = { CP: 1, FO: 2, CM: 3, TC: 4, AX: 5 };
  crew.sort((a, b) => (ordenJerarquia[a.rol] || 99) - (ordenJerarquia[b.rol] || 99));

  return crew;
}

function extractPickupInfo(fullText) {
  if (!fullText) return {};
  const pickupMap = {};
  const regex = /(\d{2}[A-Z]{3})[^]*?(?:Pick\s*Up|Remis|B[uú]squeda)[:\s]*(\d{2}:\d{2})(?:[^]*?(?:Direcci[oó]n|Domicilio)[:\s]*([^\n\r]+))?/gi;
  let m;
  while ((m = regex.exec(fullText)) !== null) {
    pickupMap[m[1].toUpperCase()] = {
      pickupTime: m[2],
      pickupAddress: m[3] ? m[3].trim() : null
    };
  }
  return pickupMap;
}

function extractRosterForApp(fullText, crewMapByDate, cobList, userProfile) {
  if (!fullText) return [];
  const cleanText = fullText.replace(/\s+/g, ' ');
  const pickupMap = extractPickupInfo(fullText);

  const pattern = /(?:([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})\s+)?(AR\s*\d+[A-Z]?|RPT|D\/L|VAC|SBF|SB[A-Z]*|\*|OF|MED|LIC|S\/G|SIM)\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})\s+([A-Z]{3})\s+([A-Z]{3})\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2})(?:\s+([A-Z]{3}\s*\d{2}[A-Z]{3}\s*\d{2}:\d{2}))?(?:\s+(73[A-Z0-9]+|33[A-Z0-9]+|E190))?/gi;

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
    const eqStr = m[8] ? m[8].trim() : 'B738';

    const dateCode = extractDateCode(comStr) || extractDateCode(rawChk) || lastDateCode;
    if (dateCode !== lastDateCode) {
      lastCheckinTime = '-';
      lastDateCode = dateCode;
    }

    const isFlight = act.startsWith('AR');
    const chkTime = extractTimeOnly(rawChk);
    if (chkTime !== '-' && isFlight) {
      lastCheckinTime = chkTime;
    }

    const comTime = extractTimeOnly(comStr);
    const finTime = extractTimeOnly(finStr);
    const outTime = extractTimeOnly(outStr);

    let cobTextForFlight = '';
    if (isFlight) {
      const matchingCob = (cobList || []).find(c => c.text && c.text.toUpperCase().includes(act));
      if (matchingCob) {
        cobTextForFlight = matchingCob.text;
      } else if (cobList && cobList[flightCounter]) {
        cobTextForFlight = cobList[flightCounter].text;
      } else if (crewMapByDate && crewMapByDate[dateCode]) {
        cobTextForFlight = crewMapByDate[dateCode];
      }
      flightCounter++;
    }

    const crewSource = cobTextForFlight ? (cobTextForFlight + ' ' + betweenText) : betweenText;
    const pk = pickupMap[dateCode] || {};

    parsed.push({
      fechaAsignada: dateCode,
      checkin: chkTime !== '-' ? chkTime : lastCheckinTime,
      actividad: act,
      comienzo: comTime,
      desde: desStr,
      hacia: hacStr,
      fin: finTime,
      checkout: outTime,
      tipoAvion: eqStr,
      pickupTime: pk.pickupTime || null,
      pickupAddress: pk.pickupAddress || null,
      tripulacion: isFlight ? parseCrewFromRawText(crewSource, userProfile) : []
    });
  }

  return parsed;
}

export default function AerowebSyncScreen({ onClose, onDataParsed }) {
  const [credentials, setCredentials] = useState(null);
  const webViewRef = useRef(null);

  useEffect(() => {
    async function fetchCredentials() {
      try {
        const profile = await getEncryptedData('user_profile');
        if (profile && profile.aerowebUser && (profile.aerowebPass || profile.dni)) {
          setCredentials(profile);
        } else {
          Alert.alert('Faltan Credenciales', 'Guardá tu legajo y clave en el Perfil.');
          if (onClose) onClose();
        }
      } catch (err) {
        if (onClose) onClose();
      }
    }
    fetchCredentials();
  }, []);

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
            var yaMostro = sessionStorage.getItem('roster_mostrado');
            if (!yaMostro) {
              var selects = document.querySelectorAll('select');
              for (var s = 0; s < selects.length; s++) {
                var sel = selects[s];
                var idName = ((sel.id || '') + (sel.name || '')).toLowerCase();
                if (idName.includes('day') || idName.includes('dia') || idName.includes('from')) {
                  for (var o = 0; o < sel.options.length; o++) {
                    if (sel.options[o].value === '1' || sel.options[o].value === '01') {
                      sel.selectedIndex = o;
                      sel.dispatchEvent(new Event('change', { bubbles: true }));
                      break;
                    }
                  }
                }
              }

              var radios = Array.from(document.querySelectorAll('input[type="radio"]'));
              var conDetalles = radios.find(r => r.parentElement && r.parentElement.innerText.toLowerCase().includes('con detalle'));
              if (conDetalles && !conDetalles.checked) {
                conDetalles.checked = true;
                conDetalles.click();
              }

              var checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
              checkboxes.forEach(cb => {
                if (!cb.checked) {
                  cb.checked = true;
                  cb.click();
                }
              });

              var btnMostrar = document.querySelector('input[value="Mostrar"], input[value="Ver"], input[type="submit"]');
              if (btnMostrar) {
                sessionStorage.setItem('roster_mostrado', 'true');
                btnMostrar.click();
                return;
              }
            }

            var bodyCheck = document.body ? document.body.innerText : '';
            if (bodyCheck.includes('Checkin') && bodyCheck.includes('Actividad') && !window._dataSent) {
              window._dataSent = true;

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
                  crewMapByDate[foundDate] = (crewMapByDate[foundDate] || '') + ' ' + rawCobText;
                }

                if (rawCobText) {
                  cobList.push({ id: cobId, date: foundDate, text: rawCobText });
                }
              }

              var fullVisibleText = document.body ? document.body.innerText : '';

              window.ReactNativeWebView.postMessage(JSON.stringify({ 
                status: 'full_text', 
                text: fullVisibleText,
                crewMap: crewMapByDate,
                cobList: cobList
              }));
            }
          }
        } catch(e) {}
      }
      
      if (window._syncInterval) clearInterval(window._syncInterval);
      window._syncInterval = setInterval(runAutomation, 900);
    })();
    true;
  `;

  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.status === 'full_text') {
        const userProfile = await getEncryptedData('user_profile');
        const rawList = extractRosterForApp(data.text, data.crewMap, data.cobList, userProfile);
        
        if (rawList.length > 0 && onDataParsed) {
          onDataParsed({ type: 'realizada', raw: rawList });
        }
        if (onClose) onClose();
      }
    } catch (e) {
      if (onClose) onClose();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ACTUALIZANDO</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}><Text style={styles.closeBtnText}>✕</Text></TouchableOpacity>
      </View>
      <View style={styles.cardContainer}>
        <View style={styles.iconCircle}><ActivityIndicator size="large" color={COLORS.primary} /></View>
        <Text style={styles.syncTitle}>ACTUALIZANDO</Text>
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
  hiddenWebView: { width: 0, height: 0, opacity: 0, overflow: 'hidden' }
});