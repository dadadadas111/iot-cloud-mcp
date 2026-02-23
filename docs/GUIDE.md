# Hướng Dẫn Sử Dụng IoT Cloud MCP Server

## Giới Thiệu

**IoT Cloud MCP Server** là máy chủ Model Context Protocol (MCP) chuyên nghiệp giúp kết nối các trợ lý AI (Claude, ChatGPT) với hệ thống IoT Cloud REST API. Server này cho phép bạn quản lý và điều khiển các thiết bị IoT thông qua giao diện chat tự nhiên.

### Tính Năng Chính

- 🔐 **Xác thực đơn giản**: Đăng nhập qua email/password, không cần cấu hình API key phức tạp
- 🏠 **Quản lý thiết bị IoT**: Xem danh sách, trạng thái, và điều khiển thiết bị
- 📍 **Quản lý vị trí**: Tổ chức thiết bị theo địa điểm (nhà, phòng, tòa nhà...)
- 👥 **Quản lý nhóm**: Gom các thiết bị thành nhóm để điều khiển đồng loạt
- 🔍 **Tìm kiếm thông minh**: Tìm thiết bị, vị trí, nhóm theo từ khóa
- ⚡ **Điều khiển thiết bị**: Bật/tắt, điều chỉnh độ sáng, nhiệt độ, màu sắc...

---

## Cài Đặt Kết Nối

### Link MCP Server

| Môi trường | URL                                   |
|-----------|---------------------------------------|
| Production | `https://mcp.dash.id.vn/api/mcp`     |
| Staging    | `https://mcp-stag.dash.id.vn/api/mcp`|

### 1. Kết Nối với Claude Desktop

**Video hướng dẫn:** https://youtu.be/6ZVRJKw5q9g?si=EjeZAMqQrNYLgwVH&t=386

### 2. Kết Nối với ChatGPT Web

**Các bước:**

1. Truy cập: https://chatgpt.com/#settings/Connectors
2. Click **"Create App"** hoặc **"Add Connector"**
3. Chọn **MCP** làm loại connector
4. Nhập thông tin:
   - **Name**: IoT Cloud (hoặc tên tùy ý)
   - **MCP Server URL**: `https://mcp.dash.id.vn/api/mcp`
5. Click **Save** hoặc **Connect**
6. Server đã sẵn sàng sử dụng

---

## Danh Sách Tools

Server cung cấp **14 tools** được chia thành các nhóm chức năng:

### 🔐 Xác Thực (1 tool)

#### `login`
- Đăng nhập vào hệ thống IoT Cloud
- **Bắt buộc gọi đầu tiên** trước khi sử dụng các tools khác
- Input: `email`, `password`

note: 
- Mỗi server chỉ hỗ trợ 1 project. 
- project staging là **Rogo Life App Dev** (647701793bcdc39e381157ab)
- project production là **Rogo Life Mobile App** (6476ebbaec05f7cf69a8107f)

=> phải dùng tài khoản trong 2 project này để đăng nhập thành công.

### 🔍 Tìm Kiếm & Khám Phá (2 tools)

#### `search`
- Tìm kiếm thiết bị, vị trí, nhóm theo từ khóa
- Hỗ trợ tìm theo tên, mô tả, ID
- Input: `query` (ví dụ: "phòng khách", "đèn", "AC")

#### `fetch`
- Lấy thông tin chi tiết theo ID cụ thể
- Input: `id` (format: `device:uuid`, `location:uuid`, `group:uuid`)

### 📋 Liệt Kê Tài Nguyên (3 tools)

#### `list_devices`
- Liệt kê **TẤT CẢ** thiết bị IoT
- Không có filter, trả về toàn bộ danh sách

#### `list_locations`
- Liệt kê **TẤT CẢ** vị trí (location)
- Hiển thị cấu trúc tổ chức không gian

#### `list_groups`
- Liệt kê **TẤT CẢ** nhóm thiết bị
- Xem thiết bị được phân loại như thế nào

### 🏠 Quản Lý Thiết Bị (3 tools)

#### `get_device`
- Lấy thông tin chi tiết thiết bị theo UUID
- Bao gồm: thuộc tính, cấu hình, thông số kỹ thuật

#### `get_device_state`
- Kiểm tra trạng thái hiện tại của thiết bị theo UUID
- Hiển thị: bật/tắt, độ sáng, nhiệt độ, màu sắc...

#### `get_device_state_by_mac`
- Kiểm tra trạng thái thiết bị theo địa chỉ MAC
- Input: `locationUuid`, `macAddress`

### 📍 Quản Lý Vị Trí & Nhóm (2 tools)

#### `get_location_state`
- Lấy trạng thái **TẤT CẢ thiết bị** trong một vị trí
- Hữu ích để xem tổng quan một phòng/tòa nhà

#### `update_device`
- Cập nhật thông tin thiết bị (tên, mô tả, nhóm...)
- **Không dùng để điều khiển** thiết bị (bật/tắt)

### ⚡ Điều Khiển Thiết Bị (2 tools)

#### `control_device_simple`
- Điều khiển thiết bị đơn giản với các lệnh phổ biến:
  - `turn_on`: Bật thiết bị
  - `turn_off`: Tắt thiết bị
  - `set_brightness`: Điều chỉnh độ sáng (0-1000)
  - `set_kelvin`: Nhiệt độ màu (0-65000)
  - `set_temperature`: Nhiệt độ điều hòa (15-30°C)
  - `set_mode`: Chế độ điều hòa (0-4)

#### `control_device`
- Điều khiển nâng cao với command array
- Yêu cầu hiểu biết về attribute IDs
- Dùng cho các tình huống phức tạp

### 🗑️ Quản Lý Nâng Cao (1 tool)

#### `delete_device`
- Xóa thiết bị vĩnh viễn khỏi hệ thống
- ⚠️ **Không thể hoàn tác**, sử dụng cẩn thận!

---

## Quy Trình Sử Dụng Phổ Biến

### 1. 🔐 Đăng Nhập Lần Đầu

```
Bạn: "Đăng nhập vào IoT Cloud"
AI: [Yêu cầu email và password]
Bạn: "email@example.com / password123"
AI: [Gọi tool login] ✅ Đăng nhập thành công!
```

### 2. 📱 Xem Danh Sách Thiết Bị

```
Bạn: "Cho tôi xem tất cả thiết bị"
AI: [Gọi tool list_devices]
    📋 Bạn có 10 thiết bị:
    1. Đèn phòng khách
    2. Điều hòa phòng ngủ
    3. ...
```

### 3. 🔍 Tìm Thiết Bị Cụ Thể

```
Bạn: "Tìm các thiết bị ở phòng khách"
AI: [Gọi tool search với query="phòng khách"]
    🔍 Tìm thấy 3 kết quả:
    - Đèn phòng khách
    - Quạt phòng khách
    - ...
```

### 4. ⭐ Kiểm Tra Trạng Thái

```
Bạn: "Kiểm tra trạng thái đèn phòng khách"
AI: [Gọi tool get_device_state]
    💡 Đèn phòng khách:
    - Trạng thái: BẬT
    - Độ sáng: 700/1000
    - Nhiệt độ màu: 4000K
    - Cập nhật lúc: 14:30:25
```

### 5. ⚡ Điều Khiển Thiết Bị

```
Bạn: "Tắt đèn phòng khách"
AI: [Gọi tool control_device_simple với action="turn_off"]
    ✅ Đã tắt đèn phòng khách
```

```
Bạn: "Bật đèn và chỉnh độ sáng 50%"
AI: [Gọi tool control_device_simple 2 lần]
    ✅ Đã bật đèn
    ✅ Đã chỉnh độ sáng về 500/1000
```

### 6. 🏠 Điều Khiển Theo Vị Trí

```
Bạn: "Tắt tất cả đèn ở phòng khách"
AI: [Gọi search → lọc devices → control_device_simple nhiều lần]
    ✅ Đã tắt 3 thiết bị:
    - Đèn trần phòng khách
    - Đèn ngủ
    - Đèn góc đọc sách
```

### 7. 🔄 Xác Nhận Thay Đổi

```
Bạn: "Kiểm tra lại trạng thái để đảm bảo"
AI: [Gọi tool get_device_state]
    ✅ Xác nhận: Đèn đã TẮT
    - Cập nhật lúc: 14:35:10
```

---

## Tips & Lưu Ý

### ✅ Nên Làm

- Luôn **đăng nhập trước** khi sử dụng các tools khác
- Dùng `search` khi không biết chính xác UUID hoặc MAC
- Dùng `control_device_simple` cho các thao tác thường gặp (đơn giản hơn)
- Kiểm tra trạng thái sau khi điều khiển để xác nhận thành công
- Sử dụng ngôn ngữ tự nhiên, AI sẽ tự hiểu và gọi đúng tool

### ❌ Không Nên

- Gọi `control_device` nâng cao nếu chưa hiểu rõ attribute IDs
- Dùng `delete_device` nếu không chắc chắn (không thể hoàn tác!)
- Quên đăng nhập → tất cả tools khác sẽ báo lỗi xác thực

### 💡 Mẹo Hay

- Có thể hỏi AI bằng tiếng Việt hoặc tiếng Anh
- Nói "thiết bị của tôi", "my devices", "check state"... đều được
- AI tự động gọi nhiều tools nếu cần (VD: tìm kiếm rồi điều khiển)
- Trạng thái thiết bị cập nhật qua MQTT, đợi 1-2 giây để kiểm tra lại

---

## Ví Dụ Thực Tế

### Kịch Bản 1: Điều Khiển Buổi Tối

```
Bạn: "Chuẩn bị chế độ xem phim"
AI: 🎬 Được rồi!
    - Tắt đèn trần phòng khách ✅
    - Bật đèn led RGB với độ sáng 20% ✅
    - Màu ánh sáng: Warm White (2700K) ✅
    - Bật loa soundbar ✅
```

### Kịch Bản 2: Tiết Kiệm Năng Lượng

```
Bạn: "Tắt tất cả thiết bị đang bật"
AI: [Quét toàn bộ devices → lọc state ON → tắt hết]
    💡 Đã tắt 7 thiết bị:
    - 4 đèn
    - 2 quạt  
    - 1 điều hòa
```

### Kịch Bản 3: Sáng Tạo Tự Động

```
Bạn: "Mỗi sáng 6h, bật đèn phòng ngủ với độ sáng tăng dần"
AI: ℹ️ MCP Server không hỗ trợ lập lịch tự động.
    Nhưng tôi có thể hướng dẫn bạn cách tạo automation
    trong ứng dụng IoT Cloud hoặc Home Assistant.
```

---

## Hỗ Trợ & Tài Liệu Kỹ Thuật

- **API Reference**: `/docs/api/TOOLS.md`
- **Control Guide**: `/docs/api/how-to-control-devices.md`
- **Device Attributes**: `/docs/api/device-attr-and-control.csv`
- **Quick Start**: `/docs/setup/QUICKSTART.md`

---

## Câu Hỏi Thường Gặp

**Q: Tại sao tool báo lỗi "Unauthorized"?**  
A: Bạn chưa đăng nhập hoặc token đã hết hạn (1 giờ). Gọi lại tool `login`.

**Q: Tôi có thể điều khiển nhóm thiết bị cùng lúc không?**  
A: Có, dùng `search` hoặc `get_location_state` để lấy danh sách, rồi gọi `control_device_simple` lần lượt.

**Q: Làm sao biết thiết bị hỗ trợ tính năng gì?**  
A: Dùng `get_device` để xem chi tiết, AI sẽ tự phân tích và đề xuất các lệnh điều khiển phù hợp.

**Q: Production và Staging khác nhau thế nào?**  
A: Production là môi trường thực tế, Staging dùng để test. Dữ liệu 2 môi trường hoàn toàn riêng biệt.

**Q: Có giới hạn số lần gọi API không?**  
A: Hiện tại chưa có rate limit nghiêm ngặt. Sử dụng hợp lý để tránh quá tải server.

---

**🎉 Chúc bạn trải nghiệm vui vẻ với IoT Cloud MCP Server!**