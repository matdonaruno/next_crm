// Quick test for sensor API
const testPayload = {
  ahtTemp: 25.9,
  ahtHum: 58.8,
  bmpTemp: 26.7,
  bmpPres: 1006,
  batteryVolt: 3.3,
  deviceId: "BCFF4D0E8852BCFF4D0E8852",
  token: "xM11a2W3mp1l5oCJzyPbTtFCAbdd02r9",
  ipAddress: "192.168.0.16",
  timestamp: 1749501813
};

fetch('http://localhost:3000/api/sensor', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(testPayload)
})
.then(res => {
  console.log('Status:', res.status);
  return res.text();
})
.then(data => console.log('Response:', data))
.catch(err => console.error('Error:', err));