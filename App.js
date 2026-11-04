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

// Configurar para que las notificaciones suenen y aparezcan como banner incluso con la app abierta
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
});

const URL_PICKUP_HOY = 'https://ssl.aerolineas.com.ar/FORMS/ActividadesProgramadas/Autogestion/IndexPost';
const URL_PICKUP_MANANA = 'https://ssl.aerolineas.com.ar/FORMS/ActividadesProgramadas/Autogestion/MananaPost';

const DESTINOS_TRES_PILOTOS = ['LIM', 'SSA', 'BOG', 'CUN', 'PUJ', 'MIA', 'MAD', 'FCO', 'JFK'];

export default function App() {
  const [activeTab, setActiveTab] = useState('hoy');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalViewMode, setModalViewMode] = useState('detail'); // 'detail' | 'aeroweb'
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [silentSyncRunning, setSilentSyncRunning] = useState(false);
  const [lastSyncTimeStr, setLastSyncTimeStr] = useState('');

  // Acordeones del detalle Aeroweb
  const [openAccordion, setOpenAccordion] = useState({
    pickup: true,
    flightStatus: true,
    crew: true,
    liveWeb: false
  });

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

  // Motor de actualización automática cada 15 minutos y cuando la app vuelve del fondo
  useEffect(() => {
    if (!userProfileState?.aerowebUser) return;

    const autoSyncInterval = setInterval(() => {
      if (!syncModalVisible && !silentSyncRunning && !modalVisible) {
        setSilentSyncRunning(true);
      }
    }, 15 * 60 * 1000); // Cada 15 minutos

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

  // Detecta silenciosamente si el vuelo es de 3 pilotos según las rutas indicadas (USH+FTE, LIM, SSA, etc.)
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

  const RestarUnaHora = (horaStr) => {
    if (!horaStr || !horaStr.includes(':')) return '-';
    let [h, m] = horaStr.split(':').map(Number);
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
    if (c.startsWith('SB') || c === 'SBF') return 'Simulador';
    if (c === '*') return 'Día OFF';
    if (c === 'RPT') return 'Reprogramación (RPT)';
    if (c === 'LIC' || c === 'MED') return 'Licencia / Médico';
    return code;
  };

  const isSpecialActivity = (code) => {
    const c = code?.toUpperCase() || '';
    return ['D/L', 'VAC', '*', 'OF', 'RPT'].includes(c) || c.startsWith('SB') || ['LIC', 'MED', 'SBF'].includes(c);
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
        updated.touchesNextDay = calc.touchesNextDay;
        updated.cantPilotos = cantPilotos;

        const tiempos = calcularTiemposOperativos(updated.presentacion, updated.tramos || []);
        updated.tiempoVuelo = tiempos.tvDisplay;
        updated.tiempoServicio = tiempos.tsDisplay;
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
      
      if (!isSpecial && item.comienzo && (!presentacion || presentacion === '-' || Math.abs(parseInt(item.comienzo) - parseInt(presentacion)) > 2)) {
        presentacion = deducirCheckin(item.comienzo);
      }

      if (!daysMap[dateKey]) {
        daysMap[dateKey] = {
          id: dateKey,
          fechaDia: dateKey,
          month: itemMonth,
          presentacion: isSpecial ? '-' : presentacion,
          flota: item.tipoAvion || 'B738',
          ultimoAterrizaje: '-',
          tiempoVuelo: '0h 00m',
          tiempoServicio: '0h 00m',
          cantPilotos: 2,
          touchesNextDay: false,
          tramos: [],
          tripulacion: [],
          pickupTime: item.pickupTime || null,
          pickupAddress: item.pickupAddress || null,
          pickupBase: item.pickupBase || null,
          pickupStatus: item.pickupStatus || null,
          flightStatus: item.flightStatus || null,
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

      if (daysMap[dateKey].presentacion === '-' && presentacion !== '-' && !isSpecial) {
        daysMap[dateKey].presentacion = presentacion;
      }

      if (item.tipoAvion && item.tipoAvion !== 'B737') {
        daysMap[dateKey].flota = item.tipoAvion;
      }

      if (item.pickupTime) daysMap[dateKey].pickupTime = item.pickupTime;
      if (item.pickupAddress) daysMap[dateKey].pickupAddress = item.pickupAddress;
      if (item.pickupBase) daysMap[dateKey].pickupBase = item.pickupBase;
      if (item.pickupStatus) daysMap[dateKey].pickupStatus = item.pickupStatus;
      if (item.flightStatus) daysMap[dateKey].flightStatus = item.flightStatus;

      if (!isSpecial) {
        daysMap[dateKey].isSpecialDay = false; 
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

  const getPickupTargetUrl = (fechaDia) => {
    const flightMs = getMsFromDateStr(fechaDia);
    if (flightMs === todayMs) {
      return URL_PICKUP_HOY;
    }
    return URL_PICKUP_MANANA;
  };

  const isAutogestionAvailable = (fechaDia) => {
    if (!fechaDia) return false;
    const flightMs = getMsFromDateStr(fechaDia);
    return flightMs === todayMs || flightMs === tomorrowMs;
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
          if (!c.pickupTime && prev.pickupTime) c.pickupTime = prev.pickupTime;
          if (!c.pickupAddress && prev.pickupAddress) c.pickupAddress = prev.pickupAddress;
          if (!c.pickupBase && prev.pickupBase) c.pickupBase = prev.pickupBase;
          if (!c.pickupStatus && prev.pickupStatus) c.pickupStatus = prev.pickupStatus;
          if (!c.flightStatus && prev.flightStatus) c.flightStatus = prev.flightStatus;
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
          } else if (
            (!updatedOrig[existingOrigIndex].tripulacion || updatedOrig[existingOrigIndex].tripulacion.length <= 1) &&
            day.tripulacion && day.tripulacion.length > 1
          ) {
            updatedOrig[existingOrigIndex].tripulacion = day.tripulacion;
          }
        });
        await AsyncStorage.setItem('rosterOriginal', JSON.stringify(updatedOrig));
        originalCards = updatedOrig;
      }

      groupedRealizada = compararConOriginal(groupedRealizada, originalCards);

      // Disparar notificación si hubo algún cambio nuevo respecto a la última lectura
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
              title: `✈️ Modificación en tu vuelo del ${day.fechaDia}`,
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

      if (origDay && !realDay.isSpecialDay) {
        const origRutas = origDay.tramos?.map(t => t.nroVuelo).join(',') || '';
        const realRutas = realDay.tramos?.map(t => t.nroVuelo).join(',') || '';
        const origHorario = origDay.tramos?.[0]?.horario || '-';
        const realHorario = realDay.tramos?.[0]?.horario || '-';

        if (origRutas !== realRutas && realRutas !== '') {
          realDay.isRPT = true;
          realDay.rptType = 'ROUTE';
          realDay.originalHorario = origHorario;
          realDay.originalPresentacion = origDay.presentacion;
          cambios.push(`🔄 Cambio de vuelo: Orig ${origRutas} (${origHorario})`);
        } else if (origHorario !== realHorario) {
          realDay.isRPT = true;
          realDay.rptType = 'DELAY';
          realDay.originalHorario = origHorario;
          realDay.originalPresentacion = origDay.presentacion;
          cambios.push(`⚠️ Horario modificado: Orig Presentación ${origDay.presentacion} | Vuelo ${origHorario}`);
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

  // Script inyectado en el WebView dentro de "Pick up, detalle del vuelo Aeroweb"
  const pickupInjectedJS = `
    (function() {
      function parseAutogestionPage() {
        try {
          var pass = document.querySelector('input[type="password"]');
          var inputs = document.querySelectorAll('input');
          var user = null;
          for (var i = 0; i < inputs.length; i++) {
            var t = (inputs[i].getAttribute('type') || '').toLowerCase();
            if ((t === 'text' || t === '') && inputs[i].type !== 'hidden') {
              user = inputs[i]; break;
            }
          }
          if (user && pass && !window._pickupLoginDone) {
            window._pickupLoginDone = true;
            user.value = "${userProfileState?.aerowebUser || ''}";
            user.dispatchEvent(new Event('change', { bubbles: true }));
            pass.value = "${userProfileState?.dni || userProfileState?.aerowebPass || ''}";
            pass.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(function() {
              var btn = document.querySelector('input[type="submit"], button[type="submit"], button');
              if (btn) btn.click();
            }, 400);
            return;
          }

          var bodyTxt = document.body ? (document.body.textContent || document.body.innerText) : '';
          if (bodyTxt.length > 120 && !pass) {
            // 1. Extraer todos los tripulantes (usando textContent para leer las 5 filas aunque el acordeón esté cerrado)
            var extractedCrew = [];
            var rows = document.querySelectorAll('table tr');
            rows.forEach(function(row) {
              var cells = row.querySelectorAll('td');
              if (cells.length >= 3) {
                var cat = (cells[0].textContent || '').trim().toUpperCase();
                var duty = (cells[1].textContent || '').trim().toUpperCase();
                var nombre = (cells[2].textContent || '').trim().replace(/\\s+/g, ' ');
                if (['CP', 'FO', 'CM', 'AX', 'TC', 'JP'].includes(cat) && nombre.length > 2) {
                  if (!extractedCrew.some(function(c) { return c.rol === cat && c.nombre === nombre; })) {
                    extractedCrew.push({ rol: cat, duty: duty, nombre: nombre });
                  }
                }
              }
            });

            // 2. Extraer Horario de búsqueda programado (ej: 05:10), Domicilio, Base y Estado
            var pkMatch = bodyTxt.match(/Horario\\s*de\\s*b[uú]squeda(?:\\s*programado)?\\s*:\\s*(\\d{2}:\\d{2})/i)
                       || bodyTxt.match(/(?:Pick\\s*Up|Remis)\\s*:\\s*(\\d{2}:\\d{2})/i);
            var dirMatch = bodyTxt.match(/Domicilio\\s*:\\s*([^\\n\\r]+?)(?=\\s*Base:|\\s*Hora|$)/i);
            var baseMatch = bodyTxt.match(/Base\\s*:\\s*([^\\n\\r]+?)(?=\\s*Estado|\\s*El viaje|$)/i);
            var statusMovilMatch = bodyTxt.match(/(VIAJE\\s+VALIDADO[^\\n\\r]*|VEH[IÍ]CULO\\s+ASIGNADO[^\\n\\r]*)/i);

            // 3. Extraer Estado del vuelo (Equipo: 73W y clases W / Y)
            var eqMatch = bodyTxt.match(/Estado\\s*del\\s*vuelo\\s*:\\s*(\\d+)\\s*-\\s*Equipo\\s*:\\s*([A-Z0-9]+)/i);
            var cabinClasses = [];
            rows.forEach(function(r) {
              var cTds = r.querySelectorAll('td');
              if (cTds.length === 5) {
                var orig = (cTds[0].textContent || '').trim();
                var clase = (cTds[1].textContent || '').trim();
                var cap = (cTds[2].textContent || '').trim();
                var booked = (cTds[3].textContent || '').trim();
                var disp = (cTds[4].textContent || '').trim();
                if ((clase === 'W' || clase === 'Y' || clase === 'C') && !isNaN(parseInt(cap))) {
                  cabinClasses.push({ origen: orig, clase: clase, capacidad: cap, booked: booked, disponibles: disp });
                }
              }
            });

            if (extractedCrew.length > 0 || pkMatch || dirMatch || cabinClasses.length > 0) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'autogestion_extracted',
                pickupTime: pkMatch ? pkMatch[1] : null,
                pickupAddress: dirMatch ? dirMatch[1].trim() : null,
                pickupBase: baseMatch ? baseMatch[1].trim() : null,
                pickupStatus: statusMovilMatch ? statusMovilMatch[1].trim() : null,
                flightStatus: (eqMatch || cabinClasses.length > 0) ? {
                  vuelo: eqMatch ? eqMatch[1] : '',
                  equipo: eqMatch ? eqMatch[2] : '',
                  clases: cabinClasses
                } : null,
                crew: extractedCrew
              }));
            }
          }
        } catch(e) {}
      }
      setInterval(parseAutogestionPage, 1400);
    })();
    true;
  `;

  const handlePickupWebViewMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'autogestion_extracted') {
        let formattedCrew = selectedFlight.tripulacion || [];

        if (data.crew && data.crew.length > 0) {
          formattedCrew = data.crew.map(trip => ({
            rol: trip.rol,
            duty: trip.duty,
            nombre: trip.nombre,
            rangType: trip.rol === 'CP' ? '4_gold' : (trip.rol === 'FO' ? '3_gold' : (trip.rol === 'CM' ? '2_silver' : 'dots')),
            label: trip.rol === 'CP' ? 'Comandante' : (trip.rol === 'FO' ? 'Primer Oficial' : (trip.rol === 'CM' ? 'Comisario' : 'Tripulante de Cabina'))
          }));
        }

        const updatedFlight = {
          ...selectedFlight,
          pickupTime: data.pickupTime || selectedFlight.pickupTime,
          pickupAddress: data.pickupAddress || selectedFlight.pickupAddress,
          pickupBase: data.pickupBase || selectedFlight.pickupBase,
          pickupStatus: data.pickupStatus || selectedFlight.pickupStatus,
          flightStatus: data.flightStatus || selectedFlight.flightStatus,
          tripulacion: formattedCrew
        };

        const savedOrigRaw = await AsyncStorage.getItem('rosterOriginal');
        let origCards = savedOrigRaw ? JSON.parse(savedOrigRaw) : [];
        const origIdx = origCards.findIndex(o => o.fechaDia === updatedFlight.fechaDia);
        if (origIdx !== -1 && (!origCards[origIdx].tripulacion || origCards[origIdx].tripulacion.length <= 1) && formattedCrew.length > 1) {
          origCards[origIdx].tripulacion = formattedCrew;
          await AsyncStorage.setItem('rosterOriginal', JSON.stringify(origCards));
        }

        let updatedRoster = rosterData.map(d =>
          d.fechaDia === updatedFlight.fechaDia ? updatedFlight : d
        );
        updatedRoster = recalculateExistingCards(compararConOriginal(updatedRoster, origCards));

        const refreshedFlight = updatedRoster.find(d => d.fechaDia === updatedFlight.fechaDia);
        if (refreshedFlight) setSelectedFlight(refreshedFlight);

        setRosterData(updatedRoster);
        await AsyncStorage.setItem('rosterData', JSON.stringify(updatedRoster));
      }
    } catch (e) {}
  };

  const rosterMonthMatch = rosterData.length > 0 ? rosterData[0].fechaDia.match(/[A-Z]+/) : null;
  const rosterMonthIndex = rosterMonthMatch ? aerowebMonths.indexOf(rosterMonthMatch[0]) : today.getMonth();
  const cobroMonthIndex = (rosterMonthIndex + 2) % 12;
  let cobroYear = today.getFullYear();
  if (rosterMonthIndex >= 10) cobroYear += 1;
  const tituloMes = `${mesesEspanol[rosterMonthIndex]} ${today.getFullYear()}`;
  const subtituloCobro = `a cobrar en ${mesesEspanol[cobroMonthIndex]} ${cobroYear}`;

  let diasServicioFlight = 0;
  let diasServicioSimulador = 0;
  let diasExtraPorCruce = 0;
  let totalReprogramacionesCCT = 0;
  
  const diasOcupados = new Set(rosterData.map(d => d.fechaDia));

  rosterData.forEach(d => {
    if (!d.isSpecialDay) {
      diasServicioFlight++;
      if (d.isRPT) totalReprogramacionesCCT++;
      if (d.touchesNextDay) {
        const currentMs = getMsFromDateStr(d.fechaDia);
        const nextDayMs = currentMs + 86400000;
        const nextDate = new Date(nextDayMs);
        const nextDayStr = `${String(nextDate.getDate()).padStart(2, '0')}${aerowebMonths[nextDate.getMonth()]}`;
        
        if (!diasOcupados.has(nextDayStr)) {
          diasExtraPorCruce++;
        }
      }
    } else if (d.specialName === 'Simulador') {
      diasServicioSimulador++;
    }
  });

  const totalDiasFlight = diasServicioFlight + diasExtraPorCruce;
  const rankMultiplier = esComandante ? 1.3 : 1.0; 

  const viaticoNacionalValor = 87564 * rankMultiplier; 
  const viaticoTierraValor = 77932 * rankMultiplier; 
  const viaticoInternacionalValor = 36; 
  
  const vuelosInternacionales = rosterData.reduce((acc, curr) => {
    let count = 0;
    curr.tramos?.forEach(t => {
      const rutaStr = t?.ruta || '';
      if (rutaStr.includes('GIG') || rutaStr.includes('SCL') || rutaStr.includes('GRU') || rutaStr.includes('MVD') || rutaStr.includes('ASU')) count++;
    });
    return acc + count;
  }, 0);
  
  const pesosTotales = (totalDiasFlight * viaticoNacionalValor) + (diasServicioSimulador * viaticoTierraValor);
  const dolaresTotales = vuelosInternacionales * viaticoInternacionalValor;

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
    else if (item.specialName === 'Simulador') { icon = '🖥️'; colorBg = '#EDE9FE'; colorText = '#7C3AED'; }
    else if (item.specialName === 'Día Libre' || item.specialName === 'Día OFF') { icon = '🏠'; colorBg = '#E0F2FE'; colorText = '#0284C7'; }
    else if (item.specialName === 'Reprogramación (RPT)') { icon = '🔄'; colorBg = '#FFEDD5'; colorText = '#EA580C'; }

    const isPast = isPastActivity(item.fechaDia);

    return (
      <View style={[styles.globitoContainer, { backgroundColor: colorBg, opacity: isPast ? 0.5 : 1 }]}>
        <Text style={[styles.globitoDate, { color: colorText }]}>{item.fechaDia}</Text>
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
            <Text style={styles.flightCardDate}>{item.fechaDia}</Text>
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
                ? `⚠️ DEMORADO (Orig: ${item.originalHorario})`
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
    else if (item.specialName === 'Simulador') { icon = '🖥️'; colorLine = '#8B5CF6'; }
    else if (item.specialName === 'Día OFF' || item.specialName === 'Día Libre') { icon = '🏠'; colorLine = '#64748B'; }
    else if (item.specialName === 'Reprogramación (RPT)') { icon = '🔄'; colorLine = '#EA580C'; }
    
    const isPast = isPastActivity(item.fechaDia);

    return (
      <View key={item.id || index} style={[styles.actividadSpecialCard, { borderLeftColor: colorLine, opacity: isPast ? 0.5 : 1 }]}>
        <View style={styles.actividadSpecialCardContent}>
          <Text style={styles.actividadSpecialCardDate}>{item.fechaDia}</Text>
          <Text style={styles.actividadSpecialCardTitle}>{item.specialName}</Text>
          <View style={{ flex: 1 }} />
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

      {/* Sincronizador silencioso en segundo plano cada 15 minutos */}
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
                <Text style={styles.calendarDayName}>{['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][today.getDay()]}</Text>
                <Text style={styles.calendarDayNumber}>{todayStr}</Text>
              </View>
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
              nextActivity.isSpecialDay 
                ? renderGlobito(nextActivity)
                : renderFlightCard(nextActivity, 'next', () => {
                    setSelectedFlight(nextActivity);
                    setModalViewMode('detail');
                    setModalVisible(true);
                  })
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
              <TouchableOpacity style={styles.monthBtnLight}><Text style={styles.monthBtnTextLight}>{'<'}</Text></TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.monthTitleLight}>{tituloMes}</Text>
                <Text style={styles.monthSubtitleLight}>{subtituloCobro}</Text>
              </View>
              <TouchableOpacity style={styles.monthBtnLight}><Text style={styles.monthBtnTextLight}>{'>'}</Text></TouchableOpacity>
            </View>

            {viaticosView === 'cantidades' ? (
              <View style={styles.listCard}>
                <View style={styles.rowItem}><Text style={styles.itemLabel}>Días de vuelo (+ cruces de día)</Text><View style={styles.rowItemRight}><Text style={styles.itemVal}>{totalDiasFlight}</Text><Text style={styles.chevron}>›</Text></View></View>
                <View style={styles.rowItem}><Text style={styles.itemLabel}>Días de Tierra (Simulador/Inst.)</Text><View style={styles.rowItemRight}><Text style={styles.itemVal}>{diasServicioSimulador}</Text><Text style={styles.chevron}>›</Text></View></View>
                <View style={styles.rowItem}><Text style={styles.itemLabel}>Comidas en escala internacional</Text><View style={styles.rowItemRight}><Text style={styles.itemVal}>{vuelosInternacionales}</Text><Text style={styles.chevron}>›</Text></View></View>
                <View style={[styles.rowItem, { borderBottomWidth: 0 }]}><Text style={styles.itemLabel}>Reprogramaciones CCT</Text><View style={styles.rowItemRight}><Text style={styles.itemVal}>{totalReprogramacionesCCT}</Text><Text style={styles.chevron}>›</Text></View></View>
              </View>
            ) : (
              <View>
                <Text style={styles.sectionHeaderLight}>EN PESOS</Text>
                <View style={styles.listCard}>
                  <View style={styles.rowItem}><Text style={styles.itemLabel}>Viático de vuelo (${viaticoNacionalValor.toLocaleString('es-AR')} x {totalDiasFlight})</Text><View style={styles.rowItemRight}><Text style={styles.itemVal}>$ {(totalDiasFlight * viaticoNacionalValor).toLocaleString('es-AR')}</Text><Text style={styles.chevron}>›</Text></View></View>
                  <View style={styles.rowItem}><Text style={styles.itemLabel}>Viático Tierra (${viaticoTierraValor.toLocaleString('es-AR')} x {diasServicioSimulador})</Text><View style={styles.rowItemRight}><Text style={styles.itemVal}>$ {(diasServicioSimulador * viaticoTierraValor).toLocaleString('es-AR')}</Text><Text style={styles.chevron}>›</Text></View></View>
                  <View style={[styles.rowItem, { borderBottomWidth: 0 }]}><Text style={[styles.itemLabel, { fontWeight: 'bold' }]}>Total</Text><View style={styles.rowItemRight}><Text style={[styles.itemVal, { fontWeight: 'bold', color: COLORS.primary }]}>$ {pesosTotales.toLocaleString('es-AR')}</Text></View></View>
                </View>
                
                <Text style={styles.sectionHeaderLight}>COMIDAS EN ESCALA</Text>
                <View style={styles.listCard}>
                  <View style={styles.rowItem}><Text style={styles.itemLabel}>Comidas internacional (USD 36 x {vuelosInternacionales})</Text><View style={styles.rowItemRight}><Text style={styles.itemVal}>US$ {dolaresTotales}</Text><Text style={styles.chevron}>›</Text></View></View>
                  <View style={[styles.rowItem, { borderBottomWidth: 0 }]}><Text style={[styles.itemLabel, { fontWeight: 'bold' }]}>Total</Text><View style={styles.rowItemRight}><Text style={[styles.itemVal, { fontWeight: 'bold', color: COLORS.primary }]}>US$ {dolaresTotales}</Text></View></View>
                </View>
              </View>
            )}
            
            <Text style={styles.footerTextLight}>Calculado con la normativa AR-877-2021 v1.2.0 • ARSA-APLA-402-2000-E v1.2.0 • B737</Text>
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

      {/* MODAL ÚNICO CON DETALLE DE JORNADA Y VISTA "PICK UP, DETALLE DEL VUELO AEROWEB" INTEGRADA */}
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
                <Text style={styles.bigDate}>{selectedFlight.fechaDia}</Text>
                
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
                          'Disponible el día previo y día del vuelo',
                          'El detalle de Pick up, Estado del vuelo y Búsqueda en Aeroweb se habilita el día anterior al vuelo y durante el día de operación.'
                        );
                        return;
                      }
                      setRemisLoading(true);
                      setModalViewMode('aeroweb');
                    }}
                  >
                    <Text style={styles.pickupBtnText}>
                      🚕 Pick up, detalle del vuelo Aeroweb
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* LÍMITES Y SEGURIDAD LIMPIO */}
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
                      Tocá "Actualizar" o abrí "Pick up, detalle del vuelo Aeroweb" para ver la tripulación.
                    </Text>
                  )}
                </View>
              </ScrollView>
            </>
          ) : (
            /* VISTA INTERNA: PICK UP, DETALLE DEL VUELO AEROWEB */
            <>
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  onPress={() => setModalViewMode('detail')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <Text style={{ fontSize: 18, color: COLORS.primary, fontWeight: 'bold' }}>‹ Volver</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Pick up, detalle Aeroweb</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ padding: 16 }}>
                {remisLoading && (
                  <View style={{ padding: 10, backgroundColor: '#EFF6FF', borderRadius: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: 'bold' }}>
                      Actualizando datos en vivo desde Aeroweb...
                    </Text>
                  </View>
                )}

                {/* ACORDEÓN 1: HORARIO Y BÚSQUEDA DE TRIPULACIONES */}
                <TouchableOpacity
                  style={styles.aerowebBlueBar}
                  onPress={() => setOpenAccordion(prev => ({ ...prev, pickup: !prev.pickup }))}
                >
                  <Text style={styles.aerowebBlueBarText}>🚗 Horario y búsqueda de tripulaciones</Text>
                </TouchableOpacity>
                {openAccordion.pickup && (
                  <View style={styles.aerowebPanelBody}>
                    <View style={styles.aerowebOrangeHeader}>
                      <Text style={styles.aerowebOrangeHeaderText}>Próximo horario</Text>
                    </View>
                    <View style={styles.aerowebPickupBox}>
                      <Text style={styles.aerowebPickupStatus}>
                        {selectedFlight.pickupStatus || 'VIAJE VALIDADO - CONSULTANDO ESTADO DE ASIGNACIÓN'}
                      </Text>
                      <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 8 }} />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={styles.aerowebPickupText}>
                          Horario de búsqueda: <Text style={{ fontWeight: 'bold' }}>{selectedFlight.pickupTime || RestarUnaHora(selectedFlight.presentacion)}</Text>
                        </Text>
                        <Text style={styles.aerowebPickupText}>
                          Presentación: <Text style={{ fontWeight: 'bold' }}>{selectedFlight.presentacion}</Text>
                        </Text>
                      </View>
                      <Text style={styles.aerowebPickupText}>
                        Domicilio: <Text style={{ fontWeight: 'bold' }}>{selectedFlight.pickupAddress || 'Sincronizando domicilio...'}</Text>
                      </Text>
                      {selectedFlight.pickupBase && (
                        <Text style={[styles.aerowebPickupText, { marginTop: 4 }]}>
                          Base: <Text style={{ fontWeight: 'bold' }}>{selectedFlight.pickupBase}</Text>
                        </Text>
                      )}
                    </View>
                  </View>
                )}

                {/* ACORDEÓN 2: ESTADO DEL VUELO */}
                <TouchableOpacity
                  style={styles.aerowebBlueBar}
                  onPress={() => setOpenAccordion(prev => ({ ...prev, flightStatus: !prev.flightStatus }))}
                >
                  <Text style={styles.aerowebBlueBarText}>✈️ Estado del vuelo</Text>
                </TouchableOpacity>
                {openAccordion.flightStatus && (
                  <View style={styles.aerowebPanelBody}>
                    <View style={styles.aerowebOrangeHeader}>
                      <Text style={styles.aerowebOrangeHeaderText}>
                        Estado del vuelo: {selectedFlight.flightStatus?.vuelo || selectedFlight.tramos?.[0]?.nroVuelo || ''} - Equipo: {selectedFlight.flightStatus?.equipo || selectedFlight.flota}
                      </Text>
                    </View>
                    {selectedFlight.flightStatus?.clases && selectedFlight.flightStatus.clases.length > 0 ? (
                      <View style={{ padding: 10 }}>
                        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#CBD5E1', paddingBottom: 6, marginBottom: 6 }}>
                          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Origen</Text>
                          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Clase</Text>
                          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Capacidad</Text>
                          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Booked</Text>
                          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Disponibles</Text>
                        </View>
                        {selectedFlight.flightStatus.clases.map((cl, i) => (
                          <View key={i} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                            <Text style={[styles.tableValCell, { flex: 1 }]}>{cl.origen}</Text>
                            <Text style={[styles.tableValCell, { flex: 1, fontWeight: 'bold' }]}>{cl.clase}</Text>
                            <Text style={[styles.tableValCell, { flex: 1 }]}>{cl.capacidad}</Text>
                            <Text style={[styles.tableValCell, { flex: 1 }]}>{cl.booked}</Text>
                            <Text style={[styles.tableValCell, { flex: 1, fontWeight: 'bold', color: COLORS.primary }]}>{cl.disponibles}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={{ padding: 12, fontSize: 12, color: '#64748B' }}>
                        Cargando disponibilidad de asientos (W / Y) desde Aeroweb...
                      </Text>
                    )}
                  </View>
                )}

                {/* ACORDEÓN 3: TRIPULACIÓN COMPLETA */}
                <TouchableOpacity
                  style={styles.aerowebBlueBar}
                  onPress={() => setOpenAccordion(prev => ({ ...prev, crew: !prev.crew }))}
                >
                  <Text style={styles.aerowebBlueBarText}>
                    👥 Tripulación ({selectedFlight.tripulacion?.length || 0})
                  </Text>
                </TouchableOpacity>
                {openAccordion.crew && (
                  <View style={styles.aerowebPanelBody}>
                    <View style={styles.aerowebOrangeHeader}>
                      <Text style={styles.aerowebOrangeHeaderText}>
                        Tripulación del vuelo {selectedFlight.tramos?.[0]?.nroVuelo || ''}
                      </Text>
                    </View>
                    <View style={{ padding: 10 }}>
                      {(selectedFlight.tripulacion || []).map((trip, idx) => (
                        <View key={idx} style={styles.crewRow}>
                          {renderEpaulette(trip.rangType)}
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.crewNameText}>{trip.nombre}</Text>
                            <Text style={styles.crewRankText}>{trip.label} ({trip.duty || 'OP'})</Text>
                          </View>
                          <View style={styles.crewRoleBox}><Text style={styles.crewRoleText}>{trip.rol}</Text></View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* ACORDEÓN 4: VER PÁGINA / MAPA DEL REMIS EN VIVO DE AEROWEB */}
                <TouchableOpacity
                  style={[styles.aerowebBlueBar, { backgroundColor: '#0F172A' }]}
                  onPress={() => setOpenAccordion(prev => ({ ...prev, liveWeb: !prev.liveWeb }))}
                >
                  <Text style={styles.aerowebBlueBarText}>
                    🗺️ {openAccordion.liveWeb ? 'Ocultar Mapa / Web de Aeroweb' : 'Ver Mapa del Auto / Web Original Aeroweb'}
                  </Text>
                </TouchableOpacity>

                <View style={openAccordion.liveWeb ? styles.liveWebContainerVisible : styles.hiddenWebView}>
                  <WebView
                    ref={remisWebViewRef}
                    source={{ uri: getPickupTargetUrl(selectedFlight.fechaDia) }}
                    injectedJavaScript={pickupInjectedJS}
                    onMessage={handlePickupWebViewMessage}
                    onLoadEnd={() => setRemisLoading(false)}
                    sharedCookiesEnabled={true}
                    thirdPartyCookiesEnabled={true}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                  />
                </View>
              </ScrollView>
            </>
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
  
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 10, gap: 12 },
  calendarIcon: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  calendarDayName: { fontSize: 10, color: '#ffffff', fontWeight: 'bold', textTransform: 'uppercase' },
  calendarDayNumber: { fontSize: 16, color: '#ffffff', fontWeight: 'bold' },
  noActivityText: { fontSize: 15, fontWeight: '600', color: '#64748B', marginVertical: 10 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginTop: 10, marginBottom: 12 },

  globitoContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 30, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  globitoDate: { fontSize: 14, fontWeight: 'bold' },
  globitoSeparator: { width: 1, height: 16, backgroundColor: '#CBD5E1', marginHorizontal: 12 },
  globitoIcon: { fontSize: 16, marginRight: 6 },
  globitoText: { fontSize: 14, fontWeight: '600' },

  flightCard: { backgroundColor: COLORS.cardBg, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.borderLight, shadowColor: COLORS.textDark, shadowOpacity: 0.05, shadowRadius: 8 },
  flightCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  flightCardHeaderLeft: { flex: 1 },
  flightCardDate: { fontSize: 18, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 4 },
  badgeFlotaContainer: { backgroundColor: COLORS.primary, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeFlotaText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
  flightCardHeaderRight: { marginLeft: 15, alignItems: 'center' },
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
  actividadSpecialCardContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16 },
  actividadSpecialCardDate: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark, width: 85 },
  actividadSpecialCardTitle: { fontSize: 15, color: COLORS.textMuted },
  actividadSpecialCardIcon: { fontSize: 18, color: '#10B981' },

  emptyCard: { backgroundColor: COLORS.cardBg, borderRadius: 14, padding: 18, marginBottom: 15, borderWidth: 1, borderColor: COLORS.borderLight },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 8 },
  summaryText: { fontSize: 13, color: COLORS.textDark, marginTop: 4, textAlign: 'center' },

  monthSelectorLight: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  monthBtnLight: { width: 36, height: 36, backgroundColor: '#f1f5f9', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  monthBtnTextLight: { color: '#475569', fontSize: 18, fontWeight: 'bold' },
  monthTitleLight: { fontSize: 18, fontWeight: 'bold', color: COLORS.textDark },
  monthSubtitleLight: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  sectionHeaderLight: { fontSize: 12, color: '#64748b', fontWeight: 'bold', letterSpacing: 1, marginBottom: 8, marginTop: 10, marginLeft: 10 },
  listCard: { backgroundColor: COLORS.cardBg, borderRadius: 14, paddingHorizontal: 18, marginBottom: 15, borderWidth: 1, borderColor: COLORS.borderLight },
  rowItemRight: { flexDirection: 'row', alignItems: 'center' },
  chevron: { fontSize: 18, color: '#cbd5e1', marginLeft: 8, marginTop: -2 },
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
  itemLabel: { fontSize: 15, color: '#334155' },
  itemVal: { fontSize: 15, fontWeight: 'bold', color: COLORS.textDark },

  modalContainer: { flex: 1, backgroundColor: COLORS.bgLight },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, backgroundColor: COLORS.cardBg },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.textDark },
  closeButton: { backgroundColor: '#f1f5f9', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  closeButtonText: { fontSize: 18, fontWeight: 'bold', color: '#475569' },
  bigDate: { fontSize: 32, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 15 },
  tramoRowModal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  borderTopTramo: { borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 8 },
  detailSub: { fontSize: 13, color: '#475569', marginVertical: 2 },
  timeGridModal: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: 12, borderRadius: 8 },
  timeLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted },
  timeVal: { fontSize: 15, fontWeight: 'bold', color: COLORS.textDark, marginTop: 2 },

  pickupBtn: { backgroundColor: COLORS.primary, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 10, marginTop: 12, alignItems: 'center' },
  pickupBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },

  aerowebBlueBar: { backgroundColor: '#1E88E5', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 8, marginBottom: 6, alignItems: 'center' },
  aerowebBlueBarText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  aerowebPanelBody: { backgroundColor: '#FFFFFF', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#CBD5E1', marginBottom: 14 },
  aerowebOrangeHeader: { backgroundColor: '#D84315', paddingVertical: 8, paddingHorizontal: 12 },
  aerowebOrangeHeaderText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  aerowebPickupBox: { backgroundColor: '#0277BD', margin: 12, padding: 14, borderRadius: 6 },
  aerowebPickupStatus: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  aerowebPickupText: { color: '#FFFFFF', fontSize: 12 },
  tableHeaderCell: { fontSize: 11, fontWeight: 'bold', color: '#334155' },
  tableValCell: { fontSize: 12, color: '#1E293B' },
  liveWebContainerVisible: { height: 460, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#CBD5E1', marginBottom: 30 },
  hiddenWebView: { width: 0, height: 0, opacity: 0, overflow: 'hidden' },

  tabBar: { flexDirection: 'row', position: 'absolute', bottom: 0, left: 0, right: 0, height: 65, backgroundColor: COLORS.cardBg, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingBottom: 10 },
  tabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabIcon: { fontSize: 20, opacity: 0.5 },
  tabIconActive: { opacity: 1 },
  tabText: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  tabTextActive: { color: COLORS.primary, fontWeight: 'bold' }
});