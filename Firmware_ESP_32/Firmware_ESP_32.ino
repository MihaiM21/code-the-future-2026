#include <WiFi.h>
#include <WebSocketsClient.h>
#include "config.h"

WebSocketsClient webSocket;

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[!] Deconectat");
      break;
    case WStype_CONNECTED:
      Serial.println("[V] Conectat");
      break;
    case WStype_TEXT:
      Serial.printf("[SERVER]: %s\n", payload);
      break;
    case WStype_ERROR:
      Serial.println("[X] Serverul nu raspunde pe acest port");
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(2000); 
  Serial.println("\n\n=== SYSTEM ONLINE ===");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("Conectare la WiFi ");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WiFi] Conectat");
  Serial.print("[WiFi] IP ESP32: ");
  Serial.println(WiFi.localIP());

  webSocket.begin(host, port, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void loop() {
  webSocket.loop();
}
