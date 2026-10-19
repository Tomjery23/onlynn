/**
 * Kiểm thử công thức tính tiền — chạy bằng: node js/pricing.test.js
 * File này không cần để website hoạt động.
 */
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var window = {
  crypto: { randomUUID: function () { return "id-" + Math.random().toString(16).slice(2); } },
};
window.window = window;
window.QLNH = {};
var ctx = {
  window: window,
  Date: Date,
  Math: Math,
  Number: Number,
  String: String,
  JSON: JSON,
  isFinite: isFinite,
  Intl: Intl,
  parseInt: parseInt,
  console: console,
};
ctx.global = window;
vm.createContext(ctx);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), ctx);
}
load("storage.js");
load("pricing.js");

var P = ctx.window.QLNH.pricing;
var settings = P.defaultSettings();
var failed = 0;

function at(y, m, d, h, min) {
  return new Date(y, m - 1, d, h, min, 0, 0);
}
function assert(name, cond, extra) {
  if (cond) console.log("OK  " + name);
  else {
    failed++;
    console.log("FAIL " + name + (extra ? " :: " + extra : ""));
  }
}

function fmt(d) {
  return P.formatDateTime(d);
}

var s1b = P.expectedCheckout(at(2026, 10, 19, 20, 30), "overnight", settings);
assert("Nhận 19/10 20:30 qua đêm trả 20/10 07:00", s1b.standard.getFullYear() === 2026 && s1b.standard.getMonth() === 9 && s1b.standard.getDate() === 20 && s1b.standard.getHours() === 7 && s1b.standard.getMinutes() === 0, fmt(s1b.standard));

var s2 = P.expectedCheckout(at(2026, 10, 19, 23, 30), "overnight", settings);
assert("Nhận 23:30 qua đêm trả 07:00 hôm sau", s2.standard.getDate() === 20 && s2.standard.getHours() === 7, fmt(s2.standard));

var s3 = P.expectedCheckout(at(2026, 10, 19, 8, 0), "daily", settings);
assert("Nghỉ ngày 08:00 trả 18:00 cùng ngày", s3.standard.getDate() === 19 && s3.standard.getHours() === 18, fmt(s3.standard));

var s4 = P.expectedCheckout(at(2026, 10, 19, 13, 0), "daily", settings);
assert("Nghỉ ngày 13:00 trả 10:00 hôm sau", s4.standard.getDate() === 20 && s4.standard.getHours() === 10, fmt(s4.standard));

var early = P.calculateStay({
  settings: settings,
  stayType: "overnight",
  checkIn: at(2026, 10, 19, 20, 30),
  checkOut: at(2026, 10, 20, 5, 0),
  extraSurcharge: 0,
  discount: 0,
  paid: 0,
});
assert("Trả sớm qua đêm vẫn 170000", early.ok && early.roomCharge === 170000 && early.autoSurcharge === 0, JSON.stringify({ ok: early.ok, room: early.roomCharge, extra: early.autoSurcharge }));

var late = P.calculateStay({
  settings: settings,
  stayType: "overnight",
  checkIn: at(2026, 10, 19, 20, 30),
  checkOut: at(2026, 10, 20, 9, 0),
  extraSurcharge: 0,
  discount: 0,
  paid: 0,
});
assert("Trả muộn 2 giờ sau 07:00 phụ thu 30000", late.ok && late.roomCharge === 170000 && late.autoSurcharge === 30000, JSON.stringify({ room: late.roomCharge, extra: late.autoSurcharge, details: late.surchargeDetails }));

var hour = P.calculateStay({
  settings: settings,
  stayType: "hourly",
  checkIn: at(2026, 10, 19, 10, 0),
  checkOut: at(2026, 10, 19, 12, 10),
  extraSurcharge: 0,
  discount: 0,
  paid: 0,
});
assert("Nghỉ giờ 2h10 làm tròn 3 giờ = 100000", hour.ok && hour.roomCharge === 100000, JSON.stringify({ room: hour.roomCharge, hours: hour.billedHours }));

var part = P.calculateStay({
  settings: settings,
  stayType: "hourly",
  checkIn: at(2026, 10, 19, 10, 0),
  checkOut: at(2026, 10, 19, 11, 0),
  extraSurcharge: 0,
  discount: 0,
  paid: 40000,
});
assert("Trả trước một phần: còn thu 30000", part.ok && part.collect === 30000 && part.refund === 0, JSON.stringify({ total: part.total, collect: part.collect }));

var over = P.calculateStay({
  settings: settings,
  stayType: "hourly",
  checkIn: at(2026, 10, 19, 10, 0),
  checkOut: at(2026, 10, 19, 11, 0),
  extraSurcharge: 0,
  discount: 0,
  paid: 100000,
});
assert("Trả thừa: hoàn 30000", over.ok && over.refund === 30000 && over.collect === 0, JSON.stringify({ refund: over.refund, total: over.total }));

var month = P.expectedCheckout(at(2026, 10, 31, 20, 30), "overnight", settings);
assert("Cuối tháng 31/10 20:30 → 01/11 07:00", month.standard.getMonth() === 10 && month.standard.getDate() === 1 && month.standard.getHours() === 7, fmt(month.standard));

var year = P.expectedCheckout(at(2026, 12, 31, 23, 30), "overnight", settings);
assert("Giao thừa 31/12 23:30 → 01/01/2027 07:00", year.standard.getFullYear() === 2027 && year.standard.getDate() === 1 && year.standard.getHours() === 7, fmt(year.standard));

var bad = P.calculateStay({
  settings: settings,
  stayType: "hourly",
  checkIn: at(2026, 10, 19, 12, 0),
  checkOut: at(2026, 10, 19, 11, 0),
  extraSurcharge: 0,
  discount: 0,
  paid: 0,
});
assert("Không cho trả trước giờ nhận", !bad.ok, bad.error);

var discountCap = P.calculateStay({
  settings: settings,
  stayType: "hourly",
  checkIn: at(2026, 10, 19, 10, 0),
  checkOut: at(2026, 10, 19, 11, 0),
  extraSurcharge: 0,
  discount: 999999,
  paid: 0,
});
assert("Không phát sinh hóa đơn âm", discountCap.ok && discountCap.total === 0, String(discountCap.total));

var dailyLate = P.calculateStay({
  settings: settings,
  stayType: "daily",
  checkIn: at(2026, 10, 19, 8, 0),
  checkOut: at(2026, 10, 19, 20, 0),
  extraSurcharge: 0,
  discount: 0,
  paid: 0,
});
assert("Nghỉ ngày trả muộn 2 giờ sau 18:00 phụ thu 30000", dailyLate.ok && dailyLate.roomCharge === 300000 && dailyLate.autoSurcharge === 30000, JSON.stringify({ room: dailyLate.roomCharge, extra: dailyLate.autoSurcharge }));

if (failed) {
  console.log("\n" + failed + " test(s) failed");
  process.exit(1);
}
console.log("\nAll pricing tests passed");
