# Bản ghi hồi quy nhập kết quả thiết bị

`device-vivo-w0.json` lấy nguyên một kết quả (`07-connectivity-components-dancing-perspective`) cùng `version`, `runtime`, `device` từ file xuất sẵn `reports/.debug/device-vivo-app-b768-graph-2026-11-17.json`. Chỉ rút `results` xuống một phần tử; không thay trọng số, draft, issue, timing hay cấu hình. Nguồn được mô tả trong [báo cáo mốc B](../../../../reports/device-bench-vivo-graph-2026-11-17.md).

Đây là kết quả đọc ảnh **tổng hợp**, không chứa ảnh học sinh, pixel hoặc khóa server. Hai cạnh đọc được có `w: 0` và issue `nonpositive_weight`. Ca kiểm tra cần nhập được file, giữ F1 cấu trúc bằng 1 và tính trọng số sai; không đổi `0` thành không trọng số. Không cần điện thoại hoặc model khi chạy test.
