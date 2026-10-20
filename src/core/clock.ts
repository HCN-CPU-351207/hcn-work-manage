// Đồng hồ dùng để đóng dấu giờ sửa. Nếu giờ máy lệch giờ Google quá 2 phút, đồng bộ Drive đặt độ lệch
// để mọi dấu giờ sửa trên máy này theo giờ Google (tránh chọn nhầm bản "mới hơn").
let offset = 0;
export const clockNow = (): number => Date.now() + offset;
export const clockOffset = (): number => offset;
export function setClockOffset(ms: number): void {
  offset = Number.isFinite(ms) ? ms : 0;
}
