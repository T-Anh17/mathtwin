# Thu ảnh thật để nghiệm thu MathTwin

Muốn biết app có chấm đúng bài viết tay thật hay không, cần **ít nhất 30 cặp (ảnh đề, ảnh bài làm)** chụp bằng điện thoại, mỗi cặp có kết luận của giáo viên. Mọi số đo hiện có đều làm trên ảnh tổng hợp, nên chưa đủ căn cứ.

## 1. Cần bao nhiêu, gồm những gì

| Yêu cầu | Tối thiểu |
| --- | --- |
| Tổng số cặp | 30 (càng gần 100 càng tốt, theo đặc tả 8.1) |
| Bài **sai** | ≥ 12 cặp; mỗi bài sai có đúng một chỗ sai đầu tiên rõ ràng |
| Bài **đúng** | ≥ 12 cặp |
| Có **gạch xóa** (gạch ngang hoặc bôi kín rồi viết lại) | ≥ 6 cặp |
| Có **bảng Dijkstra** kẻ tay | ≥ 4 cặp |
| Bài làm **2 trang trở lên** | ≥ 3 cặp |
| Trắc nghiệm hoặc đúng/sai | ≥ 4 cặp |

Rải đủ 8 dạng: đỉnh–cạnh, bậc, đường đi–liên thông, Euler, Hamilton, Dijkstra, người du lịch, người đưa thư. Mỗi dạng ít nhất 3 cặp. Nên có nhiều người viết, nhiều loại bút và giấy (vở ô li, giấy trắng, giấy nháp).

**Bài sai phải là sai thật của học sinh**, hoặc do giáo viên cố ý viết sai một bước như học sinh hay mắc: cộng nhầm, chọn đỉnh sai, đi qua cạnh không có, kết luận vội. Không viết sai kiểu vô lý.

## 2. Cách chụp

- Chụp bằng camera điện thoại thường, không dùng app quét tài liệu, không bật đèn flash.
- Đủ cả trang, không cắt mất mép chữ. Chụp thẳng là chính; khoảng 1/3 số ảnh có thể hơi nghiêng như học sinh chụp thật.
- Đề và bài làm có thể cùng một trang. Khi đó chỉ cần một ảnh.
- **Không để lộ tên, lớp, trường** trong ảnh. Che hoặc cắt phần đó trước khi gửi.

## 3. Gửi cho Claude như thế nào

Mỗi cặp là một thư mục đặt tên theo mã, **không dùng tên học sinh**, ví dụ `cap-001`:

```text
cap-001/
  de-1.jpg            ảnh đề (de-2.jpg nếu đề dài hơn một trang)
  bai-1.jpg           ảnh bài làm (bai-2.jpg… nếu nhiều trang)
  giao-vien.txt       kết luận của giáo viên, xem mục 4
```

Đặt các thư mục này **ngoài repo**, ví dụ `D:\mathtwin-anh-that\`, rồi báo Claude đường dẫn. Ảnh không được đưa vào repo nếu bạn chưa cho phép rõ ràng.

## 4. Giáo viên cần ghi gì (`giao-vien.txt`)

Chỉ cần ba dòng:

```text
Kết luận: SAI
Chỗ sai đầu tiên: dòng "B: 3 + 2 = 6" (bước cập nhật nhãn đỉnh B)
Lý do: cộng sai, 3 + 2 = 5
```

Với bài đúng thì ghi `Kết luận: ĐÚNG`, hai dòng sau để trống.

Claude sẽ dựng nháp các tệp nhãn máy cần: đề chuẩn `truth.json`, chữ bài làm chép đúng như viết `lines.json`, và `work.json`. Sau đó **giáo viên soát lại nháp**: đếm đủ cạnh (kể cả khuyên và cạnh lặp), đúng trọng số, chữ chép đúng như học sinh viết (giữ nguyên chỗ sai). Nhãn chỉ dùng được sau khi đã soát. Tốt nhất có người thứ hai đối chiếu.

## 5. Sau khi gửi

- Claude chạy `npm run eval:validate -- real-pairs --dir <đường dẫn>` để kiểm nhãn.
- Sau đó chạy `npm run eval:mvp -- --source real --dir <đường dẫn>` để đo đầu–cuối trên máy tính. Mỗi cặp mất khoảng 2–3 phút.
- Kết quả ghi vào `reports/phase5-<ngày>.md`, chỉ dùng mã cặp, không có tên.

Ba ảnh đề vẽ tay đã gửi ngày 2026-11-17 (`.ai/real-staging/de-001…003`) vẫn đang chờ bạn đối chiếu nhãn. Các đề này dùng lại được nếu bổ sung ảnh bài làm cho từng đề.
