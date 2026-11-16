# MC Academy — Học tiếng Anh cho MC cùng Thanh Vân

Web học tiếng Anh dẫn chương trình cho MC Thanh Vân, theo hướng
“MC Academy”: sidebar điều hướng, Tổng quan với tiến độ thật, lộ trình
4 giai đoạn, 7 khóa học theo chủ đề sân khấu. Trang tĩnh (HTML/CSS/JS),
không cần backend, deploy thẳng lên Vercel.

## Nội dung (dùng lại kho bài học cũ, không viết lại)

- 7 chủ đề sân khấu: Khai mạc & chào đón, Giới thiệu đại biểu, Khai trương &
  khánh thành, Gala Dinner, Hội thảo, Chuyển ý / xử lý sự cố & kết thúc, Đám cưới
- 140 câu mẫu (20/chủ đề): câu tiếng Anh, nghĩa tiếng Việt, gợi ý phát âm, mẹo dùng
- 70 kịch bản tình huống (10/chủ đề, mỗi kịch bản 3 câu theo đúng thứ tự xử lý)
- 12 kịch bản chương trình đầy đủ trong `programs.json` (5 đám cưới phong cách khác nhau + Year End Party, Khai trương, Khánh thành, Gala Dinner, Hội thảo, Lễ khai mạc, Lễ khởi công; mỗi chương trình 4 mục × 5 câu, 240 câu), dùng trong Teleprompter: chọn chương trình là xem toàn bộ kịch bản từ mở đầu đến kết tiệc, kèm giọng đọc mẫu.
- 1000 từ vựng chuyên ngành MC trong `vocab.json`: 10 chủ đề × 100 từ
  (từ đơn + cụm từ ngắn, kèm IPA, nghĩa tiếng Việt và câu ví dụ), học bằng
  flashcard có lật thẻ, nghe phát âm, xáo trộn và đánh dấu “Đã thuộc”

## 14 mục trong sidebar

1. Tổng quan — hero sân khấu, vòng tiến độ thật (câu đã thuộc / 140),
   4 thanh kỹ năng tính từ dữ liệu thật (từ vựng, luyện nghe, phát âm,
   phản xạ), câu sân khấu hôm nay, câu cần ôn lại, Sổ tay.
2. Lộ trình học — 4 giai đoạn (Nền tảng → Sân khấu cơ bản → Sự kiện
   thực tế → MC chuyên nghiệp), mỗi giai đoạn gồm các chủ đề và % hoàn thành.
3. Khóa học — 7 chủ đề dạng khóa học, bấm vào xem câu mẫu + kịch bản.
4. Từ vựng — flashcard 1000 từ vựng chuyên ngành MC (lọc theo 10 chủ đề,
   xáo trộn, lật thẻ xem nghĩa + câu ví dụ, nghe từng từ, đánh dấu “Đã thuộc”
   lưu riêng); tab “Câu mẫu theo chủ đề” giữ danh sách thẻ từ cũ có tìm kiếm.
5. Mẫu câu MC — 140 câu mẫu, lọc theo chủ đề, chế độ danh sách / flashcard.
6. Luyện nghe — nghe câu tiếng Anh rồi chọn nghĩa tiếng Việt đúng (4 đáp án).
7. Luyện nói — nghe mẫu, thu âm giọng của bạn (micro), nghe lại, tự chấm
   Đạt / Chưa đạt. Không cho phép micro vẫn nghe mẫu và tự chấm được.
8. Kho kịch bản — 70 kịch bản, nghe từng câu và đọc cả kịch bản.
9. AI MC Coach — mẹo dẫn theo từng chủ đề, checklist lỗi thường gặp,
   và công cụ Ghép câu dẫn nhanh (chạy ngay trên máy, không dùng AI máy chủ).
10. Sân khấu ảo — tập dẫn toàn màn hình với kịch bản, bấm giờ, ghi số buổi tập.
11. Teleprompter — máy nhắc chữ: chọn 1 trong 12 kịch bản chương trình đầy đủ (5 đám cưới + 7 loại sự kiện khác), chỉnh tốc độ cuộn và cỡ chữ.
12. AI Script Studio — soạn trọn kịch bản dẫn (mở đầu → giới thiệu khách →
    chuyển ý → kết thúc) từ mẫu có sẵn, nghe từng câu, sao chép toàn bộ.
13. Kiểm tra — 10 câu/lượt, 3 dạng (Anh→Việt, Việt→Anh, điền từ), lưu điểm cao nhất.
14. Tiến độ học — chuỗi ngày, số câu đã thuộc, tiến độ từng chủ đề, điểm kiểm
    tra, thống kê nghe / nói / sân khấu ảo.

## Cách hoạt động

- Tiến độ học, chuỗi ngày, sổ tay và mọi thống kê lưu trong `localStorage`
  trên thiết bị của người học (mở lại vẫn còn). Khóa lưu trữ cũ được giữ
  nguyên: mc_known_v1, mc_review_v1, mc_days_v1, mc_notes_v1.
  Từ vựng flashcard dùng khóa mới riêng: mc_vocab_known_v1.
- Giọng đọc chính là bản thu sẵn giọng nữ Aria (`avocado_v2:MAI_01`),
  nhúng trong `audio-data.js` + `audio-data-2.js` + `audio-data-3.js` +
  `audio-data-4.js` (350 câu: 140 câu mẫu + 210 câu kịch bản,
  dạng data URI, ~15.5 MB tổng cộng, mỗi file dưới 4.2 MB) và
  `audio-data-5.js` + `audio-data-6.js` + `audio-data-7.js` +
  `audio-data-8.js` (240 câu của 12 kịch bản chương trình đầy đủ,
  ~13.2 MB tổng cộng, mỗi file dưới 3.6 MB). Bấm Nghe là phát thẳng bản thu, không phụ
  thuộc Google hay giọng máy. Câu nào chưa có bản thu (từ vựng flashcard,
  câu tự gõ trong Sổ tay / Ghép câu) thì dùng Google TTS (giọng tiếng Anh
  tự nhiên, phát qua thẻ `<audio>`, câu dài tự chia nhỏ dưới 180 ký tự
  mỗi lượt). BẮT BUỘC đặt `referrerPolicy = 'no-referrer'` cho thẻ audio:
  Google trả 404 khi request mang Referer của chính trang web này (đã
  kiểm chứng bằng curl). Nếu Google lỗi hoặc tải kẹt quá 6 giây (watchdog)
  thì tự chuyển sang giọng nữ tiếng Anh của máy (`speechSynthesis`), và
  các lần bấm sau trong phiên đó đi thẳng giọng máy. Nút “Nghe chậm” luôn
  dùng giọng trên máy ở tốc độ 0.7; bấm lại nút đang phát để dừng.
- Ảnh hero là ảnh chân dung của MC (do người dùng gửi, resize 1200px
  JPEG q78, nhúng base64 trong `index.html`); nếu ảnh không tải được
  thì nền gradient sân khấu vẫn hiển thị.
- Không dùng file âm thanh hay ảnh nhị phân trong repo: GitHub
  snapshot-push không nhận file nhị phân.

## Chạy thử

Mở `index.html` qua một máy chủ tĩnh bất kỳ, ví dụ:

```bash
python3 -m http.server 8000
```

rồi mở http://localhost:8000

Kiểm tra cú pháp JS trước khi đẩy:

```bash
node --check app.js
```

## Deploy

Vercel → Add New → Project → Import Git Repository `hoccungmcthanhvan`
(không cần build command, đây là trang tĩnh). Vercel tự deploy khi push lên main.
