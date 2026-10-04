export const DEFAULT_ABSENCE = ['Sakit','Sekolah','Kuliah','Kerja','Di luar kota'];
export const DEFAULT_STATUS = ['Sekolah','Kuliah','Bekerja'];
export const DEFAULT_HADITH = ['Hadist Adab','Hadist Kitabush Shalah','Hadist Jannah Wannaar'];
export const DEFAULT_FREE = ['Olahraga (Badminton)','ASAD','Keakraban','Musyawarah Terbuka','Door to Door'];
export const DEFAULT_SPECIAL_TYPES = ['Pengajian Muda Mudi Desa Sruni 1','FGD Muda Mudi Desa Sruni 1','Pengajian Muda Mudi Daerah Sidoarjo Tengah'];
export const DEFAULT_SPEAKERS = ['Cak Sulthon','Cak Fardhan','Mas Rehan','Cak Tian','Mbak Ovy','Mbak Yoshi','Mbak Dhini','Mbak Sabrina'];
export const MEMBER_CATEGORIES = ['PRA NIKAH','PRA REMAJA','REMAJA','DEWASA'];

export function guestSeed() {
  const males = [
    { full_name: 'Rizal Maulana', nickname: 'Rizal', gender: 'MALE' },
    { full_name: 'Budi Santoso', nickname: 'Budi', gender: 'MALE' },
    { full_name: 'Andi Pratama', nickname: 'Andi', gender: 'MALE' },
    { full_name: 'Fajar Nugroho', nickname: 'Fajar', gender: 'MALE' },
  ];
  const females = [
    { full_name: 'Aisyah Putri', nickname: 'Aisyah', gender: 'FEMALE' },
    { full_name: 'Siti Rahma', nickname: 'Siti', gender: 'FEMALE' },
    { full_name: 'Fatimah Zahra', nickname: 'Fatimah', gender: 'FEMALE' },
    { full_name: 'Nadia Safitri', nickname: 'Nadia', gender: 'FEMALE' },
  ];
  return [...males, ...females];
}
