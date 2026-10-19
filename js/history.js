(function (global) {
  "use strict";

  var P = global.QLNH.pricing;

  function startOfDay(d) {
    var x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function endOfDay(d) {
    var x = new Date(d.getTime());
    x.setHours(23, 59, 59, 999);
    return x;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function filterHistory(list, q) {
    q = q || {};
    return (list || []).filter(function (h) {
      if (q.guest) {
        if (String(h.guestName || "").toLowerCase().indexOf(q.guest.toLowerCase()) === -1) return false;
      }
      if (q.phone) {
        if (String(h.phone || "").indexOf(q.phone) === -1) return false;
      }
      if (q.room) {
        if (String(h.roomName || "").toLowerCase().indexOf(q.room.toLowerCase()) === -1) return false;
      }
      if (q.stayType && q.stayType !== "all" && h.stayType !== q.stayType) return false;
      if (q.paymentStatus && q.paymentStatus !== "all" && h.paymentStatus !== q.paymentStatus) return false;
      if (q.dateFrom) {
        var from = startOfDay(new Date(q.dateFrom));
        if (new Date(h.actualCheckout).getTime() < from.getTime()) return false;
      }
      if (q.dateTo) {
        var to = endOfDay(new Date(q.dateTo));
        if (new Date(h.actualCheckout).getTime() > to.getTime()) return false;
      }
      return true;
    });
  }

  function stats(state) {
    var today = new Date();
    var history = state.history || [];
    var todayRecords = history.filter(function (h) {
      return sameDay(new Date(h.paidAt || h.actualCheckout), today);
    });
    var revenueToday = 0;
    todayRecords.forEach(function (h) {
      revenueToday += Math.min(P.clampMoney(h.paid), P.clampMoney(h.total));
    });
    var unpaid = 0;
    history.forEach(function (h) {
      unpaid += P.clampMoney(h.collect);
    });
    (state.stays || []).forEach(function (s) {
      var charge = s.charge || {};
      var total = P.clampMoney(charge.total);
      var paid = P.clampMoney(s.paid != null ? s.paid : charge.paid);
      unpaid += Math.max(0, total - paid);
    });
    var byDayMap = {};
    history.forEach(function (h) {
      var d = new Date(h.paidAt || h.actualCheckout);
      var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      if (!byDayMap[key]) byDayMap[key] = { date: key, revenue: 0, stays: 0 };
      byDayMap[key].revenue += Math.min(P.clampMoney(h.paid), P.clampMoney(h.total));
      byDayMap[key].stays += 1;
    });
    var byDay = Object.keys(byDayMap)
      .sort()
      .reverse()
      .map(function (k) {
        return byDayMap[k];
      });
    var roomCounts = global.QLNH.rooms.counts(state);
    return {
      revenueToday: revenueToday,
      staysToday: todayRecords.length,
      occupied: roomCounts.occupied,
      vacant: roomCounts.vacant,
      unpaid: unpaid,
      byDay: byDay,
    };
  }

  function csvEscape(v) {
    var s = String(v == null ? "" : v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(list) {
    var headers = [
      "Mã hóa đơn",
      "Số phòng",
      "Tên khách",
      "Điện thoại",
      "Loại hình",
      "Nhận phòng",
      "Trả phòng",
      "Thời gian thuê",
      "Tiền phòng",
      "Phụ thu",
      "Giảm giá",
      "Tổng hóa đơn",
      "Đã thanh toán",
      "Còn thiếu",
      "Tiền hoàn",
      "Trạng thái",
    ];
    var lines = [headers.join(",")];
    (list || []).forEach(function (h) {
      lines.push(
        [
          h.invoiceCode,
          h.roomName,
          h.guestName,
          h.phone,
          h.stayTypeLabel,
          P.formatDateTime(new Date(h.checkIn)),
          P.formatDateTime(new Date(h.actualCheckout)),
          h.durationLabel,
          h.roomCharge,
          h.surcharge,
          h.discount,
          h.total,
          h.paid,
          h.collect,
          h.refund,
          global.QLNH.payments.paymentStatusLabel(h.paymentStatus),
        ]
          .map(csvEscape)
          .join(",")
      );
    });
    return "\uFEFF" + lines.join("\r\n");
  }

  global.QLNH = global.QLNH || {};
  global.QLNH.history = {
    filterHistory: filterHistory,
    stats: stats,
    toCsv: toCsv,
  };
})(window);
