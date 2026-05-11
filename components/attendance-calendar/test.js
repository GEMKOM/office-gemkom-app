import { AttendanceCalendar } from './attendance-calendar.js';

const SAMPLE_RESPONSE = {
    user_id: 5,
    user_display: 'Ahmet Yılmaz',
    year: 2026,
    month: 5,
    shift_rule: {
        id: 1,
        name: 'Standart Mesai',
        expected_start: '08:00',
        expected_end: '17:00',
        overtime_threshold_minutes: 15
    },
    summary: {
        total_working_days: 20,
        total_present: 8,
        total_absent: 1,
        total_overtime_minutes: 45,
        total_late_minutes: 12,
        total_early_leave_minutes: 0
    },
    days: [
        {
            date: '2026-05-01',
            day_type: 'public_holiday',
            weekday: 'Friday',
            holiday_name: 'Emek ve Dayanışma Günü',
            record: null,
            flag: null
        },
        {
            date: '2026-05-02',
            day_type: 'weekend',
            weekday: 'Saturday',
            holiday_name: null,
            record: null,
            flag: null
        },
        {
            date: '2026-05-03',
            day_type: 'weekend',
            weekday: 'Sunday',
            holiday_name: null,
            record: null,
            flag: null
        },
        {
            date: '2026-05-04',
            day_type: 'working',
            weekday: 'Monday',
            holiday_name: null,
            record: {
                id: 312,
                date: '2026-05-04',
                status: 'complete',
                method: 'ip',
                check_in_time: '2026-05-04T07:58:00+03:00',
                check_out_time: '2026-05-04T17:45:00+03:00',
                leave_type: null,
                overtime_minutes: 45,
                late_minutes: 0,
                early_leave_minutes: 0,
                notes: ''
            },
            flag: null
        },
        {
            date: '2026-05-05',
            day_type: 'working',
            weekday: 'Tuesday',
            holiday_name: null,
            record: {
                id: 318,
                date: '2026-05-05',
                status: 'complete',
                method: 'ip',
                check_in_time: '2026-05-05T08:14:00+03:00',
                check_out_time: '2026-05-05T17:01:00+03:00',
                leave_type: null,
                overtime_minutes: 0,
                late_minutes: 14,
                early_leave_minutes: 0,
                notes: ''
            },
            flag: null
        },
        {
            date: '2026-05-06',
            day_type: 'leave',
            weekday: 'Wednesday',
            holiday_name: null,
            record: {
                id: 325,
                date: '2026-05-06',
                status: 'leave',
                method: 'hr_manual',
                check_in_time: null,
                check_out_time: null,
                leave_type: 'annual_leave',
                overtime_minutes: 0,
                late_minutes: 0,
                early_leave_minutes: 0,
                notes: 'vr:12'
            },
            flag: null
        },
        {
            date: '2026-05-09',
            day_type: 'working',
            weekday: 'Saturday',
            holiday_name: null,
            record: null,
            flag: 'absent'
        },
        {
            date: '2026-05-10',
            day_type: 'working',
            weekday: 'Sunday',
            holiday_name: null,
            record: {
                id: 402,
                date: '2026-05-10',
                status: 'pending_override',
                method: 'manual_override',
                check_in_time: '2026-05-10T09:03:00+03:00',
                check_out_time: null,
                leave_type: null,
                overtime_minutes: 0,
                late_minutes: 0,
                early_leave_minutes: 0,
                notes: ''
            },
            flag: 'pending_approval'
        },
        {
            date: '2026-05-31',
            day_type: 'working',
            weekday: 'Sunday',
            holiday_name: null,
            record: null,
            flag: null
        }
    ]
};

function shiftPayload(base, year, month, userId) {
    return {
        ...base,
        year,
        month,
        user_id: userId || base.user_id,
        user_display: userId ? `Kullanıcı #${userId}` : base.user_display
    };
}

function mockMonthlySummary({ year, month, user_id }) {
    const out = shiftPayload(SAMPLE_RESPONSE, year, month, user_id);
    return Promise.resolve(out);
}

const calendar = new AttendanceCalendar('attendance-calendar-test', {
    initialYear: 2026,
    initialMonth: 5,
    initialUserId: 5,
    fetchMonthlySummary: mockMonthlySummary
});

calendar.refresh();
