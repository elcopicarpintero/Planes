import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert, Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../../theme/colors';
import { saveEncryptedData, getEncryptedData } from '../../services/storage';

export default function ProfileSetupScreen({ onClose, onProfileUpdated, onLogout }) {
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [telefono, setTelefono] = useState('');
  const [rank, setRank] = useState(''); // Inicia en blanco sin pre-marcar nada
  const [fleet, setFleet] = useState(''); // Inicia en blanco sin pre-marcar nada
  const [aerowebUser, setAerowebUser] = useState('');
  const [aerowebPass, setAerowebPass] = useState('');
  const [avatarUri, setAvatarUri] = useState(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        let saved = await getEncryptedData('user_profile');
        if (!saved) {
          const raw = await AsyncStorage.getItem('user_profile');
          if (raw) saved = JSON.parse(raw);
        }
        if (saved && saved.aerowebUser) {
          setNombre(saved.nombre || '');
          setDni(saved.dni || '');
          setEmail(saved.email || '');
          setAppPassword(saved.appPassword || '');
          setTelefono(saved.telefono || '');
          setRank(saved.rank || '');
          setFleet(saved.fleet || '');
          setAerowebUser(saved.aerowebUser || '');
          setAerowebPass(saved.aerowebPass || '');
          setAvatarUri(saved.avatarUri || null);
        }
      } catch (e) {}
    }
    loadProfile();
  }, []);

  const handlePickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso requerido', 'Habilitá el acceso a tus fotos para elegir y recortar tu imagen de perfil.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const finalUri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        setAvatarUri(finalUri);
      }
    } catch (e) {
      Alert.alert('Aviso', 'Verificá haber ejecutado: npx expo install expo-image-picker');
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarUri(null);
  };

  const handleSave = async () => {
    if (!nombre.trim() || !dni.trim() || !aerowebUser.trim() || !rank || !fleet) {
      Alert.alert(
        'Datos incompletos',
        'Por favor completá Nombre y Apellido, DNI, Función a bordo, Flota y tu Legajo de AeroWeb.'
      );
      return;
    }

    const profileData = {
      nombre: nombre.trim().toUpperCase(),
      dni: dni.trim(),
      email: email.trim(),
      appPassword: appPassword,
      telefono: telefono.trim(),
      rank,
      fleet,
      aerowebUser: aerowebUser.trim(),
      aerowebPass: aerowebPass.trim() || dni.trim(),
      avatarUri: avatarUri || null,
      updatedAt: new Date().toISOString()
    };

    try {
      await saveEncryptedData('user_profile', profileData);
    } catch (e) {}
    await AsyncStorage.setItem('user_profile', JSON.stringify(profileData));

    try {
      const rawAvatars = await AsyncStorage.getItem('crew_avatars_registry');
      const registry = rawAvatars ? JSON.parse(rawAvatars) : {};
      const cleanKey = profileData.nombre.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
      if (profileData.avatarUri) {
        registry[cleanKey] = profileData.avatarUri;
        registry[profileData.aerowebUser] = profileData.avatarUri;
      } else {
        delete registry[cleanKey];
        delete registry[profileData.aerowebUser];
      }
      await AsyncStorage.setItem('crew_avatars_registry', JSON.stringify(registry));
    } catch (e) {}

    if (onProfileUpdated) onProfileUpdated(profileData);
    if (onClose) onClose();
  };

  const handleClearSession = async () => {
    try {
      await saveEncryptedData('user_profile', null);
    } catch (e) {}
    await AsyncStorage.multiRemove([
      'user_profile',
      'rosterData',
      'rosterOriginal',
      'lastSyncTimeStr',
      'aeroweb_annual_summary',
      'aeroweb_vencimientos_live',
      'synced_full_year_2026_v20'
    ]);
    setNombre('');
    setDni('');
    setEmail('');
    setAppPassword('');
    setTelefono('');
    setRank('');
    setFleet('');
    setAerowebUser('');
    setAerowebPass('');
    setAvatarUri(null);
    if (onLogout) onLogout();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Registro y Perfil de Tripulante</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarFallbackText}>
                {nombre ? nombre.trim().slice(0, 2).toUpperCase() : '👤'}
              </Text>
            )}
          </View>
          <View style={styles.avatarButtonsRow}>
            <TouchableOpacity style={styles.avatarBtnPrimary} onPress={handlePickAvatar}>
              <Text style={styles.avatarBtnPrimaryText}>
                {avatarUri ? 'Cambiar / Recortar Foto' : 'Subir Fotografía'}
              </Text>
            </TouchableOpacity>
            {avatarUri && (
              <TouchableOpacity style={styles.avatarBtnDanger} onPress={handleRemoveAvatar}>
                <Text style={styles.avatarBtnDangerText}>Eliminar</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.avatarHint}>
            Visible junto a tu nombre en la sección Tripulación de cada vuelo.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>DATOS DEL TRIPULANTE</Text>

          <Text style={styles.label}>NOMBRE Y APELLIDO</Text>
          <TextInput
            style={styles.input}
            placeholder="Apellido, Nombre"
            placeholderTextColor="#94A3B8"
            value={nombre}
            onChangeText={setNombre}
          />

          <View style={styles.rowGap}>
            <View style={styles.flexOne}>
              <Text style={styles.label}>DNI (SIN PUNTOS)</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                placeholder="Número de DNI"
                placeholderTextColor="#94A3B8"
                value={dni}
                onChangeText={setDni}
              />
            </View>
            <View style={styles.flexOne}>
              <Text style={styles.label}>WHATSAPP (GUÍA)</Text>
              <TextInput
                style={styles.input}
                keyboardType="phone-pad"
                placeholder="+54911..."
                placeholderTextColor="#94A3B8"
                value={telefono}
                onChangeText={setTelefono}
              />
            </View>
          </View>

          <Text style={styles.label}>CORREO ELECTRÓNICO</Text>
          <TextInput
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="correo@aerolineas.com.ar"
            placeholderTextColor="#94A3B8"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>CONTRASEÑA DE LA APLICACIÓN</Text>
          <TextInput
            style={styles.input}
            secureTextEntry={true}
            placeholder="Contraseña para tu cuenta"
            placeholderTextColor="#94A3B8"
            value={appPassword}
            onChangeText={setAppPassword}
          />

          <Text style={styles.label}>FUNCIÓN A BORDO</Text>
          <View style={styles.pillsRow}>
            {['Comandante', 'Primer Oficial', 'Comisario', 'Tripulante'].map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.pillBtn, rank === r && styles.pillBtnActive]}
                onPress={() => setRank(r)}
              >
                <Text style={[styles.pillText, rank === r && styles.pillTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>FLOTA ASIGNADA</Text>
          <View style={styles.pillsRow}>
            {['B737', 'A330', 'E190'].map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.pillBtn, fleet === f && styles.pillBtnActive]}
                onPress={() => setFleet(f)}
              >
                <Text style={[styles.pillText, fleet === f && styles.pillTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>CREDENCIALES INDIVIDUALES AEROWEB (CIFRADAS)</Text>

          <Text style={styles.label}>LEGAJO AEROWEB</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            placeholder="Número de legajo"
            placeholderTextColor="#94A3B8"
            value={aerowebUser}
            onChangeText={setAerowebUser}
          />

          <Text style={styles.label}>CLAVE DE AEROWEB</Text>
          <TextInput
            style={styles.input}
            secureTextEntry={true}
            placeholder="Tu clave personal de AeroWeb"
            placeholderTextColor="#94A3B8"
            value={aerowebPass}
            onChangeText={setAerowebPass}
          />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Guardar Perfil y Sincronizar</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleClearSession}>
          <Text style={styles.logoutBtnText}>Cerrar sesión y limpiar datos en este dispositivo</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  flexOne: { flex: 1 },
  rowGap: { flexDirection: 'row', gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: COLORS.cardBg, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.textDark },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { fontSize: 16, fontWeight: 'bold', color: '#475569' },
  scrollContent: { padding: 18, paddingBottom: 60 },
  avatarSection: { alignItems: 'center', marginBottom: 18, backgroundColor: COLORS.cardBg, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: COLORS.borderLight },
  avatarCircle: { width: 92, height: 92, borderRadius: 46, backgroundColor: '#E0F2FE', borderWidth: 2, borderColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginBottom: 12 },
  avatarImg: { width: 92, height: 92, resizeMode: 'cover' },
  avatarFallbackText: { fontSize: 28, fontWeight: '800', color: COLORS.primary },
  avatarButtonsRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  avatarBtnPrimary: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  avatarBtnPrimaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  avatarBtnDanger: { backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  avatarBtnDangerText: { color: '#DC2626', fontSize: 13, fontWeight: 'bold' },
  avatarHint: { fontSize: 11.5, color: '#64748B', marginTop: 8, textAlign: 'center' },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.borderLight },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: COLORS.primary, letterSpacing: 0.8, marginBottom: 10 },
  label: { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontWeight: '600', color: COLORS.textDark },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 6 },
  pillBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1' },
  pillBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 13, fontWeight: 'bold', color: '#475569' },
  pillTextActive: { color: '#FFFFFF' },
  saveBtn: { backgroundColor: COLORS.primary, paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  logoutBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  logoutBtnText: { color: '#DC2626', fontSize: 14, fontWeight: 'bold' }
});