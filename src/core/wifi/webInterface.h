#ifndef WEB_INTERFACE_H
#define WEB_INTERFACE_H

#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ESPmDNS.h>
#include <FS.h>
#include <SD.h>
#include <SPI.h>
#include <WiFi.h>

extern AsyncWebServer *server;

String humanReadableSize(uint64_t bytes);
String listFiles(FS &fs, const String &folder);

void loopOptionsWebUi();
void configureWebServer();
void startWebUi(bool mode_ap = false);
void stopWebUi();

#endif
