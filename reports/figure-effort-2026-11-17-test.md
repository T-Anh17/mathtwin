# Công sửa bản nháp D — synthetic-fig test — 2026-11-17

D chạy **không có glyph model** như trong app (nhãn, trọng số để trống). Một thao tác = một lần chạm hoặc một ô gõ.
Đỉnh nháp ghép với đỉnh chú thích theo vị trí (≤ max(40 px, 1,5 × cao nhãn)). Tự nhập: app tự đặt nhãn A, B, C… nên đồ thị có nhãn liền A… chỉ tốn 1 thao tác/đỉnh.
Ảnh tổng hợp, không phải ảnh thật. Thời gian là máy tính, chỉ tham khảo.

| Nhóm | Ảnh | TB thao tác từ nháp D | TB thao tác tự nhập | Tỉ lệ | Ảnh nháp D ít thao tác hơn |
| --- | ---: | ---: | ---: | ---: | ---: |
| all | 116 | 18.1 | 18.5 | 0.98 | 45 |
| crop | 87 | 18.3 | 18.5 | 0.99 | 34 |
| page | 29 | 17.7 | 18.5 | 0.95 | 11 |
| 1–4 đỉnh | 84 | 13.0 | 12.3 | 1.06 | 22 |
| 5–8 đỉnh | 24 | 25.7 | 27.3 | 0.94 | 15 |
| 9+ đỉnh | 8 | 49.3 | 57.5 | 0.86 | 8 |

Đỉnh: ghép 392, thừa 330, thiếu 116. Cạnh: đúng 192, thừa 8, thiếu 452.
Thời gian D (Node, máy tính): p50 3099 ms, p90 4989 ms.
