#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <WiFiClientSecure.h>  // HTTPS通信用
#include <Wire.h>
#include <Adafruit_AHTX0.h>
#include <Adafruit_BMP280.h>
#include <ArduinoJson.h>
#include <BearSSL.h>

// WiFi設定
const char* ssid = "Your_SSID";
const char* password = "Your_PASSWORD";

// 固定IP設定（各デバイスに一意のIPを割り当てる）
IPAddress staticIP(192, 168, 0, 100);
IPAddress gateway(192, 168, 0, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress dns(192, 168, 0, 1);

// VercelにデプロイされたアプリのAPIエンドポイント
const char* serverUrl = "https://your-app-name.vercel.app/api/sensor";

// ISRG Root X1証明書（Let's Encryptのルート証明書）
// https://letsencrypt.org/certificates/ からダウンロードしたものを使用
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

// センサーオブジェクト
Adafruit_AHTX0 aht;
Adafruit_BMP280 bmp;

// MAC ID (デバイス固有ID)
String deviceId = "";

// センサー測定値
float ahtTemp = 0;
float ahtHum  = 0;
float bmpTemp = 0;
float bmpPres = 0;

// 測定と送信のタイミング変数
unsigned long prevMeasureTime = 0;
unsigned long prevPostTime = 0;
unsigned long lastConnectionAttempt = 0;
const unsigned long CONNECTION_RETRY_DELAY = 30000; // 30秒

// LED設定（ステータス表示用）
const int STATUS_LED = LED_BUILTIN; // 通常はGPIO2
bool ledState = false;

void setup() {
  // シリアル通信の初期化
  Serial.begin(115200);
  Serial.println("\n\n=== ESP8266 Temperature Sensor ===");
  
  // LEDピンの設定
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, HIGH); // 初期状態はOFF (LEDはLOWで点灯)
  
  // MACアドレスからデバイスIDを生成
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char macStr[13] = {0};
  sprintf(macStr, "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  deviceId = String(macStr);
  
  Serial.print("Device ID (MAC): ");
  Serial.println(deviceId);
  
  // WiFi接続
  connectToWiFi();
  
  // I2Cセンサーの初期化 (SDA:GPIO4, SCL:GPIO5)
  Wire.begin(4, 5);
  initSensors();
  
  Serial.println("Setup completed.");
}

void loop() {
  unsigned long currentTime = millis();
  
  // WiFi接続確認と再接続試行
  if (WiFi.status() != WL_CONNECTED) {
    // WiFi接続が切れた場合、LEDを点滅させる
    if (currentTime % 500 < 250) {
      digitalWrite(STATUS_LED, LOW); // LED点灯
    } else {
      digitalWrite(STATUS_LED, HIGH); // LED消灯
    }
    
    // 一定時間ごとに再接続を試みる
    if (currentTime - lastConnectionAttempt > CONNECTION_RETRY_DELAY) {
      Serial.println("WiFi connection lost, attempting to reconnect...");
      connectToWiFi();
      lastConnectionAttempt = currentTime;
    }
  } else {
    // 接続中は通常のLED動作（測定時に点滅）
    digitalWrite(STATUS_LED, HIGH); // 通常時は消灯
  }
  
  // (A) センサー測定：3秒間隔
  if (currentTime - prevMeasureTime >= 3000) {
    prevMeasureTime = currentTime;
    
    // 測定中はLEDを点灯
    digitalWrite(STATUS_LED, LOW);
    
    // センサーから測定値を取得
    if (readSensors()) {
      // 測定値をシリアルモニタに表示
      printSensorData();
    }
    
    // 測定完了後はLEDを消灯
    digitalWrite(STATUS_LED, HIGH);
  }
  
  // (B) 一定間隔（60秒）ごとにセンサー値をサーバーへPOST
  if (currentTime - prevPostTime >= 60000) {
    prevPostTime = currentTime;
    
    if (WiFi.status() == WL_CONNECTED) {
      sendSensorData();
    }
  }
  
  // CPU負荷軽減のための短いディレイ
  delay(10);
}

// WiFiに接続する関数
void connectToWiFi() {
  Serial.print("Connecting to WiFi...");
  
  // 固定IP設定（任意）
  WiFi.config(staticIP, gateway, subnet, dns);
  
  // WiFi接続を開始
  WiFi.begin(ssid, password);
  
  // タイムアウト用のカウンター
  int timeout = 0;
  while (WiFi.status() != WL_CONNECTED && timeout < 20) {
    delay(500);
    Serial.print(".");
    // 接続中はLEDを点滅
    ledState = !ledState;
    digitalWrite(STATUS_LED, ledState ? LOW : HIGH);
    timeout++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    // 接続成功時はLEDを3回点滅
    for (int i = 0; i < 3; i++) {
      digitalWrite(STATUS_LED, LOW);
      delay(100);
      digitalWrite(STATUS_LED, HIGH);
      delay(100);
    }
  } else {
    Serial.println("\nWiFi connection failed!");
  }
  
  lastConnectionAttempt = millis();
}

// センサーを初期化する関数
void initSensors() {
  Serial.println("Initializing sensors...");
  
  // AHT20センサーの初期化
  if (!aht.begin()) {
    Serial.println("Failed to find AHT20 sensor!");
  } else {
    Serial.println("AHT20 sensor initialized");
  }
  
  // BMP280センサーの初期化
  if (!bmp.begin(0x77)) {
    Serial.println("Failed to find BMP280 sensor!");
  } else {
    Serial.println("BMP280 sensor initialized");
    // デフォルト設定
    bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,     // 動作モード
                    Adafruit_BMP280::SAMPLING_X2,     // 温度オーバーサンプリング
                    Adafruit_BMP280::SAMPLING_X16,    // 気圧オーバーサンプリング
                    Adafruit_BMP280::FILTER_X16,      // フィルタリング
                    Adafruit_BMP280::STANDBY_MS_500); // スタンバイ時間
  }
}

// センサーから値を読み取る関数
bool readSensors() {
  bool success = false;
  
  // AHT20センサーから値を読み取り
  sensors_event_t humidity, temp;
  if (aht.getEvent(&humidity, &temp)) {
    ahtTemp = temp.temperature;
    ahtHum = humidity.relative_humidity;
    success = true;
  } else {
    Serial.println("Failed to read from AHT sensor!");
  }

  // BMP280センサーから値を読み取り
  float tempBmp = bmp.readTemperature();
  float pres = bmp.readPressure() / 100.0F; // hPaに変換
  
  // 値が異常でないか確認
  if (!isnan(tempBmp) && !isnan(pres) && tempBmp > -40 && tempBmp < 85) {
    bmpTemp = tempBmp;
    bmpPres = pres;
    success = true;
  } else {
    Serial.println("Failed to read from BMP sensor or invalid data!");
  }
  
  return success;
}

// センサーデータをシリアルに出力
void printSensorData() {
  Serial.println("=== Sensor Readings ===");
  Serial.print("AHT20: ");
  Serial.print(ahtTemp);
  Serial.print("°C, ");
  Serial.print(ahtHum);
  Serial.println("%");
  
  Serial.print("BMP280: ");
  Serial.print(bmpTemp);
  Serial.print("°C, ");
  Serial.print(bmpPres);
  Serial.println("hPa");
}

// センサーデータをサーバーに送信する関数
void sendSensorData() {
  Serial.println("Sending data to server...");
  
  // HTTPSクライアントの準備
  WiFiClientSecure client;
  
  // ルート証明書を使用してTLS接続のセキュリティを確保
  BearSSL::X509List cert(ISRG_Root_X1);
  client.setTrustAnchors(&cert);
  
  // ESP8266のメモリ制限により証明書検証処理がタイムアウトする場合、以下の設定を追加
  client.setBufferSizes(512, 512);
  
  // 接続タイムアウトを設定（必要に応じて）
  client.setTimeout(15000); // 15秒
  
  HTTPClient http;
  
  // サーバーに接続
  http.begin(client, serverUrl);
  http.addHeader("Content-Type", "application/json");

  // JSONデータの作成
  StaticJsonDocument<256> jsonDoc;
  jsonDoc["deviceId"] = deviceId;
  jsonDoc["ipAddress"] = WiFi.localIP().toString();
  jsonDoc["ahtTemp"] = ahtTemp;
  jsonDoc["ahtHum"] = ahtHum;
  jsonDoc["bmpTemp"] = bmpTemp;
  jsonDoc["bmpPres"] = bmpPres;

  String payload;
  serializeJson(jsonDoc, payload);
  
  Serial.print("Sending payload: ");
  Serial.println(payload);

  // POSTリクエスト送信
  int httpResponseCode = http.POST(payload);
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    Serial.print("Response: ");
    Serial.println(response);
    
    // データ送信成功時、LEDを短く点灯
    digitalWrite(LED_BUILTIN, LOW);
    delay(50);
    digitalWrite(LED_BUILTIN, HIGH);
  } else {
    Serial.print("Error sending HTTP POST: ");
    Serial.println(httpResponseCode);
    // エラー時、LEDを長く点灯
    digitalWrite(LED_BUILTIN, LOW);
    delay(500);
    digitalWrite(LED_BUILTIN, HIGH);
  }
  
  http.end();
} 