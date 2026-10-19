(function (global) {
  "use strict";

  var STATUS = {
    vacant: { key: "vacant", label: "Trống", className: "room-vacant" },
    occupied: { key: "occupied", label: "Đang thuê", className: "room-occupied" },
    cleaning: { key: "cleaning", label: "Chờ dọn", className: "room-cleaning" },
    inactive: { key: "inactive", label: "Ngừng hoạt động", className: "room-inactive" },
  };

  function defaultRooms() {
    var rooms = [];
    for (var i = 1; i <= 20; i++) {
      var num = 100 + i;
      rooms.push({
        id: global.QLNH.storage.uid(),
        name: "P" + num,
        status: "vacant",
        stayId: null,
        note: "",
        createdAt: new Date().toISOString(),
      });
    }
    return rooms;
  }

  function ensureSeed(state) {
    if (!state.settings) {
      state.settings = global.QLNH.pricing.defaultSettings();
    }
    if (!state.seeded) {
      if (!state.rooms || !state.rooms.length) {
        state.rooms = defaultRooms();
      }
      state.seeded = true;
    }
    return state;
  }

  function getRoom(state, roomId) {
    return state.rooms.find(function (r) {
      return r.id === roomId;
    });
  }

  function getRoomByName(state, name) {
    var n = String(name || "").trim().toLowerCase();
    return state.rooms.find(function (r) {
      return r.name.toLowerCase() === n;
    });
  }

  function getStay(state, stayId) {
    return state.stays.find(function (s) {
      return s.id === stayId;
    });
  }

  function activeStayOfRoom(state, roomId) {
    var room = getRoom(state, roomId);
    if (!room || !room.stayId) return null;
    return getStay(state, room.stayId) || null;
  }

  function canCheckIn(state, roomId) {
    var room = getRoom(state, roomId);
    if (!room) return { ok: false, error: "Không tìm thấy phòng." };
    if (room.status === "inactive") return { ok: false, error: "Phòng đang ngừng hoạt động." };
    if (room.status === "occupied" || room.stayId) return { ok: false, error: "Phòng đang có khách, không thể nhận thêm." };
    if (room.status === "cleaning") return { ok: false, error: "Phòng đang chờ dọn dẹp, hãy xác nhận đã dọn xong trước." };
    return { ok: true, room: room };
  }

  function addRoom(state, name) {
    name = String(name || "").trim();
    if (!name) return { ok: false, error: "Nhập số phòng / tên phòng." };
    if (getRoomByName(state, name)) return { ok: false, error: "Tên phòng đã tồn tại." };
    var room = {
      id: global.QLNH.storage.uid(),
      name: name,
      status: "vacant",
      stayId: null,
      note: "",
      createdAt: new Date().toISOString(),
    };
    state.rooms.push(room);
    return { ok: true, room: room };
  }

  function updateRoom(state, roomId, patch) {
    var room = getRoom(state, roomId);
    if (!room) return { ok: false, error: "Không tìm thấy phòng." };
    if (patch.name) {
      var other = getRoomByName(state, patch.name);
      if (other && other.id !== roomId) return { ok: false, error: "Tên phòng đã tồn tại." };
      room.name = String(patch.name).trim();
    }
    if (patch.note != null) room.note = patch.note;
    if (patch.status === "inactive") {
      if (room.status === "occupied") return { ok: false, error: "Không thể ngừng phòng đang có khách." };
      room.status = "inactive";
      room.stayId = null;
    }
    if (patch.status === "vacant" && room.status === "inactive") {
      room.status = "vacant";
    }
    return { ok: true, room: room };
  }

  function removeRoom(state, roomId) {
    var room = getRoom(state, roomId);
    if (!room) return { ok: false, error: "Không tìm thấy phòng." };
    if (room.status === "occupied" || room.stayId) {
      return { ok: false, error: "Không thể xóa phòng đang có khách." };
    }
    state.rooms = state.rooms.filter(function (r) {
      return r.id !== roomId;
    });
    return { ok: true };
  }

  function setCleaning(state, roomId) {
    var room = getRoom(state, roomId);
    if (!room) return { ok: false, error: "Không tìm thấy phòng." };
    if (room.status === "occupied") return { ok: false, error: "Hãy trả phòng trước khi đánh dấu dọn dẹp." };
    room.status = "cleaning";
    room.stayId = null;
    return { ok: true, room: room };
  }

  function setCleaned(state, roomId) {
    var room = getRoom(state, roomId);
    if (!room) return { ok: false, error: "Không tìm thấy phòng." };
    if (room.status === "occupied") return { ok: false, error: "Phòng đang có khách." };
    room.status = "vacant";
    room.stayId = null;
    return { ok: true, room: room };
  }

  function counts(state) {
    var occupied = 0;
    var vacant = 0;
    var cleaning = 0;
    var inactive = 0;
    state.rooms.forEach(function (r) {
      if (r.status === "occupied") occupied++;
      else if (r.status === "cleaning") cleaning++;
      else if (r.status === "inactive") inactive++;
      else vacant++;
    });
    return { occupied: occupied, vacant: vacant, cleaning: cleaning, inactive: inactive, total: state.rooms.length };
  }

  global.QLNH = global.QLNH || {};
  global.QLNH.rooms = {
    STATUS: STATUS,
    defaultRooms: defaultRooms,
    ensureSeed: ensureSeed,
    getRoom: getRoom,
    getRoomByName: getRoomByName,
    getStay: getStay,
    activeStayOfRoom: activeStayOfRoom,
    canCheckIn: canCheckIn,
    addRoom: addRoom,
    updateRoom: updateRoom,
    removeRoom: removeRoom,
    setCleaning: setCleaning,
    setCleaned: setCleaned,
    counts: counts,
  };
})(window);
