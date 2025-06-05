var buttonsInitialized = false;

function WifiConfig() {
    showModal('ACCESS_AUTH_MATRIX //_ SecureNet', `
    <div class="form-group">
      <label for="modalWifiSsid">Node_ID (Username):</label>
      <input type="text" id="modalWifiSsid" value="admin">
    </div>
    <div class="form-group">
      <label for="modalWifiPwd">PassKey (Password):</label>
      <input type="password" id="modalWifiPwd">
    </div>
  `, 'info', [
        { text: 'ABORT_CONFIG', class: 'secondary', onClick: 'closeModal()' },
        { text: 'SAVE_CONFIG_>', class: 'primary', onClick: `(function(){
        const ssid = document.getElementById('modalWifiSsid').value;
        const pwd = document.getElementById('modalWifiPwd').value;
        if (!ssid || !pwd) { showToast('ERR: Invalid credentials data_stream', 'error'); return; }
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "/wifi?usr=" + ssid + "&pwd=" + pwd, true); // Buat async
        xhr.onload = function() {
            if (xhr.status === 200) {
                showToast('AUTH_CONFIG_OK: ' + xhr.responseText, 'success');
            } else {
                showToast('AUTH_CONFIG_FAIL: ' + (xhr.responseText || xhr.statusText), 'error');
            }
        };
        xhr.onerror = function() { showToast('AUTH_CONFIG_ERR: Network issue.', 'error'); };
        xhr.send();
        closeModal();
      })()`}
    ]);
}

function serialCmd() {
    showModal('CMD_CONSOLE_ACCESS //_ Direct_Link', `
    <div class="form-group">
      <label for="modalSerialCommand">Execute_CMD:</label>
      <input type="text" id="modalSerialCommand" placeholder=">_">
    </div>
  `, 'info', [
        { text: 'TERMINATE_LINK', class: 'secondary', onClick: 'closeModal()' },
        { text: 'EXECUTE_CMD_>', class: 'primary', onClick: `(function(){
        const cmd = document.getElementById('modalSerialCommand').value;
        if (!cmd) { showToast('WARN: Empty command node. No transmission.', 'warning'); return; }
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append("cmnd", cmd);
        xhr.open("POST", "/cm", true); // Buat async
        xhr.onload = function() {
            if (xhr.status === 200) {
                showToast('SERIAL_TX_OK: ' + xhr.responseText, 'success');
            } else {
                showToast('SERIAL_TX_FAIL: ' + (xhr.responseText || xhr.statusText), 'error');
            }
        };
        xhr.onerror = function() { showToast('SERIAL_TX_ERR: Network issue.', 'error'); };
        xhr.send(formData);
        closeModal();
      })()`}
    ]);
}

function logoutButton() {
    showModal('Logout Sequence //_ sys_disconnect', 'Initiate disconnection from BRUCE Fw interface?', 'warning', [
        { text: 'DECLINE_EXIT', class: 'secondary', onClick: 'closeModal()' },
        { text: 'CONFIRM_EXIT_>', class: 'primary', onClick: `closeModal(); (function(){
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "/logout", true);
        xhr.onload = function() {
            if (xhr.status === 302 || xhr.status === 200) { // 302 adalah redirect
                 showToast('Logout successful. Disconnecting...', 'success');
                 setTimeout(function () { window.open("/logged-out", "_self"); }, 500);
            } else {
                 showToast('Logout failed. Status: ' + xhr.status, 'error');
            }
        };
        xhr.onerror = function() { showToast('Logout ERR: Network issue.', 'error'); };
        xhr.send();
      })()`}
    ]);
}

function rebootButton() {
    showModal('System Reboot //_ core_cycle', 'Confirm device core system restart sequence?', 'warning', [
        { text: 'CANCEL_REBOOT', class: 'secondary', onClick: 'closeModal()' },
        { text: 'INITIATE_REBOOT_>', class: 'primary', onClick: `closeModal(); (function(){
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "/reboot", true);
         xhr.onload = function() {
            if (xhr.status === 200) {
                showToast('REBOOT_ACK: ' + xhr.responseText, 'info');
                // Device will reboot, no further client action needed
            } else {
                showToast('REBOOT_FAIL: ' + (xhr.responseText || xhr.statusText), 'error');
            }
        };
        xhr.onerror = function() { showToast('REBOOT_ERR: Network issue.', 'error'); };
        xhr.send();
      })()`}
    ]);
}

function generateBreadcrumbs(path, fs) {
    const breadcrumbContainer = _("breadcrumbs");
    const fsIndicator = _("fs-type-indicator");
    if (fsIndicator) fsIndicator.textContent = fs + " // ";
    if (!breadcrumbContainer) return;

    breadcrumbContainer.innerHTML = "";
    const parts = path.split('/').filter(part => part.length > 0);
    let currentPathForLink = "/";

    const rootLink = document.createElement('a');
    rootLink.href = 'javascript:void(0);';
    rootLink.textContent = 'root';
    rootLink.onclick = () => listFilesButton('/', fs, true);
    breadcrumbContainer.appendChild(rootLink);

    parts.forEach((part, index) => {
        currentPathForLink += part + "/";
        const separator = document.createTextNode(" / ");
        breadcrumbContainer.appendChild(separator);
        const link = document.createElement('a');
        link.href = 'javascript:void(0);';
        link.textContent = part;
        const capturedPath = currentPathForLink;
        link.onclick = () => listFilesButton(capturedPath, fs, true);
        breadcrumbContainer.appendChild(link);
    });
     if (path === "/" || path === "") {
        breadcrumbContainer.innerHTML = "";
        breadcrumbContainer.appendChild(rootLink);
    }
}

function listFilesButton(folders, fs = 'LittleFS', userRequest = false) {
    var xmlhttp = new XMLHttpRequest();
    _("actualFolder").value = folders;
    _("actualFS").value = fs;

    generateBreadcrumbs(folders, fs);

    if (userRequest) {
         _("status").innerHTML = "Accessing " + fs + " path: " + folders;
    }
    // Teks placeholder awal saat memuat
    const detailsDiv = _("details");
    if (detailsDiv) {
        detailsDiv.innerHTML = "<p class='file-manager-placeholder'>Fetching file data from " + fs + "...</p>";
    }


    xmlhttp.onload = function () {
        if (xmlhttp.status === 200) {
            var responseText = xmlhttp.responseText;
            var lines = responseText.split('\n');
            if (lines.length > 0 && lines[lines.length - 1].trim() === "") {
                lines.pop();
            }

            var tableContent = "<table><thead><tr><th>Name_Identifier</th><th>Size_Bytes</th><th>Execute_Protocol</th></tr></thead><tbody>";

            var PreFolder = folders.substring(0, folders.lastIndexOf('/'));
            if (PreFolder === "" && folders !== "/") PreFolder = "/";
            else if (folders === "/") PreFolder = "/";

            if (folders !== "/") {
                 tableContent += "<tr class='file-row-animate'><td><a onclick=\"listFilesButton('" + PreFolder + "', '" + fs + "', true)\" href='javascript:void(0);'>&lt; ..Parent_Directory &gt;</a></td><td></td><td></td></tr>";
            }

            var currentPaPath = "";
            var foldersArray = [];
            var filesArray = [];

            lines.forEach(function (line) {
                if (line.trim() === "") return;
                var type = line.substring(0, 2);
                var dataPart = line.substring(3);
                var lastColonIndex = dataPart.lastIndexOf(':');
                var itemNameOrPath = dataPart.substring(0, lastColonIndex);
                var itemSizeOrZero = dataPart.substring(lastColonIndex + 1);

                if (type === "pa") {
                    currentPaPath = itemNameOrPath;
                    if (!currentPaPath.endsWith("/") && currentPaPath !== "/") currentPaPath += "/";
                    if (currentPaPath === "//") currentPaPath = "/";
                } else if (type === "Fo") {
                    let fullItemPath = (currentPaPath === "/" ? "/" : currentPaPath) + itemNameOrPath;
                    if (fullItemPath.startsWith("//")) fullItemPath = fullItemPath.substring(1);
                    foldersArray.push({ path: fullItemPath, name: itemNameOrPath });
                } else if (type === "Fi") {
                     let fullItemPath = (currentPaPath === "/" ? "/" : currentPaPath) + itemNameOrPath;
                    if (fullItemPath.startsWith("//")) fullItemPath = fullItemPath.substring(1);
                    filesArray.push({ path: fullItemPath, name: itemNameOrPath, size: itemSizeOrZero });
                }
            });

            foldersArray.sort((a, b) => a.name.localeCompare(b.name));
            filesArray.sort((a, b) => a.name.localeCompare(b.name));

            let contentAdded = false;
            if (folders !== "/") contentAdded = true;

            foldersArray.forEach(function (item) {
                tableContent += "<tr class='file-row-animate'><td><a onclick=\"listFilesButton('" + item.path + "', '" + fs + "', true)\" href='javascript:void(0);'>" + item.name + "</a></td>";
                tableContent += "<td>[DIR]</td>";
                tableContent += "<td class='file-actions'><i class=\"gg-folder\" title='Open Folder' onclick=\"listFilesButton('" + item.path + "', '" + fs + "', true)\"></i>";
                tableContent += "<i class=\"gg-rename\" title='Rename' onclick=\"renameFile('" + item.path + "', '" + item.name + "')\"></i>";
                tableContent += "<i class=\"gg-trash\" title='Delete' onclick=\"downloadDeleteButton('" + item.path + "', 'delete')\"></i></td></tr>";
                contentAdded = true;
            });
            filesArray.forEach(function (item) {
                tableContent += "<tr class='file-row-animate'><td>" + item.name + "</td>";
                tableContent += "<td>" + item.size + "</td>";
                tableContent += "<td class='file-actions'>";
                const ext = item.name.substring(item.name.lastIndexOf('.') + 1).toLowerCase();
                if (ext === "sub") tableContent += "<i class=\"gg-data\" title='Send SubGhz' onclick=\"sendSubFile(\'" + item.path + "\')\"></i>";
                if (ext === "ir") tableContent += "<i class=\"gg-data\" title='Send IR' onclick=\"sendIrFile(\'" + item.path + "\')\"></i>";
                if (["bjs", "js"].includes(ext)) tableContent += "<i class=\"gg-data\" title='Run JS' onclick=\"runJsFile(\'" + item.path + "\')\"></i>";
                if (["mp3", "wav", "mod", "opus", "aac", "flac"].includes(ext)) tableContent += "<i class=\"gg-data\" title='Play Audio' onclick=\"playAudioFile(\'" + item.path + "\')\"></i>";
                if (ext === "txt") tableContent += "<i class=\"gg-data\" title='Run BadUSB' onclick=\"runBadusbFile(\'" + item.path + "\')\"></i>";
                if (ext === "enc") tableContent += "<i class=\"gg-data\" title='Decrypt & Type' onclick=\"decryptAndType(\'" + item.path + "\')\"></i>";
                tableContent += "<i class=\"gg-arrow-down-r\" title='Download' onclick=\"downloadDeleteButton('" + item.path + "', 'download')\"></i>";
                tableContent += "<i class=\"gg-rename\" title='Rename' onclick=\"renameFile('" + item.path + "', '" + item.name + "')\"></i>";
                tableContent += "<i class=\"gg-trash\" title='Delete' onclick=\"downloadDeleteButton('" + item.path + "', 'delete')\"></i>";
                tableContent += "<i class=\"gg-pen\" title='Edit' onclick=\"downloadDeleteButton('" + item.path + "', 'edit')\"></i>";
                tableContent += "</td></tr>";
                contentAdded = true;
            });

            if (!contentAdded) {
                let Lm = "Error: Low memory, list truncated.";
                let Er = "Error:"; // Pesan error umum dari backend
                if (responseText.includes(Lm)){
                    tableContent += "<tr><td colspan='3' class='file-manager-placeholder error-text'>" + Lm + "</td></tr>";
                } else if (responseText.includes(Er) && !responseText.includes(Lm)){ // Jika ada error lain
                     tableContent += "<tr><td colspan='3' class='file-manager-placeholder error-text'>Error from device: " + responseText.substring(responseText.indexOf(Er)) + "</td></tr>";
                } else { // Benar-benar kosong
                    tableContent += "<tr><td colspan='3' class='file-manager-placeholder'>" + fs + " directory is empty.</td></tr>";
                }
            }
            tableContent += "</tbody></table>";
            if(detailsDiv) detailsDiv.innerHTML = tableContent;
            updateFileManagerUI();
        } else {
             _("status").innerHTML = 'Err: Fetch_File_List //_ ' + xmlhttp.status + " " + xmlhttp.statusText;
             if(detailsDiv) detailsDiv.innerHTML = "<p class='file-manager-placeholder error-text'>Failed to load file list from " + fs + ".<br>Status: " + xmlhttp.status + " (" + xmlhttp.statusText + ")</p>";
        }
    };
    xmlhttp.onerror = function () {
        _("status").innerHTML = 'Network anomaly detected... Connection unstable.';
        if(detailsDiv) detailsDiv.innerHTML = "<p class='file-manager-placeholder error-text'>Network Error: Unable to connect to device.</p>";
    };

    xmlhttp.open("GET", "/listfiles?fs=" + fs + "&folder=" + folders, true);
    xmlhttp.send();

    const activeBtnClass = 'active-fs-btn';
    const sdBtn = _('sdButton');
    const lfsBtn = _('littleFsButton');
    if (sdBtn) sdBtn.classList.remove(activeBtnClass);
    if (lfsBtn) lfsBtn.classList.remove(activeBtnClass);
    if (fs === 'SD' && sdBtn) sdBtn.classList.add(activeBtnClass);
    if (fs === 'LittleFS' && lfsBtn) lfsBtn.classList.add(activeBtnClass);

    if (!buttonsInitialized || userRequest) {
        const upDetailsHeader = _("updetailsheader");
        if (upDetailsHeader) {
            upDetailsHeader.innerHTML = "<h3>Data_Transfer_Interface //_ " + fs + "</h3>" +
                "<input type='file' id='fil' multiple style='display:none'>" +
                "<input type='file' id='fol' webkitdirectory directory multiple style='display:none'>" +
                "<button onclick=\"_('fil').click()\">UPLOAD_FILES_></button>" +
                "<button onclick=\"_('fol').click()\">UPLOAD_FOLDERS_></button>" +
                "<button onclick=\"CreateFolderModal()\">CREATE_DIRECTORY_></button>" + // Panggil CreateFolderModal
                "<button onclick=\"showCreateFile('" + folders + "')\">CREATE_FILE_NODE_></button>" +
                "<input type=\"checkbox\" id=\"encryptCheckbox\" style='display:none'>" +
                "<button id=\"encryptBtn\" onclick=\"_('encryptCheckbox').click(); toggleEncrypt()\">ENCRYPT_UPLOADS</button>";
        }

        if(_("fil")) _("fil").onchange = e => handleFileForm(e.target.files, _("actualFolder").value);
        if(_("fol")) _("fol").onchange = e => handleFileForm(e.target.files, _("actualFolder").value);

        if(_("updetails")) _("updetails").innerHTML = "";
        if (!buttonsInitialized) buttonsInitialized = true;
    }
}

function toggleEncrypt() {
    const encryptCheckbox = _("encryptCheckbox");
    const encryptBtn = _("encryptBtn");
    if (!encryptCheckbox || !encryptBtn) return;
    if (encryptCheckbox.checked) {
        encryptBtn.style.backgroundColor = "var(--accent-secondary)";
        encryptBtn.style.color = "var(--text-main)";
        encryptBtn.textContent = "ENCRYPTION_ACTIVE";
    } else {
        encryptBtn.style.backgroundColor = "";
        encryptBtn.style.color = "";
        encryptBtn.textContent = "ENCRYPT_UPLOADS";
    }
}

function renameFile(filePath, oldName) {
    var actualFolder = _("actualFolder").value;
    var fs = _("actualFS").value;

    showModal('Rename Node //_ ID_Modify', `
    <div class="form-group">
      <label for="modalNewName">New Identifier for "${oldName}":</label>
      <input type="text" id="modalNewName" value="${oldName}">
    </div>
    `, 'info', [
        { text: 'CANCEL_OP', class: 'secondary', onClick: 'closeModal()' },
        { text: 'RENAME_NODE_>', class: 'primary', onClick: `(function(){
            const newName = document.getElementById('modalNewName').value;
            if (newName == null || newName == "" || newName === "${oldName}") {
                showToast(newName === "${oldName}" ? 'WARN: No change in identifier.' : 'ERR: Invalid identifier.', newName === "${oldName}" ? 'warning' : 'error');
                if (newName !== "${oldName}") { closeModal(); return; } // Hanya tutup jika bukan no change
                closeModal(); return;
            }
            const xhr = new XMLHttpRequest();
            const formData = new FormData();
            formData.append("fs", "${fs}");
            formData.append("filePath", "${filePath}");
            formData.append("fileName", newName);
            xhr.open("POST", "/rename", true);
            xhr.onload = function() {
                if (xhr.status === 200 && xhr.responseText.startsWith("OK:")) {
                    showToast('RENAME_OK: ${oldName} -> ' + newName, 'success');
                } else {
                    showToast('RENAME_FAIL: ' + (xhr.responseText || xhr.statusText), 'error');
                }
                listFilesButton("${actualFolder}", "${fs}", false);
            };
            xhr.onerror = function() { showToast('RENAME_ERR: Network issue.', 'error'); };
            xhr.send(formData);
            closeModal();
        })()`}
    ]);
}

function _handleGenericCommand(command, successMsg, failMsg, confirmPrompt = null) {
    if (confirmPrompt && !confirm(confirmPrompt)) {
        showToast('OP_ABORTED: User cancelled.', 'info');
        return;
    }
    var fs = _("actualFS").value; // Ambil FS saat ini jika diperlukan
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("cmnd", command);
    xhr.open("POST", "/cm", true);
    xhr.onload = function() {
        const message = xhr.responseText || xhr.statusText;
        if (xhr.status === 200 && message.startsWith("CMD_OK:")) {
            showToast(successMsg + ': ' + message.substring(7), 'success');
        } else {
            showToast(failMsg + ': ' + message, 'error');
        }
        listFilesButton(_("actualFolder").value, fs, false); // Refresh list, mungkin aksi cm mengubah file
    };
    xhr.onerror = function() { showToast('CMD_ERR: Network issue.', 'error'); };
    xhr.send(formData);
}

function sendIrFile(filePath) {
    _handleGenericCommand(`ir tx_from_file ${filePath}`, 'IR_TX_OK', 'IR_TX_FAIL', `Confirm IR signal burst from: ${filePath}?`);
}
function sendSubFile(filePath) {
     _handleGenericCommand(`subghz tx_from_file ${filePath}`, 'SubGHz_TX_OK', 'SubGHz_TX_FAIL', `Confirm SubGHz transmission from: ${filePath}?`);
}
function runJsFile(filePath) {
    _handleGenericCommand(`js run_from_file ${filePath}`, 'JS_EXEC_OK', 'JS_EXEC_FAIL', `Execute JS_Payload from: ${filePath}?`);
}
function runBadusbFile(filePath) {
    _handleGenericCommand(`badusb run_from_file ${filePath}`, 'BadUSB_RUN_OK', 'BadUSB_RUN_FAIL', `Deploy BadUSB script from: ${filePath} via USB?`);
}
function playAudioFile(filePath) {
    _handleGenericCommand(`play ${filePath}`, 'AUDIO_PLAY_OK', 'AUDIO_PLAY_FAIL'); // No confirm for play
}
function decryptAndType(filePath) {
    if (!confirm("Decrypt and transmit via HID: " + filePath + "?")) {
        showToast('OP_ABORTED: User cancelled.', 'info');
        return;
    }
    if (!cachedPassword) cachedPassword = prompt("Enter decryption key:", cachedPassword || "");
    if (!cachedPassword) { showToast('ERR: Decryption key required.', 'warning'); return; }
    _handleGenericCommand(`crypto type_from_file ${filePath} ${cachedPassword}`, 'CryptoType_OK', 'CryptoType_FAIL');
}


function downloadDeleteButton(filename, action) {
    var fs = _("actualFS").value;
    var urltocall = "/file?name=" + filename + "&action=" + action + "&fs=" + fs;
    var actualFolder = _("actualFolder").value;
    var option = true;

    if (action == "delete") {
        option = confirm("Confirm permanent deletion of node: " + filename + "?\n\nDATA_DESTRUCTION_IMMINENT. NON_RECOVERABLE.");
        if (!option) { showToast('DELETE_ABORTED: User cancelled.', 'info'); return; }
    }

    const xhr = new XMLHttpRequest();
    xhr.open("GET", urltocall, true); // Buat async
    xhr.onload = function() {
        const message = xhr.responseText || xhr.statusText;
        if (xhr.status === 200 && message.startsWith("OK:")) {
             showToast(action.toUpperCase() + '_OK: ' + message.substring(3), 'success');
        } else if (xhr.status === 200 && action === "edit") { // Edit action might return file content on 200
            if(_("editor")) _("editor").value = xhr.responseText;
            if(_("editor-file")) _("editor-file").innerHTML = filename;
            const editorContainer = document.querySelector('.editor-container');
            if(editorContainer) editorContainer.style.display = 'flex';
            showToast('EDIT_LOAD_OK: ' + filename + ' ready.', 'info');
            return; // Jangan refresh list untuk edit
        }
        else {
            showToast(action.toUpperCase() + '_FAIL: ' + message, 'error');
        }
        listFilesButton(actualFolder, fs, false); // Refresh list setelah aksi (kecuali edit load)
    };
     xhr.onerror = function() { showToast(action.toUpperCase() + '_ERR: Network issue.', 'error'); };

    if (action == "download") {
        if(_("status")) _("status").innerHTML = "Initiating download: " + filename;
        window.open(urltocall, "_blank");
        showToast('DOWNLOAD_INIT: ' + filename, 'info');
    } else if (action == "edit") {
         xhr.send(); // Kirim request untuk edit
    } else if (option) { // Untuk delete, create, createfile jika option true
         xhr.send();
    }
}

function cancelEdit() {
    const editorContainer = document.querySelector('.editor-container');
    if(editorContainer) editorContainer.style.display = 'none';
    if(_("editor")) _("editor").value = "";
    if(_("status")) _("status").innerHTML = "Editor_Mode_Deactivated.";
    showToast('EDIT_CANCELLED: No changes saved.', 'info');
}

function CreateFolderModal() {
    var actualFolder = _("actualFolder").value;
    var fs = _("actualFS").value;
    showModal('Create Directory Node //_ Path_Construct', `
    <div class="form-group">
      <label for="modalNewFolderName">New Directory Identifier:</label>
      <input type="text" id="modalNewFolderName" placeholder="New_Folder_ID">
    </div>
    <p style="font-size:0.8em; color:var(--text-dim);">Will be created in: ${actualFolder}</p>
    `, 'info', [
        { text: 'ABORT_CONSTRUCT', class: 'secondary', onClick: 'closeModal()' },
        { text: 'CREATE_NODE_>', class: 'primary', onClick: `(function(){
            const folderName = document.getElementById('modalNewFolderName').value;
            if (!folderName || folderName.trim() === "") {
                showToast('ERR: Directory identifier cannot be empty.', 'error');
                return; // Jangan tutup modal jika error
            }
            // Panggil downloadDeleteButton yang sudah memiliki toast sendiri
            downloadDeleteButton(_("actualFolder").value.replace(/\/$/, "") + "/" + folderName, 'create');
            closeModal();
        })()`}
    ]);
}

function showCreateFile(folders) {
    var currentPath = folders.replace(/\/$/, "");
    if (currentPath === "") currentPath = "/";

    var uploadform = "<p>Create file node at: <b>" + currentPath + "</b>" +
        "<input type=\"hidden\" id=\"createInFolder\" value=\"" + currentPath + "\">" + // Ubah ID agar unik dari modal
        "<input type=\"text\" id=\"createFileName\" placeholder=\"node_name.ext\">" +
        "<button onclick=\"CreateFileFromInput()\">CREATE_FILE_NODE_></button>" + // Panggil fungsi baru
        "</p>";
    if(_("updetails")) _("updetails").innerHTML = uploadform;
}

function CreateFileFromInput() { // Fungsi baru untuk form inline
    var folderPath = _("createInFolder").value;
    var inputFileName = _("createFileName").value;
    if(!inputFileName) {
        showToast("ERR: File identifier cannot be empty.", "error");
        return;
    }
    var fullFileName = (folderPath === "/" ? "/" : folderPath + "/") + inputFileName;
    if (fullFileName.startsWith("//")) fullFileName = fullFileName.substring(1);
    // Panggil downloadDeleteButton yang sudah memiliki toast sendiri
    downloadDeleteButton(fullFileName, 'createfile');
    // Kosongkan input setelah create
    if(_("createFileName")) _("createFileName").value = "";
    // Mungkin kosongkan _("updetails") atau beri pesan sukses di sana
    if(_("updetails")) _("updetails").innerHTML = "<p style='color:var(--accent-primary)'>Create file action initiated...</p>";
    setTimeout(() => { if(_("updetails")) _("updetails").innerHTML = "";}, 3000);

}

function _(el) { return document.getElementById(el); }

function saveFile() {
    var fs = _("actualFS").value;
    var folder = _("actualFolder").value;
    var fileName = _("editor-file").innerText;
    var fileContent = _("editor").value;

    const formdata = new FormData();
    formdata.append("fs", fs);
    formdata.append("name", fileName);
    formdata.append("content", fileContent);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/edit", true); // Buat async
    xhr.onload = function() {
        const message = xhr.responseText || xhr.statusText;
        if (xhr.status === 200 && message.startsWith("OK:")) {
            showToast('SAVE_OK: ' + message.substring(3), 'success');
        } else {
            showToast('SAVE_FAIL: ' + message, 'error');
        }
        listFilesButton(folder, fs, false); // Refresh list
    };
    xhr.onerror = function() { showToast('SAVE_ERR: Network issue.', 'error'); };
    xhr.send(formdata);
    if(_("status")) _("status").innerText = 'Save operation processing...'; // Pesan sementara
}

window.addEventListener("load", function () {
    var dropAreaTarget = _("drop-area"); // Kembali targetkan ke #drop-area
    if(dropAreaTarget){
        dropAreaTarget.addEventListener("dragenter", dragEnter, false);
        dropAreaTarget.addEventListener("dragover", dragOver, false);
        dropAreaTarget.addEventListener("dragleave", dragLeave, false);
        dropAreaTarget.addEventListener("drop", drop, false);
    } else {
        console.warn("Drop area element 'drop-area' not found.");
    }
    systemInfo();
    listFilesButton(_("actualFolder").value || "/", _("actualFS").value || 'LittleFS', true);
});

function dragEnter(event) { event.preventDefault(); if(this.classList) this.classList.add("highlight"); }
function dragOver(event) { event.preventDefault(); if(this.classList) this.classList.add("highlight"); }
function dragLeave(event) { event.preventDefault(); if(this.classList) this.classList.remove("highlight"); }

var currentFileIndex = 0;
var totalSize = 0;
var totalFiles = 0;
var completedFiles = 0;

function writeSendForm() {
    var uploadform = "<p>Initiating Data Uplink...</p>" +
        "<div id=\"file-progress-container\"></div>";
    if(_("updetails")) _("updetails").innerHTML = uploadform;
}

async function drop(event) {
    event.preventDefault();
    const dropAreaTarget = _("drop-area"); // Pastikan referensi benar
    if(dropAreaTarget) dropAreaTarget.classList.remove("highlight");

    const items = event.dataTransfer.items;
    const filesQ = [];
    const promises = [];

    if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
            const itemOrEntry = items[i];
            const entry = itemOrEntry.webkitGetAsEntry ? itemOrEntry.webkitGetAsEntry() : null;
            if (entry) {
                promises.push(FileTree(entry, "", filesQ));
            } else if (itemOrEntry.getAsFile) {
                const file = itemOrEntry.getAsFile();
                if (file) filesQ.push(file);
            }
        }
    } else if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
         for(let i=0; i < event.dataTransfer.files.length; i++) {
            filesQ.push(event.dataTransfer.files[i]);
         }
    }

    try {
        await Promise.all(promises);
    } catch (error) {
        showToast('ERR: Processing dropped items failed. ' + error, 'error');
        return;
    }


    if (filesQ.length > 0) {
        handleFileForm(filesQ, _("actualFolder").value);
    } else if (event.dataTransfer.files && event.dataTransfer.files.length > 0 && promises.length === 0 && filesQ.length === 0) {
        handleFileForm(Array.from(event.dataTransfer.files), _("actualFolder").value);
    } else if (filesQ.length === 0) { // Hanya tampilkan jika benar-benar tidak ada file
        showToast("WARN: No valid files or folders processed from drop.", "warning");
    }
}


function FileTree(item, path = "", filesQ) {
    return new Promise((resolve, reject) => {
        if (!item) { reject("Invalid item in FileTree"); return; }
        if (item.isFile) {
            item.file(function (file) {
                if (!file) { reject("Failed to get file object for: " + item.name); return; }
                const fileWithPath = new File([file], path + file.name, { type: file.type });
                filesQ.push(fileWithPath);
                resolve();
            }, (err) => { reject("File API error for " + item.name + ": " + err); });
        } else if (item.isDirectory) {
            const dirReader = item.createReader();
            if (!dirReader) { reject("Failed to create directory reader for: " + item.name); return; }
            let allEntries = [];
            function readEntriesBatch() {
                dirReader.readEntries(async (entries) => {
                    if (!entries) { reject("readEntries returned null for: " + item.name); return; }
                    if (entries.length > 0) {
                        allEntries = allEntries.concat(entries);
                        readEntriesBatch();
                    } else {
                        const entryPromises = [];
                        for (let i = 0; i < allEntries.length; i++) {
                            entryPromises.push(FileTree(allEntries[i], path + item.name + "/", filesQ));
                        }
                        try {
                           await Promise.all(entryPromises);
                           resolve();
                        } catch (batchError) {
                           reject("Error processing directory entries for " + item.name + ": " + batchError);
                        }
                    }
                }, (err) => { reject("readEntries API error for " + item.name + ": " + err); });
            }
            readEntriesBatch();
        } else {
            resolve();
        }
    });
}

let fileQueue = [];
let activeUploads = 0;
const maxConcurrentUploads = 3;

function handleFileForm(files, folder) {
    if (!files || files.length === 0) {
      showToast("INFO: No files selected for upload.", "info");
      return;
    }
    writeSendForm();
    var fsValue = _("actualFS") ? _("actualFS").value : 'LittleFS';
    fileQueue = Array.from(files);
    totalFiles = fileQueue.length;
    completedFiles = 0;
    activeUploads = 0;
    if(_("status")) _("status").innerHTML = `Preparing ${totalFiles} nodes for uplink...`;
    for (let i = 0; i < Math.min(maxConcurrentUploads, fileQueue.length); i++) {
        processNextUpload(fsValue, folder);
    }
}

function processNextUpload(fs, folder) {
    if (fileQueue.length === 0) {
        if (activeUploads === 0) { // Semua upload selesai atau gagal
            const finalMessage = "Uplink Complete. " + completedFiles + " of " + totalFiles + " nodes transferred.";
            if(_("status")) _("status").innerHTML = finalMessage;
            if(_("updetails")) _("updetails").innerHTML = "";
            listFilesButton(_("actualFolder").value, fs, false);
            showToast(finalMessage, completedFiles === totalFiles && totalFiles > 0 ? 'success' : (totalFiles === 0 ? 'info' : 'warning'));
        }
        return;
    }
    if (activeUploads >= maxConcurrentUploads) return;

    const file = fileQueue.shift();
    activeUploads++;
    uploadFile(folder, file, fs)
        .then(() => {
            activeUploads--;
            completedFiles++;
            if(_("status")) _("status").innerHTML = `Uplinking: ${completedFiles} of ${totalFiles}. Current: ${file.name}`;
             // showToast(`UPLOAD_OK: ${file.name}`, 'success'); // Opsi: toast per file
            processNextUpload(fs, folder);
        })
        .catch((errorStatus) => {
            activeUploads--;
            if(_("status")) _("status").innerHTML = `Uplink error on ${file.name}. Status: ${errorStatus}`;
            showToast(`UPLOAD_FAIL: ${file.name}. Error: ${errorStatus}`, 'error');
            processNextUpload(fs, folder);
        });
}

function uploadFile(folder, file, fs) {
    return new Promise((resolve, reject) => {
        const progressBarId = `progress-${file.name.replace(/[^a-zA-Z0-9]/g, '')}`;
        let fileProgressDiv = _(progressBarId + "-container");
        const progressContainer = _("file-progress-container");

        if (!fileProgressDiv && progressContainer) {
            fileProgressDiv = document.createElement("div");
            fileProgressDiv.id = progressBarId + "-container";
            fileProgressDiv.innerHTML = `<p>${file.name}: <progress id="${progressBarId}" value="0" max="100"></progress></p>`;
            progressContainer.appendChild(fileProgressDiv);
        }
        var formdata = new FormData();
        formdata.append("file", file, file.webkitRelativePath || file.name);
        formdata.append("fs", fs);
        formdata.append("folder", folder);

        var ajax = new XMLHttpRequest();
        ajax.upload.addEventListener("progress", function (event) {
            if (event.lengthComputable) {
                var percent = (event.loaded / event.total) * 100;
                const progressBarElem = _(progressBarId);
                if(progressBarElem) progressBarElem.value = Math.round(percent);
            }
        }, false);
        ajax.addEventListener("load", () => {
            if (ajax.status === 200) resolve();
            else reject(ajax.statusText || 'Upload status ' + ajax.status);
        }, false);
        ajax.addEventListener("error", () => reject('Network error'), false);
        ajax.addEventListener("abort", () => reject('Upload aborted'), false);
        ajax.open("POST", "/");
        ajax.send(formdata);
    });
}

function systemInfo() {
    const xmlhttp = new XMLHttpRequest();
    xmlhttp.onload = function () {
        if (xmlhttp.status === 200) {
            try {
                const data = JSON.parse(xmlhttp.responseText);
                if(_("firmwareVersion")) _("firmwareVersion").innerHTML = data.BRUCE_VERSION;

                function parseSizeToBytes(sizeStr) {
                    if (!sizeStr || typeof sizeStr !== 'string') return 0;
                    const parts = sizeStr.toLowerCase().split(" ");
                    if (parts.length === 0) return 0;
                    let value = parseFloat(parts[0].replace(/[^0-9.]/g, ''));
                    if (isNaN(value)) return 0;
                    const unit = parts.length > 1 ? parts[1] : "b";
                    if (unit.startsWith("kb")) value *= 1024;
                    else if (unit.startsWith("mb")) value *= 1024 * 1024;
                    else if (unit.startsWith("gb")) value *= 1024 * 1024 * 1024;
                    return value;
                }

                const sdFree = data.SD.free;
                const sdUsed = data.SD.used;
                const sdTotal = data.SD.total;
                if(_("freeSD")) _("freeSD").innerHTML = sdFree;
                if(_("usedSD")) _("usedSD").innerHTML = sdUsed;
                if(_("totalSD")) _("totalSD").innerHTML = sdTotal;
                const sdTotalBytes = parseSizeToBytes(sdTotal);
                const sdUsedBytes = parseSizeToBytes(sdUsed);
                const sdUsagePercent = sdTotalBytes > 0 ? (sdUsedBytes / sdTotalBytes) * 100 : 0;
                const sdProgressBar = _("sdProgressBar");
                if(sdProgressBar) sdProgressBar.style.width = sdUsagePercent.toFixed(2) + "%";

                const lfsFree = data.LittleFS.free;
                const lfsUsed = data.LittleFS.used;
                const lfsTotal = data.LittleFS.total;
                if(_("freeLittleFS")) _("freeLittleFS").innerHTML = lfsFree;
                if(_("usedLittleFS")) _("usedLittleFS").innerHTML = lfsUsed;
                if(_("totalLittleFS")) _("totalLittleFS").innerHTML = lfsTotal;
                const lfsTotalBytes = parseSizeToBytes(lfsTotal);
                const lfsUsedBytes = parseSizeToBytes(lfsUsed);
                const lfsUsagePercent = lfsTotalBytes > 0 ? (lfsUsedBytes / lfsTotalBytes) * 100 : 0;
                const lfsProgressBar = _("littleFsProgressBar");
                if(lfsProgressBar) lfsProgressBar.style.width = lfsUsagePercent.toFixed(2) + "%";

            } catch (error) {
                 if(_("status")) _("status").innerHTML = 'Err: Parse_SysInfo //_ ' + error;
            }
        } else {
            if(_("status")) _("status").innerHTML = 'Err: Fetch_SysInfo //_ ' + xmlhttp.status;
        }
    };
    xmlhttp.onerror = function () {
         if(_("status")) _("status").innerHTML = 'Network anomaly... SysInfo fetch failed.';
    };
    xmlhttp.open("GET", "/systeminfo", true);
    xmlhttp.send();
}

const editorElement = _("editor");
if (editorElement) {
    editorElement.addEventListener("keydown", function (e) {
        if (e.key === 's' && (e.ctrlKey || e.metaKey) ) {
            e.preventDefault();
            saveFile();
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            var cursorPos = this.selectionStart;
            var textBefore = this.value.substring(0, cursorPos);
            var textAfter = this.value.substring(cursorPos);
            this.value = textBefore + "  " + textAfter;
            this.selectionStart = cursorPos + 2;
            this.selectionEnd = cursorPos + 2;
        }
    });

    editorElement.addEventListener("keyup", function (e) {
        if (e.key === 'Escape') cancelEdit();
        const map_chars = { "(": ")", "{": "}", "[": "]", "\"": "\"", "'": "'", "`": "`", "<": ">" };
        if (e.key in map_chars && this.value.substring(this.selectionStart, this.selectionStart + 1) !== map_chars[e.key]) {
            const cursorPos = this.selectionStart;
            const textBefore = this.value.substring(0, cursorPos);
            const textAfter = this.value.substring(cursorPos);
            this.value = textBefore + map_chars[e.key] + textAfter;
            this.selectionStart = cursorPos;
            this.selectionEnd = cursorPos;
        }
    });
}

function showModal(title, message, type = 'info', buttons = []) {
    const existingModal = document.querySelector('.modal');
    if(existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
    <div class="modal-content type-${type}">
      <h3 class="modal-title">${title}</h3>
      <div class="modal-message">${message}</div>
      <div class="modal-buttons">
        ${buttons.map(btn => `<button class="${btn.class || ''}" onclick="${btn.onClick}">${btn.text}</button>`).join('')}
      </div>
    </div>`;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
}

function closeModal() {
    const modal = document.querySelector('.modal.show');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}

function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast');
    if(existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast type-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

function updateFileManagerUI() {
    const detailsElement = _('details');
    if (!detailsElement) return;

    const files = detailsElement.querySelectorAll('tbody tr.file-row-animate');
    files.forEach((file, index) => {
        file.style.setProperty('--animation-delay', `${index * 0.03}s`);
    });
}

const styleSheet = document.createElement('style');
styleSheet.textContent = `
  .modal {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(16, 16, 26, 0.8); display: flex;
    align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.3s ease; z-index: 1000;
  }
  .modal.show { opacity: 1; }
  .modal-content {
    background: var(--bg-container); color: var(--text-main);
    padding: 20px; border: 1px solid var(--border-color);
    box-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
    max-width: 500px;
    width: 90%;
    transform: translateY(-20px); transition: transform 0.3s ease;
    margin-left: auto;
    margin-right: auto;
    box-sizing: border-box;
  }
  @media (max-width: 600px) {
    .modal-content {
      width: calc(100% - 40px);
    }
  }
  .modal.show .modal-content { transform: translateY(0); }
  .modal-title { color: var(--accent-primary); margin-top: 0; margin-bottom: 15px; text-shadow: 0 0 5px var(--accent-primary); }
  .modal-message { margin-bottom: 20px; line-height: 1.5; word-break: break-word; } /* Ensure message content can break */
  .modal-message .form-group input { margin-top: 5px; } /* Spacing for inputs in modal */
  .modal-buttons { display: flex; justify-content: flex-end; gap: 10px; }
  .modal-buttons button {
    background-color: var(--bg-element); color: var(--text-main);
    border: 1px solid var(--border-color); padding: 8px 15px; cursor: pointer;
    font-family: var(--font-family-main);
  }
  .modal-buttons button.primary { background-color: var(--accent-primary); color: var(--bg-main); border-color: var(--accent-primary); }
  .modal-buttons button.primary:hover { box-shadow: 0 0 8px var(--accent-primary); }
  .modal-buttons button.secondary { background-color: var(--bg-element-darker); }
  .modal-buttons button:hover { opacity:0.9; }

  .toast {
    position: fixed; bottom: 20px; right: 20px;
    padding: 12px 20px; background: var(--bg-element);
    color: var(--text-main); border: 1px solid var(--border-color);
    box-shadow: 0 0 15px rgba(0,0,0,0.5);
    transform: translateX(120%); transition: transform 0.4s ease-out, opacity 0.4s ease-out;
    z-index: 1001; min-width: 250px; max-width: calc(100% - 40px);
    box-sizing: border-box; opacity: 0;
  }
  .toast.show { transform: translateX(0); opacity: 1;}
  .toast.type-success { border-left: 5px solid #00ff00; background-color: #102a10;}
  .toast.type-error { border-left: 5px solid var(--accent-danger); background-color: #2a1010;}
  .toast.type-warning { border-left: 5px solid #ffff00; background-color: #2a2a10;}
  .toast.type-info { border-left: 5px solid var(--accent-primary); background-color: #10102a;}

  .form-group { margin-bottom: 15px; }
  .form-group label { display: block; margin-bottom: 5px; color: var(--text-dim); }
  .form-group input[type="text"], .form-group input[type="password"] {
    width: 100%; padding: 8px; box-sizing: border-box;
    border: 1px solid var(--border-color); background: var(--bg-main);
    color: var(--text-main); font-family: var(--font-family-main);
  }
  .form-group input:focus { outline:none; border-color:var(--accent-primary); box-shadow: 0 0 5px var(--accent-primary); }

  .active-fs-btn {
    background-color: var(--accent-primary);
    color: var(--bg-main);
    border-color: var(--accent-primary);
    box-shadow: 0 0 10px var(--accent-primary);
  }
  .file-row-animate {
    opacity: 0;
    transform: translateY(10px);
    animation: fadeInEntry 0.3s ease forwards;
    animation-delay: var(--animation-delay, 0s);
  }
  @keyframes fadeInEntry {
    to { opacity: 1; transform: translateY(0); }
  }
`;
document.head.appendChild(styleSheet);
