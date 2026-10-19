(function (global) {
  "use strict";

  var KEY = "qlnh.v1";
  var VERSION = 1;

  function uid() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  function emptyState() {
    return {
      version: VERSION,
      settings: null,
      rooms: [],
      stays: [],
      history: [],
      seeded: false,
    };
  }

  function loadRaw() {
    var raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  function saveRaw(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : "Không lưu được dữ liệu (localStorage đầy hoặc bị chặn)." };
    }
  }

  function load() {
    try {
      var data = loadRaw();
      if (!data || typeof data !== "object") return emptyState();
      return {
        version: data.version || VERSION,
        settings: data.settings || null,
        rooms: Array.isArray(data.rooms) ? data.rooms : [],
        stays: Array.isArray(data.stays) ? data.stays : [],
        history: Array.isArray(data.history) ? data.history : [],
        seeded: !!data.seeded || (Array.isArray(data.rooms) && data.rooms.length > 0),
      };
    } catch (err) {
      throw new Error("Dữ liệu lưu trữ bị hỏng. Hãy khôi phục từ bản sao lưu JSON.");
    }
  }

  function save(state) {
    state.version = VERSION;
    state.updatedAt = new Date().toISOString();
    return saveRaw(state);
  }

  function isValidBackup(data) {
    if (!data || typeof data !== "object") return "File không phải JSON đối tượng.";
    if (!Array.isArray(data.rooms)) return "Thiếu danh sách phòng hợp lệ.";
    if (!Array.isArray(data.stays)) return "Thiếu danh sách lượt thuê đang hoạt động.";
    if (!Array.isArray(data.history)) return "Thiếu lịch sử giao dịch.";
    if (data.settings != null && typeof data.settings !== "object") return "Phần cài đặt không hợp lệ.";
    var roomOk = data.rooms.every(function (r) {
      return r && typeof r.id === "string" && typeof r.name === "string" && typeof r.status === "string";
    });
    if (!roomOk) return "Một hoặc nhiều phòng có cấu trúc không hợp lệ.";
    var stayOk = data.stays.every(function (s) {
      return s && typeof s.id === "string" && typeof s.roomId === "string";
    });
    if (!stayOk) return "Một hoặc nhiều lượt thuê đang hoạt động không hợp lệ.";
    var histOk = data.history.every(function (h) {
      return h && typeof h.id === "string";
    });
    if (!histOk) return "Một hoặc nhiều bản ghi lịch sử không hợp lệ.";
    return null;
  }

  function exportJson() {
    var state = load();
    return JSON.stringify(state, null, 2);
  }

  function importJson(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return { ok: false, error: "Không đọc được file JSON." };
    }
    var err = isValidBackup(data);
    if (err) return { ok: false, error: err };
    data.version = VERSION;
    var result = saveRaw(data);
    if (!result.ok) return result;
    return { ok: true, data: data };
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  global.QLNH = global.QLNH || {};
  global.QLNH.storage = {
    KEY: KEY,
    uid: uid,
    emptyState: emptyState,
    load: load,
    save: save,
    exportJson: exportJson,
    importJson: importJson,
    download: download,
    isValidBackup: isValidBackup,
  };
})(window);
