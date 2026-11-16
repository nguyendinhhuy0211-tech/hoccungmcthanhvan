# Học cùng MC Thanh Vân — Tiếng Anh cho MC

Web học tiếng Anh dẫn chương trình cho MC Thanh Vân. Trang tĩnh (HTML/CSS/JS),
không cần backend, deploy thẳng lên Vercel.

## Nội dung

- 7 chủ đề sân khấu: Khai mạc & chào đón, Giới thiệu đại biểu, Khai trương &
  khánh thành, Gala Dinner, Hội thảo, Chuyển ý / xử lý sự cố & kết thúc, Đám cưới
- 56 câu mẫu (8/chủ đề): câu tiếng Anh, nghĩa tiếng Việt, gợi ý phát âm, mẹo dùng
- 14 kịch bản tình huống (2/chủ đề, mỗi kịch bản 3 câu theo đúng thứ tự xử lý)
- Câu sân khấu mỗi ngày, chuỗi ngày học (streak), đánh dấu Đã thuộc / Ôn lại sau
- Ôn tập dạng flashcard, Sổ tay lưu câu của riêng bạn
- Ghép câu dẫn nhanh theo loại sự kiện và khoảnh khắc (thay cho phần luyện AI
  cần máy chủ — mọi thứ chạy ngay trên trình duyệt)

## Cách hoạt động

- Tiến độ học, chuỗi ngày và sổ tay lưu trong `localStorage` trên thiết bị
  của người học (mở lại vẫn còn).
- Giọng đọc chính là Google TTS (giọng tiếng Anh tự nhiên, phát qua thẻ
  `<audio>`, câu dài tự chia nhỏ dưới 180 ký tự mỗi lượt); nếu Google lỗi
  thì tự chuyển sang giọng nữ tiếng Anh của máy (`speechSynthesis`).
  Nút “Nghe chậm” luôn dùng giọng trên máy ở tốc độ 0.7; bấm lại nút đang
  phát để dừng.
- Không dùng file âm thanh MP3: GitHub snapshot-push không nhận file nhị phân,
  nên toàn bộ giọng đọc chạy qua mạng để web luôn phát được trên điện thoại.

## Chạy thử

Mở `index.html` qua một máy chủ tĩnh bất kỳ, ví dụ:

```bash
python3 -m http.server 8000
```

rồi mở http://localhost:8000

## Deploy

Vercel → Add New → Project → Import Git Repository `hoccungmcthanhvan`
(không cần build command, đây là trang tĩnh).
