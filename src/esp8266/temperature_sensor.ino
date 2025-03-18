#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>  
#include <ESP8266HTTPClient.h>
#include <Wire.h>
#include <Adafruit_AHTX0.h>
#include <Adafruit_BMP280.h>
#include <ArduinoJson.h>
#include <BearSSL.h>

// WiFi設定
const char* ssid = "BBIQRT-2G-pe388f";
const char* password = "8c7f21e9c1edd";

// 固定IP (不要ならWiFi.config()を省略しても良い)
IPAddress staticIP(192, 168, 0, 100);
IPAddress gateway(192, 168, 0, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress dns(192, 168, 0, 1);

// Vercelデプロイ先のエンドポイント (HTTPS)
const char* serverUrl = "https://next-crm-coral.vercel.app/api/sensor";

// Let's Encrypt ルート証明書 (ISRG Root X1) をBearSSL形式で指定
// openssl s_client -showcerts -connect your-app-name.vercel.app:443 などで取得
const char ISRG_Root_X1[] PROGMEM = R"CERT(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)CERT";

// Deep Sleep間隔 (8時間) → 8 * 60 * 60 = 28800秒
// 1日3回程度の起動ペース
const unsigned long SLEEP_INTERVAL_SEC = 28800UL;

// センサーオブジェクト
Adafruit_AHTX0 aht;
Adafruit_BMP280 bmp;

// 測定値 (グローバル)
float ahtTemp = 0;
float ahtHum  = 0;
float bmpTemp = 0;
float bmpPres = 0;

// ======================= setup =========================
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== ESP8266 Deep Sleep (8h) Example ===");

  // GPIO16 と RST を配線しておく必要があります
  // そうしないと deepSleep から自動復帰できません

  // --- WiFi 接続 ---
  connectToWiFi();

  // --- センサー初期化 ---
  Wire.begin(4, 5); // SDA=GPIO4, SCL=GPIO5
  initSensors();

  // --- 測定 ---
  if (readSensors()) {
    printSensorData();
  }

  // --- HTTPS POST 送信 ---
  sendSensorData();

  // --- Deep Sleep へ移行 ---
  Serial.println("Entering Deep Sleep for 8 hours...");
  // 8時間 → 28800秒 → microsecondsへ (×1,000,000)
  ESP.deepSleep(SLEEP_INTERVAL_SEC * 1000000UL);
}

// ======================= loop =========================
void loop() {
  // 実際には到達せず、deepSleep()で再起動になる。
}

// ======================= WiFi接続 ======================
void connectToWiFi() {
  Serial.println("Connecting to WiFi...");

  WiFi.config(staticIP, gateway, subnet, dns);
  WiFi.begin(ssid, password);

  int timeout = 0;
  while ((WiFi.status() != WL_CONNECTED) && (timeout < 40)) {
    delay(500);
    Serial.print(".");
    timeout++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi connection failed!");
  }
}

// ======================= initSensors ===================
void initSensors() {
  Serial.println("Initializing sensors...");

  if (!aht.begin()) {
    Serial.println("Failed to find AHT20 sensor!");
  } else {
    Serial.println("AHT20 sensor initialized.");
  }

  if (!bmp.begin(0x77)) {
    Serial.println("Failed to find BMP280 sensor!");
  } else {
    Serial.println("BMP280 sensor initialized.");
    bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                    Adafruit_BMP280::SAMPLING_X2,
                    Adafruit_BMP280::SAMPLING_X16,
                    Adafruit_BMP280::FILTER_X16,
                    Adafruit_BMP280::STANDBY_MS_500);
  }
}

// ======================= readSensors ===================
bool readSensors() {
  bool success = false;

  // AHT20 読み取り
  sensors_event_t humEvent, tempEvent;
  if (aht.getEvent(&humEvent, &tempEvent)) {
    ahtTemp = tempEvent.temperature;
    ahtHum  = humEvent.relative_humidity;
    success = true;
  } else {
    Serial.println("Failed to read from AHT20!");
  }

  // BMP280 読み取り
  float t = bmp.readTemperature();
  float p = bmp.readPressure() / 100.0F;
  if (!isnan(t) && !isnan(p)) {
    bmpTemp = t;
    bmpPres = p;
    success = true;
  } else {
    Serial.println("Failed to read from BMP280 or invalid data!");
  }

  return success;
}

// ======================= printSensorData ===============
void printSensorData() {
  Serial.println("=== Sensor Readings ===");
  Serial.print("AHT20 => Temp: ");
  Serial.print(ahtTemp);
  Serial.print("°C, Hum: ");
  Serial.print(ahtHum);
  Serial.println("%");

  Serial.print("BMP280 => Temp: ");
  Serial.print(bmpTemp);
  Serial.print("°C, Pres: ");
  Serial.print(bmpPres);
  Serial.println("hPa");
}

// ======================= sendSensorData ================
void sendSensorData() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected, skip sending data.");
    return;
  }

  Serial.println("Sending data to server via HTTPS...");

  WiFiClientSecure client;
  // BearSSLでルート証明書を設定
  BearSSL::X509List cert(ISRG_Root_X1);
  client.setTrustAnchors(&cert);

  // バッファサイズを必要に応じて調整
  client.setBufferSizes(512, 512);
  client.setTimeout(15000);

  HTTPClient http;
  if (!http.begin(client, serverUrl)) {
    Serial.println("HTTPClient.begin() failed!");
    return;
  }

  http.addHeader("Content-Type", "application/json");

  // JSON作成
  StaticJsonDocument<256> jsonDoc;
  // MACアドレス等は省略 (必要なら自分で追記)
  jsonDoc["ahtTemp"] = ahtTemp;
  jsonDoc["ahtHum"]  = ahtHum;
  jsonDoc["bmpTemp"] = bmpTemp;
  jsonDoc["bmpPres"] = bmpPres;

  String payload;
  serializeJson(jsonDoc, payload);
  
  Serial.print("Payload: ");
  Serial.println(payload);

  int httpCode = http.POST(payload);
  if (httpCode > 0) {
    Serial.print("HTTP Code: ");
    Serial.println(httpCode);
    Serial.print("Response: ");
    Serial.println(http.getString());
  } else {
    Serial.print("POST Error: ");
    Serial.println(httpCode);
  }
  http.end();
}