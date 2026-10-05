import ExcelJS from 'exceljs';

export async function exportWorkbook({ monthLabel, rekap, statsJadwal, statsAnggota, detailIzin, statistikIzin, alphaRows, materiRows, liburRows, khususRows }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Absensi Muda-Mudi Gemurung 2';
  wb.created = new Date();

  function addSheet(name, columns, rows) {
    const ws = wb.addWorksheet(name);
    ws.columns = columns.map((c) => ({ header: c, key: c, width: 18 }));
    rows.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
    return ws;
  }

  if (rekap?.columns) addSheet('01 - Rekap Kehadiran', rekap.columns, rekap.rows);
  if (statsJadwal) addSheet('03 - Statistik Jadwal', ['Jadwal', 'Hadir', 'Izin', 'Alpha'], statsJadwal);
  if (statsAnggota) addSheet('04 - Statistik Anggota', ['Nama', 'Hadir', 'Izin', 'Alpha', 'Persen Hadir'], statsAnggota);
  if (detailIzin) addSheet('05 - Detail Izin', ['Nama', 'Jadwal', 'Jenis Izin'], detailIzin);
  if (statistikIzin) addSheet('06 - Statistik Izin', statistikIzin.columns, statistikIzin.rows);
  if (alphaRows) addSheet('07 - Alpha', ['Nama', 'Jadwal'], alphaRows);
  if (materiRows) addSheet('08 - Materi', ['Jadwal', 'Jenis', 'Isi', 'Pemateri'], materiRows);
  if (liburRows) addSheet('09 - Jadwal Libur', ['Tanggal', 'Hari', 'Alasan'], liburRows);
  if (khususRows) addSheet('10 - Pengajian Khusus', ['Kegiatan', 'Tanggal', 'Hadir', 'Izin', 'Alpha'], khususRows);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Absensi-Gemurung2-${monthLabel.replace(/\s+/g, '-')}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function exportOccurrenceWorkbook({ title, info, summary, detail, izinRows, materiRows }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Absensi Muda-Mudi Gemurung 2';
  wb.created = new Date();

  function addSheet(name, columns, rows) {
    const ws = wb.addWorksheet(name);
    ws.columns = columns.map((c) => ({ header: c, key: c, width: 20 }));
    (rows || []).forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
    return ws;
  }

  addSheet('Ringkasan', ['Field', 'Nilai'], info || []);
  if (summary) addSheet('Ringkasan Angka', ['Total Anggota', 'Hadir', 'Persen Hadir', 'Izin', 'Persen Izin', 'Alpha', 'Persen Alpha'], [summary]);
  if (detail) addSheet('Detail Kehadiran', ['Nama Lengkap', 'Nama Panggilan', 'Gender', 'Kategori', 'Status', 'Jenis Izin'], detail);
  if (izinRows) addSheet('Detail Izin', ['Nama', 'Jenis Izin'], izinRows);
  if (materiRows) addSheet('Materi', ['Jenis', 'Isi', 'Pemateri'], materiRows);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${title || 'Detail-Pengajian'}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
