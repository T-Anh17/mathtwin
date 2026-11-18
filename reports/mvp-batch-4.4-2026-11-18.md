# Lô 4.4 — Luồng bài làm

Ngày: 2026-11-18. Phạm vi dừng ở 4.4; không đổi parser, core hay dữ liệu chuẩn, không gọi adb, không tải model.

## Đã triển khai

- Phiên thật: thêm/xóa/đổi thứ tự trang; B → `readWork` + `detectStrikes`; lưu chữ ngay sau mỗi trang, rồi lưu kết quả kiểm vùng/mất dòng. Mở lại tiếp tục trang chưa đọc; lỗi/hủy không xóa checkpoint.
- B yêu cầu `region` trong schema; `regionConf` lấy từ logprob giá trị, độc lập với độ chắc của chữ. Phản hồi cũ thiếu region vẫn đọc được nhưng phải khoanh vùng.
- Lọc dòng trong box hình được cung cấp hoặc cụm ít nhất ba nhãn/số đứng riêng, gần nhau và trải theo chiều ngang. Giữ ô bảng đã phân loại chắc. Thiếu box/region hoặc region conf < 0,85 → khoanh vùng. Nếu chữ thiếu box, đọc lại crop đã chọn rồi đổi tọa độ về trang gốc. Sau review r1: vẫn thiếu vị trí thì tiếp tục với cảnh báo và ảnh cả vùng, bắt buộc soát trước cả SAI lẫn ĐÚNG, không bắt gõ tay.
- `detectMissingLines`: chiếu mực theo hàng, dùng chung nguyên bộ lọc dòng kẻ vở của `detectStrikes`. Vùng nghi mất tạo câu hỏi `reading`, ô gõ trống và nút “Không có gì ở đây”; mọi câu còn lại chặn ĐÚNG/SAI.
- `WorkScreen`: hỏi lần lượt, chấm/lưu ngay sau câu trả lời; sửa dòng; nhãn “chưa chắc”; issue đặt đúng dòng; trạng thái theo lý do; nhãn đỉnh/tên cạnh thay id nội bộ; nút biểu tượng có aria-label. Bài ảnh đúng cần `review_ack`, có các crop để soát; gõ tay dùng cùng màn soát.

## Số đo synthetic-hw

Lệnh: `npm run build`, sau đó `node tools/eval/dist/work-layout.js`. Có thể truyền đường dẫn tuyệt đối của llama-server Windows làm đối số đầu tiên; khi chạy được, CLI đo tuần tự cả 40 trang. Không chạy suy luận thật trong `npm test`.

### Chữ B đã có: chỉ đo lọc hình học

Nguồn: `reports/.debug/device-vivo-app-b768-2026-11-17-40.json`.

| Chỉ số | Kết quả |
|---|---:|
| Trang / dòng OCR | 40 / 275 |
| Dòng có box / có region mới | 10 / 0 |
| Dòng hình lẫn vào lời giải, trước → sau | **42 → 42** |
| Dòng lời giải bị loại nhầm theo căn dòng | 0 |
| Dòng OCR không căn được với truth | 21 |

Định nghĩa số 42: dòng OCR căn bằng `alignWorkLines` vào các dòng truth chỉ thuộc `figure`, vẫn chưa bị gắn `question`/`figure`. Truth chỉ dùng sau khi lọc để đếm; không điền box/region truth vào chữ B. Dòng không căn được không được tự tính là hình hay lời giải. Vì hầu hết nhãn không có box, phép đo này **không chứng minh bộ lọc cải thiện**; kết quả không giảm. Trong app, các trang chưa rõ vùng bị chặn để người dùng khoanh, không tự đưa chữ chưa phân vùng vào chấm.

### Adapter Node B — tình trạng trước review r1

Hai file trọng số có sẵn trong `.models/b`. Đã gọi `LlamaCppReader` với binary dự kiến `.build-cache/llama.cpp/build/bin/Release/llama-server.exe`: không chạy được vì thiếu binary Windows; PATH và cache không có llama-server.exe. Binary Android không chạy trực tiếp trên Windows. Không tải model/binary mới. **0 trang suy luận Node thành công; không có số trước/sau cho region mới** (các số 0 trong JSON là bộ đếm chưa chạy, không phải kết quả tốt).

### Kiểm mất dòng

Chữ/box oracle từ `lines.json` + `layout.json`, cùng phép biến đổi phối cảnh của phép đo strikes; chỉ dùng vùng solution/table. Lần lượt bỏ mỗi dòng không gạch, không đọc các mẫu work-text.

| Chỉ số | Kết quả |
|---|---:|
| Lần bỏ một dòng / phát hiện đúng vùng đó | **128 / 108 (84,375%)** |
| Lần chưa bắt được | **20** |
| Trang đầy đủ không báo nhầm / tổng trang | **40 / 40** |
| Vùng báo nhầm trên trang đầy đủ | **0** |

Box oracle là box hàng, có thể giao nhau; phép chiếu chỉ cảnh báo dải không giao box đã đọc nên chưa bảo đảm bắt mọi mất dòng. Test bắt buộc xóa dòng sai “Đồ thị có 3 cạnh.” của `01-elements-multigraph-dancing-perspective` đã qua: có câu hỏi `reading`, chưa thể ĐÚNG khi chưa trả lời. Đây là số đo thành phần trên ảnh tổng hợp, không phải nghiệm thu đầu–cuối hay ảnh thật.

## Kiểm tra trước review r1

- `npm test`: **80 file test pass, 2.156 test pass, 0 fail**; lần cuối Vitest **63,50 s**, gồm typecheck vẫn dưới 3 phút. Không mạng/model/adb.
- `npx tsc --noEmit -p …/tsconfig.json`: core, reader, work, tools/eval, reader-llamacpp-shared và reader-llamacpp sạch; typecheck mobile sạch. `npm run build` sạch.
- `npm run mobile:build`: thành công với `JAVA_HOME=C:/Program Files/Android/Android Studio/jbr` (JDK 21). JAVA_HOME mặc định là JDK 17; Ninja cần chạy ngoài sandbox để tạo tiến trình con. APK: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
- Smoke test Chrome headless: app localhost với bộ đọc giả lập, 360 × 800; thêm ba trang, đổi thứ tự, xóa, đọc/hỏi lần lượt, chốt bài ảnh, gõ tay; khoanh vùng → hỏi vùng nghi mất → xác nhận trống → chốt soát. Không tràn ngang, các nút đang hiện ≥ 44 px, không lộ e1/v3. Computer-use không kết nối được native pipe nên dùng Chrome headless. Ảnh QA: `.build-cache/work44-{question,review,manual,region,missing}.png`.
- `git diff --check` sạch. Không sửa/mở các test bị cấm, không sửa parser theo test; 60 bài core giữ nguyên qua bộ test hiện có.

## File tạo/sửa

- Tạo: `apps/mobile/src/WorkFlowScreen.tsx`, `apps/mobile/src/flow/work-reading.ts`, `apps/mobile/src/work.vi.ts`, `apps/mobile/test/work-flow.test.ts`.
- Sửa mobile: `SessionScreen.tsx`, `WorkScreen.tsx`, `flow/sessionReducer.ts`, `flow/types.ts`, `preview-readers.ts`, `problem-readers.ts`, `work.css`.
- Tạo work: `packages/work/src/ink.ts`, `missing.ts`, `regions.ts`, `packages/work/test/layout.test.ts`. Sửa `src/answers.ts`, `grade.ts`, `index.ts`, `messages.vi.ts`, `strikes.ts`, `types.ts`.
- Sửa reader: `packages/reader/src/types.ts`; `packages/reader-llamacpp-shared/src/request.ts`, `response.ts`, `test/shared.test.ts`; `packages/reader-llamacpp/test/reader.test.ts` (kỳ vọng thêm regionConf).
- Tạo eval: `tools/eval/src/work-layout.ts`, `tools/eval/test/work-layout.test.ts`; sửa `tools/eval/src/work-strikes.ts` để xuất lại hàm box hàng đang có. Tạo báo cáo này.

## Quyết định & giả định

- Thêm `TextLine.regionConf`, `WorkLine.missing`, `WorkQuestion.reason: 'missing'`; không tự tạo chữ cho vùng nghi mất. Trả lời bằng chữ hoặc xác nhận trống mới bỏ cảnh báo đó.
- Thêm `Session.workPages`, event `work_page`/`work_capture_photos`. Checkpoint giữ chữ gốc, dòng sau lọc, vùng, trạng thái đã kiểm; sửa dòng được giữ cùng ảnh khi đổi thứ tự/thêm trang. Không lưu pixel vào state.
- Box ở flow/work luôn là 0–1000; adapter native và Node chuyển box pixel B tại ranh giới. Với region chắc, vùng kiểm mực bắt đầu trước dòng solution đầu 12 đơn vị và kéo tới đáy trang; crop người dùng ưu tiên. Đây là heuristic, không phải bảo đảm đọc đủ.
- B là bộ đọc chính; không đưa C vào luồng bài làm. Giữ chính sách server nền 5 phút/giữ sáng màn hình qua adapter native hiện có. Không triển khai kết quả/gia sư Lô 4.5+.

## Sửa review 4.4-r1 (2026-11-18)

### Điểm 1 — đã sửa

- Schema chế độ `lines` bắt buộc `box` cho mọi dòng, từng tọa độ nằm trong 0–1000. Prompt yêu cầu box ôm sát chữ. Prompt/schema đọc đề giữ nguyên.
- Adapter bỏ box ngoài miền, ngược/rỗng, sai dạng và box chiếm **từ 80% diện tích trang**. Bộ lọc work cũng kiểm tra box của dữ liệu cache/bộ đọc giả lập. Không bỏ chữ khi box không hợp lệ.
- Thiếu box toàn bộ hoặc một phần → khoanh vùng và đọc lại crop. Crop vẫn thiếu box → giữ chữ trong crop người dùng chọn, bỏ kiểm mất dòng tự động cho trang đó và lưu `missingLineCheckUnavailable` cùng checkpoint. Không tự suy ra tọa độ và không bắt gõ tay.
- Màn soát luôn hiện cảnh báo **“Máy không kiểm được dòng bị sót trên trang này”** cùng ảnh **toàn vùng đã chọn**. Reducer chặn cả SAI lẫn ĐÚNG trước `review_ack` nếu có trang mang cờ này. Sửa dòng làm mất xác nhận và chấm lại; các câu hỏi đọc/gạch xóa vẫn phải trả lời hết.
- Test nhánh đủ box (không đọc lại), thiếu một phần, không có box và box toàn trang bị loại; kiểm cả SAI/ĐÚNG, lưu/mở lại, ảnh/cảnh báo và hủy xác nhận khi sửa chữ.

### Điểm 2 — đã dựng và đo đủ 40 trang, không tải/cài thêm

Dựng từ đúng nguồn b12388, commit `1c2adc75f619d05efc5d49ce08eaaa96272ebfa2`,
bằng MSVC 14.51 / VS 18 Community, CMake/Ninja 4.0.2 của Android SDK.
Chỉ CPU, static, AVX2; tắt OpenMP, OpenSSL, UI tải sẵn và các bước fetch.
Lệnh đầy đủ và cách chạy có timeout/log ở [tools/eval/README.md](../tools/eval/README.md).
Binary dùng được: `.build-cache/llama-win/bin/llama-server.exe`.

Đo Windows trên **Intel Core i7-8700 @ 3,20 GHz**, B `.models/b`, 768 px,
4 luồng, 1.536 token, không đổi parser. Toàn lệnh **2.387,410 s**, dưới timeout
3.660 s; phần OCR ghi nhận **2.377,339 s**. Mỗi request giới hạn 180 s, mỗi
lượt đọc 300 s; CLI lưu sau từng trang. Không có retry hay chọn lại kết quả.

| Chỉ số | Kết quả |
|---|---:|
| Trang đã thử | **40/40** |
| Trang đọc thành công / lỗi adapter | **37 / 3** |
| Dòng trên 37 trang thành công | **356** |
| Dòng có box hợp lệ | **287/356 (80,618%)** |
| Dòng thiếu box hợp lệ | **69/356 (19,382%)** |
| Trang cần người dùng khoanh vùng | **31/37 trang đọc được** |
| Trang đọc được không cần khoanh vùng | **6/37** |
| Dòng hình lẫn vào lời giải trước → sau lọc | **0 → 0** |
| Dòng lời giải bị loại theo phép căn dòng, sau phân vùng + lọc | **30** |
| Dòng OCR không căn được với truth | **75** |
| Thời gian trang thành công: trung bình / trung vị | **53,776 / 52,455 s** |
| Thời gian trang thành công: nhỏ nhất / lớn nhất | **32,738 / 89,570 s** |

`before` đã loại dòng được B gắn `question`/`figure`; `after` thêm bộ lọc hình
học. Vì vậy **0 → 0 không chứng minh riêng bộ lọc hình học cải thiện**. So với
chữ B cũ, leakage còn lại giảm từ 42 xuống 0 trong các dòng căn được, nhưng hai
lượt OCR khác nhau và lượt mới có 3 trang lỗi. Không được suy ra nhận dạng hoàn
hảo: 30 dòng lời giải đã bị loại ở đầu ra phân vùng/lọc, 75 dòng chưa căn được;
đây là đếm theo alignment, không thay thế kiểm ảnh. Box hợp lệ chỉ chứng minh
miền/hình dạng tọa độ, chưa chứng minh box ôm đúng chữ.

Ba trang adapter báo lỗi (không có chữ/box để tính các tỷ lệ dòng):
`12-dijkstra-tied-order-dancing-straight`,
`13-tsp-tied-student-tour-dancing-perspective`,
`13-tsp-tied-student-tour-dancing-straight`. Giữ trạng thái JSON `partial` cho
kết quả OCR, dù đã thử đủ 40 trang; không điền số 0 vào trang lỗi để làm đẹp tỷ lệ.
Lượt này ghi thông báo lỗi chung của adapter, không đủ căn cứ kết luận nguyên
nhân cụ thể. CLI bản cuối bổ sung `reason`/`finish_reason` cho lần đo sau.

Phân bố region và regionConf trên **356 dòng** (không có dòng thiếu regionConf):

| region | Tổng | conf < 0,85 | 0,85 ≤ conf < 0,95 | conf ≥ 0,95 |
|---|---:|---:|---:|---:|
| question | 131 | 8 | 5 | 118 |
| figure | 127 | 5 | 3 | 119 |
| solution | 83 | 9 | 3 | 71 |
| table | 15 | 0 | 0 | 15 |
| **Tổng** | **356** | **22** | **11** | **323** |

Thời gian từng trang, đơn vị **giây**; dấu **lỗi** là lượt adapter thất bại.
Tên thư mục đầy đủ là tên bài + hậu tố cột. Thời gian gồm chuẩn bị trang,
khởi động/dừng server và đọc; có test/build chạy đồng thời ở một số trang,
không phải benchmark trong điều kiện máy rảnh, không so trực tiếp với điện thoại.

| Bài | dancing-perspective | dancing-straight | patrick-perspective | patrick-straight |
|---|---:|---:|---:|---:|
| 01-elements-multigraph | 65,506 | 64,384 | 73,820 | 69,455 |
| 07-connectivity-components | 40,524 | 52,854 | 33,486 | 48,313 |
| 09-euler-loop-parallel | 52,219 | 55,603 | 47,664 | 50,031 |
| 10-hamilton-reverse-cycle | 35,905 | 52,228 | 32,738 | 52,833 |
| 12-dijkstra-tied-order | 50,508 | 129,273 **lỗi** | 61,907 | 89,570 |
| 13-tsp-tied-student-tour | 129,458 **lỗi** | 128,579 **lỗi** | 52,455 | 58,967 |
| 14-postman-alternative-matching | 49,980 | 67,635 | 53,682 | 81,990 |
| 18-short-answer-degree | 35,365 | 40,910 | 47,575 | 45,669 |
| 19-four-true-false-items | 44,295 | 62,206 | 56,361 | 59,104 |
| 20-four-choice-question | 53,515 | 53,472 | 51,508 | 45,482 |

Dữ liệu từng trang, box/chữ quan sát và phân bố đầy đủ:
`reports/.debug/mvp-batch-4.4-measurement.json`. Log lệnh:
`reports/.debug/4.4-r1-work-layout.log` (exit 0 của công cụ đo, **không có nghĩa
là 40 lượt OCR đều thành công**). Không dùng truth để bổ sung box/region vào OCR.

### Điểm 3 — đã phân loại; giữ nguyên ngưỡng

| Nguyên nhân của 20 ca bỏ sót | Số ca |
|---|---:|
| Nhiều hàng bảng nối thành một dải mực; box hàng còn lại che dải | **20** |
| Dải riêng bị box hàng bên cạnh che | 0 |
| Dòng ngắn/dải dưới ngưỡng cao, rộng hoặc lượng mực | 0 |
| Không có dải giao dòng (kể cả mép vùng) | 0 |

Cả 20 thuộc `12-dijkstra-tied-order-{dancing,patrick}-{straight,perspective}`:
mỗi trang 5 hàng bảng, index oracle **10–14** (index bắt đầu từ 0). Kiểm ảnh
xác nhận các nét dọc bảng nối dải qua cả 5 hàng; nét bảng ngắn không đạt điều
kiện dòng kẻ vở toàn trang nên bộ lọc chung không xóa. Khi bỏ một hàng, ít nhất
một box hàng khác vẫn giao dải; hạ ngưỡng mực không giải quyết nguyên nhân này.

| Chỉ số | Trước r1 | Sau r1 |
|---|---:|---:|
| Phát hiện khi bỏ một dòng | 108/128 (84,375%) | **108/128 (84,375%)** |
| Bỏ sót | 20 | **20** |
| Trang đầy đủ không báo nhầm | 40/40 | **40/40** |
| Dải báo nhầm | 0 | **0** |

`inspectMissingLines` chỉ xuất chẩn đoán từ chính các dải/ngưỡng của detector;
`detectMissingLines` dùng cùng kết quả. Không đổi cách tìm mực, gộp dải hay
ngưỡng. Chi tiết từng ca gồm box, nguyên nhân và index các dòng đang che dải ở
`reports/.debug/mvp-batch-4.4-measurement.json`, mục `missing.misses`.

### Cổng sau sửa r1

- `npm test`: **80 file pass; 2.163 test pass, 0 fail**. Vitest 91,71 s; toàn lệnh gồm typecheck **101,561 s**, timeout cứng 180 s. Log: `reports/.debug/4.4-r1-npm-test.log` (lượt cuối). `npm run build` cuối qua trong **12,038 s**.
- `npx --no-install tsc --noEmit -p .../tsconfig.json`: core, reader, work, tools/eval, reader-llamacpp-shared, reader-llamacpp và apps/mobile đều qua. Log: `4.4-r1-typecheck.log`; tools/eval kiểm lại sau chỉnh checkpoint qua ở `4.4-r1-eval-typecheck.log`.
- `npm run mobile:build`: **qua**, tổng 91,408 s; Gradle `BUILD SUCCESSFUL in 1m 3s`. JDK 21 từ Android Studio; Gradle ép offline bằng init script tạm trong cache, gỡ sau build. APK: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Log: `reports/.debug/4.4-r1-mobile-build.log`.
- Build Windows CPU: **qua**, 218,571 s, timeout 900 s, log `reports/.debug/4.4-r1-llama-build.log`. Binary SHA-256: `6b87a4594420fe9d4627404a438c9dc2d5619ec48228bcffa54aa355ec634f79`.
- Không tải/cài model, binary, toolchain hay thư viện. Không mở test bị cấm, không sửa parser/core/dữ liệu chuẩn, không gọi adb, không làm Lô 4.5+, không commit.

### File tạo/sửa riêng cho vòng r1

- Sửa shared reader: `packages/reader-llamacpp-shared/src/request.ts`, `src/response.ts`, `test/shared.test.ts`; sửa fixture box dòng ở `packages/reader-llamacpp/test/reader.test.ts`.
- Sửa work: `packages/work/src/regions.ts`, `missing.ts`, `index.ts`.
- Sửa mobile: `apps/mobile/src/flow/work-reading.ts`, `flow/sessionReducer.ts`, `WorkFlowScreen.tsx`, `WorkScreen.tsx`, `work.vi.ts`, `apps/mobile/test/work-flow.test.ts`.
- Sửa eval: `tools/eval/src/work-layout.ts`, `tools/eval/README.md`; tạo `tools/eval/run-bounded.mjs` để giới hạn lệnh dài và ghi log. Cập nhật báo cáo này. File của toàn Lô 4.4 liệt kê ở phần trên.

### Quyết định & giả định của vòng r1

- “Gần cả trang” được định nghĩa là diện tích box ≥ 80% trang; không áp giới hạn này cho vùng người dùng chọn hay box đọc đề.
- Crop do người dùng chọn là ranh giới xác định chữ bài làm khi vẫn thiếu vị trí. Không chạy kiểm mất dòng một phần rồi coi như đã kiểm cả trang; người dùng bắt buộc so ảnh cả vùng trước kết luận.
- Không chỉnh ngưỡng để che giới hạn bảng. Số đo chỉ trên ảnh synthetic-hw và máy tính CPU, không phải nghiệm thu ảnh thật hay thời gian điện thoại.

## Sửa review 4.4-r2 (2026-11-18)

### Điểm 1 — đã sửa quy tắc vùng và khôi phục dòng; chất lượng box còn giới hạn

- Vùng người dùng chọn/xác nhận được áp dụng **trước** nhãn B, box hình và cụm nhãn hình. Dòng có box nằm trọn trong vùng thành solution/table; ngoài vùng bị bỏ qua. Trạng thái gạch giữ nguyên, parser vẫn bỏ dòng gạch.
- Màn soát có nhóm thu gọn **“Máy bỏ qua vì coi là đề/hình”**, gồm chữ, vùng ảnh, số trang và nút **“Đây là bài làm”**. Bao gồm dòng bị loại trong/gần vùng (lề 80/1000 trang); dòng không có box cũng hiện để tránh giấu chữ. Khôi phục chấm lại ngay, hủy xác nhận cũ và lưu cùng trang. Dòng xa vùng vẫn bị bỏ qua theo lựa chọn người dùng.
- Đọc crop không xóa âm thầm dòng gốc đã có box: giữ lại dòng gốc không xuất hiện nguyên văn trong bản crop, rồi áp dụng vùng xác nhận cho cả hai. Không đoán chữ hay sửa parser.
- Test: vùng thắng cả model lẫn heuristic hình; giữ gạch; loại ngoài vùng; khôi phục dòng chứa lỗi làm ĐÚNG → SAI; lưu/mở lại; crop bỏ mất dòng có box vẫn giữ dòng đó.

Đo lại **đúng 37 trang OCR thành công của r1**, không chạy lại OCR toàn bộ. JSON:
`reports/.debug/4.4-r2-region-review.json`; log cuối:
`reports/.debug/4.4-r2-region-review-verified.log`. Căn dòng giữ nguyên.

| Phép đo thành phần | Kết quả |
|---|---:|
| Dòng lời giải bị loại trước sửa | **30** |
| Trong 30 dòng cũ: thiếu box hợp lệ / có box | **11 / 19** |
| Sau vùng người dùng xác nhận mô phỏng: khôi phục / còn bị loại trong 30 dòng cũ | **2 / 28** |
| 28 dòng còn lại: thiếu box / box nằm ngoài vùng tham chiếu | **11 / 17** |
| Tổng dòng lời giải bị loại sau vùng mô phỏng, gồm cả dòng mới bị loại | **96** |
| Dòng hình còn lẫn theo alignment sau vùng mô phỏng | **0** |

Vùng xác nhận **mô phỏng** lấy vùng solution/table tham chiếu của synthetic-hw
(từ dòng lời giải đầu đến đáy trang); chỉ dùng trong eval để đo thành phần.
Không bổ sung/sửa box, chữ hay region của OCR bằng truth. Đây **không phải** kết
quả người dùng thật hoặc kết quả chấm cuối của app: 24 trang thiếu box cần đọc
lại crop, phép đo này không giả lập chữ của lượt crop. Số 96 gồm 28 dòng cũ và
68 dòng mới bị loại khi box thiếu hoặc không nằm trọn trong vùng tham chiếu.
Box hợp lệ về miền/hình dạng không bảo đảm vị trí đúng trên ảnh; không tuyên bố
đã khôi phục hết 30 dòng hay hết nguy cơ mất dòng.

Đo riêng nếu xác nhận **nguyên khung gợi ý từ OCR**, không kéo sửa: 30 dòng cũ
vẫn bị loại; tổng sau lọc là **54** (thêm 24), dòng hình lẫn **0**. Trang không có
khung giữ phân loại cũ trong phép đo này. Khung chỉ là đề xuất, có thể thiếu phần
bài làm; app hiển thị toàn ảnh để kéo/chỉnh và chưa cho chấm khi vùng còn chưa
xác nhận hoặc còn câu hỏi. Các số lọc này không thay cho lượt OCR crop và soát.

### Điểm 2 — đã thêm xác nhận vùng một chạm

- Dựng bao box hợp lệ của các dòng B gắn solution/table, cộng lề **24/1000** trang,
  chặn ở mép ảnh. Không tự áp dụng khung. Nút **“Đúng vùng này”** xác nhận khung
  hiện tại; có thể kéo trên ảnh để vẽ lại hoặc chỉnh bốn mép bằng số.
- Chỉ không có dòng solution/table nào có box hợp lệ mới bắt khoanh từ đầu.

| Nguyên nhân kích hoạt trong 31/37 trang cũ | Số trang |
|---|---:|
| Chỉ thiếu box hợp lệ | **10** |
| Chỉ regionConf < 0,85 | **2** |
| Cả hai | **14** |
| Không có dòng nào được nhận là solution/table, hai điều kiện trên không có | **5** |
| **Tổng** | **31** |

Sau sửa: **16/31** có khung để xác nhận một chạm; **15/31** phải khoanh từ đầu.
**6/37** vẫn không cần hỏi vùng như r1. Không đổi ngưỡng confidence để giảm số hỏi.
Test kiểm khung chưa được áp dụng trước xác nhận, có nút/khung sẵn, trường hợp
không dựng được khung, và xác nhận xong mới đi tiếp.

### Điểm 3 — đã chạy lại riêng 3 trang và thêm lối ra theo trang

Cùng B, binary Windows có sẵn, 768 px, 4 luồng, 1.536 token; request tối đa 180 s,
lượt đọc tối đa 300 s, toàn lệnh timeout 960 s. Tổng **408,183 s**, exit 0 của công
cụ, nhưng **0/3 lượt OCR thành công**. Không tự thử thêm hoặc đổi parser/token.

| Trang | Giây | reason | finish_reason |
|---|---:|---|---|
| 12-dijkstra-tied-order-dancing-straight | **133,727** | repetition_loop | length |
| 13-tsp-tied-student-tour-dancing-perspective | **138,794** | repetition_loop | length |
| 13-tsp-tied-student-tour-dancing-straight | **135,294** | repetition_loop | length |

Đây là lặp chữ được adapter phát hiện, server kết thúc vì giới hạn token; không
phải timeout. Log: `reports/.debug/4.4-r2-retries.log`; dữ liệu:
`reports/.debug/4.4-r2-retries.json`. Giữ nguyên phép đo 40 trang r1.

App lưu dấu trang lỗi và giữ các trang khác. Có nút **“Đọc lại trang này”** và
**“Gõ tay trang này”**. Gõ tay chỉ thay trang lỗi; các trang đã đọc giữ nguyên,
trang sau tiếp tục đọc. Trang gõ từ ảnh hiện cảnh báo không kiểm được mất dòng
và phải soát cả SAI lẫn ĐÚNG. Test kiểm cả nhánh thử lại, nhánh gõ một trang,
giữ checkpoint trước lỗi, đọc tiếp trang sau và các nút lối ra.

### Cổng sau sửa r2

- `npm test` bản cuối: **80 file pass; 2.169 test pass, 0 fail**. Vitest **52,93 s**;
  toàn lệnh gồm typecheck **58,103 s**, timeout cứng 180 s. Log:
  `reports/.debug/4.4-r2-npm-test-final.log`.
- `npm run build`: qua, **5,378 s**, log `4.4-r2-build-ts-verified.log`.
- `npx --no-install tsc --noEmit -p .../tsconfig.json`: core, reader, work,
  tools/eval và apps/mobile: **đều qua**, tổng **10,323 s**. Log:
  `reports/.debug/4.4-r2-typecheck-verified.log`.
- `npm run mobile:build`: **qua**, tổng **55,500 s**, Gradle `BUILD SUCCESSFUL in 34s`;
  JDK 21 của Android Studio, Gradle ép offline bằng init script tạm trong cache,
  gỡ sau build. APK: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
  Log: `reports/.debug/4.4-r2-mobile-build.log`. `git diff --check` sạch.
- Không mở file/mẫu test bị cấm, không sửa parser/core/dữ liệu chuẩn hay file bảo
  vệ, không tải/cài, không gọi adb, không làm Lô 4.5+, không commit.

### File tạo/sửa riêng cho r2

- Work: sửa `packages/work/src/regions.ts`, `src/index.ts`, `test/layout.test.ts`.
- Mobile: sửa `apps/mobile/src/flow/work-reading.ts`, `flow/sessionReducer.ts`,
  `flow/types.ts`, `WorkFlowScreen.tsx`, `WorkScreen.tsx`, `work.vi.ts`, `work.css`,
  `apps/mobile/test/work-flow.test.ts`.
- Eval: sửa `tools/eval/src/work-layout.ts`, `tools/eval/README.md`; tạo
  `tools/eval/retry-layout.mjs`.
- Cập nhật báo cáo này; JSON/log trong `reports/.debug` là bằng chứng chạy cục bộ.
  Script kiểm tra và ép Gradle offline tạm nằm trong `.build-cache`.

### Quyết định & giả định của r2

- Vùng thắng khi **toàn box nằm trong vùng**; không tự coi box giao một phần là
  lời giải. Ngưỡng valid box, confidence và detector mất dòng giữ nguyên.
- Thêm `WorkPageRead.suggestedRegion`, `failed`; event `work_restore`,
  `work_manual_page`. Lưu cùng checkpoint, không lưu pixel vào state.
- Khung gợi ý từ OCR không phải vùng đã xác nhận. Lề 24 và khoảng gần 80 là lựa
  chọn hình học chung, không chỉnh theo chữ test. Khôi phục chỉ thay phân loại,
  không tăng độ tin cậy chữ hay tự bỏ trạng thái gạch.
- Phép đo vùng tham chiếu là mô phỏng chọn vùng trong eval thành phần của Lô 4.4;
  không phải eval đầu–cuối Lô 4.7, không phải nghiệm thu ảnh thật. Thiếu box và
  box sai vị trí còn là giới hạn; số liệu được giữ nguyên dù chưa tốt.
