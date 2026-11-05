import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  AppState
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage'; 
import { WebView } from 'react-native-webview';
import * as Notifications from 'expo-notifications';

import { COLORS } from './src/theme/colors';
import ProfileSetupScreen from './src/modules/auth/ProfileSetupScreen';
import AerowebSyncScreen from './src/modules/aeroweb/AerowebSyncScreen';
import { getEncryptedData } from './src/services/storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
});

const URL_AUTOGESTION_LOGIN = 'https://ssl.aerolineas.com.ar/FORMS/ActividadesProgramadas/Autogestion';
const URL_PICKUP_HOY = 'https://ssl.aerolineas.com.ar/FORMS/ActividadesProgramadas/Autogestion/IndexPost';
const URL_PICKUP_MANANA = 'https://ssl.aerolineas.com.ar/FORMS/ActividadesProgramadas/Autogestion/MananaPost';

const DESTINOS_TRES_PILOTOS = ['LIM', 'SSA', 'BOG', 'CUN', 'PUJ', 'MIA', 'MAD', 'FCO', 'JFK'];
const DESTINOS_INTERNACIONALES = ['GIG', 'SCL', 'GRU', 'MVD', 'ASU', 'LIM', 'SSA', 'BOG', 'CUN', 'PUJ', 'MIA', 'MAD', 'FCO', 'JFK', 'FLN', 'POA', 'CUR', 'SDQ', 'VVI', 'PDP'];

export default function App() {
  const [activeTab, setActiveTab] = useState('hoy');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalViewMode, setModalViewMode] = useState('detail'); // 'detail' | 'aeroweb'
  const [aerowebTargetMode, setAerowebTargetMode] = useState('hoy'); // 'hoy' (24h) | 'manana' (48h)
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [silentSyncRunning, setSilentSyncRunning] = useState(false);
  const [lastSyncTimeStr, setLastSyncTimeStr] = useState('');

  // Filas desplegables en la pestaña Viáticos
  const [expandedViaticos, setExpandedViaticos] = useState({
    diasServicio: false,
    vueloSinComida: true,
    vueloConComida: true,
    tierraSimu: false,
    comidaInternacional: true
  });
  const [mostrarSoloRealizados, setMostrarSoloRealizados] = useState(true);
  const [selectedViaticosMonth, setSelectedViaticosMonth] = useState(new Date().getMonth());

  const [activityView, setActivityView] = useState('roster');
  const [viaticosView, setViaticosView] = useState('cantidades');

  const [rosterData, setRosterData] = useState([]);
  const [rosterOriginal, setRosterOriginal] = useState([]);
  const [selectedFlight, setSelectedFlight] = useState({});
  const [esComandante, setEsComandante] = useState(false);
  const [userProfileState, setUserProfileState] = useState(null);
  const [remisLoading, setRemisLoading] = useState(true);

  const remisWebViewRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  const today = new Date();
  const todayStr = String(today.getDate()).padStart(2, '0');
  const aerowebMonths = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const mesesEspanol = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const diasSemanaCorto = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const diasSemanaLargo = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  useEffect(() => {
    const loadSavedData = async () => {
      try {
        const savedOrig = await AsyncStorage.getItem('rosterOriginal');
        if (savedOrig) setRosterOriginal(JSON.parse(savedOrig));

        const savedCurrent = await AsyncStorage.getItem('rosterData');
        if (savedCurrent) {
          const parsedCurrent = JSON.parse(savedCurrent);
          setRosterData(recalculateExistingCards(parsedCurrent));
        }

        const savedLastSync = await AsyncStorage.getItem('lastSyncTimeStr');
        if (savedLastSync) setLastSyncTimeStr(savedLastSync);
        
        let encryptedProfile = await getEncryptedData('user_profile');
        if (!encryptedProfile) {
          const rawProfile = await AsyncStorage.getItem('user_profile');
          if (rawProfile) encryptedProfile = JSON.parse(rawProfile);
        }

        if (encryptedProfile && encryptedProfile.aerowebUser) {
          setUserProfileState(encryptedProfile);
          setEsComandante(encryptedProfile.rank === 'Comandante');
        } else {
          setProfileModalVisible(true);
        }
      } catch(e) {}
    };

    const registerForPushNotificationsAsync = async () => {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus === 'granted') {
          const tokenData = await Notifications.getExpoPushTokenAsync();
          console.log('EXPO PUSH TOKEN:', tokenData.data);
        }
      } catch (e) {}
    };

    loadSavedData();
    registerForPushNotificationsAsync();
  }, []);

  // Chequeo automático silencioso cada 15 minutos
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

  const getMsFromDateStr = (fechaDia) => {
    if (!fechaDia) return 0;
    const dStr = fechaDia.match(/\d+/);
    const mStr = fechaDia.match(/[A-Z]+/);
    if (!dStr || !mStr) return 0;
    const d = parseInt(dStr[0], 10);
    const m = aerowebMonths.indexOf(mStr[0]);
    let y = today.getFullYear();
    if (today.getMonth() === 11 && m === 0) y++;
    if (today.getMonth() === 0 && m === 11) y--;
    return new Date(y, m, d).getTime();
  };

  // Formatea "05NOV" -> "Jueves 05" o "Jueves 05 - Viernes 06" si toca dos días de servicio
  const formatDayAndNumberHeader = (item) => {
    if (!item || !item.fechaDia) return '';
    const ms = getMsFromDateStr(item.fechaDia);
    if (!ms) return item.fechaDia;

    const dateObj = new Date(ms);
    const dayName1 = diasSemanaLargo[dateObj.getDay()];
    const dayNum1 = String(dateObj.getDate()).padStart(2, '0');

    if (item.touchesNextDay) {
      const nextDateObj = new Date(ms + 86400000);
      const dayName2 = diasSemanaLargo[nextDateObj.getDay()];
      const dayNum2 = String(nextDateObj.getDate()).padStart(2, '0');
      return `${dayName1} ${dayNum1} - ${dayName2} ${dayNum2}`;
    }

    return `${dayName1} ${dayNum1}`;
  };

  const formatShortDateNum = (fechaDia) => {
    if (!fechaDia) return '';
    const dMatch = fechaDia.match(/\d+/);
    const mMatch = fechaDia.match(/[A-Z]+/);
    if (!dMatch || !mMatch) return fechaDia;
    const d = dMatch[0].padStart(2, '0');
    const m = String(aerowebMonths.indexOf(mMatch[0]) + 1).padStart(2, '0');
    return `${d}/${m}`;
  };

  const formatMinToHM = (totalMinutes) => {
    if (!totalMinutes || totalMinutes <= 0) return '0h 00m';
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  };

  const diffMinutes = (startStr, endStr) => {
    if (!startStr || !endStr || !startStr.includes(':') || !endStr.includes(':')) return 0;
    const [h1, m1] = startStr.split(':').map(Number);
    const [h2, m2] = endStr.split(':').map(Number);
    let t1 = h1 * 60 + m1;
    let t2 = h2 * 60 + m2;
    if (t2 < t1) t2 += 24 * 60;
    return t2 - t1;
  };

  const detectarCantidadPilotos = (dayObj) => {
    const pilotosEnLista = (dayObj.tripulacion || []).filter(
      t => (t.rol === 'CP' || t.rol === 'FO') && (!t.duty || t.duty === 'OP')
    ).length;
    if (pilotosEnLista >= 3) return 3;

    const rutasTexto = (dayObj.tramos || []).map(t => (t.ruta || '').toUpperCase()).join(' | ');
    const tieneUSH = rutasTexto.includes('USH');
    const tieneFTE = rutasTexto.includes('FTE');

    if (tieneUSH && tieneFTE) return 3;

    for (const dest of DESTINOS_TRES_PILOTOS) {
      if (rutasTexto.includes(dest)) return 3;
    }

    return 2;
  };

  const calcularUltimoAterrizaje = (presentacionStr, cantidadTramos = 2, cantPilotos = 2) => {
    if (!presentacionStr || presentacionStr === '-' || !presentacionStr.includes(':')) {
      return { display: '-', touchesNextDay: false };
    }
    const timeMatch = presentacionStr.match(/(\d{2}):(\d{2})/);
    if (!timeMatch) return { display: '-', touchesNextDay: false };

    const presH = parseInt(timeMatch[1], 10);
    const presM = parseInt(timeMatch[2], 10);
    const presMinutos = presH * 60 + presM;

    let maxTsvMinutos = 12 * 60 + 30;

    if (presMinutos >= 14 * 60 && presMinutos < 16 * 60) {
      maxTsvMinutos = 11 * 60;
    } else if (presMinutos >= 16 * 60 || presMinutos < 5 * 60) {
      maxTsvMinutos = 9 * 60 + 30;
    } else if (presMinutos >= 5 * 60 && presMinutos < 6 * 60) {
      maxTsvMinutos = 11 * 60 + 30;
    }

    if (cantPilotos <= 2 && cantidadTramos > 2) {
      maxTsvMinutos -= (cantidadTramos - 2) * 30;
    }

    if (cantPilotos >= 3) {
      maxTsvMinutos = 15 * 60;
    }

    const totalMin = presMinutos + maxTsvMinutos;
    let h = Math.floor(totalMin / 60);
    let m = totalMin % 60;

    let touchesNextDay = false;
    let plusDay = '';
    if (h >= 24) {
      h -= 24;
      plusDay = ' (+1)';
      touchesNextDay = true;
    }

    return {
      display: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${plusDay}`,
      touchesNextDay
    };
  };

  const checkIfOperacionTouchesNextDay = (dayObj) => {
    if (!dayObj.tramos || dayObj.tramos.length === 0) return false;
    const pres = dayObj.presentacion;
    const presMin = pres && pres.includes(':') ? parseInt(pres.split(':')[0], 10) * 60 + parseInt(pres.split(':')[1], 10) : 0;

    for (const t of dayObj.tramos) {
      if (t.comienzoRaw && t.finRaw && t.comienzoRaw.includes(':') && t.finRaw.includes(':')) {
        const [h1, m1] = t.comienzoRaw.split(':').map(Number);
        const [h2, m2] = t.finRaw.split(':').map(Number);
        const min1 = h1 * 60 + m1;
        const min2 = h2 * 60 + m2;
        if (min2 < min1 || min1 < presMin || (min2 + 30) >= 24 * 60) {
          return true;
        }
      }
    }
    return false;
  };

  const correspondeComidaEscalaInternacional = (dayObj) => {
    if (dayObj.isSpecialDay || !dayObj.tramos || dayObj.tramos.length === 0) return false;

    let tocaEscalaIntl = false;
    dayObj.tramos.forEach(t => {
      const ruta = (t.ruta || '').toUpperCase();
      DESTINOS_INTERNACIONALES.forEach(code => {
        if (ruta.includes(code)) tocaEscalaIntl = true;
      });
    });

    if (!tocaEscalaIntl) return false;
    if (dayObj.tramos.length === 1) return true;

    const primerTramo = dayObj.tramos[0];
    const ultimoTramo = dayObj.tramos[dayObj.tramos.length - 1];

    const llegadaEscalaStr = primerTramo.finRaw || '';
    const salidaEscalaStr = ultimoTramo.comienzoRaw || '';
    const finJornadaStr = ultimoTramo.finRaw || '';

    const toMin = (s) => {
      if (!s || !s.includes(':')) return -1;
      const [h, m] = s.split(':').map(Number);
      return h * 60 + m;
    };

    const llegadaMin = toMin(llegadaEscalaStr);
    const salidaMin = toMin(salidaEscalaStr);
    let finMin = toMin(finJornadaStr);
    const inicioMin = toMin(primerTramo.comienzoRaw);

    if (finMin !== -1 && inicioMin !== -1 && finMin < inicioMin) {
      finMin += 24 * 60;
    }

    if (llegadaMin >= 19 * 60 + 30 || salidaMin >= 20 * 60 || finMin >= 22 * 60) {
      return true;
    }

    if (llegadaMin !== -1 && salidaMin !== -1 && llegadaMin <= 13 * 60 && salidaMin >= 13 * 60 + 30) {
      return true;
    }

    return false;
  };

  const calcularTiemposOperativos = (presentacionStr, tramos = []) => {
    if (!tramos || tramos.length === 0) {
      return { tvDisplay: '0h 00m', tsDisplay: '0h 00m' };
    }
    let totalTvMin = 0;
    tramos.forEach(t => {
      if (t.comienzoRaw && t.finRaw && t.comienzoRaw !== '-' && t.finRaw !== '-') {
        totalTvMin += diffMinutes(t.comienzoRaw, t.finRaw);
      }
    });

    let totalTsMin = 0;
    const ultimoFin = tramos[tramos.length - 1]?.finRaw;
    if (presentacionStr && presentacionStr !== '-' && ultimoFin && ultimoFin !== '-') {
      totalTsMin = diffMinutes(presentacionStr, ultimoFin) + 30;
    }

    return {
      tvDisplay: formatMinToHM(totalTvMin),
      tsDisplay: formatMinToHM(totalTsMin)
    };
  };

  const deducirCheckin = (primerComienzo) => {
    if (!primerComienzo || !primerComienzo.includes(':')) return '-';
    let [h, m] = primerComienzo.split(':').map(Number);
    h -= 1;
    if (h < 0) h += 24;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const calcularTurnaround = (llegadaStr, salidaStr) => {
    if (!llegadaStr || !salidaStr || llegadaStr === '-' || salidaStr === '-') return null;
    const diff = diffMinutes(llegadaStr, salidaStr);
    let h = Math.floor(diff / 60);
    let m = diff % 60;
    return `${h}h ${m}m`;
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
    return ['D/L', 'VAC', '*', 'OF', 'RPT', 'GUA', 'ELD', 'CUR', 'INS', 'SIM'].includes(c) || c.startsWith('SB') || ['LIC', 'MED', 'SBF'].includes(c);
  };

  const isOffOrFreeOrVacation = (item) => {
    if (!item || !item.isSpecialDay) return false;
    const name = (item.specialName || '').toLowerCase();
    return name.includes('off') || name.includes('libre') || name.includes('vacaciones') || name.includes('licencia');
  };

  const recalculateExistingCards = (cards) => {
    if (!cards || !Array.isArray(cards)) return [];
    const ordenJerarquia = { CP: 1, FO: 2, CM: 3, TC: 4, AX: 5 };

    return cards.map(day => {
      const updated = { ...day };
      if (updated.tripulacion && updated.tripulacion.length > 0) {
        updated.tripulacion = [...updated.tripulacion].sort(
          (a, b) => (ordenJerarquia[a.rol] || 99) - (ordenJerarquia[b.rol] || 99)
        );
      }
      if (!updated.isSpecialDay && updated.presentacion && updated.presentacion !== '-') {
        const cantPilotos = detectarCantidadPilotos(updated);
        const calc = calcularUltimoAterrizaje(updated.presentacion, updated.tramos?.length || 2, cantPilotos);
        updated.ultimoAterrizaje = calc.display;
        updated.touchesNextDay = checkIfOperacionTouchesNextDay(updated);
        updated.cantPilotos = cantPilotos;

        const tiempos = calcularTiemposOperativos(updated.presentacion, updated.tramos || []);
        updated.tiempoVuelo = tiempos.tvDisplay;
        updated.tiempoServicio = tiempos.tsDisplay;
      } else if (updated.isSpecialDay && updated.specialName?.startsWith('Simulador')) {
        updated.touchesNextDay = checkIfOperacionTouchesNextDay(updated);
      }
      return updated;
    });
  };

  const processAerowebToCards = (rawData) => {
    if (!rawData || rawData.length === 0) return [];
    const daysMap = {};
    const result = [];

    rawData.forEach(item => {
      let rawDate = item.fechaAsignada || '';
      const dateMatch = rawDate.match(/(\d{1,2})\s*([A-Z]{3})/i);
      let dateKey = 'DESC';
      let itemMonth = '';

      if (dateMatch) {
        const d = dateMatch[1].padStart(2, '0');
        const m = dateMatch[2].toUpperCase();
        itemMonth = m;
        dateKey = `${d}${m}`;
      } else {
        dateKey = rawDate || 'DESC';
      }

      const isSpecial = isSpecialActivity(item.actividad);
      let presentacion = item.checkin || '-';
      
      if ((!isSpecial || item.actividad?.startsWith('SB')) && item.comienzo && (!presentacion || presentacion === '-' || Math.abs(parseInt(item.comienzo) - parseInt(presentacion)) > 2)) {
        presentacion = deducirCheckin(item.comienzo);
      }

      if (!daysMap[dateKey]) {
        daysMap[dateKey] = {
          id: dateKey,
          fechaDia: dateKey,
          month: itemMonth,
          presentacion: (isSpecial && !item.actividad?.startsWith('SB')) ? '-' : presentacion,
          flota: item.tipoAvion || 'B738',
          ultimoAterrizaje: '-',
          tiempoVuelo: '0h 00m',
          tiempoServicio: '0h 00m',
          cantPilotos: 2,
          touchesNextDay: false,
          tramos: [],
          tripulacion: [],
          isSpecialDay: isSpecial,
          specialName: isSpecial ? getSpecialActivityName(item.actividad) : null,
          isRPT: false,
          rptType: null,
          originalHorario: null,
          originalPresentacion: null,
          cambiosDetectados: []
        };
        result.push(daysMap[dateKey]);
      }

      if (daysMap[dateKey].presentacion === '-' && presentacion !== '-' && (!isSpecial || item.actividad?.startsWith('SB'))) {
        daysMap[dateKey].presentacion = presentacion;
      }

      if (item.tipoAvion && item.tipoAvion !== 'B737') {
        daysMap[dateKey].flota = item.tipoAvion;
      }

      if (!isSpecial || item.actividad?.startsWith('SB')) {
        if (!isSpecial) daysMap[dateKey].isSpecialDay = false;
        daysMap[dateKey].tramos.push({
          ruta: item.desde && item.hacia ? `${item.desde} → ${item.hacia}` : item.actividad,
          nroVuelo: item.actividad,
          horario: item.comienzo && item.fin ? `${item.comienzo} → ${item.fin}` : (item.comienzo || '-'),
          comienzoRaw: item.comienzo || '-',
          finRaw: item.fin || '-'
        });
      }

      if (item.tripulacion && item.tripulacion.length > 0) {
        item.tripulacion.forEach(trip => {
          if (!daysMap[dateKey].tripulacion.find(c => c.rol === trip.rol && c.nombre === trip.nombre)) {
            daysMap[dateKey].tripulacion.push({
              ...trip, 
              rangType: trip.rol === 'CP' ? '4_gold' : (trip.rol === 'FO' ? '3_gold' : (trip.rol === 'CM' ? '2_silver' : 'dots')),
              label: trip.rol === 'CP' ? 'Comandante' : (trip.rol === 'FO' ? 'Primer Oficial' : (trip.rol === 'CM' ? 'Comisario' : 'Tripulante'))
            });
          }
        });
      }
    });

    return recalculateExistingCards(result);
  };

  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const tomorrowMs = todayMs + 86400000;

  const isAutogestionAvailable = (fechaDia) => {
    if (!fechaDia) return false;
    const flightMs = getMsFromDateStr(fechaDia);
    return flightMs === todayMs || flightMs === tomorrowMs;
  };

  const openDirectAerowebAutogestion = (flightItem) => {
    const flightMs = getMsFromDateStr(flightItem?.fechaDia);
    const mode = flightMs > todayMs ? 'manana' : 'hoy';
    setSelectedFlight(flightItem || {});
    setAerowebTargetMode(mode);
    setRemisLoading(true);
    setModalViewMode('aeroweb');
    setModalVisible(true);
  };

  const isFlightCompletedOrInProgress = (dayObj) => {
    const dayMs = getMsFromDateStr(dayObj.fechaDia);
    if (dayMs < todayMs) return true;
    if (dayMs > todayMs) return false;

    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    if (dayObj.presentacion && dayObj.presentacion.includes(':')) {
      const [ph, pm] = dayObj.presentacion.split(':').map(Number);
      return nowMinutes >= (ph * 60 + pm);
    }
    return false;
  };

  const handleDataParsed = async (payload) => {
    if (payload.type === 'realizada') {
      let newCards = processAerowebToCards(payload.raw);
      
      const savedCurrentRaw = await AsyncStorage.getItem('rosterData');
      const existingMonthCards = savedCurrentRaw ? JSON.parse(savedCurrentRaw) : [];
      const currentMonth = newCards[0]?.month || aerowebMonths[today.getMonth()];

      const mergedMap = {};
      existingMonthCards
        .filter(c => c.month === currentMonth)
        .forEach(c => { mergedMap[c.fechaDia] = c; });

      newCards.forEach(c => {
        const prev = mergedMap[c.fechaDia];
        if (prev) {
          if ((!c.tripulacion || c.tripulacion.length < (prev.tripulacion?.length || 0)) && prev.tripulacion?.length > 1) {
            c.tripulacion = prev.tripulacion;
          }
        }
        mergedMap[c.fechaDia] = c;
      });

      let groupedRealizada = recalculateExistingCards(
        Object.values(mergedMap).sort((a, b) => getMsFromDateStr(a.fechaDia) - getMsFromDateStr(b.fechaDia))
      );

      const savedOriginal = await AsyncStorage.getItem('rosterOriginal');
      let originalCards = savedOriginal ? JSON.parse(savedOriginal) : [];
      const originalMonth = originalCards[0]?.month;

      if (currentMonth !== originalMonth || originalCards.length === 0) {
        await AsyncStorage.setItem('rosterOriginal', JSON.stringify(groupedRealizada));
        originalCards = groupedRealizada;
        setRosterOriginal(groupedRealizada);
      } else {
        let updatedOrig = [...originalCards];
        groupedRealizada.forEach(day => {
          const existingOrigIndex = updatedOrig.findIndex(o => o.fechaDia === day.fechaDia);
          if (existingOrigIndex === -1) {
            updatedOrig.push(day);
          } else {
            if (updatedOrig[existingOrigIndex].tripulacion) {
              updatedOrig[existingOrigIndex].tripulacion = updatedOrig[existingOrigIndex].tripulacion.map(t => ({
                ...t,
                nombre: (t.nombre || '').split(/\b(?:MON|TUE|WED|THU|FRI|SAT|SUN)\b|\b\d{1,2}[A-Z]{3}\b/i)[0].trim()
              }));
            }
            if (
              (!updatedOrig[existingOrigIndex].tripulacion || updatedOrig[existingOrigIndex].tripulacion.length <= 1) &&
              day.tripulacion && day.tripulacion.length > 1
            ) {
              updatedOrig[existingOrigIndex].tripulacion = day.tripulacion;
            }
          }
        });
        await AsyncStorage.setItem('rosterOriginal', JSON.stringify(updatedOrig));
        originalCards = updatedOrig;
      }

      groupedRealizada = compararConOriginal(groupedRealizada, originalCards);

      await notificarNuevosCambios(existingMonthCards, groupedRealizada);

      const nowTime = new Date();
      const timeFormatted = `${String(nowTime.getHours()).padStart(2, '0')}:${String(nowTime.getMinutes()).padStart(2, '0')}`;
      setLastSyncTimeStr(timeFormatted);
      await AsyncStorage.setItem('lastSyncTimeStr', timeFormatted);

      setRosterData(groupedRealizada);
      await AsyncStorage.setItem('rosterData', JSON.stringify(groupedRealizada));

      if (selectedFlight && selectedFlight.fechaDia) {
        const refreshedSelected = groupedRealizada.find(d => d.fechaDia === selectedFlight.fechaDia);
        if (refreshedSelected) setSelectedFlight(refreshedSelected);
      }
    }
  };

  const notificarNuevosCambios = async (previousCards, updatedCards) => {
    try {
      const prevMap = {};
      (previousCards || []).forEach(c => {
        prevMap[c.fechaDia] = (c.cambiosDetectados || []).join('|');
      });

      for (const day of updatedCards) {
        const currentChanges = day.cambiosDetectados || [];
        const currentSignature = currentChanges.join('|');
        const prevSignature = prevMap[day.fechaDia] || '';

        if (currentChanges.length > 0 && currentSignature !== prevSignature) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `✈️ Novedad en tu vuelo del ${day.fechaDia}`,
              body: currentChanges.join('\n'),
              sound: true
            },
            trigger: null
          });
        }
      }
    } catch (e) {}
  };

  const compararConOriginal = (currentCards, originalCards) => {
    return currentCards.map(realDay => {
      const origDay = originalCards.find(o => o.fechaDia === realDay.fechaDia && o.month === realDay.month);
      const cambios = [];
      realDay.isRPT = false;
      realDay.rptType = null;

      if (origDay && !realDay.isSpecialDay) {
        const origRutas = origDay.tramos?.map(t => t.nroVuelo).join(',') || '';
        const realRutas = realDay.tramos?.map(t => t.nroVuelo).join(',') || '';
        const origEtd = origDay.tramos?.[0]?.comienzoRaw || '-';
        const realEtd = realDay.tramos?.[0]?.comienzoRaw || '-';
        const origHorario = origDay.tramos?.[0]?.horario || '-';

        if (origRutas !== realRutas && realRutas !== '') {
          realDay.isRPT = true;
          realDay.rptType = 'ROUTE';
          realDay.originalHorario = origHorario;
          realDay.originalPresentacion = origDay.presentacion;
          cambios.push(`🔄 Cambio de vuelo: Orig ${origRutas} (${origHorario})`);
        } else if (origEtd !== realEtd && origEtd !== '-' && realEtd !== '-') {
          realDay.isRPT = true;
          realDay.rptType = 'DELAY';
          realDay.originalHorario = origHorario;
          realDay.originalPresentacion = origDay.presentacion;
          cambios.push(`⚠️ Salida modificada: ETD Orig ${origEtd} → Nuevo ${realEtd}`);
        }

        if (origDay.flota && realDay.flota && origDay.flota !== realDay.flota) {
          cambios.push(`✈️ Cambio de avión: ${origDay.flota} → ${realDay.flota}`);
        }

        if (origDay.tripulacion && origDay.tripulacion.length > 1 && realDay.tripulacion && realDay.tripulacion.length > 1) {
          const origNames = origDay.tripulacion.map(c => `${c.rol} ${c.nombre}`);
          const realNames = realDay.tripulacion.map(c => `${c.rol} ${c.nombre}`);

          const salieron = origNames.filter(n => !realNames.includes(n));
          const entraron = realNames.filter(n => !origNames.includes(n));

          salieron.forEach(s => cambios.push(`❌ Salió de tripulación: ${s}`));
          entraron.forEach(e => cambios.push(`✅ Entró a tripulación: ${e}`));
        }
      }

      realDay.cambiosDetectados = cambios;
      return realDay;
    });
  };

  // Automatización directa en el WebView de Autogestión:
  // 1) Si pide Legajo y DNI, los completa y envía el formulario
  // 2) En la pantalla de los botones "24 ACTIVIDAD DE HOY" y "48 ACTIVIDAD DE MAÑANA" (Imagen 4),
  //    toca automáticamente el botón correspondiente o navega a IndexPost / MananaPost.
  const wantManana = aerowebTargetMode === 'manana';
  const pickupInjectedJS = `
    (function() {
      function runDirectAutogestion() {
        try {
          var url = window.location.href.toLowerCase();
          var pass = document.querySelector('input[type="password"]');
          var inputs = document.querySelectorAll('input');
          var user = null;
          for (var i = 0; i < inputs.length; i++) {
            var t = (inputs[i].getAttribute('type') || '').toLowerCase();
            if ((t === 'text' || t === '' || t === 'number') && inputs[i].type !== 'hidden') {
              user = inputs[i]; break;
            }
          }

          // 1. Login automático con Legajo y DNI
          if (user && pass && !window._pickupLoginDone) {
            window._pickupLoginDone = true;
            user.value = "${userProfileState?.aerowebUser || ''}";
            user.dispatchEvent(new Event('input', { bubbles: true }));
            user.dispatchEvent(new Event('change', { bubbles: true }));
            pass.value = "${userProfileState?.dni || userProfileState?.aerowebPass || ''}";
            pass.dispatchEvent(new Event('input', { bubbles: true }));
            pass.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(function() {
              var btn = document.querySelector('input[type="submit"], button[type="submit"], button');
              if (btn) btn.click();
            }, 350);
            return;
          }

          // 2. Si estamos en el menú de los botones "24 ACTIVIDAD DE HOY" / "48 ACTIVIDAD DE MAÑANA", tocar el botón automáticamente
          if (!pass && !url.includes('indexpost') && !url.includes('mananapost') && !window._buttonClicked) {
            var allClickables = document.querySelectorAll('a, button, input[type="submit"], input[type="button"], div, span');
            for (var j = 0; j < allClickables.length; j++) {
              var el = allClickables[j];
              var txt = (el.innerText || el.value || el.textContent || '').toUpperCase().replace(/\\s+/g, ' ');
              var href = (el.getAttribute && el.getAttribute('href')) ? el.getAttribute('href').toLowerCase() : '';

              if (${wantManana ? 'true' : 'false'}) {
                if (href.includes('manana') || txt === 'ACTIVIDAD DE MAÑANA' || (txt.includes('48') && txt.includes('ACTIVIDAD DE MAÑANA'))) {
                  window._buttonClicked = true;
                  el.click();
                  return;
                }
              } else {
                if (href.includes('indexpost') || txt === 'ACTIVIDAD DE HOY' || (txt.includes('24') && txt.includes('ACTIVIDAD DE HOY'))) {
                  window._buttonClicked = true;
                  el.click();
                  return;
                }
              }
            }
          }
        } catch(e) {}
      }
      setInterval(runDirectAutogestion, 700);
    })();
    true;
  `;

  // =========================================================================
  // CÁLCULO DE VIÁTICOS Y TÍTULO DE MES ("noviembre 2026" / "a cobrar en enero")
  // =========================================================================
  const rosterMonthIndex = selectedViaticosMonth;
  const cobroMonthIndex = (rosterMonthIndex + 2) % 12;
  const tituloMes = `${mesesEspanol[rosterMonthIndex]} ${today.getFullYear()}`;
  const subtituloCobro = `a cobrar en ${mesesEspanol[cobroMonthIndex]}`;

  const rankMultiplier = esComandante ? 1.3 : 1.0; 
  const viaticoSinComidaValor = Math.round(87564 * rankMultiplier);
  const viaticoTierraValor = Math.round(77932 * rankMultiplier);
  const viaticoInternacionalUSD = 36;

  const targetAerowebMonth = aerowebMonths[rosterMonthIndex];
  const actividadesDelMes = rosterData.filter(d => !d.month || d.month === targetAerowebMonth);
  const actividadesComputables = actividadesDelMes.filter(d =>
    mostrarSoloRealizados ? isFlightCompletedOrInProgress(d) : true
  );

  const itemsVueloSinComida = [];
  const itemsVueloConComida = [];
  const itemsTierraSimu = [];
  const itemsComidaInternacional = [];
  const itemsDiasServicio = [];

  const fechasContabilizadas = new Set(actividadesComputables.map(d => d.fechaDia));

  actividadesComputables.forEach(d => {
    const fechaCorta = formatShortDateNum(d.fechaDia);
    const labelVuelos = (d.tramos || []).map(t => t.nroVuelo).join(' · ') || d.specialName || 'Actividad';

    if (!d.isSpecialDay) {
      const tieneComidaIntl = correspondeComidaEscalaInternacional(d);
      itemsDiasServicio.push({ fecha: fechaCorta, detalle: labelVuelos });

      if (tieneComidaIntl) {
        itemsVueloConComida.push({ fecha: fechaCorta, detalle: labelVuelos, monto: viaticoSinComidaValor });
        itemsComidaInternacional.push({ fecha: fechaCorta, detalle: labelVuelos, montoUSD: viaticoInternacionalUSD });
      } else {
        itemsVueloSinComida.push({ fecha: fechaCorta, detalle: labelVuelos, monto: viaticoSinComidaValor });
      }

      if (d.touchesNextDay) {
        const nextDate = new Date(getMsFromDateStr(d.fechaDia) + 86400000);
        const nextKey = `${String(nextDate.getDate()).padStart(2, '0')}${aerowebMonths[nextDate.getMonth()]}`;
        const nextShort = `${String(nextDate.getDate()).padStart(2, '0')}/${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
        if (!fechasContabilizadas.has(nextKey)) {
          itemsDiasServicio.push({ fecha: nextShort, detalle: `${labelVuelos} (+1)` });
          itemsVueloSinComida.push({ fecha: nextShort, detalle: `${labelVuelos} (+1)`, monto: viaticoSinComidaValor });
        }
      }
    } else if (d.specialName && (d.specialName.startsWith('Simulador') || d.specialName.startsWith('Guardia') || d.specialName.startsWith('Instrucción'))) {
      itemsDiasServicio.push({ fecha: fechaCorta, detalle: d.specialName });
      itemsTierraSimu.push({ fecha: fechaCorta, detalle: d.specialName, monto: viaticoTierraValor });

      if (d.touchesNextDay) {
        const nextDate = new Date(getMsFromDateStr(d.fechaDia) + 86400000);
        const nextKey = `${String(nextDate.getDate()).padStart(2, '0')}${aerowebMonths[nextDate.getMonth()]}`;
        const nextShort = `${String(nextDate.getDate()).padStart(2, '0')}/${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
        if (!fechasContabilizadas.has(nextKey)) {
          itemsDiasServicio.push({ fecha: nextShort, detalle: `${d.specialName} (+1)` });
          itemsTierraSimu.push({ fecha: nextShort, detalle: `${d.specialName} (+1)`, monto: viaticoTierraValor });
        }
      }
    }
  });

  const totalPesosVueloSinComida = itemsVueloSinComida.length * viaticoSinComidaValor;
  const totalPesosVueloConComida = itemsVueloConComida.length * viaticoSinComidaValor;
  const totalPesosTierra = itemsTierraSimu.length * viaticoTierraValor;
  const pesosTotales = totalPesosVueloSinComida + totalPesosVueloConComida + totalPesosTierra;
  const dolaresTotales = itemsComidaInternacional.length * viaticoInternacionalUSD;

  const todayActivity = rosterData.find(d => getMsFromDateStr(d.fechaDia) === todayMs);
  const rosterOrdenado = [...rosterData].sort((a, b) => getMsFromDateStr(a.fechaDia) - getMsFromDateStr(b.fechaDia));
  const nextActivity = rosterOrdenado.find(d => getMsFromDateStr(d.fechaDia) > todayMs);

  const isPastActivity = (fechaDia) => getMsFromDateStr(fechaDia) < todayMs;

  const renderEpaulette = (type) => {
    if (type === '4_gold') return <View style={styles.epauletteContainer}><View style={styles.goldStripe} /><View style={styles.goldStripe} /><View style={styles.goldStripe} /><View style={styles.goldStripe} /></View>;
    if (type === '3_gold') return <View style={styles.epauletteContainer}><View style={styles.goldStripe} /><View style={styles.goldStripe} /><View style={styles.goldStripe} /></View>;
    if (type === '2_silver') return <View style={styles.epauletteContainerBlue}><View style={styles.silverStripe} /><View style={styles.silverStripe} /></View>;
    return <View style={styles.epauletteContainerDots}><Text style={styles.dotsText}>• •</Text></View>;
  };

  const renderGlobito = (item) => {
    let icon = '🏠';
    let colorBg = '#F1F5F9';
    let colorText = '#475569';
    if (item.specialName === 'Vacaciones') { icon = '☀️'; colorBg = '#FEF3C7'; colorText = '#D97706'; }
    else if (item.specialName?.startsWith('Simulador')) { icon = '🖥️'; colorBg = '#EDE9FE'; colorText = '#7C3AED'; }
    else if (item.specialName === 'Día Libre' || item.specialName === 'Día OFF') { icon = '🏠'; colorBg = '#E0F2FE'; colorText = '#0284C7'; }
    else if (item.specialName === 'Reprogramación (RPT)') { icon = '🔄'; colorBg = '#FFEDD5'; colorText = '#EA580C'; }

    const isPast = isPastActivity(item.fechaDia);

    return (
      <View style={[styles.globitoContainer, { backgroundColor: colorBg, opacity: isPast ? 0.5 : 1 }]}>
        <Text style={[styles.globitoDate, { color: colorText }]}>{formatDayAndNumberHeader(item)}</Text>
        <View style={styles.globitoSeparator} />
        <Text style={styles.globitoIcon}>{icon}</Text>
        <Text style={[styles.globitoText, { color: colorText }]}>{item.specialName}</Text>
      </View>
    );
  };

  const renderFlightCard = (item, index, onPress) => {
    const isPast = isPastActivity(item.fechaDia);
    const hasChanges = item.isRPT || (item.cambiosDetectados && item.cambiosDetectados.length > 0);
    
    return (
      <TouchableOpacity key={item.id || index} style={[styles.flightCard, { opacity: isPast ? 0.5 : 1 }]} onPress={onPress}>
        <View style={styles.flightCardHeader}>
          <View style={styles.flightCardHeaderLeft}>
            <Text style={styles.flightCardDate}>{formatDayAndNumberHeader(item)}</Text>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <View style={styles.badgeFlotaContainer}><Text style={styles.badgeFlotaText}>{item.flota}</Text></View>
            </View>
          </View>
          <View style={styles.flightCardHeaderRight}>
            <Text style={styles.flightCardHeaderLabel}>Presentación</Text>
            <Text style={styles.flightCardHeaderVal}>{item.presentacion}</Text>
          </View>
          <View style={styles.flightCardHeaderRight}>
            <Text style={styles.flightCardHeaderLabel}>Últ. Aterrizaje</Text>
            <Text style={[styles.flightCardHeaderVal, { color: COLORS.primary }]}>{item.ultimoAterrizaje}</Text>
          </View>
        </View>

        <View style={styles.metricsRowCard}>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillLabel}>VUELO: </Text>
            <Text style={styles.metricPillVal}>{item.tiempoVuelo || '0h 00m'}</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillLabel}>TIEMPO DE SERVICIO: </Text>
            <Text style={styles.metricPillVal}>{item.tiempoServicio || '0h 00m'}</Text>
          </View>
        </View>
        
        {hasChanges && (
          <View style={{ 
            backgroundColor: item.rptType === 'DELAY' ? '#FEF3C7' : '#FEE2E2', 
            borderColor: item.rptType === 'DELAY' ? '#F59E0B' : '#EF4444',
            borderWidth: 1,
            alignSelf: 'flex-start', 
            paddingHorizontal: 8, 
            paddingVertical: 4, 
            borderRadius: 6, 
            marginTop: 8,
            marginBottom: 4 
          }}>
            <Text style={{ 
              color: item.rptType === 'DELAY' ? '#B45309' : '#DC2626', 
              fontSize: 11, 
              fontWeight: 'bold' 
            }}>
              {item.rptType === 'DELAY'
                ? `${item.cambiosDetectados[0]}`
                : (item.rptType === 'ROUTE' ? '🔄 REPROGRAMADO' : `🔔 ${item.cambiosDetectados[0]}`)}
            </Text>
          </View>
        )}

        <View style={styles.flightCardDivider} />
        {item.tramos && item.tramos.map((t, idx) => (
          <View key={idx} style={styles.flightCardTramoRow}>
            <View>
              <Text style={styles.flightCardRoute}>{t.ruta}</Text>
              <Text style={styles.flightCardFlightNum}>{t.nroVuelo}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.flightCardTime}>{t.horario}</Text>
            </View>
          </View>
        ))}
      </TouchableOpacity>
    );
  };

  const renderActividadSpecialCard = (item, index) => {
    let icon = '🏠';
    let colorLine = '#10B981';
    if (item.specialName === 'Vacaciones') { icon = '☀️'; colorLine = '#F59E0B'; }
    else if (item.specialName?.startsWith('Simulador')) { icon = '🖥️'; colorLine = '#8B5CF6'; }
    else if (item.specialName === 'Día OFF' || item.specialName === 'Día Libre') { icon = '🏠'; colorLine = '#64748B'; }
    else if (item.specialName === 'Reprogramación (RPT)') { icon = '🔄'; colorLine = '#EA580C'; }
    
    const isPast = isPastActivity(item.fechaDia);
    const simHorario = item.tramos?.[0]?.horario;

    return (
      <View key={item.id || index} style={[styles.actividadSpecialCard, { borderLeftColor: colorLine, opacity: isPast ? 0.5 : 1 }]}>
        <View style={styles.actividadSpecialCardContent}>
          <View style={{ flex: 1 }}>
            <Text style={styles.actividadSpecialCardDate}>{formatDayAndNumberHeader(item)}</Text>
            <Text style={styles.actividadSpecialCardTitle}>{item.specialName}</Text>
            {simHorario && (
              <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '600', marginTop: 2 }}>
                Pres: {item.presentacion} • Sesión: {simHorario}
              </Text>
            )}
          </View>
          <Text style={styles.actividadSpecialCardIcon}>{icon}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bgLight} />
      
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>PLANES</Text>
          <Text style={styles.headerSubtitle}>
            {userProfileState?.nombre ? `${userProfileState.nombre}` : 'B737 Aerolíneas'}
            {lastSyncTimeStr ? ` • Sync ${lastSyncTimeStr}` : ''}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.syncBtn}
            onPress={() => {
              setSilentSyncRunning(false);
              setSyncModalVisible(true);
            }}
          >
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
            {/* Ícono del calendario con el Día de la Semana ("Jueves") a la derecha */}
            <View style={styles.headerTitleContainer}>
              <View style={styles.calendarIcon}>
                <Text style={styles.calendarDayName}>{diasSemanaCorto[today.getDay()]}</Text>
                <Text style={styles.calendarDayNumber}>{todayStr}</Text>
              </View>
              <Text style={styles.todayFullDayText}>{diasSemanaLargo[today.getDay()]}</Text>
            </View>
            
            <Text style={styles.sectionLabel}>Actividad de Hoy</Text>
            {todayActivity ? (
              todayActivity.isSpecialDay 
                ? renderGlobito(todayActivity) 
                : renderFlightCard(todayActivity, 'today', () => {
                    setSelectedFlight(todayActivity);
                    setModalViewMode('detail');
                    setModalVisible(true);
                  })
            ) : (
              <Text style={styles.noActivityText}>No tenés actividad programada para hoy.</Text>
            )}

            <Text style={styles.sectionLabel}>Próxima actividad programada</Text>
            {nextActivity ? (
              <View>
                {nextActivity.isSpecialDay 
                  ? renderGlobito(nextActivity)
                  : renderFlightCard(nextActivity, 'next', () => {
                      setSelectedFlight(nextActivity);
                      setModalViewMode('detail');
                      setModalVisible(true);
                    })}

                {/* Si la próxima actividad NO es OFF, Día Libre ni Vacaciones, mostramos el botón directo a Detalle Aeroweb */}
                {!isOffOrFreeOrVacation(nextActivity) && (
                  <TouchableOpacity
                    style={[styles.pickupBtn, { marginTop: -4, marginBottom: 16 }]}
                    onPress={() => openDirectAerowebAutogestion(nextActivity)}
                  >
                    <Text style={styles.pickupBtnText}>
                      🚕 Detalle Aeroweb ({formatDayAndNumberHeader(nextActivity)})
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.emptyCard}><Text style={styles.summaryText}>No hay vuelos próximos. Tocá "Actualizar".</Text></View>
            )}
          </View>
        )}

        {activeTab === 'actividad' && (
          <View>
            <View style={styles.toggleContainer}>
              <TouchableOpacity style={[styles.toggleBtn, activityView === 'roster' && styles.toggleBtnActive]} onPress={() => setActivityView('roster')}>
                <Text style={[styles.toggleText, activityView === 'roster' && styles.toggleTextActive]}>≡ Roster ({rosterData.length})</Text>
              </TouchableOpacity>
            </View>
            {rosterOrdenado.map((item, index) => item.isSpecialDay ? renderActividadSpecialCard(item, index) : renderFlightCard(item, index, () => {
              setSelectedFlight(item);
              setModalViewMode('detail');
              setModalVisible(true);
            }))}
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
              <TouchableOpacity
                style={styles.monthBtnLight}
                onPress={() => setSelectedViaticosMonth(prev => (prev === 0 ? 11 : prev - 1))}
              >
                <Text style={styles.monthBtnTextLight}>{'<'}</Text>
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.monthTitleLight}>{tituloMes}</Text>
                <Text style={styles.monthSubtitleLight}>{subtituloCobro}</Text>
              </View>
              <TouchableOpacity
                style={styles.monthBtnLight}
                onPress={() => setSelectedViaticosMonth(prev => (prev === 11 ? 0 : prev + 1))}
              >
                <Text style={styles.monthBtnTextLight}>{'>'}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 14 }}>
              <TouchableOpacity
                onPress={() => setMostrarSoloRealizados(!mostrarSoloRealizados)}
                style={{ backgroundColor: '#E0F2FE', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 }}
              >
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: COLORS.primary }}>
                  {mostrarSoloRealizados
                    ? '✓ Mostrando vuelos realizados a la fecha (Ver proyectado)'
                    : '📅 Mostrando proyectado de todo el mes (Ver solo realizados)'}
                </Text>
              </TouchableOpacity>
            </View>

            {viaticosView === 'cantidades' ? (
              <View style={styles.listCard}>
                <TouchableOpacity
                  style={styles.rowItem}
                  onPress={() => setExpandedViaticos(p => ({ ...p, diasServicio: !p.diasServicio }))}
                >
                  <Text style={styles.itemLabel}>Días de servicio</Text>
                  <View style={styles.rowItemRight}>
                    <Text style={styles.itemVal}>{itemsDiasServicio.length}</Text>
                    <Text style={styles.chevron}>{expandedViaticos.diasServicio ? '⌄' : '›'}</Text>
                  </View>
                </TouchableOpacity>
                {expandedViaticos.diasServicio && itemsDiasServicio.map((it, idx) => (
                  <View key={idx} style={styles.subRowViatico}>
                    <Text style={styles.subRowDate}>{it.fecha}</Text>
                    <Text style={styles.subRowFlights}>{it.detalle}</Text>
                    <Text style={styles.subRowChevron}>›</Text>
                  </View>
                ))}

                {itemsVueloSinComida.length > 0 && (
                  <>
                    <TouchableOpacity
                      style={[styles.rowItem, itemsVueloConComida.length === 0 && itemsTierraSimu.length === 0 && !expandedViaticos.vueloSinComida && { borderBottomWidth: 0 }]}
                      onPress={() => setExpandedViaticos(p => ({ ...p, vueloSinComida: !p.vueloSinComida }))}
                    >
                      <Text style={styles.itemLabel}>Viático de vuelo sin comida</Text>
                      <View style={styles.rowItemRight}>
                        <Text style={styles.itemVal}>{itemsVueloSinComida.length}</Text>
                        <Text style={styles.chevron}>{expandedViaticos.vueloSinComida ? '⌄' : '›'}</Text>
                      </View>
                    </TouchableOpacity>
                    {expandedViaticos.vueloSinComida && itemsVueloSinComida.map((it, idx) => (
                      <View key={idx} style={styles.subRowViatico}>
                        <Text style={styles.subRowDate}>{it.fecha}</Text>
                        <Text style={styles.subRowFlights}>{it.detalle}</Text>
                        <Text style={styles.subRowChevron}>›</Text>
                      </View>
                    ))}
                  </>
                )}

                {itemsVueloConComida.length > 0 && (
                  <>
                    <TouchableOpacity
                      style={styles.rowItem}
                      onPress={() => setExpandedViaticos(p => ({ ...p, vueloConComida: !p.vueloConComida }))}
                    >
                      <Text style={styles.itemLabel}>Viático de vuelo con comida (Escala Intl.)</Text>
                      <View style={styles.rowItemRight}>
                        <Text style={styles.itemVal}>{itemsVueloConComida.length}</Text>
                        <Text style={styles.chevron}>{expandedViaticos.vueloConComida ? '⌄' : '›'}</Text>
                      </View>
                    </TouchableOpacity>
                    {expandedViaticos.vueloConComida && itemsVueloConComida.map((it, idx) => (
                      <View key={idx} style={styles.subRowViatico}>
                        <Text style={styles.subRowDate}>{it.fecha}</Text>
                        <Text style={styles.subRowFlights}>{it.detalle}</Text>
                        <Text style={styles.subRowChevron}>›</Text>
                      </View>
                    ))}
                  </>
                )}

                {itemsTierraSimu.length > 0 && (
                  <>
                    <TouchableOpacity
                      style={[styles.rowItem, { borderBottomWidth: 0 }]}
                      onPress={() => setExpandedViaticos(p => ({ ...p, tierraSimu: !p.tierraSimu }))}
                    >
                      <Text style={styles.itemLabel}>Viático de Tierra (Simulador/Inst.)</Text>
                      <View style={styles.rowItemRight}>
                        <Text style={styles.itemVal}>{itemsTierraSimu.length}</Text>
                        <Text style={styles.chevron}>{expandedViaticos.tierraSimu ? '⌄' : '›'}</Text>
                      </View>
                    </TouchableOpacity>
                    {expandedViaticos.tierraSimu && itemsTierraSimu.map((it, idx) => (
                      <View key={idx} style={styles.subRowViatico}>
                        <Text style={styles.subRowDate}>{it.fecha}</Text>
                        <Text style={styles.subRowFlights}>{it.detalle}</Text>
                        <Text style={styles.subRowChevron}>›</Text>
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
                      <TouchableOpacity
                        style={styles.rowItem}
                        onPress={() => setExpandedViaticos(p => ({ ...p, vueloSinComida: !p.vueloSinComida }))}
                      >
                        <Text style={styles.itemLabel}>Viático de vuelo sin comida</Text>
                        <View style={styles.rowItemRight}>
                          <Text style={styles.itemVal}>$ {totalPesosVueloSinComida.toLocaleString('es-AR')}</Text>
                          <Text style={styles.chevron}>{expandedViaticos.vueloSinComida ? '⌄' : '›'}</Text>
                        </View>
                      </TouchableOpacity>
                      {expandedViaticos.vueloSinComida && itemsVueloSinComida.map((it, idx) => (
                        <View key={idx} style={styles.subRowViatico}>
                          <Text style={styles.subRowDate}>{it.fecha}</Text>
                          <Text style={styles.subRowFlights}>{it.detalle}</Text>
                          <Text style={styles.subRowAmount}>$ {it.monto.toLocaleString('es-AR')}</Text>
                          <Text style={styles.subRowChevron}>›</Text>
                        </View>
                      ))}
                    </>
                  )}

                  {itemsVueloConComida.length > 0 && (
                    <>
                      <TouchableOpacity
                        style={styles.rowItem}
                        onPress={() => setExpandedViaticos(p => ({ ...p, vueloConComida: !p.vueloConComida }))}
                      >
                        <Text style={styles.itemLabel}>Viático de vuelo con comida</Text>
                        <View style={styles.rowItemRight}>
                          <Text style={styles.itemVal}>$ {totalPesosVueloConComida.toLocaleString('es-AR')}</Text>
                          <Text style={styles.chevron}>{expandedViaticos.vueloConComida ? '⌄' : '›'}</Text>
                        </View>
                      </TouchableOpacity>
                      {expandedViaticos.vueloConComida && itemsVueloConComida.map((it, idx) => (
                        <View key={idx} style={styles.subRowViatico}>
                          <Text style={styles.subRowDate}>{it.fecha}</Text>
                          <Text style={styles.subRowFlights}>{it.detalle}</Text>
                          <Text style={styles.subRowAmount}>$ {it.monto.toLocaleString('es-AR')}</Text>
                          <Text style={styles.subRowChevron}>›</Text>
                        </View>
                      ))}
                    </>
                  )}

                  {itemsTierraSimu.length > 0 && (
                    <>
                      <TouchableOpacity
                        style={styles.rowItem}
                        onPress={() => setExpandedViaticos(p => ({ ...p, tierraSimu: !p.tierraSimu }))}
                      >
                        <Text style={styles.itemLabel}>Viático Tierra (Simulador)</Text>
                        <View style={styles.rowItemRight}>
                          <Text style={styles.itemVal}>$ {totalPesosTierra.toLocaleString('es-AR')}</Text>
                          <Text style={styles.chevron}>{expandedViaticos.tierraSimu ? '⌄' : '›'}</Text>
                        </View>
                      </TouchableOpacity>
                      {expandedViaticos.tierraSimu && itemsTierraSimu.map((it, idx) => (
                        <View key={idx} style={styles.subRowViatico}>
                          <Text style={styles.subRowDate}>{it.fecha}</Text>
                          <Text style={styles.subRowFlights}>{it.detalle}</Text>
                          <Text style={styles.subRowAmount}>$ {it.monto.toLocaleString('es-AR')}</Text>
                          <Text style={styles.subRowChevron}>›</Text>
                        </View>
                      ))}
                    </>
                  )}

                  <View style={[styles.rowItem, { borderBottomWidth: 0 }]}>
                    <Text style={[styles.itemLabel, { fontWeight: 'bold' }]}>Total</Text>
                    <View style={styles.rowItemRight}>
                      <Text style={[styles.itemVal, { fontWeight: 'bold', color: COLORS.primary }]}>
                        $ {pesosTotales.toLocaleString('es-AR')}
                      </Text>
                    </View>
                  </View>
                </View>
                
                {itemsComidaInternacional.length > 0 && (
                  <>
                    <Text style={styles.sectionHeaderLight}>EN DÓLARES (COMIDA EN ESCALA)</Text>
                    <View style={styles.listCard}>
                      <TouchableOpacity
                        style={styles.rowItem}
                        onPress={() => setExpandedViaticos(p => ({ ...p, comidaInternacional: !p.comidaInternacional }))}
                      >
                        <Text style={styles.itemLabel}>Comidas en escala internacional</Text>
                        <View style={styles.rowItemRight}>
                          <Text style={styles.itemVal}>US$ {dolaresTotales}</Text>
                          <Text style={styles.chevron}>{expandedViaticos.comidaInternacional ? '⌄' : '›'}</Text>
                        </View>
                      </TouchableOpacity>
                      {expandedViaticos.comidaInternacional && itemsComidaInternacional.map((it, idx) => (
                        <View key={idx} style={styles.subRowViatico}>
                          <Text style={styles.subRowDate}>{it.fecha}</Text>
                          <Text style={styles.subRowFlights}>{it.detalle}</Text>
                          <Text style={styles.subRowAmount}>US$ {it.montoUSD}</Text>
                          <Text style={styles.subRowChevron}>›</Text>
                        </View>
                      ))}
                      <View style={[styles.rowItem, { borderBottomWidth: 0 }]}>
                        <Text style={[styles.itemLabel, { fontWeight: 'bold' }]}>Total</Text>
                        <View style={styles.rowItemRight}>
                          <Text style={[styles.itemVal, { fontWeight: 'bold', color: COLORS.primary }]}>
                            US$ {dolaresTotales}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </>
                )}
              </View>
            )}
            
            <Text style={styles.footerTextLight}>
              Calculado con la normativa AR-877-2021 v1.2.0 • ARSA-APLA-402-2000-E v1.2.0 • B737 • valores de octubre 2026
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={syncModalVisible} animationType="slide">
        <AerowebSyncScreen onClose={() => setSyncModalVisible(false)} onDataParsed={handleDataParsed} />
      </Modal>

      <Modal visible={profileModalVisible} animationType="slide">
        <ProfileSetupScreen
          onClose={() => setProfileModalVisible(false)}
          onProfileUpdated={(newProfile) => {
            setUserProfileState(newProfile);
            setEsComandante(newProfile.rank === 'Comandante');
          }}
          onLogout={() => {
            setUserProfileState(null);
            setEsComandante(false);
          }}
        />
      </Modal>

      <Modal visible={modalVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.modalContainer}>
          {modalViewMode === 'detail' ? (
            <>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Detalle de Jornada</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ padding: 20 }}>
                <Text style={styles.bigDate}>{formatDayAndNumberHeader(selectedFlight)}</Text>
                
                {(selectedFlight.isRPT || (selectedFlight.cambiosDetectados && selectedFlight.cambiosDetectados.length > 0)) && (
                  <View style={{ 
                    backgroundColor: selectedFlight.rptType === 'DELAY' ? '#FEF3C7' : '#FEE2E2', 
                    padding: 12, 
                    borderRadius: 8, 
                    marginBottom: 15, 
                    borderWidth: 1, 
                    borderColor: selectedFlight.rptType === 'DELAY' ? '#F59E0B' : '#FCA5A5' 
                  }}>
                    <Text style={{ color: selectedFlight.rptType === 'DELAY' ? '#92400E' : '#991B1B', fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>
                      🔔 Modificaciones respecto al Plan Original
                    </Text>
                    {selectedFlight.cambiosDetectados && selectedFlight.cambiosDetectados.map((cambio, idx) => (
                      <Text key={idx} style={{ color: selectedFlight.rptType === 'DELAY' ? '#B45309' : '#B91C1C', fontSize: 13, marginTop: 2, fontWeight: '600' }}>
                        {cambio}
                      </Text>
                    ))}
                  </View>
                )}

                <View style={styles.emptyCard}>
                  <Text style={styles.cardTitle}>Tramos Operados</Text>
                  {selectedFlight.tramos && selectedFlight.tramos.map((t, i) => {
                    let turnaroundText = null;
                    if (i > 0 && selectedFlight.tramos[i-1].finRaw && t.comienzoRaw) {
                      turnaroundText = calcularTurnaround(selectedFlight.tramos[i-1].finRaw, t.comienzoRaw);
                    }
                    return (
                      <View key={i}>
                        {turnaroundText && (
                          <View style={{ alignItems: 'center', marginVertical: 8 }}>
                            <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                              <Text style={{ fontSize: 11, color: '#64748B', fontWeight: 'bold' }}>⏳ Turnaround: {turnaroundText}</Text>
                            </View>
                          </View>
                        )}
                        <View style={[styles.tramoRowModal, i > 0 && !turnaroundText && styles.borderTopTramo]}>
                          <View><Text style={styles.flightCardRoute}>{t.ruta}</Text><Text style={styles.detailSub}>Vuelo: {t.nroVuelo}</Text></View>
                          <View style={{ alignItems: 'flex-end' }}><Text style={styles.flightCardTime}>{t.horario}</Text></View>
                        </View>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.emptyCard}>
                  <Text style={styles.cardTitle}>Horarios Operativos</Text>
                  <View style={styles.timeGridModal}>
                    <View>
                      <Text style={styles.timeLabel}>PRESENTACIÓN</Text>
                      <Text style={styles.timeVal}>{selectedFlight.presentacion}</Text>
                    </View>
                    <View>
                      <Text style={styles.timeLabel}>VUELO (TV)</Text>
                      <Text style={styles.timeVal}>{selectedFlight.tiempoVuelo || '0h 00m'}</Text>
                    </View>
                    <View>
                      <Text style={styles.timeLabel}>T. DE SERVICIO</Text>
                      <Text style={styles.timeVal}>{selectedFlight.tiempoServicio || '0h 00m'}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.pickupBtn,
                      !isAutogestionAvailable(selectedFlight.fechaDia) && { backgroundColor: '#64748B' }
                    ]}
                    onPress={() => {
                      if (!isAutogestionAvailable(selectedFlight.fechaDia)) {
                        Alert.alert(
                          'Disponible 24h / 48h en Aeroweb',
                          'El portal de Autogestión Aeroweb muestra únicamente la Actividad de Hoy (24h) y la Actividad de Mañana (48h).'
                        );
                        return;
                      }
                      openDirectAerowebAutogestion(selectedFlight);
                    }}
                  >
                    <Text style={styles.pickupBtnText}>
                      🚕 Detalle del vuelo Aeroweb
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.emptyCard}>
                  <Text style={styles.cardTitle}>Límites y Seguridad</Text>
                  <Text style={styles.detailSub}>
                    Último posible aterrizaje: <Text style={{ fontWeight: 'bold', color: COLORS.primary }}>{selectedFlight.ultimoAterrizaje}</Text>
                  </Text>
                </View>

                <View style={styles.emptyCard}>
                  <Text style={styles.cardTitle}>
                    Tripulación Asignada ({selectedFlight.tripulacion?.length || 0})
                  </Text>
                  {selectedFlight.tripulacion && selectedFlight.tripulacion.length > 0 ? (
                    selectedFlight.tripulacion.map((trip, idx) => (
                      <View key={idx} style={styles.crewRow}>
                        {renderEpaulette(trip.rangType)}
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.crewNameText}>{trip.nombre}</Text>
                          <Text style={styles.crewRankText}>{trip.label} {trip.duty ? `(${trip.duty})` : ''}</Text>
                        </View>
                        <View style={styles.crewRoleBox}><Text style={styles.crewRoleText}>{trip.rol}</Text></View>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.detailSub}>
                      Tocá "Actualizar" para sincronizar la tripulación.
                    </Text>
                  )}
                </View>
              </ScrollView>
            </>
          ) : (
            /* VISTA DIRECTA DE AUTOGESTIÓN AEROWEB (24H ACTIVIDAD DE HOY / 48H ACTIVIDAD DE MAÑANA) */
            <View style={{ flex: 1 }}>
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  onPress={() => setModalViewMode('detail')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <Text style={{ fontSize: 18, color: COLORS.primary, fontWeight: 'bold' }}>‹ Volver</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>
                  {aerowebTargetMode === 'manana' ? 'Aeroweb (48h Mañana)' : 'Aeroweb (24h Hoy)'}
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Botones rápidos 24h / 48h arriba por si querés alternar directamente dentro de Aeroweb */}
              <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F1F5F9', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
                <TouchableOpacity
                  style={[styles.quickAerowebSwitch, aerowebTargetMode === 'hoy' && styles.quickAerowebSwitchActive]}
                  onPress={() => {
                    setAerowebTargetMode('hoy');
                    remisWebViewRef.current?.injectJavaScript(`window.location.href = "${URL_PICKUP_HOY}"; true;`);
                  }}
                >
                  <Text style={[styles.quickAerowebSwitchText, aerowebTargetMode === 'hoy' && { color: '#FFFFFF' }]}>
                    ↺ 24 Actividad de Hoy
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickAerowebSwitch, aerowebTargetMode === 'manana' && styles.quickAerowebSwitchActive]}
                  onPress={() => {
                    setAerowebTargetMode('manana');
                    remisWebViewRef.current?.injectJavaScript(`window.location.href = "${URL_PICKUP_MANANA}"; true;`);
                  }}
                >
                  <Text style={[styles.quickAerowebSwitchText, aerowebTargetMode === 'manana' && { color: '#FFFFFF' }]}>
                    ↺ 48 Actividad de Mañana
                  </Text>
                </TouchableOpacity>
              </View>

              {remisLoading && (
                <View style={{ padding: 8, backgroundColor: '#EFF6FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: 'bold' }}>
                    Ingresando a Autogestión Aeroweb...
                  </Text>
                </View>
              )}

              <View style={{ flex: 1 }}>
                <WebView
                  ref={remisWebViewRef}
                  source={{ uri: URL_AUTOGESTION_LOGIN }}
                  injectedJavaScript={pickupInjectedJS}
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

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('hoy')}><Text style={[styles.tabIcon, activeTab === 'hoy' && styles.tabIconActive]}>✈️</Text><Text style={[styles.tabText, activeTab === 'hoy' && styles.tabTextActive]}>Hoy</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('actividad')}><Text style={[styles.tabIcon, activeTab === 'actividad' && styles.tabIconActive]}>📅</Text><Text style={[styles.tabText, activeTab === 'actividad' && styles.tabTextActive]}>Actividad</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('viaticos')}><Text style={[styles.tabIcon, activeTab === 'viaticos' && styles.tabIconActive]}>$</Text><Text style={[styles.tabText, activeTab === 'viaticos' && styles.tabTextActive]}>Viáticos</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 15, paddingBottom: 10, backgroundColor: COLORS.cardBg, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary },
  headerSubtitle: { fontSize: 11, color: COLORS.textMuted },
  headerButtons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  syncBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  syncBtnText: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
  profileBadgeBtn: { backgroundColor: COLORS.borderLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primary },
  profileBadgeText: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold' },
  scrollContent: { padding: 20, paddingBottom: 100 },
  
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 10, gap: 14 },
  calendarIcon: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  calendarDayName: { fontSize: 10, color: '#ffffff', fontWeight: 'bold', textTransform: 'uppercase' },
  calendarDayNumber: { fontSize: 16, color: '#ffffff', fontWeight: 'bold' },
  todayFullDayText: { fontSize: 22, fontWeight: 'bold', color: COLORS.textDark },
  noActivityText: { fontSize: 15, fontWeight: '600', color: '#64748B', marginVertical: 10 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginTop: 10, marginBottom: 12 },

  globitoContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 30, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  globitoDate: { fontSize: 14, fontWeight: 'bold' },
  globitoSeparator: { width: 1, height: 16, backgroundColor: '#CBD5E1', marginHorizontal: 12 },
  globitoIcon: { fontSize: 16, marginRight: 6 },
  globitoText: { fontSize: 14, fontWeight: '600' },

  flightCard: { backgroundColor: COLORS.cardBg, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.borderLight, shadowColor: COLORS.textDark, shadowOpacity: 0.05, shadowRadius: 8 },
  flightCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  flightCardHeaderLeft: { flex: 1, paddingRight: 6 },
  flightCardDate: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 4 },
  badgeFlotaContainer: { backgroundColor: COLORS.primary, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeFlotaText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
  flightCardHeaderRight: { marginLeft: 12, alignItems: 'center' },
  flightCardHeaderLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600', marginBottom: 2 },
  flightCardHeaderVal: { fontSize: 14, fontWeight: 'bold', color: COLORS.textDark },
  
  metricsRowCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 4 },
  metricPill: { flexDirection: 'row', alignItems: 'center' },
  metricPillLabel: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  metricPillVal: { fontSize: 12, fontWeight: 'bold', color: COLORS.textDark },

  flightCardDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 10 },
  flightCardTramoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  flightCardRoute: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark },
  flightCardFlightNum: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  flightCardTime: { fontSize: 14, fontWeight: '600', color: COLORS.textDark },

  actividadSpecialCard: { backgroundColor: COLORS.cardBg, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.borderLight, borderLeftWidth: 6, shadowColor: COLORS.textDark, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  actividadSpecialCardContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  actividadSpecialCardDate: { fontSize: 15, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 2 },
  actividadSpecialCardTitle: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  actividadSpecialCardIcon: { fontSize: 18, color: '#10B981', marginLeft: 10 },

  emptyCard: { backgroundColor: COLORS.cardBg, borderRadius: 14, padding: 18, marginBottom: 15, borderWidth: 1, borderColor: COLORS.borderLight },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 8 },
  summaryText: { fontSize: 13, color: COLORS.textDark, marginTop: 4, textAlign: 'center' },

  monthSelectorLight: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  monthBtnLight: { width: 36, height: 36, backgroundColor: '#f1f5f9', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  monthBtnTextLight: { color: '#475569', fontSize: 18, fontWeight: 'bold' },
  monthTitleLight: { fontSize: 20, fontWeight: 'bold', color: COLORS.textDark },
  monthSubtitleLight: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  sectionHeaderLight: { fontSize: 12, color: '#64748b', fontWeight: 'bold', letterSpacing: 1, marginBottom: 8, marginTop: 10, marginLeft: 10 },
  listCard: { backgroundColor: COLORS.cardBg, borderRadius: 14, paddingHorizontal: 18, marginBottom: 15, borderWidth: 1, borderColor: COLORS.borderLight },
  rowItemRight: { flexDirection: 'row', alignItems: 'center' },
  chevron: { fontSize: 18, color: '#64748b', marginLeft: 8 },
  subRowViatico: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingLeft: 4, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  subRowDate: { fontSize: 14, color: '#64748b', width: 55, fontWeight: '500' },
  subRowFlights: { flex: 1, fontSize: 14, color: '#475569', fontWeight: '500' },
  subRowAmount: { fontSize: 14, color: '#475569', fontWeight: '600', marginRight: 8 },
  subRowChevron: { fontSize: 16, color: '#94a3b8' },
  footerTextLight: { fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 10, paddingHorizontal: 20, lineHeight: 16 },

  crewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  epauletteContainer: { width: 44, height: 28, backgroundColor: '#111827', borderRadius: 4, justifyContent: 'space-evenly', paddingVertical: 3, paddingHorizontal: 2, borderWidth: 1, borderColor: '#374151' },
  goldStripe: { height: 2, backgroundColor: '#F59E0B', borderRadius: 1, width: '100%' },
  epauletteContainerBlue: { width: 44, height: 28, backgroundColor: '#1E3A8A', borderRadius: 4, justifyContent: 'space-evenly', paddingVertical: 4, paddingHorizontal: 2, borderWidth: 1, borderColor: '#3B82F6' },
  silverStripe: { height: 2, backgroundColor: '#E2E8F0', borderRadius: 1, width: '100%' },
  epauletteContainerDots: { width: 44, height: 28, backgroundColor: '#111827', borderRadius: 4, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#374151' },
  dotsText: { color: '#9CA3AF', fontSize: 12, fontWeight: 'bold', letterSpacing: 2 },
  crewRoleBox: { backgroundColor: COLORS.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  crewRoleText: { color: '#ffffff', fontWeight: 'bold', fontSize: 11 },
  crewNameText: { fontSize: 13, fontWeight: 'bold', color: COLORS.textDark },
  crewRankText: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },

  toggleContainer: { flexDirection: 'row', backgroundColor: COLORS.borderLight, borderRadius: 10, padding: 4, marginBottom: 15 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: { backgroundColor: COLORS.primary },
  toggleText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  toggleTextActive: { color: '#ffffff' },

  rowItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  itemLabel: { fontSize: 15, color: '#334155', fontWeight: '500' },
  itemVal: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark },

  modalContainer: { flex: 1, backgroundColor: COLORS.bgLight },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, backgroundColor: COLORS.cardBg },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.textDark },
  closeButton: { backgroundColor: '#f1f5f9', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  closeButtonText: { fontSize: 18, fontWeight: 'bold', color: '#475569' },
  bigDate: { fontSize: 26, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 15 },
  tramoRowModal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  borderTopTramo: { borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 8 },
  detailSub: { fontSize: 13, color: '#475569', marginVertical: 2 },
  timeGridModal: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: 12, borderRadius: 8 },
  timeLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted },
  timeVal: { fontSize: 15, fontWeight: 'bold', color: COLORS.textDark, marginTop: 2 },

  pickupBtn: { backgroundColor: COLORS.primary, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 10, marginTop: 12, alignItems: 'center' },
  pickupBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },

  quickAerowebSwitch: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center' },
  quickAerowebSwitchActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  quickAerowebSwitchText: { fontSize: 12, fontWeight: 'bold', color: '#334155' },

  tabBar: { flexDirection: 'row', position: 'absolute', bottom: 0, left: 0, right: 0, height: 65, backgroundColor: COLORS.cardBg, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingBottom: 10 },
  tabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabIcon: { fontSize: 20, opacity: 0.5 },
  tabIconActive: { opacity: 1 },
  tabText: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  tabTextActive: { color: COLORS.primary, fontWeight: 'bold' }
});