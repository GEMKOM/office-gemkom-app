import { screen } from '@testing-library/react';
import type { DepartmentTask } from '@/api/projects/departmentTasks';
import { renderWithProviders } from '@/test/render';
import { DepartmentTasksContext, type DepartmentTasksContextValue } from '../context';
import { ConsultationTab } from './ConsultationTab';

vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { username: 'ali' } }) }));

const context = {
  openDialog: vi.fn(),
  reloadList: vi.fn(),
  applyTask: vi.fn(),
} as unknown as DepartmentTasksContextValue;

function renderTab(task: Partial<DepartmentTask>) {
  return renderWithProviders(
    <DepartmentTasksContext.Provider value={context}>
      <ConsultationTab task={{ id: 1, status: 'pending', ...task } as DepartmentTask} />
    </DepartmentTasksContext.Provider>,
  );
}

/** Row helper: the label and its value share one Grid.Col. */
function row(label: string): string {
  const cell = screen.getByText(label).closest('div');
  return (cell?.textContent ?? '').replace(label, '').trim();
}

describe('ConsultationTab - Teklif Bilgisi', () => {
  it('shows the offer customer in the Müşteri / Firma row', () => {
    renderTab({
      department: 'design',
      offer_summary: { offer_no: 'TKF-2026-001', customer_name: 'Arçelik A.Ş.' },
    });
    expect(row('Müşteri / Firma:')).toBe('Arçelik A.Ş.');
  });

  it('falls back to a neutral placeholder when no customer is set', () => {
    renderTab({ department: 'design', offer_summary: { offer_no: 'TKF-2026-002' } });
    expect(row('Müşteri / Firma:')).toBe('-');
  });

  it('keeps the logistics-only rows alongside it', () => {
    renderTab({
      department: 'logistics',
      offer_summary: {
        offer_no: 'TKF-2026-003',
        customer_name: 'Bosch',
        incoterms: 'FOB',
        delivery_place: 'İzmir',
      },
    });
    expect(row('Müşteri / Firma:')).toBe('Bosch');
    expect(row('Incoterms:')).toBe('FOB');
    expect(row('Teslim Yeri:')).toBe('İzmir');
  });
});
