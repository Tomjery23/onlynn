(function (global) {
  "use strict";

  var moneyFmt = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  });

  function uid() {
    return global.QLNH.storage.uid();
  }

  function defaultSettings() {
    return {
      inn: {
        name: "Nhà nghỉ Hoa Hồng",
        address: "Việt Nam",
        phone: "",
        invoicePaper: "a4",
      },
      hourly: {
        firstHour: 70000,
        extraHour: 15000,
        rounding: "ceil",
        defaultDurationHours: 1,
      },
      overnight: {
        price: 170000,
        extraHour: 15000,
        earlyCheckoutChargeFull: true,
        windows: [
          {
            id: uid(),
            checkInFrom: "20:00",
            checkInTo: "23:00",
            checkoutTime: "07:00",
            label: "Nhận 20:00–23:00, trả 07:00 sáng hôm sau",
          },
          {
            id: uid(),
            checkInFrom: "23:00",
            checkInTo: "06:00",
            checkoutTime: "07:00",
            label: "Nhận từ 23:00 hoặc rạng sáng, trả 07:00",
          },
        ],
        fallbackCheckoutTime: "07:00",
        lateBands: [
          {
            id: uid(),
            start: "07:00",
            end: "12:00",
            mode: "per_hour",
            amount: 15000,
            label: "Phụ thu mỗi giờ đến 12:00",
          },
          {
            id: uid(),
            start: "12:00",
            end: "16:00",
            mode: "fixed",
            amount: 130000,
            label: "Phụ thu khung 12:00–16:00",
          },
        ],
      },
      daily: {
        price: 300000,
        extraHour: 15000,
        earlyCheckoutChargeFull: true,
        windows: [
          {
            id: uid(),
            checkInFrom: "06:00",
            checkInTo: "12:00",
            checkoutTime: "18:00",
            label: "Nhận 06:00–12:00, trả 18:00 cùng ngày",
          },
          {
            id: uid(),
            checkInFrom: "12:00",
            checkInTo: "16:00",
            checkoutTime: "10:00",
            label: "Nhận 12:00–16:00, trả 10:00 sáng hôm sau",
          },
        ],
        fallbackCheckoutTime: "18:00",
        lateBands: [],
      },
      conversion: {
        hourlyToOvernightFrom: "23:00",
        overnightToHourlyFrom: "06:00",
      },
      otherFees: [],
      roundingNote: "Mặc định làm tròn lên theo từng giờ.",
    };
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function asInt(value, fallback) {
    var n = Number(value);
    if (!isFinite(n)) return fallback || 0;
    return Math.round(n);
  }

  function clampMoney(n) {
    n = asInt(n, 0);
    if (n < 0) return 0;
    return n;
  }

  function formatVND(n) {
    return moneyFmt.format(clampMoney(n)).replace(/\s/g, " ");
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function parseHM(hm) {
    if (!hm || typeof hm !== "string") return { h: 0, m: 0 };
    var parts = hm.split(":");
    return { h: asInt(parts[0], 0), m: asInt(parts[1], 0) };
  }

  function toMinutes(hm) {
    var t = parseHM(hm);
    return t.h * 60 + t.m;
  }

  function dateToLocalInput(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    return (
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      "T" +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes())
    );
  }

  function fromLocalInput(value) {
    if (!value) return null;
    var d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  function formatDateTime(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "—";
    return (
      pad(d.getDate()) +
      "/" +
      pad(d.getMonth() + 1) +
      "/" +
      d.getFullYear() +
      " " +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes())
    );
  }

  function formatDuration(ms) {
    if (ms < 0) ms = 0;
    var totalMin = Math.round(ms / 60000);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    if (h === 0) return m + " phút";
    if (m === 0) return h + " giờ";
    return h + " giờ " + m + " phút";
  }

  function minutesOf(d) {
    return d.getHours() * 60 + d.getMinutes();
  }

  function inWindow(mins, fromHM, toHM) {
    var from = toMinutes(fromHM);
    var to = toMinutes(toHM);
    if (from === to) return true;
    if (from < to) return mins >= from && mins < to;
    return mins >= from || mins < to;
  }

  function findWindow(checkIn, windows) {
    var mins = minutesOf(checkIn);
    var list = windows || [];
    for (var i = 0; i < list.length; i++) {
      if (inWindow(mins, list[i].checkInFrom, list[i].checkInTo)) return list[i];
    }
    return null;
  }

  function applyCheckoutTime(checkIn, checkoutHM) {
    var t = parseHM(checkoutHM);
    var out = new Date(checkIn.getTime());
    out.setHours(t.h, t.m, 0, 0);
    while (out.getTime() <= checkIn.getTime()) {
      out.setDate(out.getDate() + 1);
    }
    return out;
  }

  function stayTypeLabel(type) {
    if (type === "overnight") return "Nghỉ qua đêm";
    if (type === "daily") return "Nghỉ ngày";
    return "Nghỉ giờ";
  }

  function conversionNotice(checkIn, stayType, settings) {
    var conv = settings.conversion || {};
    var mins = minutesOf(checkIn);
    var overnightFrom = conv.hourlyToOvernightFrom || "23:00";
    var hourlyFrom = conv.overnightToHourlyFrom || "06:00";
    var notes = [];
    if (stayType === "hourly" && inWindow(mins, overnightFrom, hourlyFrom)) {
      notes.push(
        "Giờ nhận phòng từ " +
          overnightFrom +
          " trở đi thường chuyển sang gói nghỉ qua đêm. Hãy kiểm tra loại hình thuê."
      );
    }
    if (stayType === "overnight" && inWindow(mins, hourlyFrom, overnightFrom) && minutesOf(checkIn) >= toMinutes(hourlyFrom) && minutesOf(checkIn) < toMinutes("20:00")) {
      notes.push(
        "Sau " +
          hourlyFrom +
          " sáng, nhà nghỉ thường tính theo nghỉ giờ. Hãy xác nhận lại loại hình thuê."
      );
    }
    return notes;
  }

  function expectedCheckout(checkIn, stayType, settings) {
    var warnings = conversionNotice(checkIn, stayType, settings);
    var standard;
    var matched = true;
    var windowUsed = null;

    if (stayType === "hourly") {
      var hours = Number(settings.hourly.defaultDurationHours) || 1;
      standard = new Date(checkIn.getTime() + hours * 3600000);
      return { standard: standard, expected: standard, matched: true, window: null, warnings: warnings };
    }

    var pack = stayType === "overnight" ? settings.overnight : settings.daily;
    windowUsed = findWindow(checkIn, pack.windows);
    if (windowUsed) {
      standard = applyCheckoutTime(checkIn, windowUsed.checkoutTime);
    } else {
      matched = false;
      standard = applyCheckoutTime(checkIn, pack.fallbackCheckoutTime || "12:00");
      warnings.push(
        "Giờ nhận phòng không nằm trong khung đã thiết lập của " +
          stayTypeLabel(stayType) +
          ". Đã áp dụng giờ trả phòng thay thế " +
          (pack.fallbackCheckoutTime || "12:00") +
          "."
      );
    }
    return { standard: standard, expected: standard, matched: matched, window: windowUsed, warnings: warnings };
  }

  function billedHoursFromMinutes(minutes, rounding) {
    if (minutes <= 0) return 0;
    var hours = minutes / 60;
    if (rounding === "floor") return Math.max(1, Math.floor(hours));
    if (rounding === "nearest") return Math.max(1, Math.round(hours) || 1);
    if (rounding === "none") return hours;
    return Math.max(1, Math.ceil(hours));
  }

  function hourlyCharge(minutes, settings) {
    var rounding = settings.hourly.rounding || "ceil";
    var first = clampMoney(settings.hourly.firstHour);
    var extra = clampMoney(settings.hourly.extraHour);
    if (minutes <= 0) {
      return { billedHours: 1, roomCharge: first, details: [{ label: "Giờ đầu tiên (tối thiểu)", amount: first }] };
    }
    if (rounding === "none") {
      var extraMin = Math.max(0, minutes - 60);
      var extraAmt = Math.round((extraMin * extra) / 60);
      var details = [{ label: "Giờ đầu tiên", amount: first }];
      if (extraAmt) details.push({ label: "Giờ tiếp theo (" + extraMin + " phút)", amount: extraAmt });
      return { billedHours: minutes / 60, roomCharge: first + extraAmt, details: details };
    }
    var billed = billedHoursFromMinutes(minutes, rounding);
    var room = billed <= 1 ? first : first + (billed - 1) * extra;
    var details2 = [{ label: "Giờ đầu tiên", amount: first }];
    if (billed > 1) {
      details2.push({ label: "Giờ tiếp theo × " + (billed - 1), amount: (billed - 1) * extra });
    }
    return { billedHours: billed, roomCharge: room, details: details2 };
  }

  function bandCovers(date, band) {
    return inWindow(minutesOf(date), band.start, band.end);
  }

  function lateFee(standard, actual, extraHour, bands, rounding) {
    var details = [];
    var amount = 0;
    if (!(standard instanceof Date) || !(actual instanceof Date)) return { amount: 0, details: details };
    if (actual.getTime() <= standard.getTime()) return { amount: 0, details: details };

    var list = (bands || []).slice();
    var usedFixed = {};
    var cursor = new Date(standard.getTime());
    var step = 3600000;
    var hourChunks = 0;
    var leftoverMin = 0;

    while (cursor.getTime() < actual.getTime()) {
      var next = new Date(cursor.getTime() + step);
      var chunkEnd = next.getTime() > actual.getTime() ? actual : next;
      var mid = new Date(cursor.getTime() + Math.max(1, (chunkEnd.getTime() - cursor.getTime()) / 2));
      var matchedBand = null;
      for (var i = 0; i < list.length; i++) {
        if (bandCovers(mid, list[i])) {
          matchedBand = list[i];
          break;
        }
      }
      if (matchedBand && matchedBand.mode === "fixed") {
        if (!usedFixed[matchedBand.id]) {
          usedFixed[matchedBand.id] = true;
          var fee = clampMoney(matchedBand.amount);
          amount += fee;
          details.push({ label: matchedBand.label || "Phụ thu khung giờ", amount: fee });
        }
      } else {
        var mins = (chunkEnd.getTime() - cursor.getTime()) / 60000;
        if (matchedBand && matchedBand.mode === "per_hour") {
          leftoverMin += mins;
          hourChunks += mins;
          var last = details[details.length - 1];
          var label = matchedBand.label || "Phụ thu theo giờ";
          var rate = clampMoney(matchedBand.amount);
          if (last && last._rate === rate && last._kind === "hour-band") {
            last._mins += mins;
          } else {
            details.push({ label: label, amount: 0, _rate: rate, _kind: "hour-band", _mins: mins });
          }
        } else {
          leftoverMin += mins;
          hourChunks += mins;
          var last2 = details[details.length - 1];
          if (last2 && last2._kind === "hour-default") {
            last2._mins += mins;
          } else {
            details.push({
              label: "Phụ thu mỗi giờ sau giờ tiêu chuẩn",
              amount: 0,
              _rate: clampMoney(extraHour),
              _kind: "hour-default",
              _mins: mins,
            });
          }
        }
      }
      cursor = next;
    }

    details.forEach(function (d) {
      if (d._mins != null) {
        var hours;
        if (rounding === "none") {
          d.amount = Math.round((d._mins * d._rate) / 60);
          d.label += " (" + Math.round(d._mins) + " phút)";
        } else {
          hours = billedHoursFromMinutes(d._mins, rounding || "ceil");
          d.amount = hours * d._rate;
          d.label += " × " + hours + " giờ";
        }
        amount += d.amount;
        delete d._mins;
        delete d._rate;
        delete d._kind;
      }
    });

    return { amount: amount, details: details.filter(function (d) { return d.amount !== 0; }) };
  }

  function calculateStay(input) {
    var settings = input.settings;
    var stayType = input.stayType || "hourly";
    var checkIn = input.checkIn instanceof Date ? input.checkIn : fromLocalInput(input.checkIn);
    var checkOut = input.checkOut instanceof Date ? input.checkOut : fromLocalInput(input.checkOut);
    var warnings = [];

    if (!checkIn || isNaN(checkIn.getTime())) {
      return { ok: false, error: "Giờ nhận phòng không hợp lệ." };
    }
    if (!checkOut || isNaN(checkOut.getTime())) {
      return { ok: false, error: "Giờ trả phòng không hợp lệ." };
    }
    if (checkOut.getTime() <= checkIn.getTime()) {
      return { ok: false, error: "Giờ trả phòng phải sau giờ nhận phòng (đã tính cả ngày)." };
    }

    var exp = expectedCheckout(checkIn, stayType, settings);
    warnings = warnings.concat(exp.warnings || []);
    var standard = exp.standard;
    var durationMs = checkOut.getTime() - checkIn.getTime();
    var minutes = durationMs / 60000;
    var roomCharge = 0;
    var billedHours = 0;
    var roomDetails = [];
    var autoSurcharge = 0;
    var surchargeDetails = [];

    if (stayType === "hourly") {
      var hourRes = hourlyCharge(minutes, settings);
      roomCharge = hourRes.roomCharge;
      billedHours = hourRes.billedHours;
      roomDetails = hourRes.details;
    } else if (stayType === "overnight") {
      roomCharge = clampMoney(settings.overnight.price);
      billedHours = billedHoursFromMinutes(minutes, settings.hourly.rounding || "ceil");
      roomDetails = [{ label: "Gói nghỉ qua đêm", amount: roomCharge }];
      if (checkOut.getTime() < standard.getTime()) {
        if (!settings.overnight.earlyCheckoutChargeFull) {
          var early = hourlyCharge(minutes, settings);
          roomCharge = early.roomCharge;
          roomDetails = early.details;
          warnings.push("Trả sớm: tính theo giờ vì đã tắt tính đủ gói qua đêm.");
        } else {
          warnings.push("Trả phòng sớm hơn giờ tiêu chuẩn: vẫn tính đủ giá gói nghỉ qua đêm.");
        }
      } else if (checkOut.getTime() > standard.getTime()) {
        var lateO = lateFee(
          standard,
          checkOut,
          settings.overnight.extraHour,
          settings.overnight.lateBands,
          settings.hourly.rounding
        );
        autoSurcharge = lateO.amount;
        surchargeDetails = lateO.details;
      }
    } else {
      roomCharge = clampMoney(settings.daily.price);
      billedHours = billedHoursFromMinutes(minutes, settings.hourly.rounding || "ceil");
      roomDetails = [{ label: "Gói nghỉ ngày", amount: roomCharge }];
      if (checkOut.getTime() < standard.getTime()) {
        if (!settings.daily.earlyCheckoutChargeFull) {
          var earlyD = hourlyCharge(minutes, settings);
          roomCharge = earlyD.roomCharge;
          roomDetails = earlyD.details;
          warnings.push("Trả sớm: tính theo giờ vì đã tắt tính đủ gói nghỉ ngày.");
        } else {
          warnings.push("Trả phòng sớm hơn giờ tiêu chuẩn: vẫn tính đủ giá gói nghỉ ngày.");
        }
      } else if (checkOut.getTime() > standard.getTime()) {
        var bands = settings.daily.lateBands && settings.daily.lateBands.length
          ? settings.daily.lateBands
          : [
              {
                id: "daily-default-late",
                start: "00:00",
                end: "00:00",
                mode: "per_hour",
                amount: settings.daily.extraHour,
                label: "Phụ thu trả muộn",
              },
            ];
        var lateD = lateFee(standard, checkOut, settings.daily.extraHour, bands, settings.hourly.rounding);
        autoSurcharge = lateD.amount;
        surchargeDetails = lateD.details;
      }
    }

    var extraSurcharge = clampMoney(input.extraSurcharge);
    var discount = clampMoney(input.discount);
    var paid = clampMoney(input.paid);
    var surcharge = autoSurcharge + extraSurcharge;
    var subtotal = roomCharge + surcharge;
    if (discount > subtotal) {
      warnings.push("Giảm giá lớn hơn tổng tiền phòng và phụ thu nên đã giới hạn bằng tổng đó.");
      discount = subtotal;
    }
    var total = subtotal - discount;
    if (total < 0) total = 0;
    var due = total - paid;
    var refund = due < 0 ? -due : 0;
    var collect = due > 0 ? due : 0;

    return {
      ok: true,
      stayType: stayType,
      stayTypeLabel: stayTypeLabel(stayType),
      checkIn: checkIn,
      checkOut: checkOut,
      standardCheckout: standard,
      matchedWindow: exp.matched,
      window: exp.window,
      durationMs: durationMs,
      durationLabel: formatDuration(durationMs),
      billedHours: billedHours,
      roomCharge: roomCharge,
      autoSurcharge: autoSurcharge,
      extraSurcharge: extraSurcharge,
      surcharge: surcharge,
      discount: discount,
      total: total,
      paid: paid,
      due: due,
      collect: collect,
      refund: refund,
      roomDetails: roomDetails,
      surchargeDetails: surchargeDetails,
      warnings: warnings,
    };
  }

  function totalsFromResult(result) {
    if (!result || !result.ok) {
      return { roomCharge: 0, surcharge: 0, discount: 0, total: 0, paid: 0, collect: 0, refund: 0 };
    }
    return {
      roomCharge: result.roomCharge,
      surcharge: result.surcharge,
      discount: result.discount,
      total: result.total,
      paid: result.paid,
      collect: result.collect,
      refund: result.refund,
    };
  }

  global.QLNH = global.QLNH || {};
  global.QLNH.pricing = {
    defaultSettings: defaultSettings,
    clone: clone,
    asInt: asInt,
    clampMoney: clampMoney,
    formatVND: formatVND,
    dateToLocalInput: dateToLocalInput,
    fromLocalInput: fromLocalInput,
    formatDateTime: formatDateTime,
    formatDuration: formatDuration,
    stayTypeLabel: stayTypeLabel,
    expectedCheckout: expectedCheckout,
    calculateStay: calculateStay,
    totalsFromResult: totalsFromResult,
    applyCheckoutTime: applyCheckoutTime,
    findWindow: findWindow,
  };
})(window);
