// src/services/storage.js
import * as SecureStore from 'expo-secure-store';

export async function saveEncryptedData(key, value) {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error guardando datos encriptados:', error);
  }
}

export async function getEncryptedData(key) {
  try {
    const result = await SecureStore.getItemAsync(key);
    return result ? JSON.parse(result) : null;
  } catch (error) {
    console.error('Error obteniendo datos encriptados:', error);
    return null;
  }
}

export async function deleteEncryptedData(key) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    console.error('Error eliminando datos encriptados:', error);
  }
}
