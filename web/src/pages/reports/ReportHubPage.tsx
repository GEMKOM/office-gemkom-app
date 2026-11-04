import { REPORT_HUBS } from '@/routes/reportCatalog';
import { useLocation } from 'react-router';
import { NotFound } from '@/pages/NotFound';
import { normalizeRoute } from '@/routes/migrated';
import { ReportCatalog } from './ReportCatalog';

/**
 * A department's report hub (/manufacturing/reports, /procurement/reports, …):
 * the Rapor Merkezi filtered to its departments (REPORT_HUBS).
 */
export function ReportHubPage() {
  const path = normalizeRoute(useLocation().pathname);
  const hub = REPORT_HUBS[path];
  if (!hub) return <NotFound />;
  return (
    <ReportCatalog
      key={path}
      title={hub.title}
      subtitle="Bu bölümün raporları; tüm raporlar için Rapor Merkezi."
      departments={hub.departments}
      backTo={hub.backTo}
    />
  );
}
