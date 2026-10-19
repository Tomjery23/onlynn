(function (global) {
  "use strict";

  var P = global.QLNH.pricing;
  var R = global.QLNH.rooms;
  var S = global.QLNH.storage;

  function invoiceCode(date) {
    var d = date || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    var rand = S.uid().replace(/-/g, "").slice(0, 6).toUpperCase();
    return "HD-" + y + m + day + "-" + rand;
  }

  function snapshotCharge(result) {
    return {
      stayType: result.stayType,
      stayTypeLabel: result.stayTypeLabel,
      checkIn: result.checkIn.toISOString(),
      checkOut: result.checkOut.toISOString(),
      standardCheckout: result.standardCheckout.toISOString(),
      durationMs: result.durationMs,
      durationLabel: result.durationLabel,
      billedHours: result.billedHours,
      roomCharge: result.roomCharge,
      autoSurcharge: result.autoSurcharge,
      extraSurcharge: result.extraSurcharge,
      surcharge: result.surcharge,
      discount: result.discount,
      total: result.total,
      paid: result.paid,
      collect: result.collect,
      refund: result.refund,
      roomDetails: result.roomDetails,
      surchargeDetails: result.surchargeDetails,
      warnings: result.warnings,
    };
  }

  function buildStay(form, result, room) {
    return {
      id: S.uid(),
      roomId: room.id,
      roomName: room.name,
      guestName: String(form.guestName || "").trim(),
      phone: String(form.phone || "").trim(),
      notes: String(form.notes || "").trim(),
      stayType: result.stayType,
      checkIn: result.checkIn.toISOString(),
      expectedCheckout: (form.expectedCheckout || result.checkOut).toISOString
        ? (form.expectedCheckout || result.checkOut).toISOString()
        : result.checkOut.toISOString(),
      actualCheckout: null,
      standardCheckout: result.standardCheckout.toISOString(),
      extraSurcharge: result.extraSurcharge,
      discount: result.discount,
      paid: result.paid,
      charge: snapshotCharge(result),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function recalcStay(stay, settings, actualCheckout, patch) {
    patch = patch || {};
    var checkOut = actualCheckout || P.fromLocalInput(stay.expectedCheckout) || new Date(stay.expectedCheckout);
    var result = P.calculateStay({
      settings: settings,
      stayType: patch.stayType || stay.stayType,
      checkIn: new Date(stay.checkIn),
      checkOut: checkOut,
      extraSurcharge: patch.extraSurcharge != null ? patch.extraSurcharge : stay.extraSurcharge,
      discount: patch.discount != null ? patch.discount : stay.discount,
      paid: patch.paid != null ? patch.paid : stay.paid,
    });
    return result;
  }

  function checkIn(state, form) {
    var room = form.roomId ? R.getRoom(state, form.roomId) : R.getRoomByName(state, form.roomName);
    if (!room) return { ok: false, error: "Chọn phòng hợp lệ." };
    var gate = R.canCheckIn(state, room.id);
    if (!gate.ok) return gate;
    if (!String(form.guestName || "").trim()) return { ok: false, error: "Nhập tên khách hàng." };

    var checkInAt = form.checkIn instanceof Date ? form.checkIn : P.fromLocalInput(form.checkIn);
    var expected = form.expectedCheckout instanceof Date ? form.expectedCheckout : P.fromLocalInput(form.expectedCheckout);
    if (!expected) {
      expected = P.expectedCheckout(checkInAt, form.stayType, state.settings).expected;
    }
    var result = P.calculateStay({
      settings: state.settings,
      stayType: form.stayType,
      checkIn: checkInAt,
      checkOut: expected,
      extraSurcharge: form.extraSurcharge,
      discount: form.discount,
      paid: form.paid,
    });
    if (!result.ok) return result;

    var stay = buildStay(
      {
        guestName: form.guestName,
        phone: form.phone,
        notes: form.notes,
        expectedCheckout: expected,
      },
      result,
      room
    );
    stay.expectedCheckout = expected.toISOString();
    state.stays.push(stay);
    room.status = "occupied";
    room.stayId = stay.id;
    return { ok: true, stay: stay, room: room, result: result };
  }

  function updateStay(state, stayId, patch) {
    var stay = R.getStay(state, stayId);
    if (!stay) return { ok: false, error: "Không tìm thấy lượt thuê." };
    ["guestName", "phone", "notes", "stayType"].forEach(function (k) {
      if (patch[k] != null) stay[k] = patch[k];
    });
    if (patch.checkIn) stay.checkIn = (patch.checkIn instanceof Date ? patch.checkIn : P.fromLocalInput(patch.checkIn)).toISOString();
    if (patch.expectedCheckout) {
      stay.expectedCheckout = (
        patch.expectedCheckout instanceof Date ? patch.expectedCheckout : P.fromLocalInput(patch.expectedCheckout)
      ).toISOString();
    }
    if (patch.extraSurcharge != null) stay.extraSurcharge = P.clampMoney(patch.extraSurcharge);
    if (patch.discount != null) stay.discount = P.clampMoney(patch.discount);
    if (patch.paid != null) stay.paid = P.clampMoney(patch.paid);
    var calc = recalcStay(stay, state.settings, P.fromLocalInput(stay.expectedCheckout) || new Date(stay.expectedCheckout));
    if (!calc.ok) return calc;
    stay.charge = snapshotCharge(calc);
    stay.standardCheckout = calc.standardCheckout.toISOString();
    stay.updatedAt = new Date().toISOString();
    return { ok: true, stay: stay, result: calc };
  }

  function addPayment(state, stayId, amount) {
    var stay = R.getStay(state, stayId);
    if (!stay) return { ok: false, error: "Không tìm thấy lượt thuê." };
    stay.paid = P.clampMoney(stay.paid) + P.clampMoney(amount);
    var calc = recalcStay(stay, state.settings, new Date(stay.expectedCheckout), { paid: stay.paid });
    if (calc.ok) stay.charge = snapshotCharge(calc);
    stay.updatedAt = new Date().toISOString();
    return { ok: true, stay: stay, result: calc };
  }

  function checkout(state, stayId, options) {
    options = options || {};
    var stay = R.getStay(state, stayId);
    if (!stay) return { ok: false, error: "Không tìm thấy lượt thuê đang hoạt động." };
    var room = R.getRoom(state, stay.roomId);
    var actual = options.actualCheckout instanceof Date ? options.actualCheckout : P.fromLocalInput(options.actualCheckout);
    if (!actual) actual = new Date();
    if (options.paid != null) stay.paid = P.clampMoney(options.paid);
    if (options.discount != null) stay.discount = P.clampMoney(options.discount);
    if (options.extraSurcharge != null) stay.extraSurcharge = P.clampMoney(options.extraSurcharge);

    var result = recalcStay(stay, state.settings, actual, {
      extraSurcharge: stay.extraSurcharge,
      discount: stay.discount,
      paid: stay.paid,
    });
    if (!result.ok) return result;

    stay.actualCheckout = actual.toISOString();
    stay.charge = snapshotCharge(result);

    var record = {
      id: S.uid(),
      invoiceCode: invoiceCode(actual),
      stayId: stay.id,
      roomId: stay.roomId,
      roomName: stay.roomName,
      guestName: stay.guestName,
      phone: stay.phone,
      notes: stay.notes,
      stayType: stay.stayType,
      stayTypeLabel: result.stayTypeLabel,
      checkIn: stay.checkIn,
      expectedCheckout: stay.expectedCheckout,
      actualCheckout: stay.actualCheckout,
      standardCheckout: stay.standardCheckout,
      durationMs: result.durationMs,
      durationLabel: result.durationLabel,
      roomCharge: result.roomCharge,
      autoSurcharge: result.autoSurcharge,
      extraSurcharge: result.extraSurcharge,
      surcharge: result.surcharge,
      discount: result.discount,
      total: result.total,
      paid: result.paid,
      collect: result.collect,
      refund: result.refund,
      paymentStatus: result.collect > 0 ? "unpaid" : result.refund > 0 ? "overpaid" : "paid",
      roomDetails: result.roomDetails,
      surchargeDetails: result.surchargeDetails,
      warnings: result.warnings,
      paidAt: new Date().toISOString(),
      innSnapshot: {
        name: state.settings.inn.name,
        address: state.settings.inn.address,
        phone: state.settings.inn.phone,
      },
    };

    state.history.unshift(record);
    state.stays = state.stays.filter(function (s) {
      return s.id !== stay.id;
    });
    if (room) {
      room.stayId = null;
      room.status = "cleaning";
    }
    return { ok: true, record: record, room: room, result: result };
  }

  function paymentStatusLabel(status) {
    if (status === "paid") return "Đã thanh toán";
    if (status === "unpaid") return "Còn thiếu";
    if (status === "overpaid") return "Thừa tiền / hoàn lại";
    return status || "—";
  }

  function invoiceHtml(record, settings) {
    var inn = record.innSnapshot || (settings && settings.inn) || {};
    var paper = (settings && settings.inn && settings.inn.invoicePaper) || "a4";
    var dueLabel = record.collect > 0
      ? "Còn thiếu: " + P.formatVND(record.collect)
      : record.refund > 0
        ? "Tiền thừa trả khách: " + P.formatVND(record.refund)
        : "Đã thanh toán đủ";
    var rows = (record.roomDetails || [])
      .concat(record.surchargeDetails || [])
      .map(function (d) {
        return "<tr><td>" + escapeHtml(d.label) + "</td><td class='right'>" + P.formatVND(d.amount) + "</td></tr>";
      })
      .join("");
    if (record.extraSurcharge) {
      rows += "<tr><td>Phụ thu khác</td><td class='right'>" + P.formatVND(record.extraSurcharge) + "</td></tr>";
    }
    return (
      '<div class="invoice-sheet paper-' +
      paper +
      '">' +
      "<header><h1>" +
      escapeHtml(inn.name || "Nhà nghỉ") +
      "</h1>" +
      "<p>" +
      escapeHtml(inn.address || "") +
      (inn.phone ? " · ĐT: " + escapeHtml(inn.phone) : "") +
      "</p>" +
      "<h2>HÓA ĐƠN THANH TOÁN</h2></header>" +
      "<p><strong>Mã hóa đơn:</strong> " +
      escapeHtml(record.invoiceCode) +
      "</p>" +
      "<p><strong>Phòng:</strong> " +
      escapeHtml(record.roomName) +
      " · <strong>Khách:</strong> " +
      escapeHtml(record.guestName) +
      (record.phone ? " · " + escapeHtml(record.phone) : "") +
      "</p>" +
      "<p><strong>Loại hình:</strong> " +
      escapeHtml(record.stayTypeLabel) +
      "</p>" +
      "<p><strong>Nhận phòng:</strong> " +
      escapeHtml(P.formatDateTime(new Date(record.checkIn))) +
      "<br><strong>Trả phòng:</strong> " +
      escapeHtml(P.formatDateTime(new Date(record.actualCheckout))) +
      "<br><strong>Thời gian lưu trú:</strong> " +
      escapeHtml(record.durationLabel) +
      "</p>" +
      "<table><thead><tr><th>Khoản mục</th><th class='right'>Số tiền</th></tr></thead><tbody>" +
      rows +
      "<tr><td>Giảm giá</td><td class='right'>- " +
      P.formatVND(record.discount) +
      "</td></tr>" +
      "</tbody></table>" +
      "<p class='total'><strong>Tổng tiền: " +
      P.formatVND(record.total) +
      "</strong></p>" +
      "<p>Đã thanh toán: " +
      P.formatVND(record.paid) +
      "<br>" +
      dueLabel +
      "</p>" +
      "<p>Thời gian thanh toán: " +
      escapeHtml(P.formatDateTime(new Date(record.paidAt))) +
      "</p>" +
      (record.notes ? "<p>Ghi chú: " + escapeHtml(record.notes) + "</p>" : "") +
      "<p class='thanks'>Xin cảm ơn quý khách!</p>" +
      "</div>"
    );
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  global.QLNH = global.QLNH || {};
  global.QLNH.payments = {
    invoiceCode: invoiceCode,
    snapshotCharge: snapshotCharge,
    checkIn: checkIn,
    updateStay: updateStay,
    addPayment: addPayment,
    checkout: checkout,
    recalcStay: recalcStay,
    paymentStatusLabel: paymentStatusLabel,
    invoiceHtml: invoiceHtml,
    escapeHtml: escapeHtml,
  };
})(window);
