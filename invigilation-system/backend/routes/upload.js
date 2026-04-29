// backend/routes/upload.js
// ============================================================
// Parses the institution timetable CSV/Excel.
//
// INPUT FORMAT (your actual file):
//   Sr. No. | Code | Course Name | Day and Date | Time |
//   Student Count | Faculty Name | Mobile No. | Count (+10) | COUNT
//
// KEY LOGIC:
//   - "Faculty Name" in the CSV = the subject teacher for that exam
//     → stored in exams.subject_faculty_name + exams.subject_faculty_mobile
//   - rooms_required = ceil(COUNT / 36)  [36 students per room]
//   - session: AM start → FN, PM start → AN
//   - date: "Thursday, 07/05/2026" → "2026-05-07"
// ============================================================
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const Papa     = require('papaparse');
const XLSX     = require('xlsx');
const supabase = require('../supabaseClient');
const { authenticate, requireAdmin } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    ['csv','xls','xlsx'].includes(ext) ? cb(null, true) : cb(new Error('CSV/Excel only'));
  },
});

// "Thursday, 07/05/2026" → "2026-05-07"
function parseDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// "10.30 AM to 12.30 PM" → FN,  "03.00 PM ..." → AN
function parseSession(t) {
  if (!t) return 'FN';
  const u = String(t).toUpperCase().trim();
  const m = u.match(/^(\d+)[.:]\d+\s*(AM|PM)/);
  return m ? (m[2] === 'AM' ? 'FN' : 'AN') : 'FN';
}

// ceil(n / 36), min 1
function calcRooms(n) {
  const v = parseInt(n, 10);
  return isNaN(v) || v <= 0 ? 1 : Math.max(1, Math.ceil(v / 36));
}

// Flexible column getter (case-insensitive, trimmed)
function get(row, ...keys) {
  for (const k of keys) {
    for (const rk of Object.keys(row)) {
      if (rk.trim().toLowerCase() === k.toLowerCase()) {
        const v = row[rk];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      }
    }
  }
  return null;
}

function normaliseRow(row) {
  const date    = parseDate(get(row, 'Day and Date', 'date', 'Date'));
  const time    = get(row, 'Time', 'time');
  const code    = get(row, 'Code', 'code', 'course_code', 'Course Code');
  const name    = get(row, 'Course Name', 'course name', 'subject_name', 'Subject Name', 'subject');
  const count   = get(row, 'COUNT', 'count', 'Student Count', 'student count', 'students');
  const facName = get(row, 'Faculty Name', 'faculty name', 'faculty');
  const facMob  = get(row, 'Mobile No.', 'Mobile No', 'mobile no', 'mobile', 'Mobile');
  const session = parseSession(time);

  if (!date || !code || !name) return null;

  return {
    date,
    session,
    subject_name:           name,
    course_code:            code.toUpperCase(),
    rooms_required:         calcRooms(count),
    subject_faculty_name:   facName || null,
    subject_faculty_mobile: facMob  || null,
  };
}

router.post('/', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = req.file.originalname.split('.').pop().toLowerCase();
  let rawRows = [];

  try {
    if (ext === 'csv') {
      const result = Papa.parse(req.file.buffer.toString('utf-8'), { header: true, skipEmptyLines: true });
      rawRows = result.data;
    } else {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    }
  } catch (e) {
    return res.status(400).json({ error: `Parse failed: ${e.message}` });
  }

  const valid = rawRows.map(normaliseRow).filter(Boolean);

  if (valid.length === 0)
    return res.status(400).json({ error: 'No valid rows found. Check column headers.' });

  const { data, error } = await supabase.from('exams').insert(valid).select();
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    message:      `Imported ${data.length} exam records`,
    imported:     data.length,
    total_parsed: rawRows.length,
    skipped:      rawRows.length - valid.length,
    sample:       data.slice(0, 3),
  });
});

module.exports = router;
