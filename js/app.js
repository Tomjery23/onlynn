(function () {
  "use strict";

  var S = QLNH.storage;
  var P = QLNH.pricing;
  var R = QLNH.rooms;
  var Pay = QLNH.payments;
  var Hist = QLNH.history;
  var UI = QLNH.ui;
  var $ = UI.$;
  var $all = UI.$all;

  var state = null;
  var selectedRoomId = null;
  var checkoutStayId = null;
  var fillExpectedFromRule = true;
  var lastCalc = null;

  function persist() {
    var res = S.save(state);
    if (!res.ok) {
      UI.toast(res.error, "error");
      return false;
    }
    return true;
  }

  function loadState() {
    try {
      state = R.ensureSeed(S.load());
      if (!state.settings) state.settings = P.defaultSettings();
      persist();
    } catch (err) {
      UI.toast(err.message, "error");
      state = R.ensureSeed(S.emptyState());
    }
  }

  function val(id) {
    var el = $(id);
    return el ? el.value : "";
  }

  function setVal(id, v) {
    var el = $(id);
    if (el) el.value = v;
  }

  function numVal(id) {
    return P.clampMoney(val(id));
  }

  function nowInput() {
    return P.dateToLocalInput(new Date());
  }

  function formStayType() {
    return val("#f-type") || "hourly";
  }

  function collectForm() {
    return {
      roomId: val("#f-room"),
      guestName: val("#f-name"),
      phone: val("#f-phone"),
      stayType: formStayType(),
      checkIn: val("#f-checkin"),
      expectedCheckout: val("#f-expected"),
      actualCheckout: val("#f-actual"),
      extraSurcharge: numVal("#f-surcharge"),
      discount: numVal("#f-discount"),
      paid: numVal("#f-paid"),
      notes: val("#f-notes"),
    };
  }

  function calcFromForm() {
    var f = collectForm();
    var checkIn = P.fromLocalInput(f.checkIn);
    var checkOut = P.fromLocalInput(f.actualCheckout || f.expectedCheckout);
    if (!checkIn || !checkOut) {
      lastCalc = null;
      renderCalcBox(null, "Nhập đủ giờ nhận và giờ trả phòng.");
      return null;
    }
    var result = P.calculateStay({
      settings: state.settings,
      stayType: f.stayType,
      checkIn: checkIn,
      checkOut: checkOut,
      extraSurcharge: f.extraSurcharge,
      discount: f.discount,
      paid: f.paid,
    });
    lastCalc = result;
    renderCalcBox(result);
    if (result.ok) {
      setVal("#f-room-price", result.roomCharge);
      setVal("#f-total", result.total);
      $("#f-collect").textContent = result.collect > 0 ? P.formatVND(result.collect) : "0 ₫";
      $("#f-refund").textContent = result.refund > 0 ? P.formatVND(result.refund) : "0 ₫";
    }
    return result;
  }

  function renderCalcBox(result, fallback) {
    var box = $("#calc-result");
    if (!result || !result.ok) {
      box.innerHTML =
        '<p class="muted">' +
        Pay.escapeHtml((result && result.error) || fallback || "Chưa có kết quả tính tiền.") +
        "</p>";
      return;
    }
    var warn = (result.warnings || [])
      .map(function (w) {
        return '<div class="notice">' + Pay.escapeHtml(w) + "</div>";
      })
      .join("");
    var due =
      result.collect > 0
        ? '<div class="due due-collect">Còn phải thu: <strong>' + P.formatVND(result.collect) + "</strong></div>"
        : result.refund > 0
          ? '<div class="due due-refund">Tiền thừa trả khách: <strong>' + P.formatVND(result.refund) + "</strong></div>"
          : '<div class="due due-ok">Đã thanh toán đủ</div>';
    box.innerHTML =
      warn +
      '<dl class="kv">' +
      "<div><dt>Giờ nhận phòng</dt><dd>" +
      Pay.escapeHtml(P.formatDateTime(result.checkIn)) +
      "</dd></div>" +
      "<div><dt>Giờ trả phòng</dt><dd>" +
      Pay.escapeHtml(P.formatDateTime(result.checkOut)) +
      "</dd></div>" +
      "<div><dt>Giờ trả tiêu chuẩn</dt><dd>" +
      Pay.escapeHtml(P.formatDateTime(result.standardCheckout)) +
      "</dd></div>" +
      "<div><dt>Tổng thời gian lưu trú</dt><dd>" +
      Pay.escapeHtml(result.durationLabel) +
      "</dd></div>" +
      "<div><dt>Loại hình thuê</dt><dd>" +
      Pay.escapeHtml(result.stayTypeLabel) +
      "</dd></div>" +
      "<div><dt>Tiền phòng</dt><dd>" +
      P.formatVND(result.roomCharge) +
      "</dd></div>" +
      "<div><dt>Tiền phụ thu</dt><dd>" +
      P.formatVND(result.surcharge) +
      "</dd></div>" +
      "<div><dt>Tiền giảm giá</dt><dd>" +
      P.formatVND(result.discount) +
      "</dd></div>" +
      "<div><dt>Tổng hóa đơn</dt><dd><strong>" +
      P.formatVND(result.total) +
      "</strong></dd></div>" +
      "<div><dt>Đã thanh toán</dt><dd>" +
      P.formatVND(result.paid) +
      "</dd></div>" +
      "</dl>" +
      due;
  }

  function applyExpectedFromRule() {
    if (!fillExpectedFromRule) return;
    var checkIn = P.fromLocalInput(val("#f-checkin"));
    if (!checkIn) return;
    var type = formStayType();
    var exp = P.expectedCheckout(checkIn, type, state.settings);
    setVal("#f-expected", P.dateToLocalInput(exp.expected));
    if (!val("#f-actual")) setVal("#f-actual", P.dateToLocalInput(exp.expected));
  }

  function fillRoomSelect(filterStatus) {
    var sel = $("#f-room");
    var current = sel.value;
    var html = '<option value="">-- Chọn phòng --</option>';
    state.rooms.forEach(function (r) {
      if (filterStatus && r.status !== filterStatus && r.id !== current) return;
      var label = r.name + " (" + (R.STATUS[r.status] ? R.STATUS[r.status].label : r.status) + ")";
      html += '<option value="' + r.id + '">' + Pay.escapeHtml(label) + "</option>";
    });
    sel.innerHTML = html;
    if (current) sel.value = current;
  }

  function renderStats() {
    var st = Hist.stats(state);
    $("#stat-revenue").textContent = P.formatVND(st.revenueToday);
    $("#stat-stays").textContent = String(st.staysToday);
    $("#stat-occupied").textContent = String(st.occupied);
    $("#stat-vacant").textContent = String(st.vacant);
    $("#stat-unpaid").textContent = P.formatVND(st.unpaid);
    var dayBox = $("#stat-byday");
    if (!st.byDay.length) {
      dayBox.innerHTML = '<p class="muted">Chưa có doanh thu theo ngày.</p>';
    } else {
      dayBox.innerHTML = st.byDay
        .slice(0, 14)
        .map(function (d) {
          return (
            '<div class="day-row"><span>' +
            Pay.escapeHtml(d.date) +
            "</span><span>" +
            d.stays +
            " lượt</span><strong>" +
            P.formatVND(d.revenue) +
            "</strong></div>"
          );
        })
        .join("");
    }
  }

  function renderPriceBoard() {
    var s = state.settings;
    $("#board-inn-name").textContent = s.inn.name;
    $("#p-hourly-first").textContent = P.formatVND(s.hourly.firstHour);
    $("#p-hourly-extra").textContent = P.formatVND(s.hourly.extraHour);
    $("#p-overnight").textContent = P.formatVND(s.overnight.price);
    $("#p-overnight-extra").textContent = P.formatVND(s.overnight.extraHour);
    $("#p-daily").textContent = P.formatVND(s.daily.price);
    $("#p-daily-late").textContent = P.formatVND(s.daily.extraHour);
    $("#p-rounding").textContent =
      s.hourly.rounding === "ceil"
        ? "Làm tròn lên theo giờ"
        : s.hourly.rounding === "floor"
          ? "Làm tròn xuống theo giờ"
          : s.hourly.rounding === "nearest"
            ? "Làm tròn gần nhất"
            : "Tính theo phút thực tế";
    $("#p-hourly-windows").innerHTML = '<li>Giờ đầu: ' + P.formatVND(s.hourly.firstHour) + ", mỗi giờ sau: " + P.formatVND(s.hourly.extraHour) + "</li>";
    $("#p-overnight-windows").innerHTML = (s.overnight.windows || [])
      .map(function (w) {
        return "<li>" + Pay.escapeHtml(w.label || (w.checkInFrom + " → " + w.checkInTo + ", trả " + w.checkoutTime)) + "</li>";
      })
      .join("");
    $("#p-overnight-bands").innerHTML = (s.overnight.lateBands || [])
      .map(function (b) {
        return (
          "<li>" +
          Pay.escapeHtml(b.label || b.start + "–" + b.end) +
          ": " +
          (b.mode === "fixed" ? P.formatVND(b.amount) : P.formatVND(b.amount) + "/giờ") +
          "</li>"
        );
      })
      .join("") || "<li>Không có khung phụ thu thêm</li>";
    $("#p-daily-windows").innerHTML = (s.daily.windows || [])
      .map(function (w) {
        return "<li>" + Pay.escapeHtml(w.label || (w.checkInFrom + " → " + w.checkInTo + ", trả " + w.checkoutTime)) + "</li>";
      })
      .join("");
    $("#board-address").textContent = s.inn.address || "";
    $("#board-phone").textContent = s.inn.phone ? "ĐT: " + s.inn.phone : "";
  }

  function elapsedLabel(iso) {
    if (!iso) return "—";
    return P.formatDuration(Date.now() - new Date(iso).getTime());
  }

  function renderRooms() {
    var q = val("#room-search").trim().toLowerCase();
    var st = val("#room-filter");
    var box = $("#room-grid");
    var rooms = state.rooms.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) === -1) return false;
      if (st && st !== "all" && r.status !== st) return false;
      return true;
    });
    if (!rooms.length) {
      box.innerHTML = '<p class="muted">Không có phòng phù hợp.</p>';
      return;
    }
    box.innerHTML = rooms
      .map(function (r) {
        var stay = R.activeStayOfRoom(state, r.id);
        var meta = R.STATUS[r.status] || R.STATUS.vacant;
        var extra = "";
        if (stay) {
          extra =
            '<div class="room-meta"><div>' +
            Pay.escapeHtml(stay.guestName) +
            "</div><div>" +
            Pay.escapeHtml(P.stayTypeLabel(stay.stayType)) +
            "</div><div>Nhận: " +
            Pay.escapeHtml(P.formatDateTime(new Date(stay.checkIn))) +
            "</div><div>Dự kiến: " +
            Pay.escapeHtml(P.formatDateTime(new Date(stay.expectedCheckout))) +
            "</div><div>Tạm tính: " +
            P.formatVND((stay.charge && stay.charge.total) || 0) +
            "</div><div>Đã thuê: " +
            Pay.escapeHtml(elapsedLabel(stay.checkIn)) +
            "</div></div>";
        }
        return (
          '<button type="button" class="room-card ' +
          meta.className +
          (selectedRoomId === r.id ? " selected" : "") +
          '" data-room="' +
          r.id +
          '"><div class="room-head"><strong>' +
          Pay.escapeHtml(r.name) +
          '</strong><span class="room-status">' +
          Pay.escapeHtml(meta.label) +
          "</span></div>" +
          extra +
          "</button>"
        );
      })
      .join("");
  }

  function renderHistory() {
    var filtered = Hist.filterHistory(state.history, {
      guest: val("#h-guest"),
      phone: val("#h-phone"),
      room: val("#h-room"),
      stayType: val("#h-type"),
      paymentStatus: val("#h-status"),
      dateFrom: val("#h-from"),
      dateTo: val("#h-to"),
    });
    var body = $("#history-body");
    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="12" class="muted">Chưa có lịch sử phù hợp.</td></tr>';
      $("#history-cards").innerHTML = '<p class="muted">Chưa có lịch sử phù hợp.</p>';
      return;
    }
    body.innerHTML = filtered
      .map(function (h) {
        var due =
          h.collect > 0 ? "Thiếu " + P.formatVND(h.collect) : h.refund > 0 ? "Hoàn " + P.formatVND(h.refund) : "Đủ";
        return (
          "<tr>" +
          '<td data-label="Mã">' +
          Pay.escapeHtml(h.invoiceCode) +
          "</td>" +
          '<td data-label="Phòng">' +
          Pay.escapeHtml(h.roomName) +
          "</td>" +
          '<td data-label="Khách">' +
          Pay.escapeHtml(h.guestName) +
          "<br><small>" +
          Pay.escapeHtml(h.phone || "") +
          "</small></td>" +
          '<td data-label="Loại">' +
          Pay.escapeHtml(h.stayTypeLabel) +
          "</td>" +
          '<td data-label="Nhận">' +
          Pay.escapeHtml(P.formatDateTime(new Date(h.checkIn))) +
          "</td>" +
          '<td data-label="Trả">' +
          Pay.escapeHtml(P.formatDateTime(new Date(h.actualCheckout))) +
          "</td>" +
          '<td data-label="Thời gian">' +
          Pay.escapeHtml(h.durationLabel) +
          "</td>" +
          '<td data-label="Tiền phòng">' +
          P.formatVND(h.roomCharge) +
          "</td>" +
          '<td data-label="Phụ thu">' +
          P.formatVND(h.surcharge) +
          "</td>" +
          '<td data-label="Tổng">' +
          P.formatVND(h.total) +
          "</td>" +
          '<td data-label="Thanh toán">' +
          Pay.escapeHtml(Pay.paymentStatusLabel(h.paymentStatus)) +
          "<br><small>" +
          due +
          "</small></td>" +
          '<td data-label="Thao tác"><button type="button" class="btn btn-ghost btn-small" data-invoice="' +
          h.id +
          '">Xem / In</button></td>' +
          "</tr>"
        );
      })
      .join("");
    $("#history-cards").innerHTML = filtered
      .map(function (h) {
        return (
          '<article class="data-card"><h4>' +
          Pay.escapeHtml(h.invoiceCode) +
          " · " +
          Pay.escapeHtml(h.roomName) +
          "</h4><p>" +
          Pay.escapeHtml(h.guestName) +
          " · " +
          Pay.escapeHtml(h.stayTypeLabel) +
          "</p><p>" +
          Pay.escapeHtml(P.formatDateTime(new Date(h.checkIn))) +
          " → " +
          Pay.escapeHtml(P.formatDateTime(new Date(h.actualCheckout))) +
          "</p><p><strong>" +
          P.formatVND(h.total) +
          "</strong> · " +
          Pay.escapeHtml(Pay.paymentStatusLabel(h.paymentStatus)) +
          '</p><button type="button" class="btn btn-ghost" data-invoice="' +
          h.id +
          '">Xem / In hóa đơn</button></article>'
        );
      })
      .join("");
  }

  function refresh() {
    renderPriceBoard();
    fillRoomSelect();
    initQuickRoomSelect();
    renderRooms();
    renderHistory();
    renderStats();
    calcFromForm();
    calcQuick();
  }

  function resetForm() {
    fillExpectedFromRule = true;
    selectedRoomId = null;
    setVal("#f-room", "");
    setVal("#f-name", "");
    setVal("#f-phone", "");
    setVal("#f-type", "hourly");
    setVal("#f-checkin", nowInput());
    setVal("#f-surcharge", "0");
    setVal("#f-discount", "0");
    setVal("#f-paid", "0");
    setVal("#f-notes", "");
    setVal("#f-actual", "");
    applyExpectedFromRule();
    renderRooms();
    calcFromForm();
  }

  function openRoomModal(roomId) {
    var room = R.getRoom(state, roomId);
    if (!room) return;
    selectedRoomId = roomId;
    var stay = R.activeStayOfRoom(state, roomId);
    $("#room-modal-title").textContent = "Phòng " + room.name;
    var html = '<p>Trạng thái: <strong>' + Pay.escapeHtml((R.STATUS[room.status] || {}).label || room.status) + "</strong></p>";
    if (stay) {
      html +=
        "<p>Khách: <strong>" +
        Pay.escapeHtml(stay.guestName) +
        "</strong><br>SĐT: " +
        Pay.escapeHtml(stay.phone || "—") +
        "<br>Loại: " +
        Pay.escapeHtml(P.stayTypeLabel(stay.stayType)) +
        "<br>Nhận: " +
        Pay.escapeHtml(P.formatDateTime(new Date(stay.checkIn))) +
        "<br>Dự kiến trả: " +
        Pay.escapeHtml(P.formatDateTime(new Date(stay.expectedCheckout))) +
        "<br>Tạm tính: " +
        P.formatVND((stay.charge && stay.charge.total) || 0) +
        "<br>Đã trả: " +
        P.formatVND(stay.paid) +
        "<br>Ghi chú: " +
        Pay.escapeHtml(stay.notes || "—") +
        "</p>";
    }
    $("#room-modal-body").innerHTML = html;
    $("#rm-checkin").disabled = room.status !== "vacant";
    $("#rm-calc").disabled = !stay;
    $("#rm-pay").disabled = !stay;
    $("#rm-checkout").disabled = !stay;
    $("#rm-edit").disabled = !stay;
    $("#rm-clean").disabled = room.status === "occupied" || room.status === "inactive";
    $("#rm-cleaned").disabled = room.status !== "cleaning";
    $("#rm-inactive").textContent = room.status === "inactive" ? "Mở lại phòng" : "Ngừng hoạt động";
    UI.openModal("#room-modal");
    renderRooms();
  }

  function loadStayToForm(stay) {
    fillExpectedFromRule = false;
    setVal("#f-room", stay.roomId);
    setVal("#f-name", stay.guestName);
    setVal("#f-phone", stay.phone);
    setVal("#f-type", stay.stayType);
    setVal("#f-checkin", P.dateToLocalInput(new Date(stay.checkIn)));
    setVal("#f-expected", P.dateToLocalInput(new Date(stay.expectedCheckout)));
    setVal("#f-actual", nowInput());
    setVal("#f-surcharge", stay.extraSurcharge || 0);
    setVal("#f-discount", stay.discount || 0);
    setVal("#f-paid", stay.paid || 0);
    setVal("#f-notes", stay.notes || "");
    calcFromForm();
    document.getElementById("sec-checkin").scrollIntoView({ behavior: "smooth" });
  }

  function prepareCheckout(stayId, autoNow) {
    var stay = R.getStay(state, stayId);
    if (!stay) {
      UI.toast("Không có lượt thuê đang hoạt động.", "error");
      return;
    }
    checkoutStayId = stayId;
    loadStayToForm(stay);
    if (autoNow) setVal("#f-actual", nowInput());
    var result = calcFromForm();
    $("#co-title").textContent = "Tính tiền trả phòng · " + stay.roomName;
    renderCalcBox(result);
    $("#checkout-preview").innerHTML = $("#calc-result").innerHTML;
    UI.openModal("#checkout-modal");
  }

  function windowRow(kind, w) {
    return (
      '<div class="repeat-row" data-kind="' +
      kind +
      '" data-id="' +
      w.id +
      '">' +
      '<label>Từ <input type="time" class="w-from" value="' +
      Pay.escapeHtml(w.checkInFrom) +
      '"></label>' +
      '<label>Đến <input type="time" class="w-to" value="' +
      Pay.escapeHtml(w.checkInTo) +
      '"></label>' +
      '<label>Giờ trả <input type="time" class="w-out" value="' +
      Pay.escapeHtml(w.checkoutTime) +
      '"></label>' +
      '<label class="grow">Mô tả <input type="text" class="w-label" value="' +
      Pay.escapeHtml(w.label || "") +
      '"></label>' +
      '<button type="button" class="btn btn-ghost btn-small w-del">Xóa</button>' +
      "</div>"
    );
  }

  function bandRow(kind, b) {
    return (
      '<div class="repeat-row" data-kind="' +
      kind +
      '" data-id="' +
      b.id +
      '">' +
      '<label>Từ <input type="time" class="b-from" value="' +
      Pay.escapeHtml(b.start) +
      '"></label>' +
      '<label>Đến <input type="time" class="b-to" value="' +
      Pay.escapeHtml(b.end) +
      '"></label>' +
      '<label>Kiểu <select class="b-mode"><option value="per_hour"' +
      (b.mode === "per_hour" ? " selected" : "") +
      '>Mỗi giờ</option><option value="fixed"' +
      (b.mode === "fixed" ? " selected" : "") +
      ">Số tiền cố định</option></select></label>" +
      '<label>Số tiền <input type="number" min="0" step="1000" class="b-amt" value="' +
      b.amount +
      '"></label>' +
      '<label class="grow">Mô tả <input type="text" class="b-label" value="' +
      Pay.escapeHtml(b.label || "") +
      '"></label>' +
      '<button type="button" class="btn btn-ghost btn-small b-del">Xóa</button>' +
      "</div>"
    );
  }

  function openSettings() {
    var s = state.settings;
    setVal("#s-name", s.inn.name);
    setVal("#s-address", s.inn.address);
    setVal("#s-phone", s.inn.phone);
    setVal("#s-paper", s.inn.invoicePaper || "a4");
    setVal("#s-first", s.hourly.firstHour);
    setVal("#s-extra", s.hourly.extraHour);
    setVal("#s-round", s.hourly.rounding);
    setVal("#s-def-hours", s.hourly.defaultDurationHours);
    setVal("#s-on-price", s.overnight.price);
    setVal("#s-on-extra", s.overnight.extraHour);
    $("#s-on-full").checked = !!s.overnight.earlyCheckoutChargeFull;
    setVal("#s-on-fallback", s.overnight.fallbackCheckoutTime);
    setVal("#s-day-price", s.daily.price);
    setVal("#s-day-extra", s.daily.extraHour);
    $("#s-day-full").checked = !!s.daily.earlyCheckoutChargeFull;
    setVal("#s-day-fallback", s.daily.fallbackCheckoutTime);
    setVal("#s-conv-on", s.conversion.hourlyToOvernightFrom);
    setVal("#s-conv-hour", s.conversion.overnightToHourlyFrom);
    $("#s-on-windows").innerHTML = (s.overnight.windows || []).map(function (w) {
      return windowRow("overnight", w);
    }).join("");
    $("#s-day-windows").innerHTML = (s.daily.windows || []).map(function (w) {
      return windowRow("daily", w);
    }).join("");
    $("#s-on-bands").innerHTML = (s.overnight.lateBands || []).map(function (b) {
      return bandRow("overnight", b);
    }).join("");
    $("#s-day-bands").innerHTML = (s.daily.lateBands || []).map(function (b) {
      return bandRow("daily", b);
    }).join("");
    UI.openModal("#settings-modal");
  }

  function readWindows(container) {
    return $all(".repeat-row", container).map(function (row) {
      return {
        id: row.getAttribute("data-id") || S.uid(),
        checkInFrom: $(".w-from", row).value,
        checkInTo: $(".w-to", row).value,
        checkoutTime: $(".w-out", row).value,
        label: $(".w-label", row).value,
      };
    });
  }

  function readBands(container) {
    return $all(".repeat-row", container).map(function (row) {
      return {
        id: row.getAttribute("data-id") || S.uid(),
        start: $(".b-from", row).value,
        end: $(".b-to", row).value,
        mode: $(".b-mode", row).value,
        amount: P.clampMoney($(".b-amt", row).value),
        label: $(".b-label", row).value,
      };
    });
  }

  function saveSettings() {
    state.settings.inn.name = val("#s-name") || "Nhà nghỉ";
    state.settings.inn.address = val("#s-address");
    state.settings.inn.phone = val("#s-phone");
    state.settings.inn.invoicePaper = val("#s-paper");
    state.settings.hourly.firstHour = P.clampMoney(val("#s-first"));
    state.settings.hourly.extraHour = P.clampMoney(val("#s-extra"));
    state.settings.hourly.rounding = val("#s-round");
    state.settings.hourly.defaultDurationHours = Number(val("#s-def-hours")) || 1;
    state.settings.overnight.price = P.clampMoney(val("#s-on-price"));
    state.settings.overnight.extraHour = P.clampMoney(val("#s-on-extra"));
    state.settings.overnight.earlyCheckoutChargeFull = $("#s-on-full").checked;
    state.settings.overnight.fallbackCheckoutTime = val("#s-on-fallback") || "07:00";
    state.settings.overnight.windows = readWindows($("#s-on-windows"));
    state.settings.overnight.lateBands = readBands($("#s-on-bands"));
    state.settings.daily.price = P.clampMoney(val("#s-day-price"));
    state.settings.daily.extraHour = P.clampMoney(val("#s-day-extra"));
    state.settings.daily.earlyCheckoutChargeFull = $("#s-day-full").checked;
    state.settings.daily.fallbackCheckoutTime = val("#s-day-fallback") || "18:00";
    state.settings.daily.windows = readWindows($("#s-day-windows"));
    state.settings.daily.lateBands = readBands($("#s-day-bands"));
    state.settings.conversion.hourlyToOvernightFrom = val("#s-conv-on") || "23:00";
    state.settings.conversion.overnightToHourlyFrom = val("#s-conv-hour") || "06:00";
    if (!persist()) return;
    UI.closeModal("#settings-modal");
    UI.toast("Đã lưu cài đặt. Hóa đơn cũ không bị đổi.", "success");
    refresh();
  }

  function calcQuick() {
    var checkIn = P.fromLocalInput(val("#q-checkin"));
    var checkOut = P.fromLocalInput(val("#q-checkout"));
    var box = $("#quick-result");
    if (!checkIn || !checkOut) {
      box.innerHTML = '<p class="muted">Nhập giờ nhận và giờ trả để xem tiền.</p>';
      return null;
    }
    var result = P.calculateStay({
      settings: state.settings,
      stayType: val("#q-type"),
      checkIn: checkIn,
      checkOut: checkOut,
      extraSurcharge: numVal("#q-surcharge"),
      discount: numVal("#q-discount"),
      paid: numVal("#q-paid"),
    });
    if (!result.ok) {
      box.innerHTML = '<p class="error-text">' + Pay.escapeHtml(result.error) + "</p>";
      return null;
    }
    box.innerHTML =
      '<div class="quick-total">' +
      P.formatVND(result.total) +
      "</div>" +
      "<p>" +
      Pay.escapeHtml(result.stayTypeLabel) +
      " · " +
      Pay.escapeHtml(result.durationLabel) +
      "</p>" +
      "<p>Phòng " +
      P.formatVND(result.roomCharge) +
      " + phụ thu " +
      P.formatVND(result.surcharge) +
      " − giảm " +
      P.formatVND(result.discount) +
      "</p>" +
      "<p>" +
      (result.collect > 0
        ? "Còn thu " + P.formatVND(result.collect)
        : result.refund > 0
          ? "Hoàn " + P.formatVND(result.refund)
          : "Đủ tiền") +
      "</p>" +
      (result.warnings || [])
        .map(function (w) {
          return '<div class="notice">' + Pay.escapeHtml(w) + "</div>";
        })
        .join("");
    return result;
  }

  function showInvoice(record) {
    var html = Pay.invoiceHtml(record, state.settings);
    $("#invoice-view").innerHTML = html;
    $("#print-root").innerHTML = html;
    UI.openModal("#invoice-modal");
  }

  function bind() {
    $all("[data-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-nav");
        var el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        $all(".nav-btn").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
      });
    });

    ["#f-type", "#f-checkin", "#f-expected", "#f-actual", "#f-surcharge", "#f-discount", "#f-paid"].forEach(function (id) {
      $(id).addEventListener("input", function () {
        if (id === "#f-type") fillExpectedFromRule = true;
        if (id === "#f-checkin" || id === "#f-type") applyExpectedFromRule();
        if (id === "#f-expected") fillExpectedFromRule = false;
        calcFromForm();
      });
      $(id).addEventListener("change", function () {
        if (id === "#f-type") fillExpectedFromRule = true;
        if (id === "#f-checkin" || id === "#f-type") applyExpectedFromRule();
        calcFromForm();
      });
    });

    $("#btn-now-in").addEventListener("click", function () {
      setVal("#f-checkin", nowInput());
      applyExpectedFromRule();
      calcFromForm();
    });
    $("#btn-now-out").addEventListener("click", function () {
      setVal("#f-actual", nowInput());
      fillExpectedFromRule = false;
      calcFromForm();
    });
    $("#btn-calc").addEventListener("click", function () {
      var r = calcFromForm();
      if (r && r.ok) UI.toast("Đã tính tiền.", "success");
      else UI.toast((r && r.error) || "Không tính được tiền.", "error");
    });
    $("#btn-reset").addEventListener("click", resetForm);
    $("#btn-checkin").addEventListener("click", function () {
      var f = collectForm();
      f.checkIn = P.fromLocalInput(f.checkIn);
      f.expectedCheckout = P.fromLocalInput(f.expectedCheckout);
      var res = Pay.checkIn(state, f);
      if (!res.ok) {
        UI.toast(res.error, "error");
        return;
      }
      persist();
      UI.toast("Đã nhận phòng " + res.room.name + ".", "success");
      resetForm();
      refresh();
    });
    $("#btn-pay").addEventListener("click", function () {
      var roomId = val("#f-room") || selectedRoomId;
      var stay = roomId ? R.activeStayOfRoom(state, roomId) : null;
      if (!stay) {
        UI.toast("Chọn phòng đang thuê để ghi nhận thanh toán.", "error");
        return;
      }
      var amount = numVal("#f-paid") - P.clampMoney(stay.paid);
      if (amount === 0) {
        stay.paid = numVal("#f-paid");
        stay.discount = numVal("#f-discount");
        stay.extraSurcharge = numVal("#f-surcharge");
        var calc = Pay.recalcStay(stay, state.settings, P.fromLocalInput(val("#f-actual")) || new Date(stay.expectedCheckout));
        if (calc.ok) stay.charge = Pay.snapshotCharge(calc);
      } else {
        Pay.addPayment(state, stay.id, amount < 0 ? 0 : amount);
        stay.paid = numVal("#f-paid");
      }
      persist();
      UI.toast("Đã cập nhật số tiền khách thanh toán. Phòng vẫn đang thuê.", "success");
      refresh();
    });
    $("#btn-checkout-calc").addEventListener("click", function () {
      var roomId = val("#f-room") || selectedRoomId;
      var stay = roomId ? R.activeStayOfRoom(state, roomId) : null;
      if (!stay) {
        UI.toast("Chọn phòng đang có khách để tính tiền trả phòng.", "error");
        return;
      }
      prepareCheckout(stay.id, true);
    });
    $("#btn-checkout").addEventListener("click", function () {
      var roomId = val("#f-room") || selectedRoomId;
      var stay = roomId ? R.activeStayOfRoom(state, roomId) : null;
      if (!stay) {
        UI.toast("Chọn phòng đang thuê để trả phòng.", "error");
        return;
      }
      prepareCheckout(stay.id, !val("#f-actual"));
    });

    $("#co-confirm").addEventListener("click", async function () {
      if (!checkoutStayId) return;
      var ok = await UI.confirmDialog({
        title: "Xác nhận trả phòng",
        message: "Thanh toán và trả phòng? Phòng sẽ chuyển sang trạng thái chờ dọn. Hóa đơn được lưu vào lịch sử và không đổi khi sửa giá sau này.",
        okText: "Xác nhận thanh toán và trả phòng",
      });
      if (!ok) return;
      var res = Pay.checkout(state, checkoutStayId, {
        actualCheckout: P.fromLocalInput(val("#f-actual")) || new Date(),
        paid: numVal("#f-paid"),
        discount: numVal("#f-discount"),
        extraSurcharge: numVal("#f-surcharge"),
      });
      if (!res.ok) {
        UI.toast(res.error, "error");
        return;
      }
      persist();
      UI.closeModal("#checkout-modal");
      showInvoice(res.record);
      UI.toast("Đã trả phòng. Hóa đơn đã lưu.", "success");
      checkoutStayId = null;
      resetForm();
      refresh();
    });
    $("#co-close").addEventListener("click", function () {
      UI.closeModal("#checkout-modal");
    });

    $("#btn-settings").addEventListener("click", openSettings);
    $("#s-save").addEventListener("click", saveSettings);
    $("#s-cancel").addEventListener("click", function () {
      UI.closeModal("#settings-modal");
    });
    $("#s-reset").addEventListener("click", async function () {
      var ok = await UI.confirmDialog({
        title: "Khôi phục mặc định",
        message: "Khôi phục bảng giá và quy định giờ nghỉ về mặc định? Lịch sử hóa đơn cũ không bị xóa.",
      });
      if (!ok) return;
      var inn = state.settings.inn;
      state.settings = P.defaultSettings();
      state.settings.inn = inn;
      persist();
      openSettings();
      UI.toast("Đã khôi phục bảng giá mặc định.", "success");
      refresh();
    });
    $("#s-add-on-w").addEventListener("click", function () {
      $("#s-on-windows").insertAdjacentHTML(
        "beforeend",
        windowRow("overnight", { id: S.uid(), checkInFrom: "20:00", checkInTo: "23:00", checkoutTime: "07:00", label: "" })
      );
    });
    $("#s-add-day-w").addEventListener("click", function () {
      $("#s-day-windows").insertAdjacentHTML(
        "beforeend",
        windowRow("daily", { id: S.uid(), checkInFrom: "06:00", checkInTo: "12:00", checkoutTime: "18:00", label: "" })
      );
    });
    $("#s-add-on-b").addEventListener("click", function () {
      $("#s-on-bands").insertAdjacentHTML(
        "beforeend",
        bandRow("overnight", { id: S.uid(), start: "07:00", end: "12:00", mode: "per_hour", amount: 15000, label: "" })
      );
    });
    $("#s-add-day-b").addEventListener("click", function () {
      $("#s-day-bands").insertAdjacentHTML(
        "beforeend",
        bandRow("daily", { id: S.uid(), start: "18:00", end: "23:00", mode: "per_hour", amount: 15000, label: "" })
      );
    });
    document.body.addEventListener("click", function (e) {
      if (e.target.classList.contains("w-del") || e.target.classList.contains("b-del")) {
        e.target.closest(".repeat-row").remove();
      }
    });

    $("#room-grid").addEventListener("click", function (e) {
      var card = e.target.closest("[data-room]");
      if (!card) return;
      openRoomModal(card.getAttribute("data-room"));
    });
    $("#room-search").addEventListener("input", renderRooms);
    $("#room-filter").addEventListener("change", renderRooms);
    $("#btn-add-room").addEventListener("click", async function () {
      var name = val("#new-room-name").trim();
      var res = R.addRoom(state, name);
      if (!res.ok) {
        UI.toast(res.error, "error");
        return;
      }
      persist();
      setVal("#new-room-name", "");
      UI.toast("Đã thêm phòng " + res.room.name + ".", "success");
      refresh();
    });
    $("#rm-close").addEventListener("click", function () {
      UI.closeModal("#room-modal");
    });
    $("#rm-checkin").addEventListener("click", function () {
      var room = R.getRoom(state, selectedRoomId);
      UI.closeModal("#room-modal");
      resetForm();
      setVal("#f-room", room.id);
      document.getElementById("sec-checkin").scrollIntoView({ behavior: "smooth" });
    });
    $("#rm-calc").addEventListener("click", function () {
      UI.closeModal("#room-modal");
      prepareCheckout(R.activeStayOfRoom(state, selectedRoomId).id, true);
    });
    $("#rm-pay").addEventListener("click", function () {
      var stay = R.activeStayOfRoom(state, selectedRoomId);
      UI.closeModal("#room-modal");
      loadStayToForm(stay);
      UI.toast("Nhập số tiền đã trả rồi bấm Thanh toán.", "info");
    });
    $("#rm-checkout").addEventListener("click", function () {
      UI.closeModal("#room-modal");
      prepareCheckout(R.activeStayOfRoom(state, selectedRoomId).id, true);
    });
    $("#rm-edit").addEventListener("click", function () {
      var stay = R.activeStayOfRoom(state, selectedRoomId);
      UI.closeModal("#room-modal");
      loadStayToForm(stay);
    });
    $("#rm-save-edit").addEventListener("click", function () {
      var stay = selectedRoomId ? R.activeStayOfRoom(state, selectedRoomId) : R.activeStayOfRoom(state, val("#f-room"));
      if (!stay) {
        UI.toast("Không có lượt thuê để sửa.", "error");
        return;
      }
      var res = Pay.updateStay(state, stay.id, collectForm());
      if (!res.ok) {
        UI.toast(res.error, "error");
        return;
      }
      persist();
      UI.toast("Đã cập nhật thông tin thuê phòng.", "success");
      refresh();
    });
    $("#rm-clean").addEventListener("click", function () {
      var res = R.setCleaning(state, selectedRoomId);
      if (!res.ok) {
        UI.toast(res.error, "error");
        return;
      }
      persist();
      UI.closeModal("#room-modal");
      UI.toast("Đã đánh dấu đang dọn dẹp.", "success");
      refresh();
    });
    $("#rm-cleaned").addEventListener("click", function () {
      var res = R.setCleaned(state, selectedRoomId);
      if (!res.ok) {
        UI.toast(res.error, "error");
        return;
      }
      persist();
      UI.closeModal("#room-modal");
      UI.toast("Phòng đã sẵn sàng cho thuê.", "success");
      refresh();
    });
    $("#rm-rename").addEventListener("click", function () {
      var name = val("#rm-new-name").trim();
      var res = R.updateRoom(state, selectedRoomId, { name: name });
      if (!res.ok) {
        UI.toast(res.error, "error");
        return;
      }
      persist();
      UI.toast("Đã đổi tên phòng.", "success");
      openRoomModal(selectedRoomId);
      refresh();
    });
    $("#rm-delete").addEventListener("click", async function () {
      var ok = await UI.confirmDialog({
        title: "Xóa phòng",
        message: "Xóa phòng này khỏi danh sách? Không xóa được nếu đang có khách.",
      });
      if (!ok) return;
      var res = R.removeRoom(state, selectedRoomId);
      if (!res.ok) {
        UI.toast(res.error, "error");
        return;
      }
      persist();
      UI.closeModal("#room-modal");
      UI.toast("Đã xóa phòng.", "success");
      refresh();
    });
    $("#rm-inactive").addEventListener("click", function () {
      var room = R.getRoom(state, selectedRoomId);
      var res;
      if (room.status === "inactive") res = R.updateRoom(state, selectedRoomId, { status: "vacant" });
      else res = R.updateRoom(state, selectedRoomId, { status: "inactive" });
      if (!res.ok) {
        UI.toast(res.error, "error");
        return;
      }
      persist();
      openRoomModal(selectedRoomId);
      refresh();
    });

    ["#q-type", "#q-checkin", "#q-checkout", "#q-surcharge", "#q-discount", "#q-paid"].forEach(function (id) {
      $(id).addEventListener("input", calcQuick);
      $(id).addEventListener("change", calcQuick);
    });
    $("#q-now").addEventListener("click", function () {
      setVal("#q-checkout", nowInput());
      calcQuick();
    });
    $("#q-now-in").addEventListener("click", function () {
      setVal("#q-checkin", nowInput());
      var cin = P.fromLocalInput(val("#q-checkin"));
      var exp = P.expectedCheckout(cin, val("#q-type"), state.settings);
      setVal("#q-checkout", P.dateToLocalInput(exp.expected));
      calcQuick();
    });
    $("#q-recalc").addEventListener("click", function () {
      var r = calcQuick();
      if (r) UI.toast("Đã tính lại.", "success");
    });
    $("#q-to-form").addEventListener("click", function () {
      setVal("#f-type", val("#q-type"));
      setVal("#f-checkin", val("#q-checkin"));
      setVal("#f-expected", val("#q-checkout"));
      setVal("#f-actual", val("#q-checkout"));
      setVal("#f-surcharge", val("#q-surcharge"));
      setVal("#f-discount", val("#q-discount"));
      setVal("#f-paid", val("#q-paid"));
      if (val("#q-room")) setVal("#f-room", val("#q-room"));
      fillExpectedFromRule = false;
      calcFromForm();
      UI.toast("Đã đưa thông tin vào hóa đơn nhận phòng.", "success");
      document.getElementById("sec-checkin").scrollIntoView({ behavior: "smooth" });
    });

    ["#h-guest", "#h-phone", "#h-room", "#h-type", "#h-status", "#h-from", "#h-to"].forEach(function (id) {
      $(id).addEventListener("input", renderHistory);
      $(id).addEventListener("change", renderHistory);
    });
    $("#h-export").addEventListener("click", function () {
      var filtered = Hist.filterHistory(state.history, {
        guest: val("#h-guest"),
        phone: val("#h-phone"),
        room: val("#h-room"),
        stayType: val("#h-type"),
        paymentStatus: val("#h-status"),
        dateFrom: val("#h-from"),
        dateTo: val("#h-to"),
      });
      S.download("lich-su-thue-phong.csv", Hist.toCsv(filtered), "text/csv;charset=utf-8");
      UI.toast("Đã xuất CSV (UTF-8).", "success");
    });
    document.body.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-invoice]");
      if (!btn) return;
      var rec = state.history.find(function (h) {
        return h.id === btn.getAttribute("data-invoice");
      });
      if (rec) showInvoice(rec);
    });
    $("#inv-print").addEventListener("click", function () {
      window.print();
    });
    $("#inv-close").addEventListener("click", function () {
      UI.closeModal("#invoice-modal");
    });

    $("#btn-backup").addEventListener("click", function () {
      S.download("qlnh-backup.json", S.exportJson(), "application/json;charset=utf-8");
      UI.toast("Đã tải file sao lưu JSON.", "success");
    });
    $("#btn-restore").addEventListener("click", function () {
      $("#restore-file").click();
    });
    $("#restore-file").addEventListener("change", async function () {
      var file = this.files && this.files[0];
      this.value = "";
      if (!file) return;
      var ok = await UI.confirmDialog({
        title: "Khôi phục dữ liệu",
        message: "Thay thế toàn bộ dữ liệu hiện tại bằng file sao lưu? Lịch sử hiện tại sẽ bị thay bằng lịch sử trong file (không tự xóa nếu bạn hủy).",
      });
      if (!ok) return;
      var text = await file.text();
      var res = S.importJson(text);
      if (!res.ok) {
        UI.toast(res.error, "error");
        return;
      }
      loadState();
      resetForm();
      refresh();
      UI.toast("Đã khôi phục dữ liệu từ file.", "success");
    });

    $all("[data-close]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        UI.closeModal(btn.getAttribute("data-close"));
      });
    });
    $all(".modal").forEach(function (m) {
      m.addEventListener("click", function (e) {
        if (e.target === m) UI.closeModal(m);
      });
    });

    window.addEventListener("storage", function (e) {
      if (e.key === S.KEY) {
        loadState();
        refresh();
        UI.toast("Dữ liệu vừa được cập nhật từ tab khác.", "info");
      }
    });
  }

  function initQuickRoomSelect() {
    var sel = $("#q-room");
    sel.innerHTML =
      '<option value="">Không chọn</option>' +
      state.rooms
        .map(function (r) {
          return '<option value="' + r.id + '">' + Pay.escapeHtml(r.name) + "</option>";
        })
        .join("");
  }

  function init() {
    loadState();
    bind();
    resetForm();
    setVal("#q-checkin", nowInput());
    var cin = P.fromLocalInput(val("#q-checkin"));
    var exp = P.expectedCheckout(cin, "hourly", state.settings);
    setVal("#q-checkout", P.dateToLocalInput(exp.expected));
    initQuickRoomSelect();
    refresh();
    setInterval(function () {
      renderRooms();
      renderStats();
    }, 60000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
