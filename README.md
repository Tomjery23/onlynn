# Quản lý nhà nghỉ Hoa Hồng

Website quản lý nhà nghỉ chạy hoàn toàn trên trình duyệt: HTML5, CSS3 và JavaScript thuần. Không cần máy chủ, không cần cài đặt cơ sở dữ liệu. Dữ liệu lưu trong `localStorage` của trình duyệt.

## Cách chạy

1. Mở thư mục dự án trong Cursor hoặc VS Code.
2. Mở file `index.html` bằng trình duyệt, hoặc chuột phải chọn **Open with Live Server**.
3. Website hoạt động khi không có Internet sau khi các file đã có trên máy.

Cấu trúc:

```
index.html
css/style.css
js/storage.js
js/pricing.js
js/rooms.js
js/payments.js
js/history.js
js/ui.js
js/app.js
README.md
```

## Việc cần làm lúc đầu

- Mặc định có 20 phòng mẫu `P101`–`P120`. Có thể thêm, đổi tên hoặc xóa.
- Bảng giá mặc định theo nhà nghỉ Hoa Hồng: giờ đầu 70.000 ₫, giờ tiếp 15.000 ₫, qua đêm 170.000 ₫, ngày 300.000 ₫.
- Vào **Cài đặt giá và giờ nghỉ** để điền tên, địa chỉ, điện thoại nhà nghỉ (hiện trên hóa đơn).

## Chỉnh giá và giờ nghỉ

Bấm **Cài đặt giá và giờ nghỉ**. Có thể sửa:

- Giá giờ đầu, giờ tiếp theo, quy tắc làm tròn giờ
- Giá qua đêm, phụ thu giờ thêm, khung nhận/trả phòng
- Giá nghỉ ngày, phụ thu trả muộn, khung nhận/trả phòng
- Ngưỡng gợi ý chuyển từ nghỉ giờ sang qua đêm
- Tên nhà nghỉ, khổ giấy in A4 hoặc hóa đơn hẹp

Bấm **Lưu cài đặt**. Lần tính tiền tiếp theo dùng giá mới. Hóa đơn và lịch sử đã lưu **không** bị đổi.

**Khôi phục mặc định** chỉ đưa bảng giá về giá trị ban đầu, không xóa lịch sử.

## Quy tắc giờ trả phòng (mặc định)

Các mốc giờ nằm trong cài đặt, không viết cứng rải rác trong code.

- **Nghỉ giờ:** giờ đầu 70.000 ₫, mỗi giờ sau 15.000 ₫, mặc định làm tròn lên.
- **Nghỉ qua đêm:** nhận 20:00–23:00 hoặc từ 23:00 trở đi → trả 07:00 sáng hôm sau, giá 170.000 ₫. Trả sớm vẫn tính đủ gói. Trả muộn tính phụ thu theo cấu hình.
- **Nghỉ ngày:** nhận 06:00–12:00 → trả 18:00 cùng ngày; nhận 12:00–16:00 → trả 10:00 sáng hôm sau. Giá 300.000 ₫.

Giờ nhận 23:30 được hiểu là trả 07:00 **ngày hôm sau**. Nếu giờ trả theo đồng hồ nhỏ hơn giờ nhận, hệ thống cộng sang ngày tiếp theo (kể cả qua tháng, qua năm).

## Luồng làm việc tại quầy

1. Chọn phòng trống (thẻ xanh) hoặc chọn trong form.
2. Nhập tên khách, loại hình thuê. Giờ nhận mặc định là giờ máy tính; giờ trả dự kiến được điền theo quy tắc.
3. Bấm **Nhận phòng** — thẻ phòng chuyển đỏ.
4. Khi khách ra: chọn phòng đang thuê → **Tính tiền trả phòng**. Hệ thống lấy giờ hiện tại, tính tiền, **chưa** trả phòng.
5. Kiểm tra còn phải thu / tiền thừa, rồi **Xác nhận thanh toán và trả phòng**.
6. Phòng chuyển sang **Chờ dọn** (vàng). Sau khi dọn, bấm **Đã dọn xong** để phòng xanh trở lại.

Không nhận hai khách cùng một phòng khi phòng đang thuê.

## Sao lưu và khôi phục

- **Sao lưu JSON:** tải toàn bộ phòng, lượt thuê đang mở, lịch sử và cài đặt.
- **Khôi phục:** chọn file JSON đã lưu. Hệ thống kiểm tra cấu trúc trước khi thay dữ liệu. Nếu file sai định dạng, dữ liệu hiện tại được giữ nguyên.
- **Xuất CSV:** trong phần lịch sử, file UTF-8 có BOM để Excel đọc đúng tiếng Việt.

Nên sao lưu định kỳ. Xóa dữ liệu trình duyệt hoặc dùng trình duyệt khác sẽ không thấy dữ liệu cũ.

## In hóa đơn

Mở hóa đơn từ lịch sử hoặc ngay sau khi trả phòng, bấm **In hóa đơn**. Khi in, chỉ hiện hóa đơn (CSS `@media print`), không in bảng điều khiển.

## Ghi chú kỹ thuật

- Tiền tính bằng số nguyên VNĐ, hiển thị bằng `Intl.NumberFormat('vi-VN')`.
- Doanh thu hôm nay chỉ cộng số tiền **đã thu**, không cộng hóa đơn còn thiếu.
- Trang tự đồng bộ khi tab khác của cùng trình duyệt ghi `localStorage`.
- Không lưu mật khẩu hay thông tin thẻ ngân hàng.
