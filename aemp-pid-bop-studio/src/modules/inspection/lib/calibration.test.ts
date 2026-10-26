import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  CAL_COLUMNS, buildRegisterWorkbook, defaultDueDate, instrumentKey, parseRegisterWorkbook,
  planRegisterImport, renumber, suggestTmmd, validateInstrument, type CalInstrument,
} from './calibration';

function inst(over: Partial<CalInstrument> = {}): CalInstrument {
  return {
    id: 'i1', registerId: 'r1', sequenceNo: 1, certificateNo: 'PHO-1', instrument: 'PRESSURE GAUGE',
    tmmd: 'Monitoring', manufacturer: 'MD TOTCO', model: '', serialNumber: 'SN-1', range: '',
    location: '', grade: '', acceptanceCriteria: '', lastCalibration: '2026-03-17',
    dueDate: '2027-03-16', certifyingCompany: '', remarks: '', certFilePath: null,
    certFileName: null, ...over,
  };
}

describe('defaultDueDate', () => {
  it('is one year less a day after the last calibration, as the source registers hold', () => {
    expect(defaultDueDate('2026-03-17')).toBe('2027-03-16');
    expect(defaultDueDate('2024-02-29')).toBe('2025-02-27');
    expect(defaultDueDate(null)).toBeNull();
  });
});

describe('instrumentKey', () => {
  it('identifies an instrument by certificate + serial, case- and space-insensitive', () => {
    expect(instrumentKey(' pho-1 ', 'sn-1')).toBe(instrumentKey('PHO-1', 'SN-1'));
    expect(instrumentKey('PHO-1', 'SN-1')).not.toBe(instrumentKey('PHO-2', 'SN-1'));
  });
});

describe('suggestTmmd', () => {
  const map = [
    { instrument: 'PRESSURE GAUGE', tmmd: 'Monitoring' as const },
    { instrument: 'PRESSURE RELIEF VALVE', tmmd: 'Detecting' as const },
    { instrument: 'PRESSURE CHART RECORDER', tmmd: 'Monitoring' as const },
    { instrument: 'WEIGHT INDICATOR', tmmd: 'Measuring' as const },
  ];
  it('prefers an exact name match', () => {
    expect(suggestTmmd('pressure gauge', map)).toBe('Monitoring');
  });
  it('uses a partial match when one or two lines fit', () => {
    expect(suggestTmmd('WEIGHT', map)).toBe('Measuring');
    expect(suggestTmmd('RELIEF', map)).toBe('Detecting');
  });
  it('stays empty when nothing fits or more than two lines fit', () => {
    expect(suggestTmmd('THERMOMETER', map)).toBeNull();
    expect(suggestTmmd('PRESSURE', map)).toBeNull();
    expect(suggestTmmd('', map)).toBeNull();
  });
});

describe('validateInstrument', () => {
  it('requires Instrument, Serial no., Certificate, TMMD and Manufacturer', () => {
    expect(validateInstrument(inst())).toEqual({});
    const e = validateInstrument(inst({ instrument: ' ', serialNumber: '', certificateNo: '',
      tmmd: null, manufacturer: '' }));
    expect(Object.keys(e).sort()).toEqual(['certificateNo', 'instrument', 'manufacturer', 'serialNumber', 'tmmd']);
  });
  it('refuses a due date before the last calibration', () => {
    expect(validateInstrument(inst({ dueDate: '2026-01-01' })).dueDate).toBeTruthy();
  });
});

describe('renumber', () => {
  it('re-sequences S.N in current order, reporting only the rows that change', () => {
    const rows = [inst({ id: 'a', sequenceNo: 1 }), inst({ id: 'b', sequenceNo: 3 }), inst({ id: 'c', sequenceNo: 7 })];
    expect(renumber(rows)).toEqual([{ id: 'b', sequenceNo: 2 }, { id: 'c', sequenceNo: 3 }]);
  });
});

function sheet(rows: unknown[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Callibration Log');
  return wb;
}
const HEAD = CAL_COLUMNS.map((c) => c.header);

describe('parseRegisterWorkbook', () => {
  it('reads the header block and maps columns by heading, in any order', () => {
    const wb = sheet([
      [],
      ['', '', '', '', '', '', 'Mechanical TMMDE calibration Register', '', '', '', '', '', 'Location', 'Rig 103'],
      ['', '', '', '', '', '', '', '', '', '', '', '', 'Date', 46098],
      ['', '', '', '', '', '', '', '', '', '', '', '', 'Revision No', '1'],
      ['Serial No', 'Certificate', 'Description of Instrument', 'T/M/M/D', 'Manufacturer', 'Date of Last Calibration'],
      ['SN-1', 'PHO-1', 'PRESSURE GAUGE', 'Monitoring', 'MD TOTCO', 46098],
    ]);
    const r = parseRegisterWorkbook(wb);
    expect(r.header).toMatchObject({ title: 'Mechanical TMMDE calibration Register', location: 'Rig 103',
      registerDate: '2026-03-17', revisionNo: '1' });
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ serialNumber: 'SN-1', certificateNo: 'PHO-1', tmmd: 'Monitoring',
      lastCalibration: '2026-03-17', dueDate: '2027-03-16' });
    // a column the sheet doesn't have is reported absent, so an update leaves it alone
    expect(r.present.has('model')).toBe(false);
  });

  it('skips blank rows, refuses ambiguous text dates and drops that row', () => {
    const wb = sheet([[], [], [], [], HEAD,
      [1, 'PHO-1', 'PRESSURE GAUGE', 'Monitoring', 'X', '', 'SN-1', '', '', '', '', '03/04/2026'],
      [],
      [2, 'PHO-2', 'PRESSURE GAUGE', 'Monitoring', 'X', '', 'SN-2', '', '', '', '', '17-Mar-2026'],
    ]);
    const r = parseRegisterWorkbook(wb);
    expect(r.rows.map((x) => x.certificateNo)).toEqual(['PHO-2']);
    expect(r.rows[0].lastCalibration).toBe('2026-03-17');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ row: 6, column: 'Date of Last Calibration' });
  });

  it('keeps a row with a one-cell problem but reports it', () => {
    const wb = sheet([[], [], [], [], HEAD,
      [1, 'PHO-1', 'GAUGE', 'Sometimes', 'X', '', 'SN-1'],
    ]);
    const r = parseRegisterWorkbook(wb);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].tmmd).toBeNull();
    expect(r.errors[0]).toMatchObject({ row: 6, column: 'T/M/M/D' });
  });

  it('fails clearly when the heading row is missing', () => {
    expect(() => parseRegisterWorkbook(sheet([['nothing', 'here']]))).toThrow(/heading/i);
  });
});

describe('buildRegisterWorkbook', () => {
  it('round-trips through the parser', () => {
    const header = { title: 'Mechanical TMMDE calibration Register', location: 'Rig 103',
      registerDate: '2026-03-17', revisionNo: '1', qualificationCode: 'MNT-MS-FM-02-110' };
    const rows = [inst(), inst({ id: 'i2', sequenceNo: 2, certificateNo: 'PHO-2', serialNumber: 'SN-2',
      acceptanceCriteria: '+/- 1.0% of FS\nas per OEM' })];
    const back = parseRegisterWorkbook(buildRegisterWorkbook(header, rows));
    expect(back.header).toMatchObject(header);
    expect(back.errors).toEqual([]);
    expect(back.rows.map((r) => [r.certificateNo, r.serialNumber, r.lastCalibration, r.dueDate,
      r.acceptanceCriteria])).toEqual([
      ['PHO-1', 'SN-1', '2026-03-17', '2027-03-16', ''],
      ['PHO-2', 'SN-2', '2026-03-17', '2027-03-16', '+/- 1.0% of FS\nas per OEM'],
    ]);
  });
});

describe('planRegisterImport', () => {
  it('updates rows matched on certificate + serial and adds the rest; never deletes', () => {
    const existing = [inst({ id: 'a', certificateNo: 'PHO-1', serialNumber: 'SN-1' }),
      inst({ id: 'b', certificateNo: 'PHO-9', serialNumber: 'SN-9' })];
    const parsed = [{ ...inst({ certificateNo: 'pho-1', serialNumber: 'sn-1' }) },
      { ...inst({ certificateNo: 'PHO-2', serialNumber: 'SN-2' }) }];
    const p = planRegisterImport(parsed, existing);
    expect(p.updates.map((u) => u.id)).toEqual(['a']);
    expect(p.inserts).toHaveLength(1);
    expect(p.untouched).toBe(1);
  });
});
