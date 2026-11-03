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
  // Modos: 'login' | 'register' | 'edit'
  const [mode, setMode] = useState('login');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Campos de cuenta de la App
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');

  // Campos operativos del piloto (100% vacíos por defecto)
  const [nombre, setNombre] = useState('');
  const [aerowebUser, setAerowebUser] = useState('');
  const [aerowebPass, setAerowebPass] = useState('');
  const [dni, setDni] = useState('');
  const [rank, setRank] = useState(''); // '' sin seleccionar al inicio

  useEffect(() => {
    checkActiveSession();
  }, []);

  const checkActiveSession = async () => {
    try {
      const activeProfile = await getEncryptedData('user_profile');
      if (activeProfile && activeProfile.email) {
        setIsLoggedIn(true);
        setMode('edit');
        setEmail(activeProfile.email || '');
        setNombre(activeProfile.nombre || '');
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

  // Base de datos de cuentas registradas
  const getAccountsDB = async () => {
    try {
      const dbRaw = await getEncryptedData('accounts_db');
      return dbRaw || {};
    } catch (e) {
      return {};
    }
  };

  const handleLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !appPassword) {
      Alert.alert('Datos incompletos', 'Ingresá tu correo electrónico y contraseña.');
      return;
    }

    const db = await getAccountsDB();
    const account = db[cleanEmail];

    if (!account || account.appPassword !== appPassword) {
      Alert.alert('Error de acceso', 'Correo o contraseña incorrectos, o el usuario aún no está registrado.');
      return;
    }

    // Restaurar sesión activa con todas las credenciales guardadas
    await saveEncryptedData('user_profile', account);
    await AsyncStorage.setItem('user_profile', JSON.stringify(account));

    setIsLoggedIn(true);
    if (onProfileUpdated) onProfileUpdated(account);
    Alert.alert('¡Bienvenido a bordo!', `Sesión iniciada como ${account.nombre || cleanEmail}`);
    if (onClose) onClose();
  };

  const handleRegisterOrSave = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || (!isLoggedIn && !appPassword)) {
      Alert.alert('Faltan datos de cuenta', 'Por favor completá tu email y una contraseña para la app.');
      return;
    }
    if (!aerowebUser.trim() || !aerowebPass.trim() || !rank) {
      Alert.alert('Faltan datos operativos', 'Completá tu Legajo, Contraseña de Aeroweb y seleccioná tu Función (Comandante o Primer Oficial).');
      return;
    }

    const db = await getAccountsDB();
    const existingAccount = db[cleanEmail] || {};

    const profileData = {
      email: cleanEmail,
      appPassword: appPassword || existingAccount.appPassword,
      nombre: nombre.trim(),
      aerowebUser: aerowebUser.trim(),
      aerowebPass: aerowebPass.trim(),
      dni: dni.trim() || aerowebPass.trim(),
      rank: rank,
      updatedAt: new Date().toISOString()
    };

    // Guardar en la base de datos de cuentas por Email y en la sesión activa
    db[cleanEmail] = profileData;
    await saveEncryptedData('accounts_db', db);
    await saveEncryptedData('user_profile', profileData);
    await AsyncStorage.setItem('user_profile', JSON.stringify(profileData));

    setIsLoggedIn(true);
    if (onProfileUpdated) onProfileUpdated(profileData);
    Alert.alert('Guardado exitoso', 'Tus credenciales y perfil quedaron registrados correctamente.');
    if (onClose) onClose();
  };

  const handleLogoutConfirm = () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Querés cerrar tu sesión actual? La próxima vez solo tendrás que ingresar tu email y contraseña.',
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {isLoggedIn ? 'Mi Perfil Operativo' : (mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta Nueva')}
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
                  // Asegurar campos limpios para nuevo registro
                  setNombre('');
                  setAerowebUser('');
                  setAerowebPass('');
                  setDni('');
                  setRank('');
                }}
              >
                <Text style={[styles.switchTabText, mode === 'register' && styles.switchTabTextActive]}>
                  Registrarse
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* MODO LOGIN SIMPLE */}
          {!isLoggedIn && mode === 'login' ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Ingresá con tu cuenta de PLANES</Text>
              <Text style={styles.helperText}>
                Tus credenciales de Aeroweb y configuración se recuperarán automáticamente.
              </Text>

              <Text style={styles.label}>Correo Electrónico</Text>
              <TextInput
                style={styles.input}
                placeholder="ejemplo@correo.com"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />

              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                style={styles.input}
                placeholder="Tu contraseña de la app"
                placeholderTextColor="#94A3B8"
                secureTextEntry
                value={appPassword}
                onChangeText={setAppPassword}
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin}>
                <Text style={styles.primaryBtnText}>Ingresar a la App</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* MODO REGISTRO NUEVO O EDICIÓN DE PERFIL */
            <View>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>1. Cuenta de Acceso (App)</Text>
                <Text style={styles.label}>Correo Electrónico</Text>
                <TextInput
                  style={[styles.input, isLoggedIn && { backgroundColor: '#F1F5F9', color: '#64748B' }]}
                  placeholder="Tu email para iniciar sesión"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!isLoggedIn}
                  value={email}
                  onChangeText={setEmail}
                />

                {!isLoggedIn && (
                  <>
                    <Text style={styles.label}>Contraseña para la App</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Creá una contraseña para entrar a PLANES"
                      placeholderTextColor="#94A3B8"
                      secureTextEntry
                      value={appPassword}
                      onChangeText={setAppPassword}
                    />
                  </>
                )}

                <Text style={styles.label}>Nombre y Apellido</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Juan Pérez"
                  placeholderTextColor="#94A3B8"
                  value={nombre}
                  onChangeText={setNombre}
                />
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>2. Función y Credenciales Aeroweb</Text>
                <Text style={styles.label}>Seleccioná tu Función (Sin preselección)</Text>
                <View style={styles.rankContainer}>
                  <TouchableOpacity
                    style={[styles.rankBtn, rank === 'Comandante' && styles.rankBtnActive]}
                    onPress={() => setRank('Comandante')}
                  >
                    <Text style={[styles.rankText, rank === 'Comandante' && styles.rankTextActive]}>
                      👨‍✈️ Comandante (CP)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rankBtn, rank === 'Primer Oficial' && styles.rankBtnActive]}
                    onPress={() => setRank('Primer Oficial')}
                  >
                    <Text style={[styles.rankText, rank === 'Primer Oficial' && styles.rankTextActive]}>
                      ✈️ Primer Oficial (FO)
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Legajo Aerolíneas (Usuario Aeroweb)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ingresá tu número de legajo"
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

                <Text style={styles.label}>DNI (Para Autogestión de Remis / Pick Up)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Tu número de DNI sin puntos"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={dni}
                  onChangeText={setDni}
                />

                <TouchableOpacity style={styles.primaryBtn} onPress={handleRegisterOrSave}>
                  <Text style={styles.primaryBtnText}>
                    {isLoggedIn ? 'Guardar Cambios' : 'Registrarme e Ingresar'}
                  </Text>
                </TouchableOpacity>

                {isLoggedIn && (
                  <TouchableOpacity style={styles.logoutBtn} onPress={handleLogoutConfirm}>
                    <Text style={styles.logoutBtnText}>Cerrar Sesión</Text>
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
  switchTabText: { fontSize: 14, fontWeight: 'bold', color: '#475569' },
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
  helperText: { fontSize: 12, color: '#64748B', marginBottom: 14 },
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
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14
  },
  logoutBtnText: { color: '#DC2626', fontSize: 14, fontWeight: 'bold' }
});