import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../theme/colors';
import { saveEncryptedData, getEncryptedData } from '../../services/storage';

export default function ProfileSetupScreen({ onClose, onProfileUpdated, onLogout }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'edit'
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');

  // Campos operativos 100% en blanco para usuarios nuevos
  const [nombre, setNombre] = useState('');
  const [aerowebUser, setAerowebUser] = useState('');
  const [aerowebPass, setAerowebPass] = useState('');
  const [dni, setDni] = useState('');
  const [rank, setRank] = useState('');

  useEffect(() => {
    checkActiveSession();
  }, []);

  const checkActiveSession = async () => {
    try {
      let activeProfile = await getEncryptedData('user_profile');
      if (!activeProfile) {
        const raw = await AsyncStorage.getItem('user_profile');
        if (raw) activeProfile = JSON.parse(raw);
      }

      if (activeProfile && (activeProfile.aerowebUser || activeProfile.email)) {
        setIsLoggedIn(true);
        setMode('edit');
        setEmail(activeProfile.email || '');
        setAppPassword(activeProfile.appPassword || '');
        setNombre(activeProfile.nombre || activeProfile.fullName || '');
        setAerowebUser(activeProfile.aerowebUser || '');
        setAerowebPass(activeProfile.aerowebPass || '');
        setDni(activeProfile.dni || '');
        setRank(activeProfile.rank || '');
      } else {
        setIsLoggedIn(false);
        setMode('login');
      }
    } catch (e) {
      setIsLoggedIn(false);
      setMode('login');
    }
  };

  const getAccountsDB = async () => {
    try {
      const dbRaw = await getEncryptedData('accounts_db');
      return dbRaw || {};
    } catch (e) {
      return {};
    }
  };

  const handleLogin = async () => {
    const cleanKey = email.trim().toLowerCase();
    if (!cleanKey || !appPassword) {
      Alert.alert('Datos incompletos', 'Ingresá tu correo electrónico (o legajo) y tu contraseña.');
      return;
    }

    const db = await getAccountsDB();
    let account = db[cleanKey];
    if (!account) {
      account = Object.values(db).find(
        acc => acc.aerowebUser === cleanKey || (acc.email && acc.email.toLowerCase() === cleanKey)
      );
    }

    if (!account || account.appPassword !== appPassword) {
      Alert.alert(
        'Usuario no encontrado o clave incorrecta',
        'Si es tu primera vez con el nuevo sistema de cuentas, tocá la pestaña "Registrarse" arriba para crear tu acceso.'
      );
      return;
    }

    await saveEncryptedData('user_profile', account);
    await AsyncStorage.setItem('user_profile', JSON.stringify(account));

    setIsLoggedIn(true);
    setMode('edit');
    if (onProfileUpdated) onProfileUpdated(account);
    if (onClose) onClose();
  };

  const handleRegisterOrSave = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      Alert.alert('Falta tu Email', 'Ingresá un correo electrónico para poder iniciar sesión fácilmente la próxima vez.');
      return;
    }
    if (!appPassword) {
      Alert.alert('Falta Contraseña', 'Definí una contraseña para ingresar a la app cuando cierres sesión.');
      return;
    }
    if (!aerowebUser.trim() || !aerowebPass.trim() || !rank) {
      Alert.alert('Faltan datos operativos', 'Completá tu Legajo, Clave de Aeroweb y seleccioná tu Función.');
      return;
    }

    const db = await getAccountsDB();

    const profileData = {
      email: cleanEmail,
      appPassword: appPassword,
      nombre: nombre.trim(),
      fullName: nombre.trim(),
      aerowebUser: aerowebUser.trim(),
      aerowebPass: aerowebPass.trim(),
      dni: dni.trim() || aerowebPass.trim(),
      rank: rank,
      updatedAt: new Date().toISOString()
    };

    db[cleanEmail] = profileData;
    await saveEncryptedData('accounts_db', db);
    await saveEncryptedData('user_profile', profileData);
    await AsyncStorage.setItem('user_profile', JSON.stringify(profileData));

    setIsLoggedIn(true);
    setMode('edit');
    if (onProfileUpdated) onProfileUpdated(profileData);
    Alert.alert('Perfil Guardado', 'Tus credenciales quedaron asociadas a tu correo para futuros ingresos.');
    if (onClose) onClose();
  };

  const handleLogoutConfirm = () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Querés cerrar tu sesión? Tus credenciales quedan guardadas en tu cuenta para que vuelvas a entrar solo con tu Email y Contraseña.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar Sesión',
          style: 'destructive',
          onPress: async () => {
            await saveEncryptedData('user_profile', null);
            await AsyncStorage.removeItem('user_profile');
            setIsLoggedIn(false);
            setMode('login');
            setAppPassword('');
            setNombre('');
            setAerowebUser('');
            setAerowebPass('');
            setDni('');
            setRank('');
            if (onLogout) onLogout();
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {isLoggedIn ? 'Configuración de Perfil' : (mode === 'login' ? 'Iniciar Sesión' : 'Registro de Nuevo Usuario')}
          </Text>
          {onClose && isLoggedIn && (
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {!isLoggedIn && (
            <View style={styles.switchTabContainer}>
              <TouchableOpacity
                style={[styles.switchTab, mode === 'login' && styles.switchTabActive]}
                onPress={() => setMode('login')}
              >
                <Text style={[styles.switchTabText, mode === 'login' && styles.switchTabTextActive]}>
                  Iniciar Sesión
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.switchTab, mode === 'register' && styles.switchTabActive]}
                onPress={() => {
                  setMode('register');
                  setEmail('');
                  setAppPassword('');
                  setNombre('');
                  setAerowebUser('');
                  setAerowebPass('');
                  setDni('');
                  setRank('');
                }}
              >
                <Text style={[styles.switchTabText, mode === 'register' && styles.switchTabTextActive]}>
                  Registrarse (Nuevo)
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!isLoggedIn && mode === 'login' ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Bienvenido a PLANES</Text>
              <Text style={styles.helperText}>
                Ingresá tu email y contraseña. Si sos un usuario nuevo probando la beta, tocá la pestaña "Registrarse (Nuevo)" arriba.
              </Text>

              <Text style={styles.label}>Correo Electrónico</Text>
              <TextInput
                style={styles.input}
                placeholder="tu@correo.com"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />

              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                style={styles.input}
                placeholder="Contraseña de tu cuenta"
                placeholderTextColor="#94A3B8"
                secureTextEntry
                value={appPassword}
                onChangeText={setAppPassword}
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin}>
                <Text style={styles.primaryBtnText}>Ingresar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>1. Datos de Acceso a la App</Text>
                <Text style={styles.helperText}>
                  Con este correo y contraseña vas a volver a entrar si cerrás sesión.
                </Text>

                <Text style={styles.label}>Correo Electrónico</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ejemplo@gmail.com"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />

                <Text style={styles.label}>Contraseña de Acceso a la App</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Definí tu clave para entrar a PLANES"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                  value={appPassword}
                  onChangeText={setAppPassword}
                />

                <Text style={styles.label}>Nombre y Apellido</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Damián Croci"
                  placeholderTextColor="#94A3B8"
                  value={nombre}
                  onChangeText={setNombre}
                />
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>2. Credenciales Aeroweb y Función</Text>
                <Text style={styles.label}>Función Operativa</Text>
                <View style={styles.rankContainer}>
                  <TouchableOpacity
                    style={[styles.rankBtn, rank === 'Comandante' && styles.rankBtnActive]}
                    onPress={() => setRank('Comandante')}
                  >
                    <Text style={[styles.rankText, rank === 'Comandante' && styles.rankTextActive]}>
                      👨‍✈️ Comandante
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rankBtn, rank === 'Primer Oficial' && styles.rankBtnActive]}
                    onPress={() => setRank('Primer Oficial')}
                  >
                    <Text style={[styles.rankText, rank === 'Primer Oficial' && styles.rankTextActive]}>
                      ✈️ Primer Oficial
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Legajo Aerolíneas</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ingresá tu legajo"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={aerowebUser}
                  onChangeText={setAerowebUser}
                />

                <Text style={styles.label}>Contraseña Aeroweb</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Tu clave de Aeroweb"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                  value={aerowebPass}
                  onChangeText={setAerowebPass}
                />

                <Text style={styles.label}>DNI (Para Autogestión / Pick Up)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Tu DNI sin puntos"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={dni}
                  onChangeText={setDni}
                />

                <TouchableOpacity style={styles.primaryBtn} onPress={handleRegisterOrSave}>
                  <Text style={styles.primaryBtnText}>
                    {isLoggedIn ? 'Guardar Perfil y Credenciales' : 'Crear Cuenta e Ingresar'}
                  </Text>
                </TouchableOpacity>

                {isLoggedIn && (
                  <TouchableOpacity style={styles.logoutBtn} onPress={handleLogoutConfirm}>
                    <Text style={styles.logoutBtnText}>🚪 Cerrar Sesión</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: COLORS.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.textDark },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeBtnText: { fontSize: 16, fontWeight: 'bold', color: '#475569' },
  scroll: { padding: 20, paddingBottom: 60 },
  switchTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20
  },
  switchTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  switchTabActive: { backgroundColor: COLORS.primary },
  switchTabText: { fontSize: 13, fontWeight: 'bold', color: '#475569' },
  switchTabTextActive: { color: '#FFFFFF' },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary, marginBottom: 6 },
  helperText: { fontSize: 12, color: '#64748B', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textDark
  },
  rankContainer: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 6 },
  rankBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center'
  },
  rankBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  rankText: { fontSize: 13, fontWeight: 'bold', color: '#475569' },
  rankTextActive: { color: '#FFFFFF' },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 22
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
  logoutBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14
  },
  logoutBtnText: { color: '#DC2626', fontSize: 14, fontWeight: 'bold' }
});