# Bộ hình đồ thị vẽ tay tổng hợp khó — Lô 2.10

**Đây là ảnh tổng hợp, không phải ảnh thật hay bài viết của học sinh.** Bộ này dùng để phát triển và đánh giá bộ đọc hình, chưa chứng minh chất lượng trên vở thật.

320 ảnh: 60 nguồn trong `testdata/core` và 20 đồ thị bổ sung có seed, mỗi nguồn sinh 3 ảnh vùng hình (`crop`, 1200 × 1000) và 1 trang vở (`page`, 1000 × 1440). Tổng cộng 240 vùng hình và 80 trang. Các nguồn core có thể dùng chung một đồ thị; không coi 80 nguồn là 80 đồ thị khác nhau.

Truth giữ nguyên đồ thị gốc, bỏ `uncertain`; dùng `task: {type: "elements"}` và `questionFormat: "tu_luan"` để hợp lệ với `ProblemSpec`. Lô này chỉ đo phần đồ thị. Trang vở dùng lại dàn trang, câu đề và bài làm của `synthetic-hw` với task đếm/liệt kê; chữ xung quanh có thể đúng hoặc cố ý sai theo biến thể font, được chép nguyên văn trong `lines.json`.

Các nguồn bổ sung có 3–12 đỉnh và một số nguồn 20 đỉnh, khuyên, 2–3 cạnh song song, tên `a`, `b`, `m`, trọng số 1–99 hoặc không trọng số. Nhãn gồm `v1`, `v₁`, `Đ`. Font Patrick Hand và Dancing Script là các file OFL đã có trong [tools/eval/fonts](../../tools/eval/fonts/README.md); không cần tải thêm.

Biến thể gồm vòng méo/hở 10–40%, vòng kép, chấm, chỉ nhãn, nhãn trong/ngoài vòng; nét run/cong, đầu nét chạm/hở/đâm lố, cung song song, khuyên giọt nước nhiều hướng; giao cắt có/không chấm nhưng không phải đỉnh, cạnh sát nhãn đỉnh khác; trọng số/tên lệch hai bên và nhiều vị trí dọc cạnh, khoanh/gạch nối; ba màu bút, độ dày 1,5–4 px; giấy trắng/kẻ ngang/ô li nhạt/đậm; bóng, phối cảnh nhẹ, xoay trong ±8°, mờ và JPEG q60–90. `meta.json.parameters` ghi tham số seed và biến đổi của từng ảnh; `variants` là các nhóm chồng lấn để tách báo cáo.

Mỗi thư mục chứa:

- `1.jpg`: ảnh cuối cùng, đã xoay/phối cảnh/làm mờ/nén.
- `truth.json`: đồ thị chuẩn đi qua `validateSpec`, không có `uncertain`.
- `figure.json`: `version`, `width`, `height`, `box`; đỉnh (`id`, `label`, `center`, `contours`, `labelBox`, `style`, `gap`); cạnh (`id`, `u`, `v`, `polyline`, `w`, `name`, `weightBox`/`nameBox` khi có chữ); giao cắt (`point`, hai id cạnh, `notVertex: true`, `dot`). Không trọng số/tên là `null` trong chú thích, trường thiếu trong graph truth theo kiểu core.
- `lines.json`: chữ NFC và box ảnh, gồm nhãn/trọng số/tên và chữ xung quanh trang.
- `source.svg`: nét và raster glyph được dùng để tạo JPEG; mọi glyph lấy từ fontfile đã kèm.
- `meta.json`: nguồn, seed, split, tham số, biến thể, hash SHA-256 các artifact.

Tọa độ trong `figure.json` là **pixel ảnh cuối**, gốc trái trên, box `[left, top, right, bottom]`; không phải hệ 0–1000 của kết quả OCR. Đường bao là các polyline nét đã vẽ: vòng hở không đóng; chỉ nhãn có `contours: []`; chấm có đường bao kín. Polyline cạnh giữ cả khuyên và từng cung song song riêng. Box chữ đo từ raster font có đầy đủ dấu rồi biến đổi cùng vị trí chữ. Hình học đi qua phép phối cảnh và xoay chung; mỗi glyph nhỏ dùng affine cục bộ của phép đó. Blur/JPEG không đổi hệ tọa độ. Giao cắt tránh vùng gắn cạnh ở đỉnh; chấm giao cắt là nhiễu, không tạo thêm vertex trong truth.

Chia tập cố định với seed `210202611`: chuẩn hóa nhãn, sắp tập đỉnh và multiset `{u,v,w,name}`, băm SHA-256 thành `originalGraph`; XOR 32 bit đầu với seed rồi lấy modulo 4, bằng 0 là `test`, còn lại `dev`. Bỏ id/thứ tự và hướng trình bày cạnh khỏi khóa. Cùng đồ thị xuất hiện ở nhiều fixture hoặc biến thể luôn vào cùng tập. **Chỉ dùng `dev` để chỉnh ngưỡng; `test` chỉ dùng báo cáo.** Không đổi seed để chọn kết quả tốt hơn.

Có 44 nội dung đồ thị khác nhau sau chuẩn hóa. Các kiểm tra toàn corpus chỉ kiểm tính toàn vẹn nhãn, hình học và artifact, không chọn ngưỡng nhận dạng.

| Tập | Vùng hình | Trang vở | Tổng |
| --- | ---: | ---: | ---: |
| dev | 153 | 51 | 204 |
| test | 87 | 29 | 116 |

Sinh và kiểm tra không cần mạng/model:

```powershell
npm run eval:generate -- --set synthetic-fig
npm run eval:validate -- synthetic-fig
npm run eval:pack -- --set synthetic-fig
npm run eval:pack -- --set synthetic-fig --split test
npm run eval:read -- --engine fake --set synthetic-fig --split dev --mode graph
```

Reader `fake` chỉ kiểm pipeline với truth, không đọc pixel và không phải số đo nhận dạng. Bộ đo đóng gói trong `.build-cache/datasets/synthetic-fig[-test]/` chỉ có ảnh và `ids.json`, không kèm truth/chú thích. Lô này không cài bộ đọc D, không gọi thiết bị hay tải model.
