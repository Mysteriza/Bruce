#include "webInterface.h"
#include "core/display.h"
#include "core/mykeyboard.h"
#include "core/passwords.h"
#include "core/sd_functions.h"
#include "core/serialcmds.h"
#include "core/settings.h"
#include "core/utils.h"
#include "core/wifi/wifi_common.h"
#include "esp_task_wdt.h"
#include "webFiles.h"
#include <globals.h>

File uploadFile;
FS *_webFS_ptr = nullptr;
String uploadFolder = "/";

const int default_webserverporthttp = 80;
IPAddress AP_GATEWAY(172, 0, 0, 1);
AsyncWebServer *server = nullptr;
const char *host = "bruce";

void stopWebUi() {
    isWebUIActive = false;
    if (server) {
        server->end();
        server->~AsyncWebServer();
        free(server);
        server = nullptr;
    }
    MDNS.end(); // Panggil end() secara langsung
}

void loopOptionsWebUi() {
    if (isWebUIActive) {
        bool opt = WiFi.getMode() - 1;
        options = {
            {"Stop WebUI", stopWebUi},
            {"WebUi screen", lambdaHelper(startWebUi, opt)}
        };
        addOptionToMainMenu();
        loopOptions(options);
        return;
    }
    options = {
        {"my Network", lambdaHelper(startWebUi, false)},
        {"AP mode",    lambdaHelper(startWebUi, true) },
    };
    loopOptions(options);
}

String humanReadableSize(uint64_t bytes) {
    if (bytes < 1024) return String(bytes) + " B";
    else if (bytes < (1024 * 1024)) return String(bytes / 1024.0, 2) + " kB";
    else if (bytes < (1024 * 1024 * 1024)) return String(bytes / 1024.0 / 1024.0, 2) + " MB";
    else return String(bytes / 1024.0 / 1024.0 / 1024.0, 2) + " GB";
}

String listFiles(FS &fs, const String &path) {
    String currentPath = path;
    if (currentPath.isEmpty() || currentPath == "//") currentPath = "/";
    if (currentPath != "/" && currentPath.endsWith("/")) {
        currentPath = currentPath.substring(0, currentPath.length() - 1);
    }

    _webFS_ptr = &fs;
    uploadFolder = currentPath;

    String output = "pa:" + currentPath + ":0\n";

    File root = fs.open(currentPath);
    if (!root) { return output + "Error: Failed to open path.\n"; }
    if (!root.isDirectory()) {
        root.close();
        return output + "Error: Not a directory.\n";
    }

    File entry;
    while (entry = root.openNextFile()) {
        if (esp_get_free_heap_size() < 2560) {
            output += "Error: Low memory, list truncated.\n";
            entry.close();
            break;
        }
        String entryNameStr = String(entry.name());
        int lastSlash = entryNameStr.lastIndexOf('/');
        if (lastSlash != -1) { entryNameStr = entryNameStr.substring(lastSlash + 1); }

        if (entryNameStr.isEmpty()) continue;

        if (entry.isDirectory()) {
            output += "Fo:" + entryNameStr + ":0\n";
        } else {
            output += "Fi:" + entryNameStr + ":" + humanReadableSize(entry.size()) + "\n";
        }
        entry.close();
        esp_task_wdt_reset();
    }
    root.close();
    return output;
}

bool checkUserWebAuth(AsyncWebServerRequest *request) {
    if (bruceConfig.webUI.user.length() > 0 && bruceConfig.webUI.pwd.length() > 0) {
        return request->authenticate(bruceConfig.webUI.user.c_str(), bruceConfig.webUI.pwd.c_str());
    }
    return true;
}

void createDirRecursive(FS &fs, const String &path) {
    if (path.isEmpty() || path == "/") return;

    String pathNormalized = path;
    if (pathNormalized.startsWith("/")) pathNormalized = pathNormalized.substring(1);
    if (pathNormalized.endsWith("/"))
        pathNormalized = pathNormalized.substring(0, pathNormalized.length() - 1);

    char *pathStr = strdup(pathNormalized.c_str());
    if (!pathStr) return;

    char *ptr = strchr(pathStr, '/');
    while (ptr) {
        *ptr = '\0';
        if (strlen(pathStr) > 0 && !fs.exists(pathStr)) { fs.mkdir(pathStr); }
        *ptr = '/';
        ptr = strchr(ptr + 1, '/');
    }
    if (strlen(pathStr) > 0 && !fs.exists(pathStr)) { fs.mkdir(pathStr); }
    free(pathStr);
}

void handleUpload(
    AsyncWebServerRequest *request, const String &filename, size_t index, uint8_t *data, size_t len,
    bool final
) {
    if (!checkUserWebAuth(request)) return request->requestAuthentication();

    String targetFilename = filename;

    if (!_webFS_ptr) {
        request->send(500, "text/plain", "Filesystem not initialized for upload.");
        return;
    }

    String effectiveUploadFolder = uploadFolder;
    if (effectiveUploadFolder == "/" || effectiveUploadFolder.isEmpty()) {
        effectiveUploadFolder = "";
    } else if (!effectiveUploadFolder.startsWith("/")) {
        effectiveUploadFolder = "/" + effectiveUploadFolder;
    }
    if (effectiveUploadFolder.length() > 1 && effectiveUploadFolder.endsWith("/")) {
        effectiveUploadFolder = effectiveUploadFolder.substring(0, effectiveUploadFolder.length() - 1);
    }

    String fullPath = effectiveUploadFolder + "/" + targetFilename;
    if (fullPath.startsWith("//")) fullPath = fullPath.substring(1);

    if (!index) {
        String dirPath = "";
        int lastSlash = fullPath.lastIndexOf('/');
        if (lastSlash > 0) { dirPath = fullPath.substring(0, lastSlash); }

        if (dirPath.length() > 0) { createDirRecursive(*_webFS_ptr, dirPath); }

        int retries = 0;
        if (_webFS_ptr->exists(fullPath)) { _webFS_ptr->remove(fullPath); }
        while (!request->_tempFile && retries < 5) {
            request->_tempFile = _webFS_ptr->open(fullPath, "w");
            if (!request->_tempFile) {
                vTaskDelay(pdMS_TO_TICKS(20));
                retries++;
            }
        }
        if (!request->_tempFile) {
            request->send(500, "text/plain", "ERR: Open file failed: " + fullPath);
            return;
        }
    }

    if (len && request->_tempFile) { request->_tempFile.write(data, len); }

    if (final) {
        if (request->_tempFile) { request->_tempFile.close(); }
        request->redirect("/");
    }
}

void notFound(AsyncWebServerRequest *request) {
    AsyncWebServerResponse *response =
        request->beginResponse_P(404, "text/html", not_found_html, not_found_html_size);
    response->addHeader("Content-Encoding", "gzip");
    request->send(response);
}

void drawWebUiScreen(bool mode_ap) {
    tft.fillScreen(bruceConfig.bgColor);
    tft.drawRoundRect(5, 5, tftWidth - 10, tftHeight - 10, 5, ALCOLOR);
    if (mode_ap) {
        setTftDisplay(0, 0, bruceConfig.bgColor, FM);
        tft.drawCentreString("BruceNet/brucenet", tftWidth / 2, 7, 1);
    }
    setTftDisplay(0, 0, ALCOLOR, FM);
    tft.drawCentreString("BRUCE WebUI", tftWidth / 2, 27, 1);
    String txt = (!mode_ap) ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
    tft.setTextColor(bruceConfig.priColor);
    tft.drawCentreString("http://bruce.local", tftWidth / 2, 45, 1);
    setTftDisplay(7, 67);
    tft.setTextSize(FM);
    tft.print("IP: ");
    tft.println(txt);
    tft.setCursor(7, tft.getCursorY());
    tft.println("Usr: " + bruceConfig.webUI.user);
    tft.setCursor(7, tft.getCursorY());
    tft.println("Pwd: " + bruceConfig.webUI.pwd);
    tft.setTextColor(TFT_RED);
    tft.setTextSize(FP);
#if defined(HAS_TOUCH)
    TouchFooter();
#endif
    tft.drawCentreString("press Esc to stop", tftWidth / 2, tftHeight - 15, 1);
}

void configureWebServer() {
    if (!MDNS.begin(host)) {
        // MDNS Gagal
    }
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
    server->onNotFound(notFound);
    server->onFileUpload(handleUpload);

    server->on("/logout", HTTP_GET, [](AsyncWebServerRequest *request) {
        AsyncWebServerResponse *response = request->beginResponse(302, "text/plain", "Redirecting...");
        response->addHeader("Location", "/logged-out");
        response->addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        response->addHeader("Pragma", "no-cache");
        response->addHeader("Expires", "0");
        request->send(response);
    });

    server->on("/logged-out", HTTP_GET, [](AsyncWebServerRequest *request) {
        AsyncWebServerResponse *response =
            request->beginResponse_P(200, "text/html", logout_html, logout_html_size);
        response->addHeader("Content-Encoding", "gzip");
        request->send(response);
    });

    server->on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (checkUserWebAuth(request)) {
            AsyncWebServerResponse *response =
                request->beginResponse_P(200, "text/html", index_html, index_html_size);
            response->addHeader("Content-Encoding", "gzip");
            request->send(response);
        } else {
            request->requestAuthentication();
        }
    });
    server->on("/index.css", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (checkUserWebAuth(request)) {
            AsyncWebServerResponse *response =
                request->beginResponse_P(200, "text/css", index_css, index_css_size);
            response->addHeader("Content-Encoding", "gzip");
            request->send(response);
        } else {
            request->requestAuthentication();
        }
    });
    server->on("/index.js", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (checkUserWebAuth(request)) {
            AsyncWebServerResponse *response =
                request->beginResponse_P(200, "application/javascript", index_js, index_js_size);
            response->addHeader("Content-Encoding", "gzip");
            request->send(response);
        } else {
            request->requestAuthentication();
        }
    });

    server->on("/systeminfo", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (!checkUserWebAuth(request)) return request->requestAuthentication();
        char response_body[350];
        uint64_t littleFsTotal = 0, littleFsUsed = 0;
        if (LittleFS.begin()) { // Coba mount, akan return true jika berhasil atau sudah mounted
            littleFsTotal = LittleFS.totalBytes();
            littleFsUsed = LittleFS.usedBytes();
        }
        uint64_t sdTotal = 0, sdUsed = 0;
        if (setupSdCard()) {
            sdTotal = SD.totalBytes();
            sdUsed = SD.usedBytes();
        }

        snprintf(
            response_body,
            sizeof(response_body),
            "{\"BRUCE_VERSION\":\"%s\",\"SD\":{\"free\":\"%s\",\"used\":\"%s\",\"total\":\"%s\"},"
            "\"LittleFS\":{\"free\":\"%s\",\"used\":\"%s\",\"total\":\"%s\"}}",
            BRUCE_VERSION,
            humanReadableSize(sdTotal > sdUsed ? sdTotal - sdUsed : 0).c_str(),
            humanReadableSize(sdUsed).c_str(),
            humanReadableSize(sdTotal).c_str(),
            humanReadableSize(littleFsTotal > littleFsUsed ? littleFsTotal - littleFsUsed : 0).c_str(),
            humanReadableSize(littleFsUsed).c_str(),
            humanReadableSize(littleFsTotal).c_str()
        );
        request->send(200, "application/json", response_body);
    });

    server->on("/Oc34N", HTTP_GET, notFound);

    server->on("/rename", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!checkUserWebAuth(request)) return request->requestAuthentication();
        if (request->hasParam("fs", true) && request->hasParam("filePath", true) &&
            request->hasParam("fileName", true)) {
            String fsName = request->getParam("fs", true)->value();
            String filePath = request->getParam("filePath", true)->value();
            String newFileName = request->getParam("fileName", true)->value();

            FS *currentFS = nullptr;
            if (fsName == "SD") {
                if (!setupSdCard()) {
                    request->send(500, "text/plain", "ERR: SD Card init failed.");
                    return;
                }
                currentFS = &SD;
            } else {
                if (!LittleFS.begin()) {
                    request->send(500, "text/plain", "ERR: LittleFS mount failed.");
                    return;
                }
                currentFS = &LittleFS;
            }

            String newPath;
            if (filePath.lastIndexOf('/') == 0 && filePath.length() == 1) {
                newPath = "/" + newFileName;
            } else if (filePath.lastIndexOf('/') != -1) {
                newPath = filePath.substring(0, filePath.lastIndexOf('/') + 1) + newFileName;
            } else {
                newPath = "/" + newFileName;
            }
            if (newPath.startsWith("//")) newPath = newPath.substring(1);

            if (currentFS->rename(filePath, newPath)) {
                request->send(200, "text/plain", "OK: " + filePath + " -> " + newPath);
            } else {
                request->send(500, "text/plain", "ERR: Rename failed. From: " + filePath + " To: " + newPath);
            }
        } else {
            request->send(400, "text/plain", "ERR: Missing params for rename.");
        }
    });

    server->on("/cm", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!checkUserWebAuth(request)) return request->requestAuthentication();
        if (request->hasParam("cmnd", true)) {
            String cmnd = request->getParam("cmnd", true)->value();
            if (serialCli.parse(cmnd)) {
                request->send(200, "text/plain", "CMD_OK: " + cmnd);
            } else {
                request->send(400, "text/plain", "CMD_FAIL: " + cmnd);
            }
        } else {
            request->send(400, "text/plain", "ERR: Missing 'cmnd'.");
        }
    });

    server->on("/reboot", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (checkUserWebAuth(request)) {
            request->send(200, "text/plain", "Rebooting device...");
            ESP.restart();
        } else {
            request->requestAuthentication();
        }
    });

    server->on("/listfiles", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (!checkUserWebAuth(request)) return request->requestAuthentication();
        String folder = "/";
        if (request->hasParam("folder")) folder = request->getParam("folder")->value();

        if (request->hasParam("fs")) {
            String fsName = request->getParam("fs")->value();
            if (fsName == "SD") {
                if (!setupSdCard()) {
                    request->send(500, "text/plain", "ERR: SD Card not available.");
                    return;
                }
                _webFS_ptr = &SD;
                request->send(200, "text/plain", listFiles(SD, folder));
            } else {
                if (!LittleFS.begin()) {
                    request->send(500, "text/plain", "ERR: LittleFS mount failed.");
                    return;
                }
                _webFS_ptr = &LittleFS;
                request->send(200, "text/plain", listFiles(LittleFS, folder));
            }
        } else {
            request->send(400, "text/plain", "ERR: Missing 'fs' param.");
        }
    });

    server->on("/file", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (!checkUserWebAuth(request)) return request->requestAuthentication();
        if (request->hasParam("name") && request->hasParam("action") && request->hasParam("fs")) {
            String fileName = request->getParam("name")->value();
            String fileAction = request->getParam("action")->value();
            String fsName = request->getParam("fs")->value();

            FS *currentFS = nullptr;
            if (fsName == "SD") {
                if (!setupSdCard()) {
                    request->send(500, "text/plain", "ERR: SD Card init.");
                    return;
                }
                currentFS = &SD;
            } else {
                if (!LittleFS.begin()) {
                    request->send(500, "text/plain", "ERR: LittleFS mount failed.");
                    return;
                }
                currentFS = &LittleFS;
            }
            _webFS_ptr = currentFS;

            if (fileAction == "create") {
                if (currentFS->mkdir(fileName))
                    request->send(200, "text/plain", "OK: Folder created: " + fileName);
                else request->send(500, "text/plain", "ERR: Create folder failed: " + fileName);
            } else if (fileAction == "createfile") {
                if (currentFS->exists(fileName)) { currentFS->remove(fileName); }
                File f = currentFS->open(fileName, FILE_WRITE);
                if (f) {
                    f.close();
                    request->send(200, "text/plain", "OK: File created: " + fileName);
                } else request->send(500, "text/plain", "ERR: Create file failed: " + fileName);
            } else if (!currentFS->exists(fileName)) {
                request->send(404, "text/plain", "ERR: File not found: " + fileName);
            } else if (fileAction == "download") {
                request->send(*currentFS, fileName, "application/octet-stream", true);
            } else if (fileAction == "delete") {
                File item = currentFS->open(fileName, FILE_READ); // Buka untuk mengecek apakah direktori
                bool success = false;
                if (item) {
                    if (item.isDirectory()) { // Gunakan item.isDirectory()
                        item.close();         // Tutup file sebelum rmdir
                        success = currentFS->rmdir(fileName);
                    } else {
                        item.close(); // Tutup file sebelum remove
                        success = currentFS->remove(fileName);
                    }
                } // Jika item tidak bisa dibuka, exists() seharusnya sudah menangani, tapi bisa tambahkan
                  // error

                if (success) request->send(200, "text/plain", "OK: Deleted: " + fileName);
                else request->send(500, "text/plain", "ERR: Delete failed: " + fileName);

            } else if (fileAction == "edit") {
                File editFile = currentFS->open(fileName, FILE_READ);
                if (editFile && !editFile.isDirectory()) {
                    AsyncWebServerResponse *response =
                        request->beginResponse(*currentFS, fileName, "text/plain");
                    request->send(response);
                } else {
                    if (editFile) editFile.close();
                    request->send(500, "text/plain", "ERR: Open file for edit failed: " + fileName);
                }
            } else {
                request->send(400, "text/plain", "ERR: Invalid action.");
            }
        } else {
            request->send(400, "text/plain", "ERR: Missing params.");
        }
    });

    server->on("/edit", HTTP_POST, [](AsyncWebServerRequest *request) {
        if (!checkUserWebAuth(request)) return request->requestAuthentication();
        if (request->hasParam("name", true) && request->hasParam("content", true) &&
            request->hasParam("fs", true)) {
            String fileName = request->getParam("name", true)->value();
            String fileContent = request->getParam("content", true)->value();
            String fsName = request->getParam("fs", true)->value();

            FS *currentFS = nullptr;
            if (fsName == "SD") {
                if (!setupSdCard()) {
                    request->send(500, "text/plain", "ERR: SD Card init.");
                    return;
                }
                currentFS = &SD;
            } else {
                if (!LittleFS.begin()) {
                    request->send(500, "text/plain", "ERR: LittleFS mount failed.");
                    return;
                }
                currentFS = &LittleFS;
            }

            File editFile = currentFS->open(fileName, FILE_WRITE);
            if (editFile) {
                size_t bytesWritten = editFile.print(fileContent);
                editFile.close();
                if (bytesWritten == fileContent.length()) {
                    request->send(200, "text/plain", "OK: File updated: " + fileName);
                } else {
                    request->send(
                        500, "text/plain", "ERR: Write to file failed (partial write): " + fileName
                    );
                }
            } else {
                request->send(500, "text/plain", "ERR: Open file for write failed: " + fileName);
            }
        } else {
            request->send(400, "text/plain", "ERR: Missing params for edit.");
        }
    });

    server->on("/wifi", HTTP_GET, [](AsyncWebServerRequest *request) {
        if (checkUserWebAuth(request)) {
            if (request->hasParam("usr") && request->hasParam("pwd")) {
                String usr = request->getParam("usr")->value();
                String pwd = request->getParam("pwd")->value();
                bruceConfig.setWebUICreds(usr.c_str(), pwd.c_str());
                request->send(200, "text/plain", "OK: WebUI creds updated.");
            } else {
                request->send(400, "text/plain", "ERR: Missing usr/pwd.");
            }
        } else {
            request->requestAuthentication();
        }
    });

    server->begin();
}

void startWebUi(bool mode_ap) {
    if (!LittleFS.begin(true)) {
        displayRedStripe("LittleFS FAIL!");
        vTaskDelay(pdMS_TO_TICKS(2000));
        return;
    }

    bool keepWifiConnected = (WiFi.status() == WL_CONNECTED);
    if (!keepWifiConnected) {
        if (mode_ap) {
            wifiConnectMenu(WIFI_AP);
        } else {
            wifiConnectMenu(WIFI_STA);
            if (WiFi.status() != WL_CONNECTED) {
                displayRedStripe("WiFi STA FAIL!");
                vTaskDelay(pdMS_TO_TICKS(2000));
                return;
            }
        }
    }

    if (!server) {
        options.clear();
        options.shrink_to_fit();

        if (psramFound()) {
            server = (AsyncWebServer *)ps_malloc(sizeof(AsyncWebServer));
        } else {
            server = (AsyncWebServer *)malloc(sizeof(AsyncWebServer));
        }

        if (!server) {
            displayRedStripe("Server Alloc FAIL!");
            vTaskDelay(pdMS_TO_TICKS(2000));
            return;
        }
        new (server) AsyncWebServer(default_webserverporthttp);

        configureWebServer();
        isWebUIActive = true;
    }

    drawWebUiScreen(mode_ap);

    while (!check(EscPress)) { vTaskDelay(pdMS_TO_TICKS(50)); }

    bool closeServer = false;
    options.assign({
        {"Exit",              [&closeServer]() { closeServer = true; }},
        {"Run in background", []() {}                                 }
    });
    loopOptions(options);

    if (closeServer) {
        stopWebUi();
        if (!keepWifiConnected && WiFi.getMode() != WIFI_AP) { wifiDisconnect(); }
    }
}
