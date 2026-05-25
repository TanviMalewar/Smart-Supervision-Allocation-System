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

/**
 * GET /api/report/date-wise
 * Returns allocations grouped by date → session → exam,
 * each exam listing all assigned faculties and their allocation type.
 */
router.get('/date-wise', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('allocations')
    .select(`
      faculty:faculty_id (id, name, department, designation, employment_type, phone),
      exam:exam_id (date, session, subject_name, course_code, subject_faculty_name)
    `);
  if (error) return res.status(500).json({ error: error.message });

  // Build a nested map: date → session → courseCode → { examMeta, faculties[] }
  const dateMap = {};
  for (const r of data) {
    if (!r.faculty || !r.exam) continue;
    const { date, session, subject_name, course_code, subject_faculty_name } = r.exam;
    const dateLabel = formatDate(date);
    const rawDate   = date;

    if (!dateMap[rawDate]) dateMap[rawDate] = { label: dateLabel, rawDate, sessions: {} };
    if (!dateMap[rawDate].sessions[session]) dateMap[rawDate].sessions[session] = {};

    const key = course_code || subject_name;
    if (!dateMap[rawDate].sessions[session][key]) {
      dateMap[rawDate].sessions[session][key] = {
        courseCode: course_code,
        courseName: subject_name,
        time: sessionToTime(session),
        faculties: [],
      };
    }
    const allocType = r.faculty.name.trim() === (subject_faculty_name || '').trim()
      ? 'Subject Faculty' : 'Other Faculty';
    const facList = dateMap[rawDate].sessions[session][key].faculties;
    const facKey  = (r.faculty.name || '').trim().toLowerCase();
    // Skip if this faculty (by normalised name) is already listed for this exam
    if (!facList.some(f => (f.name || '').trim().toLowerCase() === facKey)) {
      facList.push({
        name:           r.faculty.name.trim(),
        department:     r.faculty.department,
        designation:    r.faculty.designation,
        employmentType: r.faculty.employment_type,
        phone:          r.faculty.phone || '',
        allocationType: allocType,
      });
    }
  }

  // Convert to sorted array
  const result = Object.values(dateMap)
    .sort((a, b) => a.rawDate.localeCompare(b.rawDate))
    .map(d => ({
      date:     d.label,
      rawDate:  d.rawDate,
      sessions: ['FN', 'AN']
        .filter(s => d.sessions[s])
        .map(s => ({
          session: s,
          time:    sessionToTime(s),
          exams:   Object.values(d.sessions[s]),
        })),
    }));

  res.json(result);
});

/**
 * GET /api/report/faculty-wise
 * Returns allocations grouped by faculty,
 * each faculty listing all dates + exams they're assigned to.
 */
router.get('/faculty-wise', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('allocations')
    .select(`
      faculty:faculty_id (id, name, department, designation, employment_type, phone),
      exam:exam_id (date, session, subject_name, course_code, subject_faculty_name)
    `);
  if (error) return res.status(500).json({ error: error.message });

  // Group by normalised name so duplicate DB records are merged into one card
  const facultyMap = {};
  for (const r of data) {
    if (!r.faculty || !r.exam) continue;
    // Normalise: trim + lowercase → merge duplicates with same name
    const key = (r.faculty.name || '').trim().toLowerCase();
    if (!facultyMap[key]) {
      facultyMap[key] = {
        name:           r.faculty.name.trim(),
        department:     r.faculty.department,
        designation:    r.faculty.designation,
        employmentType: r.faculty.employment_type,
        phone:          r.faculty.phone || '',
        assignments:    [],
      };
    }
    const allocType = r.faculty.name.trim() === (r.exam.subject_faculty_name || '').trim()
      ? 'Subject Faculty' : 'Other Faculty';

    // Avoid adding the exact same duty twice (same date+session+course)
    const dupKey = `${r.exam.date}|${r.exam.session}|${r.exam.course_code}`;
    const alreadyAdded = facultyMap[key].assignments.some(
      a => `${a.rawDate}|${a.session}|${a.courseCode}` === dupKey
    );
    if (!alreadyAdded) {
      facultyMap[key].assignments.push({
        date:           formatDate(r.exam.date),
        rawDate:        r.exam.date,
        session:        r.exam.session,
        time:           sessionToTime(r.exam.session),
        courseCode:     r.exam.course_code,
        courseName:     r.exam.subject_name,
        allocationType: allocType,
      });
    }
  }

  // Sort each faculty's assignments by date → session
  const result = Object.values(facultyMap)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(f => ({
      ...f,
      assignments: f.assignments.sort((a, b) =>
        a.rawDate !== b.rawDate
          ? a.rawDate.localeCompare(b.rawDate)
          : a.session.localeCompare(b.session)
      ),
    }));

  res.json(result);
});

module.exports = router;
