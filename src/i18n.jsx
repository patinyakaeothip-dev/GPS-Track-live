// i18n.jsx — Thai/English strings for the tracker
const STR = {
  th: {
    event_label: 'งานซ้อมวิ่งเทรล',
    event_name: 'Rayong Trail Running · งานซ้อม',
    race_time: 'เวลา',
    elapsed: 'ผ่านไป',
    flag_alert: 'ALERT',
    flag_ok: 'ปลอดภัย',

    // KPIs
    kpi_total:     'นักวิ่งทั้งหมด',
    kpi_total_sub: '29K · 22K · 11K',
    kpi_on_course: 'อยู่บนเส้นทาง',
    kpi_finished:  'เข้าเส้นชัยแล้ว',
    kpi_at_rest:   'พักที่จุดพัก',
    kpi_dnf:       'DNF / ถอน',
    kpi_upgraded:  'อัพเกรดระยะ',
    kpi_alerts:    'ต้องเช็คด่วน',
    kpi_alerts_sub:'> 35 นาทีไม่ติด',

    // Status
    s_on_course: 'กำลังวิ่ง',
    s_slow:      'ช้ากว่าเฉลี่ย',
    s_rest:      'อยู่จุดพัก',
    s_missing:   'ต้องเช็ค',
    s_finished:  'เข้าเส้น',
    s_dnf:       'DNF',
    s_pending:   'ยังไม่ออกตัว',

    // Checkpoints
    cp_start:  'จุดสตาร์ท',
    cp_a1_out: 'A1 · ขาไป',
    cp_a2_in:  'A2 · ขึ้นเขา',
    cp_a2_out: 'A2 · ลงเขา',
    cp_a1_in:  'A1 · ขากลับ',
    cp_finish: 'เส้นชัย',
    cp_a1:     'A1 · เขามะเข้ม',
    cp_a2:     'A2 · Green Mountain',

    // Course map
    course_map: 'กราฟ Ascend (ระดับความสูง · จำนวนคนต่อจุด)',
    all: 'ทั้งหมด',

    // Alerts
    alerts_feed:  'แจ้งเตือน',
    total:        'ทั้งหมด',
    no_alerts:    'ไม่มีการแจ้งเตือน · ทุกคนปลอดภัย',
    alert_missing:'ไม่มีสัญญาณนานเกินกำหนด',
    alert_no_ping:({mins, cp}) => `เช็คอินล่าสุด ${mins} นาทีที่ ${cp}`,
    alert_slow:   'วิ่งช้ากว่ากลุ่ม',
    alert_behind: ({km}) => `ตามหลังจังหวะเฉลี่ย ${km}K`,
    alert_dnf:    'พลาดเวลา cut-off',
    alert_dnf_detail: 'ยังไม่เข้าเส้นชัยเกินเวลา',
    btn_call:     'โทร',
    btn_dispatch: 'ส่งทีม',
    btn_resolve:  'พบแล้ว',

    // Roster
    roster: 'รายชื่อ',
    search_ph: 'ค้นหา bib / ชื่อ',
    h_bib:'BIB / อันดับ', h_name:'ชื่อ', h_dist:'ระยะ', h_progress:'ความคืบหน้า',
    h_last_cp:'จุดล่าสุด', h_eta:'ETA ถัดไป', h_status:'สถานะ',

    // Mobile
    m_bib_title: 'บัตรนักวิ่ง',
    m_bib_sub:   'ให้สตาฟแสกนตรงนี้',
    m_dist:      'ระยะ',
    m_emergency: 'ติดต่อฉุกเฉิน',
    m_next_cp:   'จุดถัดไป',
    m_progress:  'ผ่านมาแล้ว',
    m_cutoff:    'เวลา cut-off',
    m_pace:      'เพซเฉลี่ย',
    m_history:   'จุดที่ผ่านแล้ว',
    m_tap_here:  'ฉันถึงแล้ว · กดเพื่อเช็คอิน',
    m_scan_btn:  'แสกน QR ที่จุดพัก',
    m_gps_btn:   'ส่งตำแหน่งให้สตาฟ',
    m_gps_auto:  'GPS กำลังตรวจจับจุดพัก…',
    m_in_range:  'อยู่ในระยะจุด A',
    m_confirm_in:'ยืนยันเข้าจุดพัก',
    m_confirm_out:'แจ้งออกจากจุดพัก',
    m_safe:      'ปลอดภัย',
    m_help:      'ต้องการความช่วยเหลือ',
    m_help_send: 'แจ้งทีม S&R',
    m_finished:  'เข้าเส้นชัยแล้ว!',
    m_finished_sub: 'เวลาทางการจะอัพเดทเร็วๆนี้',
    m_scan_for_me:'หรือให้สตาฟแสกน QR ของคุณ',
    m_lap:       'แล็ป',

    minutes: 'นาที',
    km: 'กม.',
  },
  en: {
    event_label: 'Trail run',
    event_name: 'Rayong Trail Running · long training',
    race_time: 'Race time',
    elapsed: 'Elapsed',
    flag_alert: 'ALERT',
    flag_ok: 'All safe',

    kpi_total:     'Total runners',
    kpi_total_sub: '29K · 22K · 11K',
    kpi_on_course: 'On course',
    kpi_finished:  'Finished',
    kpi_at_rest:   'At rest stop',
    kpi_dnf:       'DNF',
    kpi_upgraded:  'Upgraded',
    kpi_alerts:    'Needs check',
    kpi_alerts_sub:'> 35 min silent',

    s_on_course: 'Running',
    s_slow:      'Slow',
    s_rest:      'At rest',
    s_missing:   'Check now',
    s_finished:  'Finished',
    s_dnf:       'DNF',
    s_pending:   'Not started',

    cp_start:  'Start',
    cp_a1_out: 'A1 · outbound',
    cp_a2_in:  'A2 · uphill',
    cp_a2_out: 'A2 · downhill',
    cp_a1_in:  'A1 · inbound',
    cp_finish: 'Finish',
    cp_a1:     'A1 · Khao Ma Khem',
    cp_a2:     'A2 · Green Mountain',

    course_map: 'Ascend chart (elevation · runners per point)',
    all: 'All',

    alerts_feed:  'Alerts',
    total:        'total',
    no_alerts:    'No alerts · everyone is safe',
    alert_missing:'No ping past threshold',
    alert_no_ping:({mins, cp}) => `Last seen ${mins} min ago at ${cp}`,
    alert_slow:   'Slower than pack',
    alert_behind: ({km}) => `Behind expected pace by ${km}K`,
    alert_dnf:    'Missed cut-off',
    alert_dnf_detail: 'No finish ping within window',
    btn_call:     'CALL',
    btn_dispatch: 'DISPATCH',
    btn_resolve:  'RESOLVE',

    roster: 'Roster',
    search_ph: 'search bib / name',
    h_bib:'BIB / RANK', h_name:'NAME', h_dist:'DIST', h_progress:'PROGRESS',
    h_last_cp:'LAST CP', h_eta:'ETA NEXT', h_status:'STATUS',

    m_bib_title: 'Runner pass',
    m_bib_sub:   'Show this to staff to scan',
    m_dist:      'Distance',
    m_emergency: 'Emergency contact',
    m_next_cp:   'Next checkpoint',
    m_progress:  'Distance run',
    m_cutoff:    'Cut-off',
    m_pace:      'Avg pace',
    m_history:   'Passed checkpoints',
    m_tap_here:  'I’m here · tap to check in',
    m_scan_btn:  'Scan checkpoint QR',
    m_gps_btn:   'Send GPS to staff',
    m_gps_auto:  'GPS auto-detecting…',
    m_in_range:  'You’re in CP A range',
    m_confirm_in:'Confirm arrival',
    m_confirm_out:'Leaving rest stop',
    m_safe:      'I’m safe',
    m_help:      'I need help',
    m_help_send: 'Page S&R team',
    m_finished:  'You crossed the line!',
    m_finished_sub: 'Official time updating soon',
    m_scan_for_me:'Or let staff scan your QR',
    m_lap:       'Lap',

    minutes: 'min',
    km: 'km',
  },
};

function tFn(lang) {
  const dict = STR[lang] || STR.en;
  return (key, vars) => {
    const v = dict[key];
    if (typeof v === 'function') return v(vars || {});
    return v != null ? v : key;
  };
}

Object.assign(window, { STR, tFn });
