// backend/routes/report.js
// ============================================================
// OUTPUT FORMAT:
//   Course Code | Course Name | Day and Date | Time | 
//   Faculty Name | Mobile No.
// ============================================================
const express  = require('express');
const router   = express.Router();
const supabase = require('../supabaseClient');
const { authenticate } = require('../middleware/auth');

// Rebuild "Day and Date" string from YYYY-MM-DD
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDate(isoDate) {
  if (!isoDate) return '';
  const [yyyy, mm, dd] = isoDate.split('-');
  const d = new Date(`${isoDate}T00:00:00`);
  return `${DAYS[d.getDay()]}, ${dd}/${mm}/${yyyy}`;
}

// Rebuild time string from session
function sessionToTime(session) {
  return session === 'FN' ? '10.30 AM to 12.30 PM' : '03.00 PM to 05.00 PM';
}

/**
 * GET /api/report?format=json|csv&faculty_id=xxx
 * Returns allocations in the requested output format.
 */
router.get('/', authenticate, async (req, res) => {
  const { format = 'json', faculty_id } = req.query;

  let query = supabase
    .from('allocations')
    .select(`
      faculty:faculty_id (name, department, designation, employment_type, duty_count, email, phone),
      exam:exam_id (date, session, subject_name, course_code, rooms_required, subject_faculty_name, subject_faculty_mobile)
    `);

  if (faculty_id) query = query.eq('faculty_id', faculty_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Flatten into output format
  const flat = data
    .filter(r => r.faculty && r.exam)
    .map(r => ({
      'Course Code':   r.exam.course_code,
      'Course Name':   r.exam.subject_name,
      'Day and Date':  formatDate(r.exam.date),
      'Time':          sessionToTime(r.exam.session),
      'Faculty Name':  r.faculty.name,
      'Mobile No.':    r.faculty.phone || '',
      // Extra fields (visible in JSON, included in CSV)
      'Department':    r.faculty.department,
      'Designation':   r.faculty.designation,
      'Employment Type': r.faculty.employment_type,
      'Subject Faculty': r.exam.subject_faculty_name || '',
      'Is Subject Faculty': r.faculty.name === r.exam.subject_faculty_name ? 'YES' : '',
    }));

  // Sort by date → session → course code
  flat.sort((a, b) => {
    const da = a['Day and Date'], db = b['Day and Date'];
    if (da !== db) return da.localeCompare(db);
    const ta = a['Time'], tb = b['Time'];
    if (ta !== tb) return ta.localeCompare(tb);
    return a['Course Code'].localeCompare(b['Course Code']);
  });

  if (format === 'csv') {
    // Primary columns first (matches requested output format)
    const cols = [
      'Course Code', 'Course Name', 'Day and Date', 'Time',
      'Faculty Name', 'Mobile No.', 'Department', 'Designation',
      'Employment Type', 'Subject Faculty', 'Is Subject Faculty',
    ];
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      cols.join(','),
      ...flat.map(r => cols.map(c => escape(r[c])).join(','))
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="invigilation_allocation_${Date.now()}.csv"`);
    return res.send(csv);
  }

  res.json({ total: flat.length, data: flat });
});

/**
 * GET /api/report/summary — per-faculty duty count
 */
router.get('/summary', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('faculty')
    .select('id, name, department, designation, employment_type, duty_count, max_duty, phone')
    .order('duty_count', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
