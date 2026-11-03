const fetch = require('node-fetch');

async function sendPushNotification(expoPushToken, title, body) {
  if (!expoPushToken) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: expoPushToken,
      sound: 'default',
      title: title,
      body: body,
      data: { withSome: 'data' },
    }),
  });
}

async function checkAerowebChanges() {
  const user = process.env.AEROWEB_USER;
  const pass = process.env.AEROWEB_PASS;
  const pushToken = process.env.EXPO_PUSH_TOKEN;

  console.log(`Verificando cambios en Aeroweb para el legajo ${user}...`);

  // Aquí conectamos con el endpoint de Aeroweb para extraer el roster actual
  // (Simulación de comparación con base de datos o estado anterior)
  let changesDetected = false;
  let alertMessage = '';

  // Ejemplo de detección de cambio operativo:
  // if (horarioCambio || tripulanteCambio) {
  //   changesDetected = true;
  //   alertMessage = '⚠️ Atención: Se detectó una modificación en tu vuelo AR1280.';
  // }

  if (changesDetected) {
    await sendPushNotification(pushToken, 'Cambio en Aeroweb ✈️', alertMessage);
    console.log('Notificación Push enviada con éxito.');
  } else {
    console.log('Sin novedades operativas en este ciclo.');
  }
}

checkAerowebChanges();