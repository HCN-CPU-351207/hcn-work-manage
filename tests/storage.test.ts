import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../electron/storage.ts';
import { createLogger } from '../electron/logger.ts';
import { emptyData } from '../src/core/model.ts';
import { mkThang } from './helpers.ts';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hcn-'));
const withThang = (ten: string) => ({ ...emptyData(), thang: [mkThang({ ten })] });

describe('ghi nguyên tử (3.4)', () => {
  it('ghi thành công và đọc lại', () => {
    const dir = tmp();
    const s = createStorage(dir);
    s.init();
    s.saveData(withThang('A'));
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8')).thang[0].ten).toBe('A');
    expect(fs.readdirSync(path.join(dir, 'tmp'))).toEqual([]);
  });
  it('lỗi giữa chừng (rename thất bại) thì data.json cũ không bị hỏng', () => {
    const dir = tmp();
    const good = createStorage(dir);
    good.init();
    good.saveData(withThang('CŨ'));
    const before = fs.readFileSync(path.join(dir, 'data.json'), 'utf8');
    const broken = createStorage(dir, {
      fsImpl: { ...fs, renameSync: () => { throw new Error('EPERM'); } } as typeof fs,
      renameRetries: 1
    });
    expect(() => broken.saveData(withThang('MỚI'))).toThrow('EPERM');
    expect(fs.readFileSync(path.join(dir, 'data.json'), 'utf8')).toBe(before);
    expect(JSON.parse(before).thang[0].ten).toBe('CŨ');
  });
  it('lỗi khi ghi file tạm cũng không đụng data.json', () => {
    const dir = tmp();
    const good = createStorage(dir);
    good.init();
    good.saveData(withThang('CŨ'));
    const before = fs.readFileSync(path.join(dir, 'data.json'), 'utf8');
    const broken = createStorage(dir, { fsImpl: { ...fs, writeSync: () => { throw new Error('ENOSPC'); } } as typeof fs });
    expect(() => broken.saveData(withThang('MỚI'))).toThrow('ENOSPC');
    expect(fs.readFileSync(path.join(dir, 'data.json'), 'utf8')).toBe(before);
  });
  it('rename lỗi tạm thời được thử lại', () => {
    const dir = tmp();
    let calls = 0;
    const flaky = {
      ...fs,
      renameSync: (a: fs.PathLike, b: fs.PathLike) => {
        if (calls++ < 2) throw new Error('EBUSY');
        fs.renameSync(a, b);
      }
    } as typeof fs;
    const s = createStorage(dir, { fsImpl: flaky, renameRetries: 3 });
    s.init();
    s.saveData(withThang('X'));
    expect(calls).toBe(3);
    expect(fs.existsSync(path.join(dir, 'data.json'))).toBe(true);
  });
  it('init dọn thư mục tmp', () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'tmp'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tmp', 'data.json.part'), 'rác');
    createStorage(dir).init();
    expect(fs.readdirSync(path.join(dir, 'tmp'))).toEqual([]);
  });
});

describe('khởi động', () => {
  it('lần đầu tạo data.json rỗng', () => {
    const dir = tmp();
    const s = createStorage(dir);
    s.init();
    expect(s.loadData().notice.kind).toBe('fresh');
    expect(fs.existsSync(path.join(dir, 'data.json'))).toBe(true);
  });
  it('data.json hỏng: đổi tên và khôi phục bản auto mới nhất', () => {
    const dir = tmp();
    const s = createStorage(dir, { now: () => new Date(2026, 9, 18, 9, 0, 0) });
    s.init();
    s.saveData(withThang('TỪ-BACKUP'));
    s.autoBackupIfNeeded(withThang('TỪ-BACKUP'));
    fs.writeFileSync(path.join(dir, 'data.json'), '{ hỏng');
    const r = s.loadData();
    expect(r.notice.kind).toBe('restored-from-backup');
    expect(r.data.thang[0].ten).toBe('TỪ-BACKUP');
    expect(fs.readdirSync(dir).some((n) => n.startsWith('data.corrupt-'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8')).thang[0].ten).toBe('TỪ-BACKUP');
  });
  it('data.json hỏng và không có backup: tạo mới và báo', () => {
    const dir = tmp();
    const s = createStorage(dir);
    s.init();
    fs.writeFileSync(path.join(dir, 'data.json'), 'xxx');
    const r = s.loadData();
    expect(r.notice.kind).toBe('corrupt-no-backup');
    expect(r.data.thang).toEqual([]);
  });
  it('schema mới hơn: giữ nguyên file, ném lỗi', () => {
    const dir = tmp();
    const s = createStorage(dir);
    s.init();
    fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ ...emptyData(), schemaVersion: 9 }));
    expect(() => s.loadData()).toThrow();
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8')).schemaVersion).toBe(9);
  });
});

describe('sao lưu', () => {
  it('mỗi ngày một bản auto, giữ 7 bản gần nhất', () => {
    const dir = tmp();
    let day = 1;
    const s = createStorage(dir, { now: () => new Date(2026, 9, day, 8, 0, 0) });
    s.init();
    for (day = 1; day <= 10; day++) {
      expect(s.autoBackupIfNeeded(withThang('a'))).not.toBeNull();
      expect(s.autoBackupIfNeeded(withThang('a'))).toBeNull(); // lần 2 trong ngày: bỏ qua
    }
    const files = s.listBackups('hcn-auto-');
    expect(files).toHaveLength(7);
    expect(files[0].startsWith('hcn-auto-20261004')).toBe(true);
  });
  it('trước cập nhật: giữ 3 bản', () => {
    const dir = tmp();
    const s = createStorage(dir);
    s.init();
    for (const v of ['1.0.1', '1.0.2', '1.0.3', '1.0.4']) s.preUpdateBackup(v, withThang('a'));
    expect(s.listBackups('hcn-pre-update-')).toEqual(['hcn-pre-update-v1.0.2.json', 'hcn-pre-update-v1.0.3.json', 'hcn-pre-update-v1.0.4.json']);
  });
  it('settings hỏng thì dùng mặc định', () => {
    const dir = tmp();
    const s = createStorage(dir);
    s.init();
    fs.writeFileSync(path.join(dir, 'settings.json'), '{{{');
    expect(s.loadSettings().language).toBe('vi');
    expect(s.loadSettings().theme).toBe('dark');
  });
});

describe('nhật ký', () => {
  it('xoay vòng khi quá dung lượng, tối đa 3 file', () => {
    const dir = tmp();
    const log = createLogger(dir, { maxBytes: 200 });
    for (let i = 0; i < 40; i++) log.info(`dòng số ${i} `.padEnd(30, '.'));
    expect(fs.readdirSync(dir).sort()).toEqual(['app.log', 'app.log.1', 'app.log.2']);
  });
});
