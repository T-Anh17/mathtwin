# Bộ ảnh tổng hợp

50 PNG: 10 đồ thị từ `testdata/core`, mỗi đồ thị có 5 biến thể: `clean`, `tilted` (xoay −4°), `blurred` (sigma 1.6), `low-resolution` (rộng 360 px), `handwritten` (nét bút/font giả viết tay). Đây là dữ liệu mô phỏng, không phải ảnh đề thật hay số đo trên điện thoại.

Phủ tám dạng bài, bốn dạng câu hỏi, khuyên, cạnh song song, đỉnh cô lập, trọng số, tên cạnh và đề tiếng Việt. Mỗi thư mục chứa `1.png`, `source.svg`, `truth.json`, `meta.json`; nhãn có cùng định dạng [bộ ảnh thật](../images/README.md).

```sh
npm run eval:generate
npm run eval:validate -- synthetic
npm run eval:read -- --engine fake --set synthetic
```

`tools/eval/src/synthetic.ts` dùng một bản `ProblemSpec` cho cả SVG và `truth.json`, giữ nguyên đồ thị/task của fixture lõi, không chép tay một danh sách cạnh khác. SVG chứa metadata của chính bản đó. `sharp` raster hóa SVG và thêm biến thể hình ảnh; biến thể không đổi nhãn. Test kiểm nhãn hợp lệ, đếm nét cạnh/đỉnh, đối chiếu nguồn SVG với mô hình dùng để vẽ và kiểm SHA-256 của SVG/PNG được ghi cùng lần sinh trong `meta.artifactHashes`. Font máy chủ có thể làm PNG khác khi sinh lại trên hệ điều hành khác; test không buộc máy khác raster hóa chữ giống từng pixel, không thay đổi nhãn chuẩn.
