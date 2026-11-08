import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal,
  SafeAreaView, StatusBar, ActivityIndicator, Alert, AppState,
  Image, TextInput, Platform, Linking, Share
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as Notifications from 'expo-notifications';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Calendar from 'expo-calendar';

import { COLORS } from './src/theme/colors';
import ProfileSetupScreen from './src/modules/auth/ProfileSetupScreen';
import AerowebSyncScreen, { sanitizeCrewName, parseCrewFromRawText, normalizeCrewKey } from './src/modules/aeroweb/AerowebSyncScreen';
import { getEncryptedData } from './src/services/storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true })
});

const BACKEND_API_URL = 'http://localhost:4000';

const URL_CONSULTA_TRIPULACION = 'https://aeroweb.aerolineas.com.ar/es-ar/aplicacionesintegradas/open/crew_prod?KeyEncrypted=ncoxkzvpllf4fo3mv2kqg3mbqpqppsnnzhy3tv3pnx5xdnmgblpishgbttixhpny7wov62x4zd46zwxblyc3tk22da5fcrn5sxb2ie5mbrc4ig7kwgsxuwnbpufyrf5o';
const URL_AEROWEB_HOME = 'https://aeroweb.aerolineas.com.ar/es-ar';
const URL_AEROWEB_SUBLOS = 'https://aeroweb.aerolineas.com.ar/Sublos/SeguiTuEmbarque';

const DESTINOS_TRES_PILOTOS = ['LIM', 'SSA', 'BOG', 'CUN', 'PUJ', 'MIA', 'MAD', 'FCO', 'JFK'];
const DESTINOS_INTERNACIONALES = ['GIG', 'SCL', 'GRU', 'MVD', 'ASU', 'LIM', 'SSA', 'BOG', 'CUN', 'PUJ', 'MIA', 'MAD', 'FCO', 'JFK', 'FLN', 'POA', 'CUR', 'SDQ', 'VVI', 'PDP', 'AUA', 'SJO', 'MEX'];
const DESTINOS_CON_COMIDA_ABORDO = ['AUA', 'BOG', 'CUN', 'PUJ', 'MIA', 'MAD', 'FCO', 'JFK', 'LIM', 'SJO', 'MEX'];

const VIATICO_INTL_USD_POR_DESTINO = {
  GIG: 38.80, SCL: 36.00, GRU: 38.80, FLN: 38.80, POA: 38.80, SSA: 38.80,
  MVD: 36.00, ASU: 36.00, VVI: 36.00, LIM: 40.00, BOG: 42.00, AUA: 45.00,
  CUN: 45.00, PUJ: 45.00, MIA: 50.00, SJO: 45.00, MEX: 45.00
};

const IATA_TO_ICAO = {
  AEP: 'SABE', EZE: 'SAEZ', COR: 'SACO', MDZ: 'SAME', BRC: 'SAZS', USH: 'SAWH',
  FTE: 'SAWC', IGR: 'SARI', SLA: 'SASA', TUC: 'SANT', NQN: 'SAZN', CRD: 'SAVC',
  REL: 'SAVT', RGA: 'SAWE', RGL: 'SAWG', PSS: 'SARP', CNQ: 'SARC', RES: 'SARE',
  SCL: 'SCEL', GIG: 'SBGL', GRU: 'SBGR', FLN: 'SBFL', POA: 'SBPA', SSA: 'SBSV',
  MVD: 'SUMU', PDP: 'SULS', ASU: 'SGAS', VVI: 'SLVR', LIM: 'SPJC', BOG: 'SKBO',
  AUA: 'TNCA', CUN: 'MMUN', PUJ: 'MDPC', MIA: 'KMIA', MAD: 'LEMD', FCO: 'LIRF',
  SJO: 'MROC', MEX: 'MMMX', CPC: 'SAZY'
};

export default function App() {
  const [activeTab, setActiveTab] = useState('hoy');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalViewMode, setModalViewMode] = useState('detail');
  const [aerowebTargetMode, setAerowebTargetMode] = useState('hoy');
  const [showRawAutogestionWeb, setShowRawAutogestionWeb] = useState(false);
  const [autogestionLiveData, setAutogestionLiveData] = useState(null);
  const [selectedNoOkReason, setSelectedNoOkReason] = useState(null);

  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [forceFullYearSync, setForceFullYearSync] = useState(false);
  const [silentSyncRunning, setSilentSyncRunning] = useState(false);
  const [lastSyncTimeStr, setLastSyncTimeStr] = useState('');
  const [changesLogModalVisible, setChangesLogModalVisible] = useState(false);

  const [reaDatabase, setReaDatabase] = useState({});
  const [selectedReaStation, setSelectedReaStation] = useState(null);

  const [crewSearchModalVisible, setCrewSearchModalVisible] = useState(false);
  const [crewQueryFlightNum, setCrewQueryFlightNum] = useState('');
  const [crewQueryDate, setCrewQueryDate] = useState('');
  const [crewSearchLoading, setCrewSearchLoading] = useState(false);
  const [crewLiveTrigger, setCrewLiveTrigger] = useState(null);
  const [crewSearchResult, setCrewSearchResult] = useState(null);
  const [showCrewRawWeb, setShowCrewRawWeb] = useState(false);

  const [sublosModalVisible, setSublosModalVisible] = useState(false);
  const [sublosOrig, setSublosOrig] = useState('');
  const [sublosDest, setSublosDest] = useState('');
  const [sublosFlightNum, setSublosFlightNum] = useState('');
  const [sublosDate, setSublosDate] = useState('');
  const [sublosLoading, setSublosLoading] = useState(false);
  const [sublosLiveTrigger, setSublosLiveTrigger] = useState(null);
  const [sublosResult, setSublosResult] = useState(null);
  const [showSublosRawWeb, setShowSublosRawWeb] = useState(false);

  const [calendarPickerTarget, setCalendarPickerTarget] = useState(null);
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth());
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

  const [phoneDirectoryModalVisible, setPhoneDirectoryModalVisible] = useState(false);
  const [phoneSearchQuery, setPhoneSearchQuery] = useState('');
  const [phoneDirectoryList, setPhoneDirectoryList] = useState([]);
  const [newContactPhoneInput, setNewContactPhoneInput] = useState('');

  const [friendsModalVisible, setFriendsModalVisible] = useState(false);
  const [friendGroupsList, setFriendGroupsList] = useState([]);
  const [newGroupNameInput, setNewGroupNameInput] = useState('');
  const [matchingFreeDaysResult, setMatchingFreeDaysResult] = useState(null);

  const [vencimientosModalVisible, setVencimientosModalVisible] = useState(false);
  const [vencimientosData, setVencimientosData] = useState({ licencias: [], cursos: [], vacaciones: [] });
  const [lastVencSyncStr, setLastVencSyncStr] = useState('');
  const [officialAnnualSummary, setOfficialAnnualSummary] = useState(null);

  const [expandedViaticos, setExpandedViaticos] = useState({
    diasServicio: false,
    vueloSinComida: true,
    vueloConComida: true,
    tierraSimu: false,
    comidaInternacional: true
  });
  const [mostrarSoloRealizados, setMostrarSoloRealizados] = useState(true);
  const [selectedViaticosMonth, setSelectedViaticosMonth] = useState(new Date().getMonth());
  const [selectedActividadMonth, setSelectedActividadMonth] = useState(new Date().getMonth());
  const [mostrarTodoElAnioEnActividad, setMostrarTodoElAnioEnActividad] = useState(true);
  const [expandedLogbookMonths, setExpandedLogbookMonths] = useState({ [new Date().getMonth()]: true });
  const [cadRecordsMap, setCadRecordsMap] = useState({});

  const [viaticosView, setViaticosView] = useState('cantidades');
  const [rosterData, setRosterData] = useState([]);
  const [rosterOriginal, setRosterOriginal] = useState([]);
  const [selectedFlight, setSelectedFlight] = useState({});
  const [esComandante, setEsComandante] = useState(false);
  const [userProfileState, setUserProfileState] = useState(null);
  const [crewAvatarsMap, setCrewAvatarsMap] = useState({});
  const [expoPushTokenState, setExpoPushTokenState] = useState(null);
  const [remisLoading, setRemisLoading] = useState(true);

  const remisWebViewRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  const today = new Date();
  const todayStr = String(today.getDate()).padStart(2, '0');
  const aerowebMonths = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const mesesEspanol = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const mesesCapitalizados = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const diasSemanaCorto = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const diasSemanaLargo = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  const shareOrCopyGroupCode = async (groupName, code) => {
    try {
      await Share.share({ message: `Sumate a nuestro grupo "${groupName}" en PLANES con el código: ${code}` });
    } catch (e) {}
  };

  const registerProfileWithBackend = async (profileObj, pushToken = null) => {
    if (!profileObj?.aerowebUser) return;
    try {
      const res = await fetch(`${BACKEND_API_URL}/api/users/register-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profileObj,
          expoPushToken: pushToken || expoPushTokenState
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.currentRosterRaw?.length > 0) {
          await handleDataParsed({ type: 'realizada', raw: json.currentRosterRaw, isHistoricalBatch: false });
        }
      }
    } catch (e) {}
  };

  const executeNativeCrewSearch = () => {
    const cleanNum = crewQueryFlightNum.replace(/\D/g, '');
    if (!cleanNum) {
      Alert.alert('Ingresá un vuelo', 'Por favor ingresá el número de vuelo AR (ej: 1280).');
      return;
    }
    const dateToUse = crewQueryDate || `${todayStr}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    setCrewSearchLoading(true);
    setCrewSearchResult(null);
    setShowCrewRawWeb(false);
    setCrewLiveTrigger({ flightNum: cleanNum, dateStr: dateToUse, ts: Date.now() });
  };

  const executeNativeSublosSearch = () => {
    const orig = (sublosOrig || '').toUpperCase().trim();
    const dest = (sublosDest || '').toUpperCase().trim();
    const flNum = (sublosFlightNum || '').replace(/\D/g, '');
    if (!orig && !dest && !flNum) {
      Alert.alert('Datos requeridos', 'Completá Origen y Destino o el número de Vuelo AR (ej: 1304).');
      return;
    }
    const dateToUse = sublosDate || `${todayStr}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    setSublosLoading(true);
    setSublosResult(null);
    setShowSublosRawWeb(false);
    setSublosLiveTrigger({ orig, dest, flNum, dateStr: dateToUse, ts: Date.now() });
  };

  const renderInlineCalendarPicker = (targetType) => {
    if (calendarPickerTarget !== targetType) return null;
    const daysInM = new Date(pickerYear, pickerMonth + 1, 0).getDate();
    const firstDayOffset = (new Date(pickerYear, pickerMonth, 1).getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < firstDayOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInM; d++) cells.push(d);
    const currentSelectedStr = targetType === 'crew' ? crewQueryDate : sublosDate;

    return (
      <View style={styles.inlineCalendarCard}>
        <View style={styles.calHeaderRow}>
          <TouchableOpacity
            style={styles.monthBtnLight}
            onPress={() => {
              if (pickerMonth === 0) { setPickerMonth(11); setPickerYear(y => y - 1); }
              else setPickerMonth(m => m - 1);
            }}
          >
            <Text style={styles.monthBtnTextLight}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.calHeaderTitle}>
            {mesesCapitalizados[pickerMonth]} {pickerYear}
          </Text>
          <TouchableOpacity
            style={styles.monthBtnLight}
            onPress={() => {
              if (pickerMonth === 11) { setPickerMonth(0); setPickerYear(y => y + 1); }
              else setPickerMonth(m => m + 1);
            }}
          >
            <Text style={styles.monthBtnTextLight}>{'>'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.calWeekRow}>
          {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(dName => (
            <Text key={dName} style={styles.calWeekDayText}>{dName}</Text>
          ))}
        </View>
        <View style={styles.calDaysGrid}>
          {cells.map((dayNum, idx) => {
            if (!dayNum) return <View key={`e_${idx}`} style={styles.calEmptyCell} />;
            const formatted = `${String(dayNum).padStart(2, '0')}/${String(pickerMonth + 1).padStart(2, '0')}/${pickerYear}`;
            const isSelected = currentSelectedStr === formatted;
            return (
              <TouchableOpacity
                key={formatted}
                style={[styles.calDayCell, isSelected && styles.calDayCellSelected]}
                onPress={() => {
                  if (targetType === 'crew') setCrewQueryDate(formatted);
                  else setSublosDate(formatted);
                  setCalendarPickerTarget(null);
                }}
              >
                <Text style={[styles.calDayText, isSelected && styles.calDayTextSelected]}>
                  {dayNum}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const getExpirationStatus = (dateStr) => {
    if (!dateStr || !dateStr.includes('/')) return 'ok';
    const parts = dateStr.trim().split('/');
    if (parts.length !== 3) return 'ok';
    let y = parseInt(parts[2], 10);
    if (y < 100) y += 2000;
    const expMs = new Date(y, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10), 23, 59, 59).getTime();
    const diffDays = (expMs - today.getTime()) / 86400000;
    if (diffDays < 0) return 'expired';
    if (diffDays <= 35) return 'warning';
    return 'ok';
  };

  const getMsFromDateStr = (fechaDia) => {
    if (!fechaDia) return 0;
    const dStr = fechaDia.match(/\d+/);
    const mStr = fechaDia.match(/[A-Z]+/);
    if (!dStr || !mStr) return 0;
    const d = parseInt(dStr[0], 10);
    const m = aerowebMonths.indexOf(mStr[0]);
    return new Date(today.getFullYear(), m, d).getTime();
  };

  const formatDayAndNumberHeader = (item) => {
    if (!item || !item.fechaDia) return '';
    const ms = getMsFromDateStr(item.fechaDia);
    if (!ms) return item.fechaDia;
    const dateObj = new Date(ms);
    const dayName1 = diasSemanaLargo[dateObj.getDay()];
    const dayNum1 = String(dateObj.getDate()).padStart(2, '0');
    const monthName1 = mesesCapitalizados[dateObj.getMonth()];
    if (item.touchesNextDay) {
      const nextDateObj = new Date(ms + 86400000);
      const dayName2 = diasSemanaLargo[nextDateObj.getDay()];
      const dayNum2 = String(nextDateObj.getDate()).padStart(2, '0');
      const monthName2 = mesesCapitalizados[nextDateObj.getMonth()];
      return monthName1 === monthName2
        ? `${dayName1} ${dayNum1} - ${dayName2} ${dayNum2} de ${monthName1}`
        : `${dayName1} ${dayNum1} de ${monthName1} - ${dayName2} ${dayNum2} de ${monthName2}`;
    }
    return `${dayName1} ${dayNum1} de ${monthName1}`;
  };

  const formatShortDateNum = (fechaDia) => {
    if (!fechaDia) return '';
    const dMatch = fechaDia.match(/\d+/);
    const mMatch = fechaDia.match(/[A-Z]+/);
    if (!dMatch || !mMatch) return fechaDia;
    return `${dMatch[0].padStart(2, '0')}/${String(aerowebMonths.indexOf(mMatch[0]) + 1).padStart(2, '0')}`;
  };

  const formatMinToHM = (totalMinutes) => {
    if (!totalMinutes || totalMinutes <= 0) return '0h 00m';
    return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, '0')}m`;
  };

  const diffMinutes = (startStr, endStr) => {
    if (!startStr || !endStr || !startStr.includes(':') || !endStr.includes(':')) return 0;
    const [h1, m1] = startStr.split(':').map(Number);
    const [h2, m2] = endStr.split(':').map(Number);
    let t1 = h1 * 60 + m1, t2 = h2 * 60 + m2;
    if (t2 < t1) t2 += 1440;
    return t2 - t1;
  };

  const addHoursToTimeStr = (timeStr, hoursToAdd) => {
    if (!timeStr || !timeStr.includes(':')) return '-';
    const [h, m] = timeStr.split(':').map(Number);
    const totalMin = h * 60 + m + hoursToAdd * 60;
    return `${String(Math.floor(totalMin / 60) % 24).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
  };

  const getUniqueAirportsForFlight = (dayObj) => {
    if (!dayObj || !dayObj.tramos) return [];
    const codes = [];
    dayObj.tramos.forEach(t => {
      let d = t.desde, h = t.hacia;
      if ((!d || !h) && t.ruta && t.ruta.includes('→')) {
        const parts = t.ruta.split('→').map(s => s.trim().toUpperCase());
        d = parts[0]; h = parts[1];
      }
      if (d && !codes.includes(d)) codes.push(d);
      if (h && !codes.includes(h)) codes.push(h);
    });
    return codes;
  };

  const getFleetKeyForRea = (flotaStr) => {
    const f = (flotaStr || '').toUpperCase();
    return (f.includes('MAX') || f.includes('38M') || f.includes('73M')) ? 'Boeing 737 MAX' : 'Boeing 737 NG';
  };

  const resolveCrewMemberPhoto = (trip) => {
    if (!trip) return null;
    if (trip.photoUrl) return trip.photoUrl;
    const cleanName = sanitizeCrewName(trip.nombre);
    const normKey = normalizeCrewKey(cleanName);
    const directKey = cleanName.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    if (crewAvatarsMap[normKey]) return crewAvatarsMap[normKey];
    if (crewAvatarsMap[directKey]) return crewAvatarsMap[directKey];
    if (userProfileState?.nombre && normalizeCrewKey(userProfileState.nombre) === normKey) {
      return userProfileState.avatarUri || null;
    }
    return null;
  };

  const openWhatsAppChat = (phoneStr, nombreStr = '') => {
    const cleanPhone = (phoneStr || '').replace(/[^\d+]/g, '');
    if (!cleanPhone || cleanPhone.length < 6) {
      Alert.alert('Teléfono no registrado', `${nombreStr || 'Este tripulante'} aún no cargó su WhatsApp en la Guía Telefónica.`);
      return;
    }
    Linking.openURL(`https://wa.me/${cleanPhone.replace('+', '')}`);
  };

  const registerUserInPhoneDirectory = async (profileObj, customPhone = null) => {
    try {
      const nameRaw = profileObj?.nombre || profileObj?.fullName;
      if (!nameRaw) return;
      const phoneVal = customPhone || profileObj?.telefono || profileObj?.phone || '';
      const cargoVal = profileObj?.rank === 'Comandante' ? 'Comandante' : 'Copiloto';
      const flotaVal = profileObj?.fleet || 'B737';
      setPhoneDirectoryList(prev => {
        const existsIdx = prev.findIndex(p => p.nombre.toLowerCase() === nameRaw.toLowerCase());
        let nextList = existsIdx !== -1 ? [...prev] : [{ id: 'me', nombre: nameRaw, flota: flotaVal, cargo: cargoVal, telefono: phoneVal }, ...prev];
        if (existsIdx !== -1) nextList[existsIdx] = { ...nextList[existsIdx], cargo: cargoVal, flota: flotaVal, telefono: phoneVal || nextList[existsIdx].telefono };
        nextList.sort((a, b) => a.nombre.localeCompare(b.nombre));
        AsyncStorage.setItem('phone_directory_list_real', JSON.stringify(nextList));
        return nextList;
      });
    } catch (e) {}
  };

  const detectarCantidadPilotos = (dayObj) => {
    const pilotosEnLista = (dayObj.tripulacion || []).filter(t => (t.rol === 'CP' || t.rol === 'FO') && (!t.duty || t.duty === 'OP')).length;
    if (pilotosEnLista >= 3) return 3;
    const rutasTexto = (dayObj.tramos || []).map(t => (t.ruta || '').toUpperCase()).join(' | ');
    if (rutasTexto.includes('USH') && rutasTexto.includes('FTE')) return 3;
    for (const dest of DESTINOS_TRES_PILOTOS) { if (rutasTexto.includes(dest)) return 3; }
    return 2;
  };

  const calcularUltimoAterrizaje = (presentacionStr, cantidadTramos = 2, cantPilotos = 2) => {
    if (!presentacionStr || !presentacionStr.includes(':')) return { display: '-', touchesNextDay: false };
    const [presH, presM] = presentacionStr.split(':').map(Number);
    const presMinutos = presH * 60 + presM;
    let maxTsvMinutos = 12 * 60 + 30;
    if (presMinutos >= 840 && presMinutos < 960) maxTsvMinutos = 660;
    else if (presMinutos >= 960 || presMinutos < 300) maxTsvMinutos = 570;
    else if (presMinutos >= 300 && presMinutos < 360) maxTsvMinutos = 690;
    if (cantPilotos <= 2 && cantidadTramos > 2) maxTsvMinutos -= (cantidadTramos - 2) * 30;
    if (cantPilotos >= 3) maxTsvMinutos = 900;
    const totalMin = presMinutos + maxTsvMinutos;
    let h = Math.floor(totalMin / 60), m = totalMin % 60, touchesNextDay = false, plusDay = '';
    if (h >= 24) { h -= 24; plusDay = ' (+1)'; touchesNextDay = true; }
    return { display: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${plusDay}`, touchesNextDay };
  };

  const checkIfOperacionTouchesNextDay = (dayObj) => {
    if (!dayObj.tramos || dayObj.tramos.length === 0) return false;
    const pres = dayObj.presentacionCongelada || dayObj.presentacion;
    const presMin = pres?.includes(':') ? parseInt(pres.split(':')[0], 10) * 60 + parseInt(pres.split(':')[1], 10) : 0;
    for (const t of dayObj.tramos) {
      if (t.comienzoRaw?.includes(':') && t.finRaw?.includes(':')) {
        const [h1, m1] = t.comienzoRaw.split(':').map(Number);
        const [h2, m2] = t.finRaw.split(':').map(Number);
        if ((h2 * 60 + m2) < (h1 * 60 + m1) || (h1 * 60 + m1) < presMin || (h2 * 60 + m2 + 30) >= 1440) return true;
      }
    }
    return false;
  };

  const obtenerInfoComidaEscalaInternacional = (dayObj, multiplier = 1.0) => {
    if (dayObj.isSpecialDay || !dayObj.tramos || dayObj.tramos.length === 0) return { correspondeUSD: false, montoUSD: 0, tieneComidaAbordo: false, tipoComida: null };
    let codigoIntl = null;
    dayObj.tramos.forEach(t => {
      const ruta = (t.ruta || '').toUpperCase();
      DESTINOS_INTERNACIONALES.forEach(code => { if (ruta.includes(code)) codigoIntl = code; });
    });
    if (!codigoIntl) return { correspondeUSD: false, montoUSD: 0, tieneComidaAbordo: false, tipoComida: null };
    const tieneComidaAbordo = DESTINOS_CON_COMIDA_ABORDO.includes(codigoIntl);
    const valorDestinoUSD = Number(((VIATICO_INTL_USD_POR_DESTINO[codigoIntl] || 36.00) * multiplier).toFixed(2));
    const toMin = (s) => s?.includes(':') ? s.split(':').map(Number).reduce((a, b) => a * 60 + b) : -1;
    const primerTramo = dayObj.tramos[0], ultimoTramo = dayObj.tramos[dayObj.tramos.length - 1];
    const llegadaMin = toMin(primerTramo.finRaw), salidaMin = toMin(ultimoTramo.comienzoRaw);
    let finMin = toMin(ultimoTramo.finRaw), inicioMin = toMin(primerTramo.comienzoRaw);
    if (finMin !== -1 && inicioMin !== -1 && finMin < inicioMin) finMin += 1440;
    if (dayObj.tramos.length === 1) {
      return { correspondeUSD: true, montoUSD: valorDestinoUSD, tieneComidaAbordo, dest: codigoIntl, tipoComida: (inicioMin >= 660 && inicioMin <= 900) ? 'Almuerzo' : 'Cena' };
    }
    const cubreAlmuerzo = llegadaMin !== -1 && salidaMin !== -1 && llegadaMin <= 780 && salidaMin >= 810;
    const cubreCena = llegadaMin >= 1170 || salidaMin >= 1200 || finMin >= 1320;
    if (cubreAlmuerzo || cubreCena) {
      return { correspondeUSD: true, montoUSD: valorDestinoUSD, tieneComidaAbordo, dest: codigoIntl, tipoComida: cubreAlmuerzo && !cubreCena ? 'Almuerzo' : 'Cena' };
    }
    return { correspondeUSD: false, montoUSD: 0, tieneComidaAbordo, dest: codigoIntl, tipoComida: null };
  };

  const calcularTiemposOperativos = (presentacionStr, tramos = []) => {
    if (!tramos || tramos.length === 0) return { tvDisplay: '0h 00m', tsDisplay: '0h 00m', tvMinutes: 0, tsMinutes: 0 };
    let totalTvMin = 0;
    tramos.forEach(t => { if (t.comienzoRaw?.includes(':') && t.finRaw?.includes(':')) totalTvMin += diffMinutes(t.comienzoRaw, t.finRaw); });
    const ultimoFin = tramos[tramos.length - 1]?.finRaw;
    const totalTsMin = (presentacionStr?.includes(':') && ultimoFin?.includes(':')) ? diffMinutes(presentacionStr, ultimoFin) + 30 : 0;
    return { tvDisplay: formatMinToHM(totalTvMin), tsDisplay: formatMinToHM(totalTsMin), tvMinutes: totalTvMin, tsMinutes: totalTsMin };
  };

  const deducirCheckin = (primerComienzo) => {
    if (!primerComienzo || !primerComienzo.includes(':')) return '-';
    let [h, m] = primerComienzo.split(':').map(Number);
    h = (h - 1 + 24) % 24;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const getSpecialActivityName = (code) => {
    const c = code?.toUpperCase() || '';
    if (c === 'D/L' || c === 'OF') return 'Día Libre';
    if (c === 'VAC') return 'Vacaciones';
    if (c.startsWith('SB') || c === 'SIM') return `Simulador (${c})`;
    if (c === '*') return 'Día OFF';
    if (c === 'RPT') return 'Reprogramación (RPT)';
    if (c === 'GUA') return 'Guardia (GUA)';
    if (c === 'ELD' || c === 'CUR' || c === 'INS') return `Instrucción (${c})`;
    if (c === 'LIC' || c === 'MED') return 'Licencia / Médico';
    return code;
  };

  const isSpecialActivity = (code) => {
    const c = code?.toUpperCase() || '';
    return ['D/L', 'VAC', '*', 'OF', 'RPT', 'GUA', 'ELD', 'CUR', 'INS', 'SIM', 'LIC', 'MED', 'SBF'].includes(c) || c.startsWith('SB');
  };

  const isOffOrFreeOrVacation = (item) => {
    if (!item || !item.isSpecialDay) return false;
    const name = (item.specialName || '').toLowerCase();
    return name.includes('off') || name.includes('libre') || name.includes('vacaciones') || name.includes('licencia');
  };

  const recalculateExistingCards = (cards) => {
    if (!Array.isArray(cards)) return [];
    const ordenJerarquia = { CP: 1, FO: 2, CM: 3, TC: 4, AX: 5 };
    return cards.map(day => {
      const updated = { ...day };
      if (updated.tripulacion?.length > 0) {
        updated.tripulacion = [...updated.tripulacion].sort((a, b) => (ordenJerarquia[a.rol] || 99) - (ordenJerarquia[b.rol] || 99));
      }
      if (!updated.isSpecialDay && updated.presentacion && updated.presentacion !== '-') {
        const cantPilotos = detectarCantidadPilotos(updated);
        const presParaLimite = updated.presentacionCongelada || updated.presentacion;
        const calc = calcularUltimoAterrizaje(presParaLimite, updated.tramos?.length || 2, cantPilotos);
        updated.ultimoAterrizaje = calc.display;
        updated.vencimientoAeropuerto = addHoursToTimeStr(presParaLimite, 4);
        updated.touchesNextDay = checkIfOperacionTouchesNextDay(updated);
        updated.cantPilotos = cantPilotos;
        const tiempos = calcularTiemposOperativos(presParaLimite, updated.tramos || []);
        updated.tiempoVuelo = tiempos.tvDisplay;
        updated.tiempoServicio = tiempos.tsDisplay;
        updated.tvMinutes = tiempos.tvMinutes;
        updated.tsMinutes = tiempos.tsMinutes;
      } else if (updated.isSpecialDay && updated.specialName?.startsWith('Simulador')) {
        updated.touchesNextDay = checkIfOperacionTouchesNextDay(updated);
      }
      return updated;
    });
  };

  const processAerowebToCards = (rawData) => {
    if (!rawData || rawData.length === 0) return [];
    const daysMap = {}, result = [];
    rawData.forEach(item => {
      const dateMatch = (item.fechaAsignada || '').match(/(\d{1,2})\s*([A-Z]{3})/i);
      let dateKey = dateMatch ? `${dateMatch[1].padStart(2, '0')}${dateMatch[2].toUpperCase()}` : (item.fechaAsignada || 'DESC');
      let itemMonth = dateMatch ? dateMatch[2].toUpperCase() : '';

      const isReturnFromOutstation = item.actividad?.startsWith('AR') && item.desde && !['AEP', 'EZE', 'BUE'].includes(item.desde.toUpperCase());
      if (isReturnFromOutstation && result.length > 0) {
        const prevCard = result[result.length - 1];
        const prevLastTramo = prevCard.tramos?.[prevCard.tramos.length - 1];
        if (prevLastTramo && prevLastTramo.ruta?.endsWith(`→ ${item.desde.toUpperCase()}`)) {
          dateKey = prevCard.fechaDia;
          itemMonth = prevCard.month;
        }
      }

      const isSpecial = isSpecialActivity(item.actividad);
      let presentacion = item.checkin || '-';
      if ((!isSpecial || item.actividad?.startsWith('SB')) && item.comienzo && (!presentacion || presentacion === '-' || Math.abs(parseInt(item.comienzo) - parseInt(presentacion)) > 2)) {
        presentacion = deducirCheckin(item.comienzo);
      }

      if (!daysMap[dateKey]) {
        daysMap[dateKey] = {
          id: dateKey, fechaDia: dateKey, month: itemMonth,
          presentacion: (isSpecial && !item.actividad?.startsWith('SB')) ? '-' : presentacion,
          presentacionCongelada: null, flota: item.tipoAvion || 'B738',
          ultimoAterrizaje: '-', vencimientoAeropuerto: '-', tiempoVuelo: '0h 00m', tiempoServicio: '0h 00m',
          tvMinutes: 0, tsMinutes: 0, cantPilotos: 2, touchesNextDay: false, tramos: [], tripulacion: [],
          isSpecialDay: isSpecial, specialName: isSpecial ? getSpecialActivityName(item.actividad) : null,
          isRPT: false, rptType: null, cambiosDetectados: [], pickupTime: item.pickupTime || null
        };
        result.push(daysMap[dateKey]);
      }

      if (daysMap[dateKey].presentacion === '-' && presentacion !== '-' && (!isSpecial || item.actividad?.startsWith('SB'))) {
        daysMap[dateKey].presentacion = presentacion;
      }
      if (item.tipoAvion && item.tipoAvion !== 'B737') daysMap[dateKey].flota = item.tipoAvion;

      if (!isSpecial || item.actividad?.startsWith('SB')) {
        if (!isSpecial) daysMap[dateKey].isSpecialDay = false;
        const existingTramoIdx = daysMap[dateKey].tramos.findIndex(t => t.nroVuelo === item.actividad && t.comienzoRaw === item.comienzo);
        const tramoObj = {
          ruta: item.desde && item.hacia ? `${item.desde} → ${item.hacia}` : item.actividad,
          desde: item.desde || '', hacia: item.hacia || '', nroVuelo: item.actividad,
          horario: item.comienzo && item.fin ? `${item.comienzo} → ${item.fin}` : (item.comienzo || '-'),
          comienzoRaw: item.comienzo || '-', finRaw: item.fin || '-',
          matricula: item.matricula || null
        };
        if (existingTramoIdx !== -1) daysMap[dateKey].tramos[existingTramoIdx] = tramoObj;
        else daysMap[dateKey].tramos.push(tramoObj);
      }

      if (item.tripulacion?.length > 0) {
        item.tripulacion.forEach(trip => {
          const cleanNombre = sanitizeCrewName(trip.nombre);
          const normK = normalizeCrewKey(cleanNombre);
          if (cleanNombre.length > 2 && !daysMap[dateKey].tripulacion.find(c => c.rol === trip.rol && normalizeCrewKey(c.nombre) === normK)) {
            daysMap[dateKey].tripulacion.push({
              ...trip, nombre: cleanNombre,
              rangType: trip.rol === 'CP' ? '4_gold' : (trip.rol === 'FO' ? '3_gold' : (trip.rol === 'CM' ? '2_silver' : 'dots')),
              label: trip.rol === 'CP' ? 'Comandante' : (trip.rol === 'FO' ? 'Primer Oficial' : (trip.rol === 'CM' ? 'Comisario' : 'Tripulante'))
            });
          }
        });
      }
    });
    return recalculateExistingCards(result);
  };

  const sanitizeAndRepairSavedCards = (cards) => {
    if (!Array.isArray(cards)) return [];
    return cards.map(card => {
      const updated = { ...card };
      const cleanedCrew = [];
      (updated.tripulacion || []).forEach(t => {
        const cleanName = sanitizeCrewName(t.nombre);
        const normK = normalizeCrewKey(cleanName);
        if (cleanName.length > 2 && !cleanedCrew.some(x => x.rol === t.rol && normalizeCrewKey(x.nombre) === normK)) {
          cleanedCrew.push({ ...t, nombre: cleanName });
        }
      });
      updated.tripulacion = cleanedCrew;
      return updated;
    });
  };

  const compararConOriginal = (currentCards, originalCards) => {
    return currentCards.map(realDay => {
      const origDay = originalCards.find(o => o.fechaDia === realDay.fechaDia && o.month === realDay.month);
      const cambios = [];
      realDay.isRPT = false;
      realDay.rptType = null;

      if (origDay && !realDay.isSpecialDay) {
        const origVuelosSet = (origDay.tramos || []).map(t => t.nroVuelo);
        const realVuelosSet = (realDay.tramos || []).map(t => t.nroVuelo);
        const hayVueloNuevoDistinto = realVuelosSet.some(v => !origVuelosSet.includes(v));
        const origEtd = origDay.tramos?.[0]?.comienzoRaw || '-';
        const realEtd = realDay.tramos?.[0]?.comienzoRaw || '-';
        const origHorario = origDay.tramos?.[0]?.horario || '-';

        if (origDay.presentacion && origDay.presentacion !== '-') realDay.presentacionCongelada = origDay.presentacion;

        (realDay.tramos || []).forEach((realTramo) => {
          const origTramo = (origDay.tramos || []).find(ot => ot.nroVuelo === realTramo.nroVuelo);
          if (origTramo?.ruta && realTramo?.ruta && origTramo.ruta !== realTramo.ruta) {
            realDay.isRPT = true;
            realDay.rptType = 'ROUTE';
            cambios.push(`🔄 Cambio de aeropuerto (${realTramo.nroVuelo}): Orig ${origTramo.ruta} → Nuevo ${realTramo.ruta}`);
          }
        });

        if (hayVueloNuevoDistinto && realVuelosSet.length > 0 && origVuelosSet.length > 0) {
          realDay.isRPT = true;
          realDay.rptType = 'ROUTE';
          cambios.push(`🔄 Cambio de vuelo: Orig ${origVuelosSet.join(' · ')} (${origHorario})`);
        } else if (origEtd !== realEtd && origEtd !== '-' && realEtd !== '-') {
          realDay.isRPT = true;
          realDay.rptType = 'DELAY';
          cambios.push(`⚠️ Salida modificada: ETD Orig ${origEtd} → Nuevo ${realEtd}`);
        }

        if (origDay.flota && realDay.flota && origDay.flota !== realDay.flota) {
          cambios.push(`✈️ Cambio de avión: ${origDay.flota} → ${realDay.flota}`);
        }

        if ((origDay.tripulacion?.length || 0) > 1 && (realDay.tripulacion?.length || 0) > 1) {
          const origMap = (origDay.tripulacion || []).map(c => ({ key: `${c.rol}_${normalizeCrewKey(c.nombre)}`, display: `${c.rol} ${sanitizeCrewName(c.nombre)}` }));
          const realMap = (realDay.tripulacion || []).map(c => ({ key: `${c.rol}_${normalizeCrewKey(c.nombre)}`, display: `${c.rol} ${sanitizeCrewName(c.nombre)}` }));
          origMap.filter(o => !realMap.some(r => r.key === o.key)).forEach(s => cambios.push(`❌ Salió de tripulación: ${s.display}`));
          realMap.filter(r => !origMap.some(o => o.key === r.key)).forEach(e => cambios.push(`✅ Entró a tripulación: ${e.display}`));
        }
      }

      realDay.cambiosDetectados = Array.from(new Set(cambios));
      if (realDay.cambiosDetectados.some(c => c.includes('Cambio de aeropuerto') || c.includes('Cambio de vuelo'))) {
        realDay.isRPT = true; realDay.rptType = 'ROUTE';
      } else if (realDay.cambiosDetectados.some(c => c.includes('Salida modificada') || c.includes('tripulación'))) {
        realDay.isRPT = true; realDay.rptType = 'DELAY';
      }
      return realDay;
    });
  };

  const saveAndNotifyVencimientos = async (newPayload) => {
    try {
      const now = new Date();
      const syncStamp = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setVencimientosData(newPayload);
      setLastVencSyncStr(syncStamp);
      await AsyncStorage.setItem('aeroweb_vencimientos_live', JSON.stringify(newPayload));
      await AsyncStorage.setItem('aeroweb_vencimientos_time', syncStamp);
    } catch (e) {}
  };

  const handleVencimientosWebMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'vencimientos_extracted' && data.payload) {
        await saveAndNotifyVencimientos(data.payload);
      }
    } catch (e) {}
  };

  const notificarNuevosCambios = async (previousCards, updatedCards) => {
    try {
      const prevMap = {};
      (previousCards || []).forEach(c => { prevMap[c.fechaDia] = (c.cambiosDetectados || []).join('|'); });
      for (const day of updatedCards) {
        const currentChanges = day.cambiosDetectados || [];
        const sig = currentChanges.join('|');
        if (currentChanges.length > 0 && sig !== (prevMap[day.fechaDia] || '')) {
          await Notifications.scheduleNotificationAsync({
            content: { title: `✈️ Modificación confirmada (${day.fechaDia})`, body: currentChanges.join('\n'), sound: true },
            trigger: null
          });
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    const loadSavedData = async () => {
      try {
        const savedCad = await AsyncStorage.getItem('cad_records_map');
        if (savedCad) setCadRecordsMap(JSON.parse(savedCad));
        const savedPhones = await AsyncStorage.getItem('phone_directory_list_real');
        if (savedPhones) setPhoneDirectoryList(JSON.parse(savedPhones));
        const savedGroups = await AsyncStorage.getItem('friend_groups_list');
        if (savedGroups) setFriendGroupsList(JSON.parse(savedGroups));
        const savedAvatars = await AsyncStorage.getItem('crew_avatars_registry');
        if (savedAvatars) setCrewAvatarsMap(JSON.parse(savedAvatars));
        const savedRea = await AsyncStorage.getItem('rea_database_live');
        if (savedRea) setReaDatabase(JSON.parse(savedRea));
        const savedVenc = await AsyncStorage.getItem('aeroweb_vencimientos_live');
        if (savedVenc) {
          const parsedV = JSON.parse(savedVenc);
          if (parsedV?.licencias?.length > 0 || parsedV?.cursos?.length > 0) setVencimientosData(parsedV);
        }
        const savedVencTime = await AsyncStorage.getItem('aeroweb_vencimientos_time');
        if (savedVencTime) setLastVencSyncStr(savedVencTime);
        const savedAnnual = await AsyncStorage.getItem('aeroweb_annual_summary');
        if (savedAnnual) setOfficialAnnualSummary(JSON.parse(savedAnnual));
        const savedOrig = await AsyncStorage.getItem('rosterOriginal');
        let parsedOrig = savedOrig ? sanitizeAndRepairSavedCards(JSON.parse(savedOrig)) : [];
        if (savedOrig) setRosterOriginal(parsedOrig);
        const savedCurrent = await AsyncStorage.getItem('rosterData');
        if (savedCurrent) {
          const parsedCurrent = sanitizeAndRepairSavedCards(JSON.parse(savedCurrent));
          setRosterData(recalculateExistingCards(compararConOriginal(parsedCurrent, parsedOrig)));
        }
        const savedLastSync = await AsyncStorage.getItem('lastSyncTimeStr');
        if (savedLastSync) setLastSyncTimeStr(savedLastSync);

        let encryptedProfile = await getEncryptedData('user_profile');
        if (!encryptedProfile) {
          const rawProfile = await AsyncStorage.getItem('user_profile');
          if (rawProfile) encryptedProfile = JSON.parse(rawProfile);
        }
        if (encryptedProfile?.aerowebUser) {
          setUserProfileState(encryptedProfile);
          setEsComandante(encryptedProfile.rank === 'Comandante');
          registerUserInPhoneDirectory(encryptedProfile);
        } else {
          setProfileModalVisible(true);
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus === 'granted') {
          const tokenData = await Notifications.getExpoPushTokenAsync();
          setExpoPushTokenState(tokenData.data);
          if (encryptedProfile?.aerowebUser) {
            registerProfileWithBackend(encryptedProfile, tokenData.data);
          }
        }
      } catch (e) {}
    };
    loadSavedData();
  }, []);

  useEffect(() => {
    if (!userProfileState?.aerowebUser) return;
    const autoSyncInterval = setInterval(() => {
      if (!syncModalVisible && !silentSyncRunning && !modalVisible) {
        setSilentSyncRunning(true);
      }
    }, 15 * 60 * 1000);

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        if (!syncModalVisible && !silentSyncRunning && !modalVisible) {
          setSilentSyncRunning(true);
        }
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      clearInterval(autoSyncInterval);
      subscription.remove();
    };
  }, [userProfileState, syncModalVisible, silentSyncRunning, modalVisible]);

  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  const getActivityEndTimestamp = (dayObj) => {
    if (!dayObj?.fechaDia) return 0;
    const baseMs = getMsFromDateStr(dayObj.fechaDia);
    if (dayObj.isSpecialDay && !dayObj.specialName?.startsWith('Simulador')) return baseMs + 86400000 - 1000;
    const lastLeg = dayObj.tramos?.[dayObj.tramos.length - 1];
    if (!lastLeg?.finRaw?.includes(':')) return baseMs + (dayObj.touchesNextDay ? 172800000 : 86400000);
    const [fh, fm] = lastLeg.finRaw.split(':').map(Number);
    return baseMs + (dayObj.touchesNextDay ? 86400000 : 0) + (fh * 60 + fm + 30) * 60000;
  };

  const isActivityStillActiveToday = (dayObj) => {
    if (!dayObj?.fechaDia) return false;
    const startDayMs = getMsFromDateStr(dayObj.fechaDia);
    const secondDayMs = dayObj.touchesNextDay ? startDayMs + 86400000 : startDayMs;
    if (startDayMs !== todayMs && secondDayMs !== todayMs) return false;
    return Date.now() <= getActivityEndTimestamp(dayObj);
  };

  const openDirectAerowebAutogestion = (flightItem) => {
    const flightMs = getMsFromDateStr(flightItem?.fechaDia);
    setSelectedFlight(flightItem || {});
    setAerowebTargetMode(flightMs > todayMs ? 'manana' : 'hoy');
    setAutogestionLiveData(null);
    setShowRawAutogestionWeb(false);
    setRemisLoading(true);
    setModalViewMode('aeroweb');
    setModalVisible(true);
  };

  const isFlightCompletedOrInProgress = (dayObj) => {
    const dayMs = getMsFromDateStr(dayObj.fechaDia);
    if (dayMs < todayMs) return true;
    if (dayMs > todayMs) return false;
    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    if (dayObj.presentacion?.includes(':')) {
      const [ph, pm] = dayObj.presentacion.split(':').map(Number);
      return nowMinutes >= (ph * 60 + pm);
    }
    return false;
  };

  const handleDataParsed = async (payload) => {
    if (payload.type === 'vencimientos' && payload.payload) {
      await saveAndNotifyVencimientos(payload.payload);
      return;
    }
    if (payload.type === 'annual_summary' && payload.rawText) {
      const tsvMatch = payload.rawText.match(/TSV\s*[:\s-]*(\d{1,4}:\d{2})/i);
      const tvMatch = payload.rawText.match(/TV\s*[:\s-]*(\d{1,4}:\d{2})/i);
      const allTimes = payload.rawText.match(/(\d{1,4}:\d{2})/g);
      const tsvRaw = tsvMatch ? tsvMatch[1] : (allTimes?.[0] || null);
      const tvRaw = tvMatch ? tvMatch[1] : (allTimes?.[1] || null);
      if (tsvRaw && tvRaw) {
        const [tvH, tvM] = tvRaw.split(':').map(Number);
        const [tsvH, tsvM] = tsvRaw.split(':').map(Number);
        const summaryObj = {
          tvStr: `${tvH}h ${String(tvM).padStart(2, '0')}m`,
          tsvStr: `${tsvH}h ${String(tsvM).padStart(2, '0')}m`,
          tvDecimal: Number((tvH + tvM / 60).toFixed(1))
        };
        setOfficialAnnualSummary(summaryObj);
        await AsyncStorage.setItem('aeroweb_annual_summary', JSON.stringify(summaryObj));
      }
      return;
    }

    const savedOrigRaw = await AsyncStorage.getItem('rosterOriginal');
    let originalCards = savedOrigRaw ? sanitizeAndRepairSavedCards(JSON.parse(savedOrigRaw)) : [];
    const savedCurrentRaw = await AsyncStorage.getItem('rosterData');
    let existingAllCards = savedCurrentRaw ? sanitizeAndRepairSavedCards(JSON.parse(savedCurrentRaw)) : [];

    if (payload.type === 'original') {
      const incomingOrig = sanitizeAndRepairSavedCards(processAerowebToCards(payload.raw));
      const origMergedMap = {};
      originalCards.forEach(o => { origMergedMap[o.fechaDia] = o; });
      incomingOrig.forEach(o => { origMergedMap[o.fechaDia] = o; });
      const updatedOrigList = Object.values(origMergedMap).sort((a, b) => getMsFromDateStr(a.fechaDia) - getMsFromDateStr(b.fechaDia));
      await AsyncStorage.setItem('rosterOriginal', JSON.stringify(updatedOrigList));
      setRosterOriginal(updatedOrigList);
      const recomputed = sanitizeAndRepairSavedCards(recalculateExistingCards(compararConOriginal(existingAllCards, updatedOrigList)));
      setRosterData(recomputed);
      await AsyncStorage.setItem('rosterData', JSON.stringify(recomputed));
      return;
    }

    if (payload.type === 'realizada') {
      let newCards = sanitizeAndRepairSavedCards(processAerowebToCards(payload.raw));
      const mergedMap = {};
      existingAllCards.forEach(c => { mergedMap[c.fechaDia] = c; });
      newCards.forEach(c => {
        const prev = mergedMap[c.fechaDia];
        if (prev && (!c.tripulacion || c.tripulacion.length <= 1) && prev.tripulacion?.length > 1) {
          c.tripulacion = prev.tripulacion;
        }
        mergedMap[c.fechaDia] = c;
      });
      let groupedRealizada = sanitizeAndRepairSavedCards(
        Object.values(mergedMap).sort((a, b) => getMsFromDateStr(a.fechaDia) - getMsFromDateStr(b.fechaDia))
      );

      let updatedOrig = [...originalCards];
      groupedRealizada.forEach(day => {
        if (!updatedOrig.some(o => o.fechaDia === day.fechaDia)) {
          updatedOrig.push(day);
        }
      });
      await AsyncStorage.setItem('rosterOriginal', JSON.stringify(updatedOrig));
      originalCards = updatedOrig;
      setRosterOriginal(updatedOrig);

      groupedRealizada = sanitizeAndRepairSavedCards(recalculateExistingCards(compararConOriginal(groupedRealizada, originalCards)));
      if (!payload.isHistoricalBatch) await notificarNuevosCambios(existingAllCards, groupedRealizada);

      const nowTime = new Date();
      const timeFormatted = `${String(nowTime.getHours()).padStart(2, '0')}:${String(nowTime.getMinutes()).padStart(2, '0')}`;
      setLastSyncTimeStr(timeFormatted);
      await AsyncStorage.setItem('lastSyncTimeStr', timeFormatted);
      setRosterData(groupedRealizada);
      await AsyncStorage.setItem('rosterData', JSON.stringify(groupedRealizada));
      if (selectedFlight?.fechaDia) {
        const refreshed = groupedRealizada.find(d => d.fechaDia === selectedFlight.fechaDia);
        if (refreshed) setSelectedFlight(refreshed);
      }
    }
  };

  const webToolInjectedJS = `
    (function() {
      function setNativeValue(input, val) {
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
      function runVenc() {
        try {
          var passInputs = Array.from(document.querySelectorAll('input[type="password"]')).filter(function(el) { return el.offsetParent !== null; });
          if (passInputs.length > 0) {
            if (selectStrictlyAerolineas()) return;
            var pass = passInputs[0];
            var form = pass.closest('form') || document.body;
            var user = Array.from(form.querySelectorAll('input')).find(function(el) {
              var t = (el.getAttribute('type') || '').toLowerCase();
              return el.offsetParent !== null && t !== 'password' && t !== 'hidden' && t !== 'submit' && t !== 'button';
            });
            setNativeValue(user, "${userProfileState?.aerowebUser || ''}");
            setNativeValue(pass, "${userProfileState?.aerowebPass || userProfileState?.dni || ''}");
            if (!window._vencAutoSubmitted && user?.value && pass?.value) {
              window._vencAutoSubmitted = true;
              setTimeout(function() {
                selectStrictlyAerolineas();
                var btn = form.querySelector('button[type="submit"], input[type="submit"], .btn-warning, button:not([type="button"])');
                if (btn) btn.click();
              }, 800);
            }
            return;
          }

          var rawContent = document.body ? (document.body.textContent || '') : '';
          if (rawContent.includes('LICENCIAS') && rawContent.includes('CURSOS')) {
            var lines = rawContent.split(/\\r?\\n/).map(function(l) { return l.replace(/\\s+/g, ' ').trim(); }).filter(Boolean);
            var section = '', licencias = [], cursos = [], vacaciones = [];
            for (var idx = 0; idx < lines.length; idx++) {
              var line = lines[idx];
              if (line.toUpperCase() === 'LICENCIAS') { section = 'licencias'; continue; }
              if (line.toUpperCase() === 'CURSOS') { section = 'cursos'; continue; }
              if (line.toUpperCase() === 'VACACIONES') { section = 'vacaciones'; continue; }
              if (line.includes('RAAC 121.401') || line.includes('vencimientos@aerolineas')) { section = ''; }
              var m = line.match(/^([A-ZÁÉÍÓÚÑ0-9\\s\\/\\-.,()]{3,45}?)\\s+(\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}|\\d+\\s*DIAS)$/i);
              if (m && section) {
                var obj = { label: m[1].trim(), value: m[2].trim() };
                if (section === 'licencias' && !licencias.some(function(x){return x.label===obj.label;})) licencias.push(obj);
                else if (section === 'cursos' && !cursos.some(function(x){return x.label===obj.label;})) cursos.push(obj);
                else if (section === 'vacaciones' && !vacaciones.some(function(x){return x.label===obj.label;})) vacaciones.push(obj);
              }
            }
            if ((licencias.length > 0 || cursos.length > 0) && !window._vencExtractedOk) {
              window._vencExtractedOk = true;
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'vencimientos_extracted', payload: { licencias, cursos, vacaciones } }));
            }
          }
        } catch(e) {}
      }
      setInterval(runVenc, 750);
    })();
    true;
  `;

  const wantManana = aerowebTargetMode === 'manana';
  const pickupInjectedJS = `
    (function() {
      window.open = function(url) {
        if (url && typeof url === 'string' && url.trim().length > 1 && url !== 'about:blank') window.location.href = url;
        return window;
      };
      function normKey(str) {
        return String(str || '')
          .replace(/\\b\\d+\\b/g, ' ')
          .replace(/[^A-ZÁÉÍÓÚÑa-záéíóúñ\\s]/g, ' ')
          .toUpperCase()
          .trim()
          .split(/\\s+/)
          .filter(function(w) { return w.length > 1 && ['CP','FO','CM','AX','TC','JP','OP','DH'].indexOf(w) === -1; })
          .sort()
          .join(' ');
      }
      function setNativeValue(input, val) {
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
      function runDirectAutogestion() {
        try {
          var bodyTxt = document.body ? (document.body.innerText || '') : '';
          var passInputs = Array.from(document.querySelectorAll('input[type="password"]')).filter(function(el) { return el.offsetParent !== null; });
          if (passInputs.length > 0) {
            if (selectStrictlyAerolineas()) return;
            var pass = passInputs[0];
            var form = pass.closest('form') || document.body;
            var user = Array.from(form.querySelectorAll('input')).find(function(el) {
              var t = (el.getAttribute('type') || '').toLowerCase();
              return el.offsetParent !== null && t !== 'password' && t !== 'hidden' && t !== 'submit' && t !== 'button';
            });
            setNativeValue(user, "${userProfileState?.aerowebUser || ''}");
            setNativeValue(pass, "${userProfileState?.aerowebPass || userProfileState?.dni || ''}");
            if (!window._pickupLoginClicked && user?.value && pass?.value) {
              window._pickupLoginClicked = true;
              setTimeout(function() {
                selectStrictlyAerolineas();
                var btn = form.querySelector('button[type="submit"], input[type="submit"], .btn-warning');
                if (btn) btn.click();
              }, 800);
            }
            return;
          }
          if (bodyTxt.includes('VENTANAS EMERGENTES') || bodyTxt.includes('abre automáticamente')) {
            var allLinks = Array.from(document.querySelectorAll('a'));
            var targetLink = allLinks.find(function(a) {
              var h = (a.getAttribute('href') || '').toLowerCase();
              var pTxt = a.parentElement ? (a.parentElement.innerText || '').toLowerCase() : '';
              if (h.endsWith('.pdf') || pTxt.includes('safari') || pTxt.includes('android')) return false;
              return pTxt.includes('automáticamente') || h.includes('ssl.aerolineas') || h.includes('forms');
            }) || allLinks[3];
            if (targetLink && !window._bridgeClicked) {
              window._bridgeClicked = true;
              targetLink.removeAttribute('target');
              var href = targetLink.getAttribute('href');
              if (href && !href.startsWith('javascript') && href !== '#') window.location.href = href;
              else targetLink.click();
              return;
            }
          }
          if (!bodyTxt.includes('Actividades Programadas') && !bodyTxt.includes('VENTANAS EMERGENTES') && !window._clicked24or48) {
            var desired = sessionStorage.getItem('desired_mode') || '${wantManana ? 'manana' : 'hoy'}';
            var allAnchors = Array.from(document.querySelectorAll('a, button, div[onclick]'));
            for (var j = 0; j < allAnchors.length; j++) {
              var el = allAnchors[j];
              var txt = (el.innerText || el.textContent || '').toUpperCase().replace(/\\s+/g, ' ').trim();
              var href = (el.getAttribute && el.getAttribute('href')) ? el.getAttribute('href') : '';
              if (desired === 'manana' && (txt.includes('ACTIVIDAD DE MAÑANA') || href.toLowerCase().includes('manana'))) {
                window._clicked24or48 = true;
                if (href && href.length > 3 && !href.startsWith('#')) window.location.href = href; else el.click();
                return;
              } else if (desired !== 'manana' && (txt.includes('ACTIVIDAD DE HOY') || href.toLowerCase().includes('actividaddehoy'))) {
                window._clicked24or48 = true;
                if (href && href.length > 3 && !href.startsWith('#')) window.location.href = href; else el.click();
                return;
              }
            }
          }

          if (bodyTxt.includes('Actividades Programadas')) {
            if (!window._autoExpandedTabs) {
              window._autoExpandedTabs = true;
              var headers = Array.from(document.querySelectorAll('a, button, .panel-heading, h4, div[data-toggle]'));
              ['Horario y búsqueda', 'Estado del vuelo', 'Tripulación'].forEach(function(label, idx) {
                setTimeout(function() {
                  var target = headers.find(function(el) {
                    var t = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
                    return t.includes(label) && t.length < 45;
                  });
                  if (target) target.click();
                }, idx * 750);
              });
            }

            var fullDomText = document.body ? (document.body.textContent || '') : '';
            var crewPhotosMap = {};
            var trs = Array.from(document.querySelectorAll('tr, div'));
            trs.forEach(function(r) {
              var img = r.querySelector ? r.querySelector('img') : null;
              var rTxt = (r.textContent || '').replace(/\\s+/g, ' ').trim();
              var m = rTxt.match(/\\b(CP|FO|CM|TC|AX|JP)\\b\\s*(?:OP|DH)?\\s+([A-ZÁÉÍÓÚÑ,\\s]{4,35})/i);
              if (img && img.src && m && !img.src.includes('logo')) {
                var nk = normKey(m[2]);
                if (nk) crewPhotosMap[nk] = img.src;
              }
            });

            var pickupStr = null;
            if (fullDomText.includes('SIN VIAJES') || fullDomText.includes('No se registran viajes pendientes')) {
              pickupStr = 'Sin viajes pendientes';
            } else {
              var pkMatch = fullDomText.match(/Pr[oó]ximo horario[\\s\\S]{0,120}?(\\d{2}:\\d{2})/i);
              if (pkMatch) pickupStr = pkMatch[1];
            }

            var estadoMatch = fullDomText.match(/Estado del vuelo:\\s*(\\d+)\\s*-\\s*Equipo\\s*:\\s*([A-Z0-9]+)/i);
            var wMatch = fullDomText.match(/\\bW\\s+(\\d+)\\s+(\\d+)\\s+(-?\\d+)/);
            var yMatch = fullDomText.match(/\\bY\\s+(\\d+)\\s+(\\d+)\\s+(-?\\d+)/);
            var flightStatusObj = (estadoMatch || wMatch || yMatch) ? {
              vuelo: estadoMatch ? ('AR' + estadoMatch[1]) : '',
              equipo: estadoMatch ? estadoMatch[2] : 'B737',
              wCap: wMatch ? wMatch[1] : '-',
              wBooked: wMatch ? wMatch[2] : '-',
              wDisp: wMatch ? wMatch[3] : '-',
              yCap: yMatch ? yMatch[1] : '-',
              yBooked: yMatch ? yMatch[2] : '-',
              yDisp: yMatch ? yMatch[3] : '-'
            } : null;

            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'live_crew_from_autogestion',
              rawText: fullDomText,
              crewPhotosMap: crewPhotosMap,
              pickupStr: pickupStr,
              flightStatusObj: flightStatusObj
            }));
          }
        } catch(e) {}
      }
      setInterval(runDirectAutogestion, 700);
    })();
    true;
  `;

  const handleAutogestionMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'live_crew_from_autogestion' && data.rawText) {
        setRemisLoading(false);
        const rawRegistry = await AsyncStorage.getItem('crew_avatars_registry');
        const avatarRegistry = rawRegistry ? JSON.parse(rawRegistry) : {};
        if (data.crewPhotosMap && Object.keys(data.crewPhotosMap).length > 0) {
          Object.assign(avatarRegistry, data.crewPhotosMap);
          setCrewAvatarsMap({ ...avatarRegistry });
          await AsyncStorage.setItem('crew_avatars_registry', JSON.stringify(avatarRegistry));
        }

        const extractedCrew = parseCrewFromRawText(data.rawText, userProfileState, avatarRegistry);
        setAutogestionLiveData(prev => ({
          pickupStr: data.pickupStr || prev?.pickupStr || null,
          flightStatusObj: data.flightStatusObj || prev?.flightStatusObj || null,
          tripulacion: extractedCrew.length > 1 ? extractedCrew : (prev?.tripulacion || selectedFlight?.tripulacion || [])
        }));

        if (extractedCrew.length > 1 && selectedFlight?.fechaDia) {
          const updatedCards = rosterData.map(card => {
            if (card.fechaDia === selectedFlight.fechaDia) {
              return { ...card, tripulacion: extractedCrew };
            }
            return card;
          });
          const recomputed = recalculateExistingCards(compararConOriginal(updatedCards, rosterOriginal));
          setRosterData(recomputed);
          await AsyncStorage.setItem('rosterData', JSON.stringify(recomputed));
          const refreshedSel = recomputed.find(c => c.fechaDia === selectedFlight.fechaDia);
          if (refreshedSel) setSelectedFlight(refreshedSel);
        }
      }
    } catch (e) {}
  };

  const switchAeroweb24or48 = (newMode) => {
    setAerowebTargetMode(newMode);
    setAutogestionLiveData(null);
    setRemisLoading(true);
    remisWebViewRef.current?.injectJavaScript(`
      sessionStorage.setItem('desired_mode', '${newMode}');
      window._clicked24or48 = false;
      window._bridgeClicked = false;
      window._autoExpandedTabs = false;
      window.location.href = '${URL_AEROWEB_HOME}';
      true;
    `);
  };

  const crewLiveInjectedJS = crewLiveTrigger ? `
    (function() {
      function fillInput(el, val) {
        if (!el || !val) return;
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      function runCrewSearch() {
        try {
          var pass = document.querySelector('input[type="password"]');
          if (pass && !window._crewLoginDone) {
            window._crewLoginDone = true;
            var user = document.querySelector('input[type="text"], input:not([type="hidden"]):not([type="password"])');
            fillInput(user, "${userProfileState?.aerowebUser || ''}");
            fillInput(pass, "${userProfileState?.dni || userProfileState?.aerowebPass || ''}");
            setTimeout(function() {
              var btn = document.querySelector('input[type="submit"], button');
              if (btn) btn.click();
            }, 400);
            return;
          }
          var bodyTxt = document.body ? (document.body.innerText || '') : '';
          var targetFl = "${crewLiveTrigger.flightNum}";
          if (bodyTxt.includes(targetFl) && /\\b(CP|FO|CM|AX|TC)\\s+[A-ZÁÉÍÓÚÑ]/i.test(bodyTxt)) {
            sessionStorage.removeItem('crew_query_submitted_' + targetFl);
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'crew_search_done', rawText: bodyTxt }));
            return;
          }
          var alreadySubmitted = sessionStorage.getItem('crew_query_submitted_' + targetFl);
          var textInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="radio"]):not([type="checkbox"])'));
          if (textInputs.length > 0 && !alreadySubmitted) {
            sessionStorage.setItem('crew_query_submitted_' + targetFl, '1');
            fillInput(textInputs[0], targetFl);
            var parts = "${crewLiveTrigger.dateStr}".split('/');
            var selects = Array.from(document.querySelectorAll('select'));
            if (selects.length >= 2 && parts.length === 3) {
              var dayVal = String(parseInt(parts[0], 10));
              var monthIdx = parseInt(parts[1], 10) - 1;
              for (var i = 0; i < selects[0].options.length; i++) {
                if (selects[0].options[i].value == dayVal || selects[0].options[i].text.trim() == parts[0]) {
                  selects[0].selectedIndex = i;
                  selects[0].dispatchEvent(new Event('change', { bubbles: true }));
                  break;
                }
              }
              if (selects[1].options[monthIdx]) {
                selects[1].selectedIndex = monthIdx;
                selects[1].dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
            setTimeout(function() {
              var btnM = document.querySelector('input[value="Mostrar"], input[value="Ver"], input[type="submit"], button');
              if (btnM) btnM.click();
            }, 450);
          }
        } catch(e) {}
      }
      setInterval(runCrewSearch, 700);
    })();
    true;
  ` : '';

  const sublosLiveInjectedJS = sublosLiveTrigger ? `
    (function() {
      function setVal(el, v) {
        if (!el || !v) return;
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, v); else el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      setInterval(function() {
        try {
          var bodyTxt = document.body ? (document.body.innerText || '') : '';
          if (!window._sublosSubmitted) {
            var vInput = document.querySelector('input[name*="Vuelo" i], input[id*="Vuelo" i], input[placeholder*="Vuelo" i]');
            var fInput = document.querySelector('input[name*="Fecha" i], input[id*="Fecha" i], input[type="date"]');
            var oField = document.querySelector('input[name*="Origen" i], select[name*="Origen" i], input[id*="Origen" i]');
            var dField = document.querySelector('input[name*="Destino" i], select[name*="Destino" i], input[id*="Destino" i]');

            if (vInput || fInput || oField) {
              window._sublosSubmitted = true;
              if (vInput && "${sublosLiveTrigger.flNum}") setVal(vInput, "${sublosLiveTrigger.flNum}");
              if (oField && "${sublosLiveTrigger.orig}") setVal(oField, "${sublosLiveTrigger.orig}");
              if (dField && "${sublosLiveTrigger.dest}") setVal(dField, "${sublosLiveTrigger.dest}");
              if (fInput && "${sublosLiveTrigger.dateStr}") {
                var p = "${sublosLiveTrigger.dateStr}".split('/');
                var isoDate = p.length === 3 ? (p[2] + '-' + p[1] + '-' + p[0]) : "${sublosLiveTrigger.dateStr}";
                setVal(fInput, fInput.type === 'date' ? isoDate : "${sublosLiveTrigger.dateStr}");
              }
              var btn = Array.from(document.querySelectorAll('button, input[type="submit"], a')).find(function(b) {
                return (b.innerText || b.value || '').toLowerCase().includes('buscar');
              });
              if (btn) setTimeout(function() { btn.click(); }, 450);
            }
          }
          if (window._sublosSubmitted && (bodyTxt.includes('Sujetos a espacio') || bodyTxt.includes('Pasajes sin emitir') || bodyTxt.includes('Disponibles'))) {
            var wMatch = bodyTxt.match(/\\bW\\s*:?\\s*(-?\\d+)/i);
            var yMatch = bodyTxt.match(/\\bY\\s*:?\\s*(-?\\d+)/i);
            var eqMatch = bodyTxt.match(/Equipo\\s*:?\\s*([A-Z0-9]{3,4})/i);
            var sujMatch = bodyTxt.match(/Sujetos a espacio\\s*:?\\s*(\\d+)/i);
            var sinEmMatch = bodyTxt.match(/Pasajes sin emitir\\s*:?\\s*(\\d+)/i);
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'sublos_parsed',
              payload: {
                wDisp: wMatch ? wMatch[1] : '-',
                yDisp: yMatch ? yMatch[1] : '-',
                equipo: eqMatch ? eqMatch[1] : 'B737',
                sujetos: sujMatch ? sujMatch[1] : '0',
                sinEmitir: sinEmMatch ? sinEmMatch[1] : '0'
              }
            }));
          }
        } catch(e) {}
      }, 800);
    })();
    true;
  ` : '';

  const rosterMonthIndex = selectedViaticosMonth;
  const cobroMonthIndex = (rosterMonthIndex + 2) % 12;
  const tituloMes = `${mesesEspanol[rosterMonthIndex]} ${today.getFullYear()}`;
  const subtituloCobro = `a cobrar en ${mesesEspanol[cobroMonthIndex]}`;
  const rankMultiplier = esComandante ? 1.3 : 1.0;
  const viaticoSinComidaValor = Math.round(87564 * rankMultiplier);
  const viaticoTierraValor = Math.round(77932 * rankMultiplier);

  const targetAerowebMonth = aerowebMonths[rosterMonthIndex];
  const actividadesDelMes = rosterData.filter(d => !d.month || d.month === targetAerowebMonth);
  const actividadesComputables = actividadesDelMes.filter(d => mostrarSoloRealizados ? isFlightCompletedOrInProgress(d) : true);

  const itemsVueloSinComida = [], itemsVueloConComida = [], itemsTierraSimu = [], itemsComidaInternacional = [], itemsDiasServicio = [];
  const fechasContabilizadas = new Set(actividadesComputables.map(d => d.fechaDia));

  actividadesComputables.forEach(d => {
    const fechaCorta = formatShortDateNum(d.fechaDia);
    const todosLosVuelos = (d.tramos || []).map(t => t.nroVuelo).join(' · ') || d.specialName || 'Actividad';
    const primerVuelo = d.tramos?.[0]?.nroVuelo || todosLosVuelos;
    const ultimoVuelo = d.tramos?.[d.tramos.length - 1]?.nroVuelo || todosLosVuelos;

    if (!d.isSpecialDay) {
      const infoIntl = obtenerInfoComidaEscalaInternacional(d, rankMultiplier);
      const labelDia1 = d.touchesNextDay && d.tramos?.length >= 2 ? `${primerVuelo} · ${ultimoVuelo}` : todosLosVuelos;
      itemsDiasServicio.push({ fecha: fechaCorta, detalle: labelDia1 });
      if (infoIntl.tieneComidaAbordo) itemsVueloConComida.push({ fecha: fechaCorta, detalle: labelDia1, monto: viaticoSinComidaValor });
      else itemsVueloSinComida.push({ fecha: fechaCorta, detalle: labelDia1, monto: viaticoSinComidaValor });

      if (infoIntl.correspondeUSD) {
        itemsComidaInternacional.push({
          fecha: fechaCorta,
          detalle: `${labelDia1} • ${infoIntl.tipoComida || 'Cena'}`,
          montoUSD: infoIntl.montoUSD
        });
      }
      if (d.touchesNextDay) {
        const nextDate = new Date(getMsFromDateStr(d.fechaDia) + 86400000);
        const nextKey = `${String(nextDate.getDate()).padStart(2, '0')}${aerowebMonths[nextDate.getMonth()]}`;
        const nextShort = `${String(nextDate.getDate()).padStart(2, '0')}/${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
        if (!fechasContabilizadas.has(nextKey)) {
          const labelDia2 = d.tramos?.length >= 2 ? ultimoVuelo : todosLosVuelos;
          itemsDiasServicio.push({ fecha: nextShort, detalle: labelDia2 });
          if (infoIntl.tieneComidaAbordo) itemsVueloConComida.push({ fecha: nextShort, detalle: labelDia2, monto: viaticoSinComidaValor });
          else itemsVueloSinComida.push({ fecha: nextShort, detalle: labelDia2, monto: viaticoSinComidaValor });
        }
      }
    } else if (d.specialName && (d.specialName.startsWith('Simulador') || d.specialName.startsWith('Guardia') || d.specialName.startsWith('Instrucción'))) {
      itemsDiasServicio.push({ fecha: fechaCorta, detalle: d.specialName });
      itemsTierraSimu.push({ fecha: fechaCorta, detalle: d.specialName, monto: viaticoTierraValor });
    }
  });

  const totalPesosVueloSinComida = itemsVueloSinComida.length * viaticoSinComidaValor;
  const totalPesosVueloConComida = itemsVueloConComida.length * viaticoSinComidaValor;
  const totalPesosTierra = itemsTierraSimu.length * viaticoTierraValor;
  const pesosTotales = totalPesosVueloSinComida + totalPesosVueloConComida + totalPesosTierra;
  const dolaresTotales = Number(itemsComidaInternacional.reduce((acc, it) => acc + it.montoUSD, 0).toFixed(2));
  const formatUSD = (num) => Number.isInteger(num) ? String(num) : num.toFixed(2).replace('.', ',');

  const getIcaoEndpoints = (tramo) => {
    let orig = tramo.desde, dest = tramo.hacia;
    if ((!orig || !dest) && tramo.ruta?.includes('→')) {
      const parts = tramo.ruta.split('→').map(s => s.trim());
      orig = parts[0]; dest = parts[1];
    }
    return { icaoOrig: IATA_TO_ICAO[orig] || orig || 'SABE', icaoDest: IATA_TO_ICAO[dest] || dest || 'SABE' };
  };

  const getAircraftModelLabel = (flota, matricula) => {
    const f = (flota || '').toUpperCase(), m = (matricula || '').toUpperCase();
    return (f.includes('M') || m.includes('HK') || m.includes('KJ') || m.includes('KE')) ? 'Boeing 737 MAX 8' : 'Boeing 737-800';
  };

  const logbookByMonth = {};
  let totalYearDecimalHours = 0, totalYearTvMinutes = 0, totalYearTsMinutes = 0, totalYearLegsOperated = 0;

  rosterData.filter(d => !d.isSpecialDay && isFlightCompletedOrInProgress(d)).forEach(d => {
    totalYearTvMinutes += d.tvMinutes || 0;
    totalYearTsMinutes += d.tsMinutes || 0;
    const mIdx = aerowebMonths.indexOf(d.month || aerowebMonths[today.getMonth()]);
    if (mIdx === -1) return;
    if (!logbookByMonth[mIdx]) {
      logbookByMonth[mIdx] = { monthIndex: mIdx, title: `${mesesCapitalizados[mIdx]} ${today.getFullYear()}`, totalHours: 0, sinMatriculaCount: 0, legs: [] };
    }
    const baseDateMs = getMsFromDateStr(d.fechaDia);
    (d.tramos || []).forEach((t, idx) => {
      totalYearLegsOperated += 1;
      const decHours = Number((diffMinutes(t.comienzoRaw, t.finRaw) / 60).toFixed(1));
      const legDateObj = new Date(baseDateMs);
      const dd = String(legDateObj.getDate()).padStart(2, '0'), mm = String(legDateObj.getMonth() + 1).padStart(2, '0'), yyyy = legDateObj.getFullYear();
      const legKey = `${d.fechaDia}_${t.nroVuelo}_${idx}`;
      const savedCad = cadRecordsMap[legKey] || {};
      const defaultMat = savedCad.matricula || t.matricula || null;
      if (!defaultMat) logbookByMonth[mIdx].sinMatriculaCount += 1;
      const { icaoOrig, icaoDest } = getIcaoEndpoints(t);
      const totalVal = savedCad.totalHours ? parseFloat(savedCad.totalHours) : decHours;
      logbookByMonth[mIdx].totalHours = Number((logbookByMonth[mIdx].totalHours + totalVal).toFixed(1));
      totalYearDecimalHours = Number((totalYearDecimalHours + totalVal).toFixed(1));
      logbookByMonth[mIdx].legs.push({
        key: legKey, icaoOrig: savedCad.icaoOrig || icaoOrig, icaoDest: savedCad.icaoDest || icaoDest,
        icaoRoute: `${savedCad.icaoOrig || icaoOrig} – ${savedCad.icaoDest || icaoDest}`,
        fecha: `${dd}/${mm}`, fechaCompleta: savedCad.fechaCompleta || `${dd}/${mm}/${yyyy}`,
        subHeaderDate: `${diasSemanaLargo[legDateObj.getDay()].toLowerCase()} ${legDateObj.getDate()} de ${mesesEspanol[legDateObj.getMonth()]}`,
        nroVuelo: savedCad.nroVuelo || t.nroVuelo, outUtc: savedCad.outUtc || addHoursToTimeStr(t.comienzoRaw, 3),
        inUtc: savedCad.inUtc || addHoursToTimeStr(t.finRaw, 3), matricula: defaultMat,
        aircraftModel: getAircraftModelLabel(d.flota, defaultMat), funcion: savedCad.funcion || (esComandante ? 'CM' : 'FO'),
        finalidad: savedCad.finalidad || 'Línea aérea', totalHours: savedCad.totalHours || decHours.toFixed(1),
        ifrHours: savedCad.ifrHours || Number((decHours * 0.9).toFixed(1)).toFixed(1),
        aterrizajes: savedCad.aterrizajes !== undefined ? savedCad.aterrizajes : 1,
        autoridadCertificante: savedCad.autoridadCertificante || 'ANAC - Explotador Aéreo (Aerolíneas Argentinas)',
        cargadoEnCad: !!savedCad.cargadoEnCad, sortMs: baseDateMs + idx * 1000
      });
    });
  });

  const logbookMonthsList = Object.values(logbookByMonth).map(m => ({ ...m, legs: m.legs.sort((a, b) => b.sortMs - a.sortMs) })).sort((a, b) => b.monthIndex - a.monthIndex);

  const todayActivity = rosterData.find(d => isActivityStillActiveToday(d));
  const rosterOrdenado = [...rosterData].sort((a, b) => getMsFromDateStr(a.fechaDia) - getMsFromDateStr(b.fechaDia));
  const nextActivity = rosterOrdenado.find(d => getMsFromDateStr(d.fechaDia) > todayMs);
  const diasConModificaciones = rosterOrdenado.filter(d => d.cambiosDetectados?.length > 0);
  const isPastActivity = (item) => item?.fechaDia ? Date.now() > getActivityEndTimestamp(item) : false;

  const renderEpaulette = (type) => {
    if (type === '4_gold') return <View style={styles.epauletteContainer}><View style={styles.goldStripe} /><View style={styles.goldStripe} /><View style={styles.goldStripe} /><View style={styles.goldStripe} /></View>;
    if (type === '3_gold') return <View style={styles.epauletteContainer}><View style={styles.goldStripe} /><View style={styles.goldStripe} /><View style={styles.goldStripe} /></View>;
    if (type === '2_silver') return <View style={styles.epauletteContainerBlue}><View style={styles.silverStripe} /><View style={styles.silverStripe} /></View>;
    return <View style={styles.epauletteContainerDots}><Text style={styles.dotsText}>• •</Text></View>;
  };

  const renderGlobito = (item) => {
    let icon = '🏠';
    if (item.specialName === 'Vacaciones') icon = '☀️';
    else if (item.specialName?.startsWith('Simulador')) icon = '🖥️';
    return (
      <View style={[styles.globitoContainer, isPastActivity(item) && styles.pastOpacity]}>
        <Text style={styles.globitoDate}>{formatDayAndNumberHeader(item)}</Text>
        <View style={styles.globitoSeparator} />
        <Text style={styles.globitoIcon}>{icon}</Text>
        <Text style={styles.globitoText}>{item.specialName}</Text>
      </View>
    );
  };

  const renderFlightCard = (item, index, onPress) => {
    const isPast = isPastActivity(item);
    const hasChanges = item.isRPT || item.cambiosDetectados?.length > 0;
    return (
      <TouchableOpacity key={item.id || index} style={[styles.flightCard, isPast && styles.pastOpacity]} onPress={onPress}>
        <View style={styles.flightCardHeader}>
          <View style={styles.flightCardHeaderLeft}>
            <Text style={styles.flightCardDate}>{formatDayAndNumberHeader(item)}</Text>
            <View style={styles.badgeFlotaContainer}><Text style={styles.badgeFlotaText}>{item.flota}</Text></View>
          </View>
          <View style={styles.flightCardHeaderRight}>
            <Text style={styles.flightCardHeaderLabel}>Presentación</Text>
            <Text style={styles.flightCardHeaderVal}>{item.presentacionCongelada || item.presentacion}</Text>
          </View>
          <View style={styles.flightCardHeaderRight}>
            <Text style={styles.flightCardHeaderLabel}>Últ. Aterrizaje</Text>
            <Text style={styles.flightCardHeaderValBlue}>{item.ultimoAterrizaje}</Text>
          </View>
        </View>
        <View style={styles.metricsRowCard}>
          <View style={styles.metricPill}><Text style={styles.metricPillLabel}>VUELO: </Text><Text style={styles.metricPillVal}>{item.tiempoVuelo || '0h 00m'}</Text></View>
          <View style={styles.metricPill}><Text style={styles.metricPillLabel}>TIEMPO DE SERVICIO: </Text><Text style={styles.metricPillVal}>{item.tiempoServicio || '0h 00m'}</Text></View>
        </View>
        {hasChanges && (
          <View style={item.rptType === 'DELAY' ? styles.changeBannerAmber : styles.changeBannerRed}>
            {item.cambiosDetectados.map((chg, cIdx) => (
              <Text key={cIdx} style={item.rptType === 'DELAY' ? styles.changeTextAmber : styles.changeTextRed}>{chg}</Text>
            ))}
          </View>
        )}
        <View style={styles.flightCardDivider} />
        {item.tramos?.map((t, idx) => (
          <View key={idx} style={styles.flightCardTramoRow}>
            <View>
              <Text style={styles.flightCardRoute}>{t.ruta}</Text>
              <Text style={styles.flightCardFlightNum}>{t.nroVuelo}{t.matricula ? ` • ${t.matricula}` : ''}</Text>
            </View>
            <Text style={styles.flightCardTime}>{t.horario}</Text>
          </View>
        ))}
      </TouchableOpacity>
    );
  };

  const renderActividadSpecialCard = (item, index) => {
    let icon = '🏠';
    if (item.specialName === 'Vacaciones') icon = '☀️';
    else if (item.specialName?.startsWith('Simulador')) icon = '🖥️';
    return (
      <View key={item.id || index} style={[styles.actividadSpecialCard, isPastActivity(item) && styles.pastOpacity]}>
        <View style={styles.actividadSpecialCardContent}>
          <View style={styles.flexOne}>
            <Text style={styles.actividadSpecialCardDate}>{formatDayAndNumberHeader(item)}</Text>
            <Text style={styles.actividadSpecialCardTitle}>{item.specialName}</Text>
          </View>
          <Text style={styles.actividadSpecialCardIcon}>{icon}</Text>
        </View>
      </View>
    );
  };

  const renderVencimientoRow = (item, idx, isLast) => {
    const status = getExpirationStatus(item.value);
    return (
      <View key={idx} style={[styles.vencRow, isLast && styles.noBorderBottom]}>
        <Text style={[styles.vencLabel, status === 'expired' && styles.textRed, status === 'warning' && styles.textAmber]}>{item.label}</Text>
        <Text style={[styles.vencDate, status === 'expired' && styles.textRed, status === 'warning' && styles.textAmber]}>{item.value}</Text>
      </View>
    );
  };

  const filteredPhoneDirectory = phoneDirectoryList.filter(p => {
    const q = phoneSearchQuery.trim().toLowerCase();
    return !q || p.nombre.toLowerCase().includes(q) || p.flota.toLowerCase().includes(q) || p.cargo.toLowerCase().includes(q);
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bgLight} />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>PLANES</Text>
          <Text style={styles.headerSubtitle}>
            {userProfileState?.nombre || 'Sincronización AeroWeb'}{lastSyncTimeStr ? ` • Sync ${lastSyncTimeStr}` : ''}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.syncBtn} onPress={() => { setSilentSyncRunning(false); setForceFullYearSync(false); setSyncModalVisible(true); }}>
            <Text style={styles.syncBtnText}>Actualizar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileBadgeBtn} onPress={() => setProfileModalVisible(true)}>
            <Text style={styles.profileBadgeText}>Perfil 👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {silentSyncRunning && !syncModalVisible && !modalVisible && (
        <AerowebSyncScreen
          silentMode={true}
          onClose={() => setSilentSyncRunning(false)}
          onDataParsed={handleDataParsed}
        />
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {activeTab === 'hoy' && (
          <View>
            <View style={styles.headerTitleContainer}>
              <View style={styles.calendarIcon}>
                <Text style={styles.calendarDayName}>{diasSemanaCorto[today.getDay()]}</Text>
                <Text style={styles.calendarDayNumber}>{todayStr}</Text>
              </View>
              <Text style={styles.todayFullDayText}>{`${diasSemanaLargo[today.getDay()]} ${todayStr} de ${mesesCapitalizados[today.getMonth()]}`}</Text>
            </View>
            <Text style={styles.sectionLabel}>Actividad de Hoy</Text>
            {todayActivity ? (
              <View>
                {todayActivity.isSpecialDay ? renderGlobito(todayActivity) : renderFlightCard(todayActivity, 'today', () => { setSelectedFlight(todayActivity); setModalViewMode('detail'); setModalVisible(true); })}
                {!isOffOrFreeOrVacation(todayActivity) && (
                  <TouchableOpacity style={styles.pickupBtnHoy} onPress={() => openDirectAerowebAutogestion(todayActivity)}>
                    <Text style={styles.pickupBtnText}>🚕 Detalle del vuelo Aeroweb (Hoy)</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : <Text style={styles.noActivityText}>No tenés más actividad programada para el resto de hoy.</Text>}

            <Text style={styles.sectionLabel}>Próxima actividad programada</Text>
            {nextActivity ? (
              <View>
                {nextActivity.isSpecialDay ? renderGlobito(nextActivity) : renderFlightCard(nextActivity, 'next', () => { setSelectedFlight(nextActivity); setModalViewMode('detail'); setModalVisible(true); })}
                {!isOffOrFreeOrVacation(nextActivity) && (
                  <TouchableOpacity style={styles.pickupBtnHoy} onPress={() => openDirectAerowebAutogestion(nextActivity)}>
                    <Text style={styles.pickupBtnText}>🚕 Detalle Aeroweb ({formatDayAndNumberHeader(nextActivity)})</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : <View style={styles.emptyCard}><Text style={styles.summaryText}>No hay vuelos próximos. Tocá "Actualizar".</Text></View>}
          </View>
        )}

        {activeTab === 'actividad' && (
          <View>
            <View style={styles.toggleContainer}>
              <TouchableOpacity style={[styles.toggleBtn, mostrarTodoElAnioEnActividad && styles.toggleBtnActive]} onPress={() => setMostrarTodoElAnioEnActividad(true)}>
                <Text style={[styles.toggleText, mostrarTodoElAnioEnActividad && styles.toggleTextActive]}>≡ Todo el Historial ({rosterOrdenado.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.toggleBtn, !mostrarTodoElAnioEnActividad && styles.toggleBtnActive]} onPress={() => setMostrarTodoElAnioEnActividad(false)}>
                <Text style={[styles.toggleText, !mostrarTodoElAnioEnActividad && styles.toggleTextActive]}>📅 Filtrar por Mes</Text>
              </TouchableOpacity>
            </View>
            {!mostrarTodoElAnioEnActividad && (
              <View style={styles.monthSelectorLight}>
                <TouchableOpacity style={styles.monthBtnLight} onPress={() => setSelectedActividadMonth(p => (p === 0 ? 11 : p - 1))}><Text style={styles.monthBtnTextLight}>{'<'}</Text></TouchableOpacity>
                <Text style={styles.monthTitleLight}>{mesesCapitalizados[selectedActividadMonth]} {today.getFullYear()}</Text>
                <TouchableOpacity style={styles.monthBtnLight} onPress={() => setSelectedActividadMonth(p => (p === 11 ? 0 : p + 1))}><Text style={styles.monthBtnTextLight}>{'>'}</Text></TouchableOpacity>
              </View>
            )}
            {rosterOrdenado.filter(it => mostrarTodoElAnioEnActividad ? true : (!it.month || it.month === aerowebMonths[selectedActividadMonth])).map((item, idx) =>
              item.isSpecialDay ? renderActividadSpecialCard(item, idx) : renderFlightCard(item, idx, () => { setSelectedFlight(item); setModalViewMode('detail'); setModalVisible(true); })
            )}
          </View>
        )}

        {activeTab === 'viaticos' && (
          <View>
            <View style={styles.toggleContainer}>
              <TouchableOpacity style={[styles.toggleBtn, viaticosView === 'cantidades' && styles.toggleBtnActive]} onPress={() => setViaticosView('cantidades')}>
                <Text style={[styles.toggleText, viaticosView === 'cantidades' && styles.toggleTextActive]}>123 Cantidades</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.toggleBtn, viaticosView === 'viaticos' && styles.toggleBtnActive]} onPress={() => setViaticosView('viaticos')}>
                <Text style={[styles.toggleText, viaticosView === 'viaticos' && styles.toggleTextActive]}>$ Viáticos</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.monthSelectorLight}>
              <TouchableOpacity style={styles.monthBtnLight} onPress={() => setSelectedViaticosMonth(p => (p === 0 ? 11 : p - 1))}><Text style={styles.monthBtnTextLight}>{'<'}</Text></TouchableOpacity>
              <View style={styles.centerItems}>
                <Text style={styles.monthTitleLight}>{tituloMes}</Text>
                <Text style={styles.monthSubtitleLight}>{subtituloCobro} • {esComandante ? 'Tarifa Comandante (+30%)' : 'Tarifa Primer Oficial'}</Text>
              </View>
              <TouchableOpacity style={styles.monthBtnLight} onPress={() => setSelectedViaticosMonth(p => (p === 11 ? 0 : p + 1))}><Text style={styles.monthBtnTextLight}>{'>'}</Text></TouchableOpacity>
            </View>

            <View style={styles.centerRowBottom14}>
              <TouchableOpacity style={styles.syncReportsPill} onPress={() => setMostrarSoloRealizados(!mostrarSoloRealizados)}>
                <Text style={styles.syncReportsPillText}>
                  {mostrarSoloRealizados ? '✓ Mostrando vuelos realizados a la fecha (Ver proyectado)' : '📅 Mostrando proyectado de todo el mes (Ver solo realizados)'}
                </Text>
              </TouchableOpacity>
            </View>

            {viaticosView === 'cantidades' ? (
              <View style={styles.listCard}>
                <TouchableOpacity style={styles.rowItem} onPress={() => setExpandedViaticos(p => ({ ...p, diasServicio: !p.diasServicio }))}>
                  <Text style={styles.itemLabel}>Días de servicio</Text>
                  <View style={styles.rowBetweenCenter}>
                    <Text style={styles.itemVal}>{itemsDiasServicio.length}</Text>
                    <Text style={styles.chevron}>{expandedViaticos.diasServicio ? '⌄' : '›'}</Text>
                  </View>
                </TouchableOpacity>
                {expandedViaticos.diasServicio && itemsDiasServicio.map((it, idx) => (
                  <View key={idx} style={styles.subRowViatico}>
                    <Text style={styles.subRowDate}>{it.fecha}</Text>
                    <Text style={styles.subRowFlights}>{it.detalle}</Text>
                  </View>
                ))}

                {itemsVueloSinComida.length > 0 && (
                  <>
                    <TouchableOpacity style={styles.rowItem} onPress={() => setExpandedViaticos(p => ({ ...p, vueloSinComida: !p.vueloSinComida }))}>
                      <Text style={styles.itemLabel}>Viático de vuelo sin comida</Text>
                      <View style={styles.rowBetweenCenter}>
                        <Text style={styles.itemVal}>{itemsVueloSinComida.length}</Text>
                        <Text style={styles.chevron}>{expandedViaticos.vueloSinComida ? '⌄' : '›'}</Text>
                      </View>
                    </TouchableOpacity>
                    {expandedViaticos.vueloSinComida && itemsVueloSinComida.map((it, idx) => (
                      <View key={idx} style={styles.subRowViatico}>
                        <Text style={styles.subRowDate}>{it.fecha}</Text>
                        <Text style={styles.subRowFlights}>{it.detalle}</Text>
                      </View>
                    ))}
                  </>
                )}

                {itemsVueloConComida.length > 0 && (
                  <>
                    <TouchableOpacity style={styles.rowItem} onPress={() => setExpandedViaticos(p => ({ ...p, vueloConComida: !p.vueloConComida }))}>
                      <Text style={styles.itemLabel}>Viático de vuelo con comida</Text>
                      <View style={styles.rowBetweenCenter}>
                        <Text style={styles.itemVal}>{itemsVueloConComida.length}</Text>
                        <Text style={styles.chevron}>{expandedViaticos.vueloConComida ? '⌄' : '›'}</Text>
                      </View>
                    </TouchableOpacity>
                    {expandedViaticos.vueloConComida && itemsVueloConComida.map((it, idx) => (
                      <View key={idx} style={styles.subRowViatico}>
                        <Text style={styles.subRowDate}>{it.fecha}</Text>
                        <Text style={styles.subRowFlights}>{it.detalle}</Text>
                      </View>
                    ))}
                  </>
                )}

                {itemsComidaInternacional.length > 0 && (
                  <>
                    <TouchableOpacity style={styles.rowItem} onPress={() => setExpandedViaticos(p => ({ ...p, comidaInternacional: !p.comidaInternacional }))}>
                      <Text style={styles.itemLabel}>Comidas en escala internacional</Text>
                      <View style={styles.rowBetweenCenter}>
                        <Text style={styles.itemVal}>{itemsComidaInternacional.length}</Text>
                        <Text style={styles.chevron}>{expandedViaticos.comidaInternacional ? '⌄' : '›'}</Text>
                      </View>
                    </TouchableOpacity>
                    {expandedViaticos.comidaInternacional && itemsComidaInternacional.map((it, idx) => (
                      <View key={idx} style={styles.subRowViatico}>
                        <Text style={styles.subRowDate}>{it.fecha}</Text>
                        <Text style={styles.subRowFlights}>{it.detalle}</Text>
                      </View>
                    ))}
                  </>
                )}

                {itemsTierraSimu.length > 0 && (
                  <>
                    <TouchableOpacity style={[styles.rowItem, styles.noBorderBottom]} onPress={() => setExpandedViaticos(p => ({ ...p, tierraSimu: !p.tierraSimu }))}>
                      <Text style={styles.itemLabel}>Viático de Tierra (Simulador/Inst.)</Text>
                      <View style={styles.rowBetweenCenter}>
                        <Text style={styles.itemVal}>{itemsTierraSimu.length}</Text>
                        <Text style={styles.chevron}>{expandedViaticos.tierraSimu ? '⌄' : '›'}</Text>
                      </View>
                    </TouchableOpacity>
                    {expandedViaticos.tierraSimu && itemsTierraSimu.map((it, idx) => (
                      <View key={idx} style={styles.subRowViatico}>
                        <Text style={styles.subRowDate}>{it.fecha}</Text>
                        <Text style={styles.subRowFlights}>{it.detalle}</Text>
                      </View>
                    ))}
                  </>
                )}
              </View>
            ) : (
              <View>
                <Text style={styles.sectionHeaderLight}>EN PESOS</Text>
                <View style={styles.listCard}>
                  {itemsVueloSinComida.length > 0 && (
                    <>
                      <TouchableOpacity style={styles.rowItem} onPress={() => setExpandedViaticos(p => ({ ...p, vueloSinComida: !p.vueloSinComida }))}>
                        <Text style={styles.itemLabel}>Viático de vuelo sin comida</Text>
                        <View style={styles.rowBetweenCenter}>
                          <Text style={styles.itemVal}>$ {totalPesosVueloSinComida.toLocaleString('es-AR')}</Text>
                          <Text style={styles.chevron}>{expandedViaticos.vueloSinComida ? '⌄' : '›'}</Text>
                        </View>
                      </TouchableOpacity>
                      {expandedViaticos.vueloSinComida && itemsVueloSinComida.map((it, idx) => (
                        <View key={idx} style={styles.subRowViatico}>
                          <Text style={styles.subRowDate}>{it.fecha}</Text>
                          <Text style={styles.subRowFlights}>{it.detalle}</Text>
                          <Text style={styles.subRowAmount}>$ {it.monto.toLocaleString('es-AR')}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  {itemsVueloConComida.length > 0 && (
                    <>
                      <TouchableOpacity style={styles.rowItem} onPress={() => setExpandedViaticos(p => ({ ...p, vueloConComida: !p.vueloConComida }))}>
                        <Text style={styles.itemLabel}>Viático de vuelo con comida</Text>
                        <View style={styles.rowBetweenCenter}>
                          <Text style={styles.itemVal}>$ {totalPesosVueloConComida.toLocaleString('es-AR')}</Text>
                          <Text style={styles.chevron}>{expandedViaticos.vueloConComida ? '⌄' : '›'}</Text>
                        </View>
                      </TouchableOpacity>
                      {expandedViaticos.vueloConComida && itemsVueloConComida.map((it, idx) => (
                        <View key={idx} style={styles.subRowViatico}>
                          <Text style={styles.subRowDate}>{it.fecha}</Text>
                          <Text style={styles.subRowFlights}>{it.detalle}</Text>
                          <Text style={styles.subRowAmount}>$ {it.monto.toLocaleString('es-AR')}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  {itemsTierraSimu.length > 0 && (
                    <>
                      <TouchableOpacity style={styles.rowItem} onPress={() => setExpandedViaticos(p => ({ ...p, tierraSimu: !p.tierraSimu }))}>
                        <Text style={styles.itemLabel}>Viático Tierra (Simulador)</Text>
                        <View style={styles.rowBetweenCenter}>
                          <Text style={styles.itemVal}>$ {totalPesosTierra.toLocaleString('es-AR')}</Text>
                          <Text style={styles.chevron}>{expandedViaticos.tierraSimu ? '⌄' : '›'}</Text>
                        </View>
                      </TouchableOpacity>
                      {expandedViaticos.tierraSimu && itemsTierraSimu.map((it, idx) => (
                        <View key={idx} style={styles.subRowViatico}>
                          <Text style={styles.subRowDate}>{it.fecha}</Text>
                          <Text style={styles.subRowFlights}>{it.detalle}</Text>
                          <Text style={styles.subRowAmount}>$ {it.monto.toLocaleString('es-AR')}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  <View style={[styles.rowItem, styles.noBorderBottom]}>
                    <Text style={styles.itemLabelBold}>Total</Text>
                    <Text style={styles.itemValBlue}>$ {pesosTotales.toLocaleString('es-AR')}</Text>
                  </View>
                </View>

                {itemsComidaInternacional.length > 0 && (
                  <>
                    <Text style={styles.sectionHeaderLight}>EN DÓLARES (COMIDA EN ESCALA)</Text>
                    <View style={styles.listCard}>
                      <TouchableOpacity style={styles.rowItem} onPress={() => setExpandedViaticos(p => ({ ...p, comidaInternacional: !p.comidaInternacional }))}>
                        <Text style={styles.itemLabel}>Comidas en escala internacional</Text>
                        <View style={styles.rowBetweenCenter}>
                          <Text style={styles.itemVal}>US$ {formatUSD(dolaresTotales)}</Text>
                          <Text style={styles.chevron}>{expandedViaticos.comidaInternacional ? '⌄' : '›'}</Text>
                        </View>
                      </TouchableOpacity>
                      {expandedViaticos.comidaInternacional && itemsComidaInternacional.map((it, idx) => (
                        <View key={idx} style={styles.subRowViatico}>
                          <Text style={styles.subRowDate}>{it.fecha}</Text>
                          <Text style={styles.subRowFlights}>{it.detalle}</Text>
                          <Text style={styles.subRowAmount}>US$ {formatUSD(it.montoUSD)}</Text>
                        </View>
                      ))}
                      <View style={[styles.rowItem, styles.noBorderBottom]}>
                        <Text style={styles.itemLabelBold}>Total</Text>
                        <Text style={styles.itemValBlue}>US$ {formatUSD(dolaresTotales)}</Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {activeTab === 'libro' && (
          <View>
            <View style={styles.libroTopRow}>
              <View>
                <Text style={styles.libroSmallLabel}>TU LIBRO 2026</Text>
                <View style={styles.libroHoursRow}>
                  <Text style={styles.libroBigHours}>{(officialAnnualSummary?.tvDecimal || totalYearDecimalHours).toFixed(1)}</Text>
                  <Text style={styles.libroHoursSub}>horas</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.syncReportsPill} onPress={() => { setForceFullYearSync(true); setSyncModalVisible(true); }}>
                <Text style={styles.syncReportsPillText}>↻ Sincronizar Reportes 2026</Text>
              </TouchableOpacity>
            </View>
            {logbookMonthsList.map(monthObj => {
              const isOpen = !!expandedLogbookMonths[monthObj.monthIndex];
              return (
                <View key={monthObj.monthIndex} style={styles.listCard}>
                  <TouchableOpacity style={[styles.rowItem, !isOpen && styles.noBorderBottom]} onPress={() => setExpandedLogbookMonths(p => ({ ...p, [monthObj.monthIndex]: !isOpen }))}>
                    <Text style={styles.itemLabelBold}>{monthObj.title}</Text>
                    <Text style={styles.itemVal}>{monthObj.totalHours.toFixed(1)}</Text>
                  </TouchableOpacity>
                  {isOpen && monthObj.legs.map((leg, i) => (
                    <View key={leg.key} style={[styles.logbookLegRow, i === monthObj.legs.length - 1 && styles.noBorderBottom]}>
                      <View style={styles.flexOne}>
                        <Text style={styles.itemLabelBold}>{leg.icaoRoute}</Text>
                        <Text style={styles.legSubText}>{leg.fecha} • {leg.nroVuelo}{leg.matricula ? ` • ${leg.matricula}` : ''}</Text>
                      </View>
                      <Text style={styles.itemVal}>{leg.totalHours}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        )}

        {activeTab === 'info' && (
          <View>
            <View style={styles.rowBetweenCenter}>
              <Text style={styles.sectionHeaderLight}>REPORTE DE ACTIVIDAD ANUAL 2026</Text>
              <TouchableOpacity onPress={() => { setForceFullYearSync(true); setSyncModalVisible(true); }}>
                <Text style={styles.syncYearLink}>↻ Sincronizar Año</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.emptyCard}>
              <View style={styles.rowBetweenCenter}>
                <View style={styles.annualCol}>
                  <Text style={styles.annualColLabel}>TIEMPO DE VUELO (TV)</Text>
                  <Text style={styles.annualColValBlue}>{officialAnnualSummary?.tvStr || formatMinToHM(totalYearTvMinutes)}</Text>
                  <Text style={styles.annualColSub}>({(officialAnnualSummary?.tvDecimal || totalYearDecimalHours).toFixed(1)} hs dec.)</Text>
                </View>
                <View style={styles.annualCol}>
                  <Text style={styles.annualColLabel}>TIEMPO SERVICIO (TSV)</Text>
                  <Text style={styles.annualColValDark}>{officialAnnualSummary?.tsvStr || formatMinToHM(totalYearTsMinutes)}</Text>
                  <Text style={styles.annualColSub}>{officialAnnualSummary?.tsvStr ? 'Reporte Anual Aeroweb' : `${logbookMonthsList.length} meses cargados`}</Text>
                </View>
                <View style={styles.annualColLast}>
                  <Text style={styles.annualColLabel}>ATERRIZAJES</Text>
                  <Text style={styles.annualColValDark}>{totalYearLegsOperated}</Text>
                  <Text style={styles.annualColSub}>Tramos</Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionHeaderLight}>HERRAMIENTAS OPERATIVAS AEROWEB</Text>
            <View style={styles.listCard}>
              <TouchableOpacity style={styles.calendarOptionRow} onPress={() => setChangesLogModalVisible(true)}>
                <View style={[styles.brandLogoCircle, styles.bgAmberSoft]}><Text style={styles.icon20}>🔔</Text></View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.calendarOptionTitle}>Modificaciones a tu Programación Original</Text>
                  <Text style={styles.calendarOptionSub}>Cambios día por día ({diasConModificaciones.length} con cambios)</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.calendarOptionRow} onPress={() => { setCrewQueryFlightNum(''); setCrewQueryDate(''); setCalendarPickerTarget(null); setCrewSearchResult(null); setShowCrewRawWeb(false); setCrewSearchModalVisible(true); }}>
                <View style={[styles.brandLogoCircle, styles.bgBlueSoft]}><Text style={styles.icon20}>👥</Text></View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.calendarOptionTitle}>Consulta de Tripulación</Text>
                  <Text style={styles.calendarOptionSub}>Buscador en vivo por número de vuelo y fecha con galones</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.calendarOptionRow} onPress={() => { setSublosOrig(''); setSublosDest(''); setSublosFlightNum(''); setSublosDate(''); setCalendarPickerTarget(null); setSublosResult(null); setShowSublosRawWeb(false); setSublosModalVisible(true); }}>
                <View style={[styles.brandLogoCircle, styles.bgPurpleSoft]}><Text style={styles.icon20}>🎫</Text></View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.calendarOptionTitle}>Sublos</Text>
                  <Text style={styles.calendarOptionSub}>Disponibilidad en cabina (W/Y), lista de espera y tripulación</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.calendarOptionRow} onPress={() => setPhoneDirectoryModalVisible(true)}>
                <View style={[styles.brandLogoCircle, styles.bgGreenSoft]}><Text style={styles.icon20}>📞</Text></View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.calendarOptionTitle}>Guía Telefónica</Text>
                  <Text style={styles.calendarOptionSub}>Directorio de tripulantes registrados con WhatsApp</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.calendarOptionRow} onPress={() => setFriendsModalVisible(true)}>
                <View style={[styles.brandLogoCircle, styles.bgOrangeSoft]}><Text style={styles.icon20}>🍻</Text></View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.calendarOptionTitle}>Amigos y Grupos</Text>
                  <Text style={styles.calendarOptionSub}>Creá grupos con código para copiar/compartir y días libres en común</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.calendarOptionRow, styles.noBorderBottom]} onPress={() => setVencimientosModalVisible(true)}>
                <View style={[styles.brandLogoCircle, styles.bgAmberSoft]}><Text style={styles.icon20}>📋</Text></View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.calendarOptionTitle}>Agenda de Vencimientos Aeroweb</Text>
                  <Text style={styles.calendarOptionSub}>Estado en vivo de tus Licencias, Cursos y Vacaciones</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* MODAL MODIFICACIONES AL PLAN ORIGINAL */}
      <Modal visible={changesLogModalVisible} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Modificaciones al Plan Original</Text>
            <TouchableOpacity onPress={() => setChangesLogModalVisible(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalPad}>
            {diasConModificaciones.length > 0 ? (
              diasConModificaciones.map((d) => (
                <TouchableOpacity
                  key={d.fechaDia}
                  style={styles.emptyCard}
                  onPress={() => {
                    setChangesLogModalVisible(false);
                    setSelectedFlight(d);
                    setModalViewMode('detail');
                    setModalVisible(true);
                  }}
                >
                  <Text style={styles.cardTitle}>{formatDayAndNumberHeader(d)}</Text>
                  <View style={styles.badgeFlotaContainer}>
                    <Text style={styles.badgeFlotaText}>
                      {(d.tramos || []).map(t => `${t.nroVuelo} (${t.ruta})`).join(' • ')}
                    </Text>
                  </View>
                  <View style={styles.borderTopTramo}>
                    {d.cambiosDetectados.map((c, idx) => (
                      <Text key={idx} style={styles.detailSub}>{c}</Text>
                    ))}
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.summaryText}>No se detectaron modificaciones respecto a tu programación original.</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* MODAL PRINCIPAL: DETALLE DE JORNADA + R.E.A + DETALLE AEROWEB 100% NATIVO */}
      <Modal visible={modalVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.modalContainer}>
          {modalViewMode === 'detail' ? (
            <View style={styles.flexOne}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Detalle de Jornada</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>✕</Text></TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.modalPad}>
                <Text style={styles.bigDate}>{formatDayAndNumberHeader(selectedFlight)}</Text>
                {(selectedFlight.isRPT || selectedFlight.cambiosDetectados?.length > 0) && (
                  <View style={selectedFlight.rptType === 'DELAY' ? styles.changeBannerAmber : styles.changeBannerRed}>
                    <Text style={selectedFlight.rptType === 'DELAY' ? styles.changeTextAmber : styles.changeTextRed}>🔔 Modificaciones respecto al Plan Original</Text>
                    {selectedFlight.cambiosDetectados?.map((cambio, idx) => (
                      <Text key={idx} style={selectedFlight.rptType === 'DELAY' ? styles.changeTextAmber : styles.changeTextRed}>{cambio}</Text>
                    ))}
                  </View>
                )}

                <View style={styles.emptyCard}>
                  <Text style={styles.cardTitle}>Tramos Operados</Text>
                  {selectedFlight.tramos?.map((t, i) => (
                    <View key={i} style={[styles.tramoRowModal, i > 0 && styles.borderTopTramo]}>
                      <View>
                        <Text style={styles.flightCardRoute}>{t.ruta}</Text>
                        <Text style={styles.detailSub}>Vuelo: {t.nroVuelo}{t.matricula ? ` • Matrícula: ${t.matricula}` : ''}</Text>
                      </View>
                      <Text style={styles.flightCardTime}>{t.horario}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.emptyCard}>
                  <Text style={styles.cardTitle}>Horarios Operativos</Text>
                  <View style={styles.timeGridModal}>
                    <View><Text style={styles.timeLabel}>PRESENTACIÓN</Text><Text style={styles.timeVal}>{selectedFlight.presentacionCongelada || selectedFlight.presentacion}</Text></View>
                    <View><Text style={styles.timeLabel}>VUELO (TV)</Text><Text style={styles.timeVal}>{selectedFlight.tiempoVuelo || '0h 00m'}</Text></View>
                    <View><Text style={styles.timeLabel}>T. DE SERVICIO</Text><Text style={styles.timeVal}>{selectedFlight.tiempoServicio || '0h 00m'}</Text></View>
                  </View>
                  <TouchableOpacity style={styles.pickupBtn} onPress={() => openDirectAerowebAutogestion(selectedFlight)}>
                    <Text style={styles.pickupBtnText}>🚕 Detalle del vuelo Aeroweb</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.emptyCard}>
                  <Text style={styles.cardTitle}>Límites y Seguridad</Text>
                  <Text style={styles.detailSub}>Último posible aterrizaje: <Text style={styles.textBlueBold}>{selectedFlight.ultimoAterrizaje}</Text></Text>
                  <Text style={styles.detailSub}>Vencimiento 4 hs de aeropuerto: <Text style={styles.textAmber}>{selectedFlight.vencimientoAeropuerto}</Text></Text>
                </View>

                {getUniqueAirportsForFlight(selectedFlight).length > 0 && (
                  <View style={styles.emptyCard}>
                    <Text style={styles.cardTitle}>R.E.A</Text>
                    <Text style={styles.detailSub}>Registro de Equipamiento de Aeropuerto • {getFleetKeyForRea(selectedFlight.flota)}</Text>
                    {getUniqueAirportsForFlight(selectedFlight).map(airportCode => {
                      const fleetKey = getFleetKeyForRea(selectedFlight.flota);
                      const stationInfo = reaDatabase[airportCode];
                      const eqList = stationInfo?.fleets?.[fleetKey] || [];
                      const missingCount = eqList.filter(e => !e.available).length;
                      const propioCount = eqList.filter(e => e.available && e.provider !== 'terceros').length;
                      const tercerosCount = eqList.filter(e => e.available && e.provider === 'terceros').length;
                      return (
                        <TouchableOpacity key={airportCode} style={styles.reaSummaryCard} onPress={() => { setSelectedReaStation(airportCode); setModalViewMode('rea'); }}>
                          <View style={styles.rowBetweenCenter}>
                            <Text style={styles.itemVal}>{airportCode} ({fleetKey.includes('MAX') ? 'B-MAX' : 'B-NG'})</Text>
                            <Text style={styles.detailSub}>{stationInfo ? `${stationInfo.sei} • ${stationInfo.updatedUtc}` : 'Consultar en vivo'} ›</Text>
                          </View>
                          {stationInfo && (
                            <View style={styles.reaBadgesRow}>
                              {missingCount > 0 && <View style={styles.badgeNoHay}><Text style={styles.badgeNoHayText}>{missingCount} NO HAY</Text></View>}
                              {propioCount > 0 && <View style={styles.badgePropio}><Text style={styles.badgePropioText}>{propioCount} PROPIO</Text></View>}
                              {tercerosCount > 0 && <View style={styles.badgeTerceros}><Text style={styles.badgeTercerosText}>{tercerosCount} TERCEROS</Text></View>}
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <View style={styles.emptyCard}>
                  <Text style={styles.cardTitle}>Tripulación Asignada ({selectedFlight.tripulacion?.length || 0})</Text>
                  {selectedFlight.tripulacion?.length > 0 ? (
                    selectedFlight.tripulacion.map((trip, idx) => {
                      const dirMatch = phoneDirectoryList.find(p => trip.nombre.toLowerCase().includes(p.nombre.split(',')[0].toLowerCase()));
                      const cleanName = sanitizeCrewName(trip.nombre);
                      const initials = cleanName.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('');
                      const photoSource = resolveCrewMemberPhoto(trip);

                      return (
                        <View key={idx} style={styles.crewRow}>
                          <View style={styles.crewAvatarWrap}>
                            {photoSource ? (
                              <Image source={{ uri: photoSource }} style={styles.crewAvatarImg} />
                            ) : (
                              <Text style={styles.crewAvatarInitials}>{initials}</Text>
                            )}
                          </View>
                          {renderEpaulette(trip.rangType)}
                          <View style={styles.crewTextWrap}>
                            <Text style={styles.crewNameText}>{cleanName}</Text>
                            <Text style={styles.crewRankText}>{trip.label} {trip.duty ? `(${trip.duty})` : ''}</Text>
                          </View>
                          <TouchableOpacity style={styles.whatsappCircleBtn} onPress={() => openWhatsAppChat(dirMatch?.telefono || '', trip.nombre)}>
                            <Text style={styles.whiteIcon13}>💬</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={styles.detailSub}>Sincronizá con "Actualizar" o abrí "Detalle del vuelo Aeroweb" para importar la tripulación oficial.</Text>
                  )}
                </View>
              </ScrollView>
            </View>
          ) : modalViewMode === 'rea' ? (
            <View style={styles.flexOne}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setModalViewMode('detail')}><Text style={styles.backLinkText}>‹ Volver</Text></TouchableOpacity>
                <Text style={styles.modalTitle}>R.E.A • {selectedReaStation}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>✕</Text></TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.modalPad}>
                {selectedReaStation && (
                  <View style={styles.emptyCard}>
                    <Text style={styles.bigDate}>{selectedReaStation} ({IATA_TO_ICAO[selectedReaStation] || selectedReaStation})</Text>
                    <Text style={styles.textBlueBold}>Flota programada: {getFleetKeyForRea(selectedFlight.flota)}</Text>
                    {((reaDatabase[selectedReaStation]?.fleets?.[getFleetKeyForRea(selectedFlight.flota)]) || []).map((eq, idx) => {
                      const isThirdParty = eq.available && eq.provider === 'terceros';
                      return (
                        <View key={idx} style={eq.available ? styles.reaRowAvailable : styles.reaRowMissing}>
                          <View style={styles.flexOne}>
                            <Text style={eq.available ? styles.reaItemGreen : styles.reaItemRed}>{eq.item}</Text>
                            <Text style={styles.detailSub}>
                              {!eq.available ? 'Equipos Propios: NO • Equipos de Terceros: NO' : (isThirdParty ? 'Equipos Propios: NO • Equipos de Terceros: SÍ' : 'Equipos Propios: SÍ')}
                            </Text>
                          </View>
                          <View style={eq.available ? styles.reaPillGreen : styles.reaPillRed}>
                            <Text style={styles.reaPillText}>{!eq.available ? 'NO HAY' : (isThirdParty ? 'SÍ (TERCEROS)' : 'SÍ (PROPIO)')}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.flexOne}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setModalViewMode('detail')}><Text style={styles.backLinkText}>‹ Volver</Text></TouchableOpacity>
                <Text style={styles.modalTitle}>{aerowebTargetMode === 'manana' ? 'Detalle Aeroweb (48h)' : 'Detalle Aeroweb (24h)'}</Text>
                <View style={styles.headerButtons}>
                  <TouchableOpacity style={styles.syncReportsPill} onPress={() => setShowRawAutogestionWeb(!showRawAutogestionWeb)}>
                    <Text style={styles.syncReportsPillText}>{showRawAutogestionWeb ? 'Vista App' : 'Ver Web'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>✕</Text></TouchableOpacity>
                </View>
              </View>

              <View style={styles.switchBarRow}>
                <TouchableOpacity style={[styles.quickAerowebSwitch, aerowebTargetMode === 'hoy' && styles.quickAerowebSwitchActive]} onPress={() => switchAeroweb24or48('hoy')}>
                  <Text style={[styles.quickAerowebSwitchText, aerowebTargetMode === 'hoy' && styles.whiteText]}>↺ 24 Actividad de Hoy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.quickAerowebSwitch, aerowebTargetMode === 'manana' && styles.quickAerowebSwitchActive]} onPress={() => switchAeroweb24or48('manana')}>
                  <Text style={[styles.quickAerowebSwitchText, aerowebTargetMode === 'manana' && styles.whiteText]}>↺ 48 Actividad de Mañana</Text>
                </TouchableOpacity>
              </View>

              {!showRawAutogestionWeb && (
                <ScrollView contentContainerStyle={styles.modalPad}>
                  {remisLoading && !autogestionLiveData && (
                    <View style={styles.emptyCard}>
                      <ActivityIndicator size="small" color={COLORS.primary} />
                      <Text style={styles.summaryText}>Obteniendo datos oficiales desde Actividades Programadas Aeroweb...</Text>
                    </View>
                  )}

                  <View style={styles.emptyCard}>
                    <Text style={styles.cardTitle}>📅 Actividad Programada</Text>
                    {(selectedFlight.tramos || []).map((t, idx) => (
                      <View key={idx} style={[styles.tramoRowModal, idx > 0 && styles.borderTopTramo]}>
                        <View>
                          <Text style={styles.flightCardRoute}>{t.nroVuelo} • {t.ruta}</Text>
                          <Text style={styles.detailSub}>{formatDayAndNumberHeader(selectedFlight)}</Text>
                        </View>
                        <Text style={styles.flightCardTime}>{t.horario}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.emptyCard}>
                    <Text style={styles.cardTitle}>🚕 Horario y búsqueda de tripulaciones</Text>
                    <View style={styles.reaSummaryCard}>
                      <Text style={styles.timeLabel}>PRÓXIMO HORARIO DE BÚSQUEDA (PICKUP)</Text>
                      <Text style={styles.itemValBlue}>
                        {autogestionLiveData?.pickupStr || selectedFlight.pickupTime || 'Consultando en Aeroweb...'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.emptyCard}>
                    <Text style={styles.cardTitle}>✈️ Estado del vuelo</Text>
                    {autogestionLiveData?.flightStatusObj ? (
                      <View>
                        <Text style={styles.textBlueBold}>
                          {autogestionLiveData.flightStatusObj.vuelo} • Equipo {autogestionLiveData.flightStatusObj.equipo}
                        </Text>
                        <View style={[styles.timeGridModal, { marginTop: 10 }]}>
                          <View>
                            <Text style={styles.timeLabel}>CLASE W (CAP {autogestionLiveData.flightStatusObj.wCap})</Text>
                            <Text style={styles.timeVal}>Booked: {autogestionLiveData.flightStatusObj.wBooked} • Disp: {autogestionLiveData.flightStatusObj.wDisp}</Text>
                          </View>
                          <View>
                            <Text style={styles.timeLabel}>CLASE Y (CAP {autogestionLiveData.flightStatusObj.yCap})</Text>
                            <Text style={styles.timeVal}>Booked: {autogestionLiveData.flightStatusObj.yBooked} • Disp: {autogestionLiveData.flightStatusObj.yDisp}</Text>
                          </View>
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.detailSub}>Sincronizando capacidad y reservas (W / Y) desde Aeroweb...</Text>
                    )}
                  </View>

                  <View style={styles.emptyCard}>
                    <Text style={styles.cardTitle}>
                      👥 Tripulación ({(autogestionLiveData?.tripulacion || selectedFlight.tripulacion || []).length})
                    </Text>
                    {(autogestionLiveData?.tripulacion || selectedFlight.tripulacion || []).map((trip, idx) => {
                      const dirMatch = phoneDirectoryList.find(p => trip.nombre.toLowerCase().includes(p.nombre.split(',')[0].toLowerCase()));
                      const cleanName = sanitizeCrewName(trip.nombre);
                      const initials = cleanName.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('');
                      const photoSource = resolveCrewMemberPhoto(trip);

                      return (
                        <View key={idx} style={styles.crewRow}>
                          <View style={styles.crewAvatarWrap}>
                            {photoSource ? (
                              <Image source={{ uri: photoSource }} style={styles.crewAvatarImg} />
                            ) : (
                              <Text style={styles.crewAvatarInitials}>{initials}</Text>
                            )}
                          </View>
                          {renderEpaulette(trip.rangType)}
                          <View style={styles.crewTextWrap}>
                            <Text style={styles.crewNameText}>{cleanName}</Text>
                            <Text style={styles.crewRankText}>{trip.label} {trip.duty ? `(${trip.duty})` : ''}</Text>
                          </View>
                          <TouchableOpacity style={styles.whatsappCircleBtn} onPress={() => openWhatsAppChat(dirMatch?.telefono || '', trip.nombre)}>
                            <Text style={styles.whiteIcon13}>💬</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>

                  <View style={styles.emptyCard}>
                    <Text style={styles.cardTitle}>✉️ Mensajes de NO OK</Text>
                    <Text style={styles.detailSub}>
                      Recuerde que al dar un NO OK, el mismo es válido para todas las actividades del día seleccionado.
                    </Text>
                    {[
                      'Motivo médico',
                      'Familiar enfermo',
                      'Documentación de vuelo / Habilitación',
                      'Programación',
                      'Fallecimiento familiar',
                      'Nacimiento / Paternidad'
                    ].map(motivo => (
                      <TouchableOpacity
                        key={motivo}
                        style={styles.rowItem}
                        onPress={() => setSelectedNoOkReason(motivo)}
                      >
                        <Text style={styles.itemLabel}>{motivo}</Text>
                        <Text style={styles.textBlueBold}>{selectedNoOkReason === motivo ? '●' : '○'}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.pickupBtn}
                      onPress={() => {
                        if (!selectedNoOkReason) {
                          Alert.alert('Seleccioná un motivo', 'Elegí primero el motivo de NO OK.');
                          return;
                        }
                        setShowRawAutogestionWeb(true);
                      }}
                    >
                      <Text style={styles.pickupBtnText}>Confirmar motivo en Aeroweb</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              )}

              <View style={showRawAutogestionWeb ? styles.flexOne : styles.hiddenWebView}>
                <WebView
                  ref={remisWebViewRef}
                  source={{ uri: URL_AEROWEB_HOME }}
                  injectedJavaScript={pickupInjectedJS}
                  injectedJavaScriptForMainFrameOnly={false}
                  onMessage={handleAutogestionMessage}
                  onLoadEnd={() => setRemisLoading(false)}
                  sharedCookiesEnabled={true}
                  thirdPartyCookiesEnabled={true}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                />
              </View>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* MODAL CONSULTA DE TRIPULACIÓN */}
      <Modal visible={crewSearchModalVisible} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Consulta de Tripulación</Text>
            <View style={styles.headerButtons}>
              {crewLiveTrigger && (
                <TouchableOpacity style={styles.syncReportsPill} onPress={() => setShowCrewRawWeb(!showCrewRawWeb)}>
                  <Text style={styles.syncReportsPillText}>{showCrewRawWeb ? 'Ocultar Web' : 'Ver Web'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => { setCrewLiveTrigger(null); setCrewSearchModalVisible(false); }} style={styles.closeButton}><Text style={styles.closeButtonText}>✕</Text></TouchableOpacity>
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.modalPad}>
            <View style={styles.cadCard}>
              <View style={styles.inputRowGap}>
                <View style={styles.flexOne}>
                  <Text style={styles.cadFieldLabel}>VUELO (AR)</Text>
                  <TextInput style={styles.cadInputBox} keyboardType="number-pad" placeholder="Ej: 1280" placeholderTextColor="#94A3B8" value={crewQueryFlightNum} onChangeText={setCrewQueryFlightNum} />
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.cadFieldLabel}>FECHA DE COMIENZO</Text>
                  <TouchableOpacity style={styles.cadInputBox} onPress={() => { setPickerMonth(today.getMonth()); setPickerYear(today.getFullYear()); setCalendarPickerTarget(calendarPickerTarget === 'crew' ? null : 'crew'); }}>
                    <Text style={crewQueryDate ? styles.dateTextSelected : styles.dateTextPlaceholder}>{crewQueryDate || 'Elegir fecha 📅'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {renderInlineCalendarPicker('crew')}
              <TouchableOpacity style={styles.cadSaveBtn} onPress={executeNativeCrewSearch}>
                <Text style={styles.cadSaveBtnText}>{crewSearchLoading ? 'Consultando en Aeroweb...' : 'Mostrar Tripulación'}</Text>
              </TouchableOpacity>
            </View>

            {crewLiveTrigger && (
              <View style={showCrewRawWeb ? styles.sublosWebWrap : styles.hiddenWebView}>
                <WebView
                  key={crewLiveTrigger.ts}
                  source={{ uri: URL_CONSULTA_TRIPULACION }}
                  injectedJavaScript={crewLiveInjectedJS}
                  injectedJavaScriptForMainFrameOnly={false}
                  onMessage={(e) => {
                    try {
                      const d = JSON.parse(e.nativeEvent.data);
                      if (d.type === 'crew_search_done' && d.rawText) {
                        const list = parseCrewFromRawText(d.rawText, null, crewAvatarsMap);
                        const routeHeader = d.rawText.match(/AR\s*\d{3,4}\s+([A-Z]{3}-[A-Z]{3})\s+(\d{6})/i);
                        setCrewSearchResult({
                          nroVuelo: `AR ${crewLiveTrigger.flightNum}`,
                          ruta: routeHeader ? routeHeader[1].replace('-', ' → ') : '',
                          fecha: crewLiveTrigger.dateStr,
                          tripulacion: list
                        });
                        setShowCrewRawWeb(false);
                        setCrewSearchLoading(false);
                        setCrewLiveTrigger(null);
                      }
                    } catch (err) {}
                  }}
                  sharedCookiesEnabled={true}
                  thirdPartyCookiesEnabled={true}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                />
              </View>
            )}

            {crewSearchResult && (
              <View style={styles.emptyCard}>
                <Text style={styles.cardTitle}>
                  {crewSearchResult.nroVuelo} {crewSearchResult.ruta ? `• ${crewSearchResult.ruta}` : ''} • {crewSearchResult.fecha}
                </Text>
                <Text style={styles.cadFieldLabel}>TRIPULACIÓN DEL VUELO ({crewSearchResult.tripulacion.length})</Text>
                {crewSearchResult.tripulacion.length > 0 ? (
                  crewSearchResult.tripulacion.map((trip, idx) => {
                    const dirMatch = phoneDirectoryList.find(p => trip.nombre.toLowerCase().includes(p.nombre.split(',')[0].toLowerCase()));
                    const cleanName = sanitizeCrewName(trip.nombre);
                    const initials = cleanName.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('');
                    const photoSource = resolveCrewMemberPhoto(trip);
                    return (
                      <View key={idx} style={styles.crewRow}>
                        <View style={styles.crewAvatarWrap}>
                          {photoSource ? (
                            <Image source={{ uri: photoSource }} style={styles.crewAvatarImg} />
                          ) : (
                            <Text style={styles.crewAvatarInitials}>{initials}</Text>
                          )}
                        </View>
                        {renderEpaulette(trip.rangType)}
                        <View style={styles.crewTextWrap}>
                          <Text style={styles.crewNameText}>{cleanName}</Text>
                          <Text style={styles.crewRankText}>{trip.label} {trip.duty ? `(${trip.duty})` : ''}</Text>
                        </View>
                        <TouchableOpacity style={styles.whatsappCircleBtn} onPress={() => openWhatsAppChat(dirMatch?.telefono || '', trip.nombre)}>
                          <Text style={styles.whiteIcon13}>💬</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.detailSub}>No se encontró nómina asignada para ese vuelo y fecha en AeroWeb.</Text>
                )}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* MODAL SUBLOS */}
      <Modal visible={sublosModalVisible} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Sublos • Seguí tu Embarque</Text>
            <View style={styles.headerButtons}>
              {sublosLiveTrigger && (
                <TouchableOpacity style={styles.syncReportsPill} onPress={() => setShowSublosRawWeb(!showSublosRawWeb)}>
                  <Text style={styles.syncReportsPillText}>{showSublosRawWeb ? 'Vista App' : 'Ver Web'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => { setSublosLiveTrigger(null); setSublosModalVisible(false); }} style={styles.closeButton}><Text style={styles.closeButtonText}>✕</Text></TouchableOpacity>
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.modalPad}>
            <View style={styles.cadCard}>
              <View style={styles.inputRowGap}>
                <View style={styles.flexOne}>
                  <Text style={styles.cadFieldLabel}>ORIGEN</Text>
                  <TextInput style={styles.cadInputBox} autoCapitalize="characters" placeholder="Ej: EZE" placeholderTextColor="#94A3B8" value={sublosOrig} onChangeText={v => setSublosOrig(v.toUpperCase())} />
                </View>
                <TouchableOpacity style={styles.swapAirportsBtn} onPress={() => { const tmp = sublosOrig; setSublosOrig(sublosDest); setSublosDest(tmp); }}>
                  <Text style={styles.textBlueBold}>⇄</Text>
                </TouchableOpacity>
                <View style={styles.flexOne}>
                  <Text style={styles.cadFieldLabel}>DESTINO</Text>
                  <TextInput style={styles.cadInputBox} autoCapitalize="characters" placeholder="Ej: MIA" placeholderTextColor="#94A3B8" value={sublosDest} onChangeText={v => setSublosDest(v.toUpperCase())} />
                </View>
              </View>
              <View style={styles.inputRowGap}>
                <View style={styles.flexOne}>
                  <Text style={styles.cadFieldLabel}>FECHA</Text>
                  <TouchableOpacity style={styles.cadInputBox} onPress={() => { setPickerMonth(today.getMonth()); setPickerYear(today.getFullYear()); setCalendarPickerTarget(calendarPickerTarget === 'sublos' ? null : 'sublos'); }}>
                    <Text style={sublosDate ? styles.dateTextSelected : styles.dateTextPlaceholder}>{sublosDate || 'Elegir fecha 📅'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.cadFieldLabel}>VUELO AR</Text>
                  <TextInput style={styles.cadInputBox} keyboardType="number-pad" placeholder="Ej: 1304" placeholderTextColor="#94A3B8" value={sublosFlightNum} onChangeText={setSublosFlightNum} />
                </View>
              </View>
              {renderInlineCalendarPicker('sublos')}
              <TouchableOpacity style={styles.cadSaveBtn} onPress={executeNativeSublosSearch}>
                <Text style={styles.cadSaveBtnText}>{sublosLoading ? 'Consultando en Aeroweb...' : 'Buscar'}</Text>
              </TouchableOpacity>
            </View>

            {sublosResult && (
              <View style={styles.emptyCard}>
                <Text style={styles.cardTitle}>
                  {sublosOrig || 'ORIGEN'} → {sublosDest || 'DESTINO'} {sublosFlightNum ? `• AR ${sublosFlightNum}` : ''}
                </Text>
                <Text style={styles.textBlueBold}>Equipo: {sublosResult.equipo}</Text>
                <View style={[styles.timeGridModal, { marginTop: 10 }]}>
                  <View>
                    <Text style={styles.timeLabel}>DISPONIBLES W</Text>
                    <Text style={styles.timeVal}>{sublosResult.wDisp}</Text>
                  </View>
                  <View>
                    <Text style={styles.timeLabel}>DISPONIBLES Y</Text>
                    <Text style={styles.timeVal}>{sublosResult.yDisp}</Text>
                  </View>
                </View>
                <View style={styles.borderTopTramo}>
                  <View style={styles.rowItem}>
                    <Text style={styles.itemLabel}>Sujetos a espacio</Text>
                    <Text style={styles.itemVal}>{sublosResult.sujetos || '0'}</Text>
                  </View>
                  <View style={[styles.rowItem, styles.noBorderBottom]}>
                    <Text style={styles.itemLabel}>Pasajes sin emitir</Text>
                    <Text style={styles.itemVal}>{sublosResult.sinEmitir || '0'}</Text>
                  </View>
                </View>
              </View>
            )}

            {sublosLiveTrigger && (
              <View style={showSublosRawWeb ? styles.sublosWebWrap : styles.hiddenWebView}>
                <WebView
                  key={sublosLiveTrigger.ts}
                  source={{ uri: URL_AEROWEB_SUBLOS }}
                  injectedJavaScript={sublosLiveInjectedJS}
                  injectedJavaScriptForMainFrameOnly={false}
                  onMessage={(e) => {
                    try {
                      const d = JSON.parse(e.nativeEvent.data);
                      if (d.type === 'sublos_parsed' && d.payload) {
                        setSublosResult(d.payload);
                        setShowSublosRawWeb(false);
                        setSublosLoading(false);
                      }
                    } catch (err) {}
                  }}
                  onLoadEnd={() => setSublosLoading(false)}
                  sharedCookiesEnabled={true}
                  thirdPartyCookiesEnabled={true}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                />
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* MODAL GUÍA TELEFÓNICA */}
      <Modal visible={phoneDirectoryModalVisible} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Guía Telefónica</Text>
            <TouchableOpacity onPress={() => setPhoneDirectoryModalVisible(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>✕</Text></TouchableOpacity>
          </View>
          <View style={styles.modalPad}>
            <Text style={styles.cadFieldLabel}>BUSCAR TRIPULANTE REGISTRADO</Text>
            <TextInput style={styles.cadInputBox} placeholder="Nombre, apellido, flota o cargo..." placeholderTextColor="#94A3B8" value={phoneSearchQuery} onChangeText={setPhoneSearchQuery} />
            <View style={styles.phoneInputRow}>
              <TextInput style={[styles.cadInputBox, styles.flexOne]} placeholder="Tu WhatsApp (ej: +54911...)" placeholderTextColor="#94A3B8" keyboardType="phone-pad" value={newContactPhoneInput} onChangeText={setNewContactPhoneInput} />
              <TouchableOpacity style={styles.savePhoneBtn} onPress={() => { if (!newContactPhoneInput.trim()) return; registerUserInPhoneDirectory(userProfileState, newContactPhoneInput.trim()); Alert.alert('Guardado', 'Tu número de WhatsApp quedó registrado.'); setNewContactPhoneInput(''); }}>
                <Text style={styles.syncBtnText}>Guardar mi N°</Text>
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.modalPad}>
            <View style={styles.listCard}>
              {filteredPhoneDirectory.map((person, idx) => (
                <View key={person.id || idx} style={[styles.rowItem, idx === filteredPhoneDirectory.length - 1 && styles.noBorderBottom]}>
                  <View style={styles.flexOne}>
                    <Text style={styles.itemLabelBold}>{person.nombre}</Text>
                    <Text style={styles.detailSub}>{person.flota} • {person.cargo}</Text>
                  </View>
                  <TouchableOpacity style={styles.whatsappGreenCircle} onPress={() => openWhatsAppChat(person.telefono, person.nombre)}>
                    <Text style={styles.whiteIcon13}>💬</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* MODAL AMIGOS Y GRUPOS */}
      <Modal visible={friendsModalVisible} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Amigos y Grupos</Text>
            <TouchableOpacity onPress={() => setFriendsModalVisible(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalPad}>
            <View style={styles.cadCard}>
              <Text style={styles.cadFieldLabel}>CREAR NUEVO GRUPO</Text>
              <TextInput style={styles.cadInputBox} placeholder="Nombre del grupo (ej: Amigos 737)" placeholderTextColor="#94A3B8" value={newGroupNameInput} onChangeText={setNewGroupNameInput} />
              <TouchableOpacity
                style={styles.cadSaveBtn}
                onPress={async () => {
                  if (!newGroupNameInput.trim()) return;
                  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                  let randomCode = '';
                  for (let i = 0; i < 6; i++) randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
                  const newGrp = { id: String(Date.now()), nombre: newGroupNameInput.trim(), codigo: randomCode, integrantes: [userProfileState?.nombre || 'Mi Programación'] };
                  const nextGroups = [newGrp, ...friendGroupsList];
                  setFriendGroupsList(nextGroups);
                  await AsyncStorage.setItem('friend_groups_list', JSON.stringify(nextGroups));
                  setNewGroupNameInput('');
                  Alert.alert('Grupo creado', `Código: ${randomCode}`, [
                    { text: 'Cerrar', style: 'cancel' },
                    { text: '📤 Copiar / Compartir Código', onPress: () => shareOrCopyGroupCode(newGrp.nombre, randomCode) }
                  ]);
                }}
              >
                <Text style={styles.cadSaveBtnText}>Crear Grupo y Generar Código (6 dígitos)</Text>
              </TouchableOpacity>
            </View>
            {friendGroupsList.length > 0 && (
              <View style={styles.emptyCard}>
                <Text style={styles.cardTitle}>Tus Grupos Activos</Text>
                {friendGroupsList.map(g => (
                  <View key={g.id} style={styles.groupItemWrap}>
                    <View style={styles.rowBetweenCenter}>
                      <Text style={styles.itemLabelBold}>{g.nombre}</Text>
                      <TouchableOpacity style={styles.shareCodePill} onPress={() => shareOrCopyGroupCode(g.nombre, g.codigo)}>
                        <Text style={styles.shareCodePillText}>📋 {g.codigo} (Copiar / Compartir)</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={styles.findFreeDaysBtn}
                      onPress={() => {
                        const myFreeDays = rosterOrdenado.filter(d => isOffOrFreeOrVacation(d) && getMsFromDateStr(d.fechaDia) >= todayMs).map(d => `${formatDayAndNumberHeader(d)} (${d.specialName})`);
                        setMatchingFreeDaysResult({ grupo: g.nombre, dias: myFreeDays.length > 0 ? myFreeDays : ['No hay días libres futuros cargados en este mes.'] });
                      }}
                    >
                      <Text style={styles.syncReportsPillText}>🔍 Buscar días libres en común (D/L, OFF, VAC)</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            {matchingFreeDaysResult && (
              <View style={styles.emptyCard}>
                <Text style={styles.cardTitle}>📅 Días libres en "{matchingFreeDaysResult.grupo}"</Text>
                {matchingFreeDaysResult.dias.map((d, i) => <Text key={i} style={styles.detailSub}>• {d}</Text>)}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* MODAL AGENDA DE VENCIMIENTOS AEROWEB */}
      <Modal visible={vencimientosModalVisible} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeaderBlue}>
            <View>
              <Text style={styles.modalTitleWhite}>AGENDA DE VENCIMIENTOS</Text>
              {lastVencSyncStr ? <Text style={styles.vencSyncSub}>Extraído de Aeroweb • {lastVencSyncStr}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => setVencimientosModalVisible(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>✕</Text></TouchableOpacity>
          </View>
          {vencimientosData.licencias.length === 0 && vencimientosData.cursos.length === 0 ? (
            <View style={styles.flexOne}>
              <View style={styles.vencBannerTop}>
                <Text style={styles.changeTextAmber}>
                  Obteniendo tus vencimientos oficiales desde tu sesión de Aeroweb...
                </Text>
              </View>
              <View style={styles.hiddenWebView}>
                <WebView
                  source={{ uri: URL_AEROWEB_HOME }}
                  injectedJavaScript={webToolInjectedJS}
                  injectedJavaScriptForMainFrameOnly={false}
                  onMessage={handleVencimientosWebMessage}
                  sharedCookiesEnabled={true}
                  thirdPartyCookiesEnabled={true}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                />
              </View>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.modalPad}>
              <View style={styles.vencSectionCard}>
                <Text style={styles.vencSectionHeader}>LICENCIAS</Text>
                {vencimientosData.licencias.map((it, i, arr) => renderVencimientoRow(it, i, i === arr.length - 1))}
              </View>
              <View style={styles.vencSectionCard}>
                <Text style={styles.vencSectionHeader}>CURSOS</Text>
                {vencimientosData.cursos.map((it, i, arr) => renderVencimientoRow(it, i, i === arr.length - 1))}
              </View>
              <View style={styles.vencSectionCard}>
                <Text style={styles.vencSectionHeader}>VACACIONES</Text>
                {vencimientosData.vacaciones.map((it, i, arr) => renderVencimientoRow(it, i, i === arr.length - 1))}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      <Modal visible={syncModalVisible} animationType="slide">
        <AerowebSyncScreen fullYearSync={forceFullYearSync} onClose={() => { setSyncModalVisible(false); setForceFullYearSync(false); }} onDataParsed={handleDataParsed} />
      </Modal>

      <Modal visible={profileModalVisible} animationType="slide">
        <ProfileSetupScreen
          onClose={() => setProfileModalVisible(false)}
          onProfileUpdated={async (newProfile) => {
            setUserProfileState(newProfile);
            setEsComandante(newProfile.rank === 'Comandante');
            registerUserInPhoneDirectory(newProfile);
            const savedAvatars = await AsyncStorage.getItem('crew_avatars_registry');
            if (savedAvatars) setCrewAvatarsMap(JSON.parse(savedAvatars));
            registerProfileWithBackend(newProfile);
            setProfileModalVisible(false);
            setForceFullYearSync(false);
            setSyncModalVisible(true);
          }}
          onLogout={() => { setUserProfileState(null); setEsComandante(false); setRosterData([]); setRosterOriginal([]); }}
        />
      </Modal>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('hoy')}><Text style={[styles.tabIcon, activeTab === 'hoy' && styles.tabIconActive]}>✈️</Text><Text style={[styles.tabText, activeTab === 'hoy' && styles.tabTextActive]}>Hoy</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('actividad')}><Text style={[styles.tabIcon, activeTab === 'actividad' && styles.tabIconActive]}>📅</Text><Text style={[styles.tabText, activeTab === 'actividad' && styles.tabTextActive]}>Actividad</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('viaticos')}><Text style={[styles.tabIcon, activeTab === 'viaticos' && styles.tabIconActive]}>$</Text><Text style={[styles.tabText, activeTab === 'viaticos' && styles.tabTextActive]}>Viáticos</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('libro')}><Text style={[styles.tabIcon, activeTab === 'libro' && styles.tabIconActive]}>📖</Text><Text style={[styles.tabText, activeTab === 'libro' && styles.tabTextActive]}>Libro</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('info')}><Text style={[styles.tabIcon, activeTab === 'info' && styles.tabIconActive]}>🗓️</Text><Text style={[styles.tabText, activeTab === 'info' && styles.tabTextActive]}>Info</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  flexOne: { flex: 1 },
  centerItems: { alignItems: 'center' },
  centerRowBottom14: { flexDirection: 'row', justifyContent: 'center', marginBottom: 14 },
  rowBetweenCenter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noBorderBottom: { borderBottomWidth: 0 },
  pastOpacity: { opacity: 0.55 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 15, paddingBottom: 10, backgroundColor: COLORS.cardBg, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary },
  headerSubtitle: { fontSize: 11, color: COLORS.textMuted },
  headerButtons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  syncBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  syncBtnText: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
  profileBadgeBtn: { backgroundColor: COLORS.borderLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primary },
  profileBadgeText: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold' },
  scrollContent: { padding: 20, paddingBottom: 100 },
  modalPad: { padding: 18, paddingBottom: 80 },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 10, gap: 14 },
  calendarIcon: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  calendarDayName: { fontSize: 10, color: '#ffffff', fontWeight: 'bold', textTransform: 'uppercase' },
  calendarDayNumber: { fontSize: 16, color: '#ffffff', fontWeight: 'bold' },
  todayFullDayText: { fontSize: 18, fontWeight: 'bold', color: COLORS.textDark, flex: 1 },
  noActivityText: { fontSize: 15, fontWeight: '600', color: '#64748B', marginVertical: 10 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginTop: 10, marginBottom: 12 },
  globitoContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0F2FE', alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 30, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  globitoDate: { fontSize: 13, fontWeight: 'bold', color: '#0284C7' },
  globitoSeparator: { width: 1, height: 16, backgroundColor: '#CBD5E1', marginHorizontal: 12 },
  globitoIcon: { fontSize: 16, marginRight: 6 },
  globitoText: { fontSize: 14, fontWeight: '600', color: '#0284C7' },
  flightCard: { backgroundColor: COLORS.cardBg, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.borderLight },
  flightCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  flightCardHeaderLeft: { flex: 1, paddingRight: 6 },
  flightCardDate: { fontSize: 15, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 4 },
  badgeFlotaContainer: { backgroundColor: COLORS.primary, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeFlotaText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
  flightCardHeaderRight: { marginLeft: 10, alignItems: 'center' },
  flightCardHeaderLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600', marginBottom: 2 },
  flightCardHeaderVal: { fontSize: 14, fontWeight: 'bold', color: COLORS.textDark },
  flightCardHeaderValBlue: { fontSize: 14, fontWeight: 'bold', color: COLORS.primary },
  metricsRowCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 4 },
  metricPill: { flexDirection: 'row', alignItems: 'center' },
  metricPillLabel: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  metricPillVal: { fontSize: 12, fontWeight: 'bold', color: COLORS.textDark },
  changeBannerAmber: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginTop: 8, marginBottom: 4, width: '100%' },
  changeBannerRed: { backgroundColor: '#FEE2E2', borderColor: '#EF4444', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginTop: 8, marginBottom: 4, width: '100%' },
  changeTextAmber: { color: '#B45309', fontSize: 12, fontWeight: 'bold', marginVertical: 1 },
  changeTextRed: { color: '#DC2626', fontSize: 12, fontWeight: 'bold', marginVertical: 1 },
  flightCardDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 10 },
  flightCardTramoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  flightCardRoute: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark },
  flightCardFlightNum: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  flightCardTime: { fontSize: 14, fontWeight: '600', color: COLORS.textDark },
  actividadSpecialCard: { backgroundColor: COLORS.cardBg, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.borderLight, borderLeftWidth: 6, borderLeftColor: '#64748B' },
  actividadSpecialCardContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  actividadSpecialCardDate: { fontSize: 14, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 2 },
  actividadSpecialCardTitle: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  actividadSpecialCardIcon: { fontSize: 18, color: '#10B981', marginLeft: 10 },
  emptyCard: { backgroundColor: COLORS.cardBg, borderRadius: 14, padding: 18, marginBottom: 15, borderWidth: 1, borderColor: COLORS.borderLight },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 8 },
  summaryText: { fontSize: 13, color: COLORS.textDark, marginTop: 4, textAlign: 'center' },
  reaSummaryCard: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  reaBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  badgeNoHay: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeNoHayText: { fontSize: 11.5, fontWeight: '800', color: '#DC2626' },
  badgePropio: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgePropioText: { fontSize: 11.5, fontWeight: '800', color: '#16A34A' },
  badgeTerceros: { backgroundColor: '#E0F2FE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeTercerosText: { fontSize: 11.5, fontWeight: '800', color: '#0284C7' },
  reaRowAvailable: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 8, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  reaRowMissing: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  reaItemGreen: { fontSize: 14, fontWeight: '700', color: '#166534' },
  reaItemRed: { fontSize: 14, fontWeight: '700', color: '#991B1B' },
  reaPillGreen: { backgroundColor: '#16A34A', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  reaPillRed: { backgroundColor: '#DC2626', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  reaPillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  inlineCalendarCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginTop: 10, marginBottom: 6, borderWidth: 1, borderColor: '#CBD5E1' },
  calHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  calHeaderTitle: { fontSize: 15, fontWeight: '800', color: COLORS.textDark },
  calWeekRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 6 },
  calWeekDayText: { width: 34, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#64748B' },
  calDaysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calEmptyCell: { width: '14.28%', height: 36 },
  calDayCell: { width: '14.28%', height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  calDayCellSelected: { backgroundColor: COLORS.primary },
  calDayText: { fontSize: 13.5, fontWeight: '600', color: COLORS.textDark },
  calDayTextSelected: { color: '#FFFFFF', fontWeight: '800' },
  whatsappCircleBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#22C55E', justifyContent: 'center', alignItems: 'center' },
  whatsappGreenCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#22C55E', justifyContent: 'center', alignItems: 'center' },
  whiteIcon13: { fontSize: 13, color: '#FFFFFF' },
  monthSelectorLight: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  monthBtnLight: { width: 36, height: 36, backgroundColor: '#f1f5f9', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  monthBtnTextLight: { color: '#475569', fontSize: 18, fontWeight: 'bold' },
  monthTitleLight: { fontSize: 20, fontWeight: 'bold', color: COLORS.textDark },
  monthSubtitleLight: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  sectionHeaderLight: { fontSize: 12, color: '#64748b', fontWeight: 'bold', letterSpacing: 1, marginBottom: 8, marginTop: 10, marginLeft: 10 },
  listCard: { backgroundColor: COLORS.cardBg, borderRadius: 14, paddingHorizontal: 18, marginBottom: 15, borderWidth: 1, borderColor: COLORS.borderLight },
  chevron: { fontSize: 18, color: '#64748b', marginLeft: 8 },
  subRowViatico: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingLeft: 4, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  subRowDate: { fontSize: 14, color: '#64748b', width: 55, fontWeight: '500' },
  subRowFlights: { flex: 1, fontSize: 14, color: '#475569', fontWeight: '500' },
  subRowAmount: { fontSize: 14, color: '#475569', fontWeight: '600', marginRight: 8 },
  logbookLegRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  legSubText: { fontSize: 13, color: '#64748B', marginTop: 2 },
  libroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  libroSmallLabel: { fontSize: 11, fontWeight: 'bold', color: '#64748B', letterSpacing: 1 },
  libroHoursRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  libroBigHours: { fontSize: 40, fontWeight: '800', color: COLORS.textDark },
  libroHoursSub: { fontSize: 16, color: '#64748B', fontWeight: '600' },
  syncReportsPill: { backgroundColor: '#E0F2FE', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: COLORS.primary },
  syncReportsPillText: { fontSize: 12, fontWeight: 'bold', color: COLORS.primary },
  syncYearLink: { fontSize: 11, fontWeight: 'bold', color: COLORS.primary, marginRight: 6 },
  annualCol: { flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: '#E2E8F0' },
  annualColLast: { flex: 0.8, alignItems: 'center' },
  annualColLabel: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  annualColValBlue: { fontSize: 18, fontWeight: '800', color: COLORS.primary, marginTop: 4 },
  annualColValDark: { fontSize: 18, fontWeight: '800', color: COLORS.textDark, marginTop: 4 },
  annualColSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  calendarOptionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  brandLogoCircle: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  bgAmberSoft: { backgroundColor: '#FEF3C7' },
  bgBlueSoft: { backgroundColor: '#E0F2FE' },
  bgPurpleSoft: { backgroundColor: '#EDE9FE' },
  bgGreenSoft: { backgroundColor: '#DCFCE7' },
  bgOrangeSoft: { backgroundColor: '#FFEDD5' },
  icon20: { fontSize: 20 },
  optionTextWrap: { flex: 1, marginHorizontal: 14 },
  calendarOptionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark },
  calendarOptionSub: { fontSize: 12, color: '#64748B', marginTop: 3, lineHeight: 16 },
  vencSectionCard: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  vencSectionHeader: { fontSize: 15, fontWeight: '800', color: '#0277BD', marginBottom: 8 },
  vencRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  vencLabel: { fontSize: 12.5, flex: 1, paddingRight: 10, color: COLORS.textDark, fontWeight: '600' },
  vencDate: { fontSize: 13, fontWeight: '800', color: COLORS.textDark },
  textRed: { color: '#DC2626', fontWeight: '800' },
  textAmber: { color: '#D97706', fontWeight: '800' },
  textBlueBold: { color: COLORS.primary, fontWeight: 'bold' },
  cadCard: { backgroundColor: COLORS.cardBg, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.borderLight },
  cadFieldLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 0.8, marginBottom: 6 },
  cadInputBox: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, fontWeight: '600', color: COLORS.textDark },
  dateTextSelected: { fontSize: 15, fontWeight: '600', color: COLORS.textDark },
  dateTextPlaceholder: { fontSize: 15, fontWeight: '600', color: '#94A3B8' },
  inputRowGap: { flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'flex-end' },
  swapAirportsBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E0F2FE', borderWidth: 1, borderColor: '#BAE6FD', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  cadSaveBtn: { backgroundColor: COLORS.primary, paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 10 },
  cadSaveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  sublosWebWrap: { height: 420, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#CBD5E1', marginBottom: 16 },
  phoneInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  savePhoneBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 },
  groupItemWrap: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  shareCodePill: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#F59E0B' },
  shareCodePillText: { fontSize: 12, fontWeight: '800', color: '#B45309' },
  findFreeDaysBtn: { backgroundColor: '#E0F2FE', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  crewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  crewTextWrap: { flex: 1, marginLeft: 12 },
  crewAvatarWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E0F2FE', borderWidth: 1, borderColor: '#BAE6FD', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginRight: 8 },
  crewAvatarImg: { width: 38, height: 38, resizeMode: 'cover' },
  crewAvatarInitials: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  epauletteContainer: { width: 44, height: 28, backgroundColor: '#111827', borderRadius: 4, justifyContent: 'space-evenly', paddingVertical: 3, paddingHorizontal: 2, borderWidth: 1, borderColor: '#374151' },
  goldStripe: { height: 2, backgroundColor: '#F59E0B', borderRadius: 1, width: '100%' },
  epauletteContainerBlue: { width: 44, height: 28, backgroundColor: '#1E3A8A', borderRadius: 4, justifyContent: 'space-evenly', paddingVertical: 4, paddingHorizontal: 2, borderWidth: 1, borderColor: '#3B82F6' },
  silverStripe: { height: 2, backgroundColor: '#E2E8F0', borderRadius: 1, width: '100%' },
  epauletteContainerDots: { width: 44, height: 28, backgroundColor: '#111827', borderRadius: 4, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#374151' },
  dotsText: { color: '#9CA3AF', fontSize: 12, fontWeight: 'bold', letterSpacing: 2 },
  crewNameText: { fontSize: 13, fontWeight: 'bold', color: COLORS.textDark },
  crewRankText: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  toggleContainer: { flexDirection: 'row', backgroundColor: COLORS.borderLight, borderRadius: 10, padding: 4, marginBottom: 15 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: { backgroundColor: COLORS.primary },
  toggleText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  toggleTextActive: { color: '#ffffff' },
  rowItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  itemLabel: { fontSize: 15, color: '#334155', fontWeight: '500' },
  itemLabelBold: { fontSize: 16, color: COLORS.textDark, fontWeight: 'bold' },
  itemVal: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark },
  itemValBlue: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary },
  modalContainer: { flex: 1, backgroundColor: COLORS.bgLight },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, backgroundColor: COLORS.cardBg },
  modalHeaderBlue: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#0277BD' },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.textDark },
  modalTitleWhite: { fontSize: 17, fontWeight: 'bold', color: '#FFFFFF' },
  vencSyncSub: { fontSize: 11, color: '#E0F2FE', marginTop: 2 },
  vencBannerTop: { padding: 12, backgroundColor: '#FEF3C7', borderBottomWidth: 1, borderBottomColor: '#F59E0B' },
  backLinkText: { fontSize: 18, color: COLORS.primary, fontWeight: 'bold' },
  closeButton: { backgroundColor: '#f1f5f9', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  closeButtonText: { fontSize: 18, fontWeight: 'bold', color: '#475569' },
  bigDate: { fontSize: 22, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 15 },
  tramoRowModal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  borderTopTramo: { borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 8, paddingTop: 6 },
  detailSub: { fontSize: 13, color: '#475569', marginVertical: 2 },
  timeGridModal: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: 12, borderRadius: 8 },
  timeLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted },
  timeVal: { fontSize: 15, fontWeight: 'bold', color: COLORS.textDark, marginTop: 2 },
  pickupBtn: { backgroundColor: COLORS.primary, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 10, marginTop: 12, alignItems: 'center' },
  pickupBtnHoy: { backgroundColor: COLORS.primary, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 10, marginTop: -4, marginBottom: 16, alignItems: 'center' },
  pickupBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  switchBarRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F1F5F9' },
  quickAerowebSwitch: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center' },
  quickAerowebSwitchActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  quickAerowebSwitchText: { fontSize: 12, fontWeight: 'bold', color: '#334155' },
  whiteText: { color: '#FFFFFF' },
  hiddenWebView: { width: 0, height: 0, opacity: 0, overflow: 'hidden' },
  tabBar: { flexDirection: 'row', position: 'absolute', bottom: 0, left: 0, right: 0, height: 65, backgroundColor: COLORS.cardBg, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingBottom: 10 },
  tabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabIcon: { fontSize: 19, opacity: 0.5 },
  tabIconActive: { opacity: 1 },
  tabText: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  tabTextActive: { color: COLORS.primary, fontWeight: 'bold' }
});