// src/modules/auth/ProfileSetupScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { COLORS } from '../../theme/colors';
import { saveEncryptedData, getEncryptedData } from '../../services/storage';

export default function ProfileSetupScreen({ onClose }) {
  const [role, setRole] = useState('Copiloto');
  const [fleet, setFleet] = useState('B737');
  const [whatsapp, setWhatsapp] = useState('');
  const [aerowebUser, setAerowebUser] = useState('');
  const [aerowebPass, setAerowebPass] = useState('');
  const [dni, setDni] = useState('');

  useEffect(() => {
    async function loadProfile() {
      const savedProfile = await getEncryptedData('user_profile');
      if (savedProfile) {
        setRole(savedProfile.role || 'Copiloto');
        setFleet(savedProfile.fleet || 'B737');
        setWhatsapp(savedProfile.whatsapp || '');
        setAerowebUser(savedProfile.aerowebUser || '');
        setAerowebPass(savedProfile.aerowebPass || '');
        setDni(savedProfile.dni || '');
      }
    }
    loadProfile();
  }, []);

  const handleSave = async () => {
    if (!aerowebUser || !aerowebPass) {
      Alert.alert('Datos Incompletos', 'Por favor ingresá tu legajo y contraseña de Aeroweb.');
      return;
    }

    const profileData = {
      role,
      fleet,
      whatsapp,
      aerowebUser,
      aerowebPass,
      dni
    };

    await saveEncryptedData('user_profile', profileData);
    Alert.alert('Perfil Guardado', 'Tus credenciales han sido encriptadas correctamente en tu dispositivo.');
    if (onClose) onClose();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Configurar Perfil</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.subtitle}>
          Tus credenciales se guardan encriptadas en el chip de seguridad de tu dispositivo y nunca salen de él.
        </Text>

        {/* FUNCIÓN */}
        <Text style={styles.label}>FUNCIÓN OPERATIVA</Text>
        <View style={styles.row}>
          {['Comandante', 'Copiloto', 'TCP'].map((item) => (
            <TouchableOpacity 
              key={item} 
              style={[styles.chip, role === item && styles.chipActive]}
              onPress={() => setRole(item)}
            >
              <Text style={[styles.chipText, role === item && styles.chipTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* FLOTA */}
        <Text style={styles.label}>FLOTA PRINCIPAL</Text>
        <View style={styles.row}>
          {['B737', 'E190', 'A330'].map((item) => (
            <TouchableOpacity 
              key={item} 
              style={[styles.chip, fleet === item && styles.chipActive]}
              onPress={() => setFleet(item)}
            >
              <Text style={[styles.chipText, fleet === item && styles.chipTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* WHATSAPP */}
        <Text style={styles.label}>WHATSAPP (Para listas de tripulación)</Text>
        <TextInput
          style={styles.input}
          placeholder="+54 9 11 1234-5678"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="phone-pad"
          value={whatsapp}
          onChangeText={setWhatsapp}
        />

        {/* ACCESO AEROWEB */}
        <View style={styles.vaultSection}>
          <Text style={styles.vaultTitle}>🔒 Acceso Aeroweb</Text>

          <Text style={styles.label}>LEGAJO</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: 31451"
            placeholderTextColor={COLORS.textMuted}
            value={aerowebUser}
            onChangeText={setAerowebUser}
            autoCapitalize="none"
            keyboardType="number-pad"
          />

          <Text style={styles.label}>CONTRASEÑA PORTAL AEROWEB</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={COLORS.textMuted}
            secureTextEntry
            value={aerowebPass}
            onChangeText={setAerowebPass}
          />

          <Text style={styles.label}>DNI (Clave por defecto Programación/Roster)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: 32888999"
            placeholderTextColor={COLORS.textMuted}
            value={dni}
            onChangeText={setDni}
            keyboardType="number-pad"
          />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Guardar Datos Encriptados</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, backgroundColor: COLORS.cardBg },
  title: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary },
  closeBtn: { backgroundColor: '#f1f5f9', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark },
  scrollContent: { padding: 20 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, marginBottom: 20, lineHeight: 18 },
  label: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 8, marginTop: 12 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: COLORS.cardBg, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textDark, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#ffffff' },
  input: { backgroundColor: COLORS.cardBg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, color: COLORS.textDark, fontSize: 15 },
  vaultSection: { marginTop: 20, padding: 16, backgroundColor: COLORS.cardBg, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderLight },
  vaultTitle: { fontSize: 15, fontWeight: 'bold', color: COLORS.primary, marginBottom: 10 },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 25, marginBottom: 40 },
  saveBtnText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' }
});