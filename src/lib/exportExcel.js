import ExcelJS from 'exceljs';
import { dayName, MONTHS } from './dates.js';

const HEADER_FILL = 'FFE0F2FE';
const HEADER_FONT = 'FF0F172A';
const ZEBRA_FILL = 'FFF8FAFC';
const GRID_BORDER = 'FF000000';
const IZIN_FILL = 'FFFEF3C7';
const ALPHA_FILL = 'FFFEE2E2';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function downloadWorkbook(wb, filename) {
  return wb.xlsx.writeBuffer().then((buf) => {
    const blob = new Blob([buf], { type: MIME });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
}

function safeFilename(s, max = 60) {
  const clean = String(s || '')
    .replace(/[\\/":*?<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
  return clean || 'Pengajian';
}

export function occurrenceFilename(occ) {
  const d = new Date(`${occ.dateISO}T00:00:00`);
  const when = Number.isNaN(d.getTime())
    ? String(occ.dateISO || '').slice(0, 10)
    : `${dayName(occ.dateISO)} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const who = occ.kind === 'khusus' ? safeFilename(occ.eventName) : 'Absensi Mumi Kelompok';
  return `${who} - ${when}.xlsx`;
}

function widthFor(header) {
  const h = String(header);
  if (/^(no|#)$/i.test(h)) return [5, 8];
  if (/nama lengkap/i.test(h)) return [15, 35];
  if (/nama/i.test(h)) return [12, 30];
  if (/tanggal/i.test(h)) return [12, 16];
  if (/status/i.test(h)) return [10, 18];
  if (/jenis|kegiatan|isi|materi|alasan|catatan|jadwal/i.test(h)) return [15, 35];
  return [10, 25];
}

function alignFor(header) {
  const h = String(header);
  if (/^(no|#)$/i.test(h) || /^\d+$/.test(h)) return 'center';
  if (/nama/i.test(h)) return 'left';
  if (/gender/i.test(h)) return 'center';
  if (/kategori/i.test(h)) return 'left';
  if (/hadir|izin|alpha|jumlah|total|persen|%/i.test(h)) return 'center';
  if (/tanggal|hari|jam|status/i.test(h)) return 'center';
  return 'left';
}

function wrapFor(header) {
  return /nama|jenis|kegiatan|isi|materi|catatan|alasan|jadwal|nilai|field/i.test(String(header));
}

function statusFillOf(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'IZIN') return IZIN_FILL;
  if (v === 'ALPHA') return ALPHA_FILL;
  return null;
}

function tableBorder() {
  const side = { style: 'thin', color: { argb: GRID_BORDER } };
  return { top: side, left: side, bottom: side, right: side };
}

function applyTableBorders(worksheet, startRow, endRow, startCol, endCol) {
  for (let r = startRow; r <= endRow; r += 1) {
    for (let c = startCol; c <= endCol; c += 1) {
      worksheet.getRow(r).getCell(c).border = tableBorder();
    }
  }
}

export function addTableSheet(wb, name, columns, rows, opts = {}) {
  const { numbered = false, statusColumn = null, zebra = true } = opts;
  const cols = numbered ? ['No', ...columns] : [...columns];
  const data = (rows || []).map((r, i) => (numbered ? [i + 1, ...r] : [...r]));
  const ws = wb.addWorksheet(String(name).slice(0, 31));
  ws.columns = cols.map((c) => ({ header: c, key: c }));
  data.forEach((r) => ws.addRow(r));

  const nCols = cols.length;
  const nRows = data.length + 1;
  const statusIdx = statusColumn != null
    ? statusColumn + (numbered ? 1 : 0)
    : cols.findIndex((c) => /^status$/i.test(String(c)));

  const widths = cols.map((c, ci) => {
    const [min, max] = widthFor(c);
    let longest = String(c).length;
    for (const r of data) {
      const len = String(r[ci] ?? '').length;
      if (len > longest) longest = len;
    }
    return Math.min(max, Math.max(min, longest + 2));
  });
  widths.forEach((w, ci) => { ws.getColumn(ci + 1).width = w; });

  for (let r = 1; r <= nRows; r += 1) {
    const row = ws.getRow(r);
    const isHeader = r === 1;
    let statusFill = null;
    if (!isHeader && statusIdx >= 0) statusFill = statusFillOf(row.getCell(statusIdx + 1).value);
    for (let c = 1; c <= nCols; c += 1) {
      const cell = row.getCell(c);
      cell.alignment = {
        vertical: 'middle',
        horizontal: isHeader ? 'center' : alignFor(cols[c - 1]),
        wrapText: isHeader || wrapFor(cols[c - 1]),
      };
      if (isHeader) {
        cell.font = { bold: true, color: { argb: HEADER_FONT } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      } else if (statusFill) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFill } };
      } else if (zebra && r % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } };
      }
    }
  }
  applyTableBorders(ws, 1, nRows, 1, nCols);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

export async function exportWorkbook({ monthLabel, rekap, statsJadwal, statsAnggota, detailIzin, statistikIzin, alphaRows, materiRows, liburRows, khususRows }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Absensi Muda-Mudi Gemurung 2';
  wb.created = new Date();

  if (rekap?.columns) addTableSheet(wb, '01 - Rekap Kehadiran', rekap.columns, rekap.rows, { numbered: true });
  if (statsJadwal) addTableSheet(wb, '03 - Statistik Jadwal', ['Jadwal', 'Hadir', 'Izin', 'Alpha'], statsJadwal);
  if (statsAnggota) addTableSheet(wb, '04 - Statistik Anggota', ['Nama', 'Hadir', 'Izin', 'Alpha', 'Persen Hadir'], statsAnggota, { numbered: true });
  if (detailIzin) addTableSheet(wb, '05 - Detail Izin', ['Nama', 'Jadwal', 'Jenis Izin'], detailIzin, { numbered: true });
  if (statistikIzin) addTableSheet(wb, '06 - Statistik Izin', statistikIzin.columns, statistikIzin.rows);
  if (alphaRows) addTableSheet(wb, '07 - Alpha', ['Nama', 'Jadwal'], alphaRows, { numbered: true });
  if (materiRows) addTableSheet(wb, '08 - Materi', ['Jadwal', 'Jenis', 'Isi', 'Pemateri'], materiRows);
  if (liburRows) addTableSheet(wb, '09 - Jadwal Libur', ['Tanggal', 'Hari', 'Alasan'], liburRows);
  if (khususRows) addTableSheet(wb, '10 - Pengajian Khusus', ['Kegiatan', 'Tanggal', 'Hadir', 'Izin', 'Alpha'], khususRows);

  await downloadWorkbook(wb, `Absensi-Gemurung2-${monthLabel.replace(/\s+/g, '-')}.xlsx`);
}

export async function exportOccurrenceWorkbook({ title, occ, info, summary, detail, izinRows, materiRows }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Absensi Muda-Mudi Gemurung 2';
  wb.created = new Date();

  addTableSheet(wb, 'Ringkasan', ['Field', 'Nilai'], info || [], { zebra: false });
  if (summary) addTableSheet(wb, 'Ringkasan Absensi', ['Total Anggota', 'Hadir', 'Persen Hadir', 'Izin', 'Persen Izin', 'Alpha', 'Persen Alpha'], [summary]);
  if (detail) addTableSheet(wb, 'Detail Kehadiran', ['Nama Lengkap', 'Nama Panggilan', 'Gender', 'Kategori', 'Status', 'Jenis Izin'], detail, { numbered: true, statusColumn: 4 });
  if (izinRows) addTableSheet(wb, 'Detail Izin', ['Nama', 'Jenis Izin'], izinRows, { numbered: true });
  if (materiRows) addTableSheet(wb, 'Materi', ['Jenis', 'Isi', 'Pemateri'], materiRows);

  const filename = occ && occ.dateISO ? occurrenceFilename(occ) : `${title || 'Detail-Pengajian'}.xlsx`;
  await downloadWorkbook(wb, filename);
}
