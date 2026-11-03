import { CostAnalysisPage as MachiningCostAnalysis } from '../../machining/reports/cost-analysis/CostAnalysisPage';
import { CostAnalysisPage as WeldingCostAnalysis } from '../../welding/reports/cost-analysis/CostAnalysisPage';
import { useReportView, type ReportView } from '../../reports-shared/reportView';
import { CombinedJobCostsPage } from '../combined-job-costs/CombinedJobCostsPage';

export type JobCostBreakdown = 'combined' | 'machining' | 'welding';

export const JOB_COST_VIEWS: ReportView<JobCostBreakdown>[] = [
  { value: 'combined', label: 'Birleşik (saat)', route: '/manufacturing/reports/combined-job-costs' },
  {
    value: 'machining',
    label: 'Talaşlı İmalat',
    route: '/manufacturing/machining/reports/cost-analysis',
  },
  { value: 'welding', label: 'Kaynaklı İmalat', route: '/manufacturing/welding/reports/cost-analysis' },
];

/**
 * İş Maliyeti: one report per job number, broken down by `?breakdown=`.
 * Birleşik is the hours of both shops side by side (the old İş Maliyeti page);
 * Talaşlı and Kaynaklı are each shop's labour cost (the two Maliyet Analizi
 * pages). Each view keeps its own filters and drill-downs; the job number
 * carries over.
 */
export function JobCostsPage() {
  const { view, switcher } = useReportView('breakdown', JOB_COST_VIEWS, ['job_no']);
  if (view === 'machining') return <MachiningCostAnalysis switcher={switcher} />;
  if (view === 'welding') return <WeldingCostAnalysis switcher={switcher} />;
  if (view === 'combined') return <CombinedJobCostsPage switcher={switcher} />;
  return null;
}
