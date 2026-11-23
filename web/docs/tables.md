# Tables in the web app

Where the app has tables, and which of them let each user choose, hide and
reorder columns. Taken from the code on 2026-11-23 (`web/src/pages`).

## How column choices work

Almost every list is the shared `DataTable` (`web/src/ui/DataTable`). A table
gets the **Sütunlar** menu with per-user saving as soon as it has a
`columnsKey`:

```tsx
<DataTable columnsKey="sales-offers" … />
```

- The menu lists the columns in the table's order. A checkbox shows or hides
  each one; the grip drags it to a new place, and the ▲/▼ buttons move it with
  the keyboard. **Varsayılana dön** goes back to the page's default.
- The layout is saved for the signed-in user on the backend
  (`GET /users/me/table-preferences/`, `PUT`/`DELETE
  /users/me/table-preferences/<columnsKey>/`), so it follows them to any
  computer. A copy in the browser (`gk.tableLayouts.<userId>`) lets the table
  open in their layout before the request returns.
- Columns added to a page later appear at their default place; columns removed
  from a page are ignored. A column with `hideBelow` still hides on narrow
  screens unless the user turned it on or off themselves.
- The old browser-only choices (`gk.tableColumns.<key>`, visibility only) are
  still read, and move to the backend the first time the user changes the
  layout.
- Excel export is unchanged: all exportable columns in the page's order.
- A table without `columnsKey` still shows the menu when a column has
  `hideBelow`, but only for showing/hiding, and nothing is remembered.

**Choosing a key:** lowercase, unique across the app, `area-table`
(`sales-offers`, `warehouse-transfers`). Never rename a key once shipped, or
users lose their layout. Two tables on one page need two keys.

## Rolling it out

1. Done: `sales/offers` (Teklifler).
2. Next, the main list pages (Kind = page, server or long lists), e.g. Satın
   Alma talepleri, Depo transferleri / Mal Kabul, Planlama talepleri, İş Emri
   listesi, Stok Kartları, Fason, Mesai, İzin. Each is one `columnsKey` line.
3. Later or never: small summary tables in reports and dashboards, tables in
   modals and detail tabs (few columns), and the dev UI preview.

Plain Mantine `<Table>`s (marked _plain Mantine table_ below) are mostly
editing grids, forms and small detail tables inside modals. They have no
Sütunlar menu; moving one to `DataTable` is a separate change per table.

## Inventory

**228 DataTables** and **74 plain Mantine tables** across the pages. **8**
DataTables have a `columnsKey`: `sales-offers`, plus 7 that already kept
visibility in the browser and now get ordering and per-user saving too
(`machining-parts`, `planning-items`, `procurement-planning-items`,
`suppliers`, `ncrs`, `qc-reviews`, `department-tasks`).

Kind: _page_ is a page's own list, _tab_ a tab or detail view, _modal_ a
dialog. Line numbers are where the `<DataTable` starts.

### Accounting (`pages/accounting`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| İş Emirleri | [period-cost/PeriodCostPage.tsx:257](../src/pages/accounting/period-cost/PeriodCostPage.tsx#L257) | page | - |
| _plain Mantine table ×1_ | [period-cost/ReconcileModal.tsx](../src/pages/accounting/period-cost/ReconcileModal.tsx) | modal | not DataTable |
| Sonuç | [subcontracting-statements/SubcontractingStatementsPage.tsx:171](../src/pages/accounting/subcontracting-statements/SubcontractingStatementsPage.tsx#L171) | page | - |

### Design (`pages/design`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| İnceleme Bekleyen Yayınlar | [release-approvals/ReleaseApprovalsPage.tsx:466](../src/pages/design/release-approvals/ReleaseApprovalsPage.tsx#L466) | page | - |
| Tamamlanan İncelemeler | [release-approvals/ReleaseApprovalsPage.tsx:479](../src/pages/design/release-approvals/ReleaseApprovalsPage.tsx#L479) | page | - |
| Bekleyen Revizyon Talepleri | [revision-requests/RevisionRequestsPage.tsx:187](../src/pages/design/revision-requests/RevisionRequestsPage.tsx#L187) | page | - |

### Dev (UI preview) (`pages/dev`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| Siparişler (sunucu modu) | [UiPreview.tsx:331](../src/pages/dev/UiPreview.tsx#L331) | page | - |
| ${formatNumber(ALL_ORDERS.length)} satır, sanal liste | [UiPreview.tsx:459](../src/pages/dev/UiPreview.tsx#L459) | page | - |
| İstemci sayfalama + footer | [UiPreview.tsx:484](../src/pages/dev/UiPreview.tsx#L484) | page | - |
| İlk yükleme (iskelet) | [UiPreview.tsx:503](../src/pages/dev/UiPreview.tsx#L503) | page | - |
| Boş | [UiPreview.tsx:504](../src/pages/dev/UiPreview.tsx#L504) | page | - |
| Satır içi düzenleme ('hata' yazınca kayıt başarısız olur) | [UiPreview.tsx:536](../src/pages/dev/UiPreview.tsx#L536) | page | - |
| Müşteriye göre gruplu | [UiPreview.tsx:562](../src/pages/dev/UiPreview.tsx#L562) | page | - |
| Sürükleyerek sırala (veya tutamaçta Boşluk + oklar) | [UiPreview.tsx:592](../src/pages/dev/UiPreview.tsx#L592) | page | - |

### Finance (`pages/finance`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| Ödeme Planı | [purchase-orders/po/PurchaseOrderDetailModal.tsx:157](../src/pages/finance/purchase-orders/po/PurchaseOrderDetailModal.tsx#L157) | modal | - |
| Sipariş Kalemleri | [purchase-orders/po/PurchaseOrderDetailModal.tsx:167](../src/pages/finance/purchase-orders/po/PurchaseOrderDetailModal.tsx#L167) | modal | - |
| Ek Giderler | [purchase-orders/tabs/AdhocCostsTab.tsx:181](../src/pages/finance/purchase-orders/tabs/AdhocCostsTab.tsx#L181) | tab | - |
| DBS Tedarikçileri | [purchase-orders/tabs/DbsTab.tsx:114](../src/pages/finance/purchase-orders/tabs/DbsTab.tsx#L114) | tab | - |
| _plain Mantine table ×1_ | [purchase-orders/tabs/DbsTab.tsx](../src/pages/finance/purchase-orders/tabs/DbsTab.tsx) | tab | not DataTable |
| Aylık Giderler | [purchase-orders/tabs/ExpensesTab.tsx:177](../src/pages/finance/purchase-orders/tabs/ExpensesTab.tsx#L177) | tab | - |
| Krediler | [purchase-orders/tabs/LoansTab.tsx:188](../src/pages/finance/purchase-orders/tabs/LoansTab.tsx#L188) | tab | - |
| _plain Mantine table ×1_ | [purchase-orders/tabs/LoansTab.tsx](../src/pages/finance/purchase-orders/tabs/LoansTab.tsx) | tab | not DataTable |
| Satın Alma Siparişleri | [purchase-orders/tabs/PurchaseOrdersTab.tsx:215](../src/pages/finance/purchase-orders/tabs/PurchaseOrdersTab.tsx#L215) | tab | - |
| Beklenen Tahsilatlar | [purchase-orders/tabs/ReceiptsTab.tsx:422](../src/pages/finance/purchase-orders/tabs/ReceiptsTab.tsx#L422) | tab | - |
| Vergi Kayıtları | [purchase-orders/tabs/TaxesTab.tsx:183](../src/pages/finance/purchase-orders/tabs/TaxesTab.tsx#L183) | tab | - |
| Aylık Detaylar | [reports/executive-overview/ExecutiveOverviewPage.tsx:324](../src/pages/finance/reports/executive-overview/ExecutiveOverviewPage.tsx#L324) | page | - |
| Proje Raporu | [reports/projects/ProjectsReportPage.tsx:118](../src/pages/finance/reports/projects/ProjectsReportPage.tsx#L118) | page | - |

### General (`pages/general`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| Vinç Talepleri | [crane-requests/list/CraneRequestsListPage.tsx:348](../src/pages/general/crane-requests/list/CraneRequestsListPage.tsx#L348) | page | - |
| Onay Bekleyen Vinç Talepleri | [crane-requests/pending/CraneRequestsPendingPage.tsx:216](../src/pages/general/crane-requests/pending/CraneRequestsPendingPage.tsx#L216) | page | - |
| Onayladığım Vinç Talepleri | [crane-requests/pending/CraneRequestsPendingPage.tsx:229](../src/pages/general/crane-requests/pending/CraneRequestsPendingPage.tsx#L229) | page | - |
| Fiyat Listesi | [crane-requests/prices/CranePricesPage.tsx:224](../src/pages/general/crane-requests/prices/CranePricesPage.tsx#L224) | page | - |
| _plain Mantine table ×1_ | [crane-requests/prices/CranePricesPage.tsx](../src/pages/general/crane-requests/prices/CranePricesPage.tsx) | page | not DataTable |
| Departman Talepleri | [department-requests/list/DepartmentRequestsListPage.tsx:294](../src/pages/general/department-requests/list/DepartmentRequestsListPage.tsx#L294) | page | - |
| Onay Bekleyen Departman Talepleri | [department-requests/pending/PendingDepartmentRequestsPage.tsx:185](../src/pages/general/department-requests/pending/PendingDepartmentRequestsPage.tsx#L185) | page | - |
| Onayladığım Departman Talepleri | [department-requests/pending/PendingDepartmentRequestsPage.tsx:200](../src/pages/general/department-requests/pending/PendingDepartmentRequestsPage.tsx#L200) | page | - |
| _plain Mantine table ×1_ | [department-requests/shared.tsx](../src/pages/general/department-requests/shared.tsx) | page | not DataTable |
| Fason Talepleri | [fason/FasonPage.tsx:156](../src/pages/general/fason/FasonPage.tsx#L156) | page | - |
| _plain Mantine table ×2_ | [fason/FasonPage.tsx](../src/pages/general/fason/FasonPage.tsx) | page | not DataTable |
| Makine Listesi | [machines/MachinesPage.tsx:326](../src/pages/general/machines/MachinesPage.tsx#L326) | page | - |
| İş Emri Numarasına Göre Dağılım | [overtime/cost-report/CostReportPage.tsx:380](../src/pages/general/overtime/cost-report/CostReportPage.tsx#L380) | page | - |
| Ücret Katsayısına Göre Dağılım | [overtime/cost-report/CostReportPage.tsx:554](../src/pages/general/overtime/cost-report/CostReportPage.tsx#L554) | page | - |
| _(no title)_ | [overtime/cost-report/CostReportPage.tsx:573](../src/pages/general/overtime/cost-report/CostReportPage.tsx#L573) | page | - |
| Mesai Talepleri | [overtime/cost-report/CostReportPage.tsx:589](../src/pages/general/overtime/cost-report/CostReportPage.tsx#L589) | page | - |
| _plain Mantine table ×1_ | [overtime/cost-report/parts.tsx](../src/pages/general/overtime/cost-report/parts.tsx) | page | not DataTable |
| Dönem Özeti | [overtime/machining-report/MachiningReportPage.tsx:430](../src/pages/general/overtime/machining-report/MachiningReportPage.tsx#L430) | page | - |
| Operatör Bazında | [overtime/machining-report/MachiningReportPage.tsx:442](../src/pages/general/overtime/machining-report/MachiningReportPage.tsx#L442) | page | - |
| Mesai / Operasyon Çalışma Raporu | [overtime/machining-report/MachiningReportPage.tsx:455](../src/pages/general/overtime/machining-report/MachiningReportPage.tsx#L455) | page | - |
| _plain Mantine table ×1_ | [overtime/machining-report/MachiningReportPage.tsx](../src/pages/general/overtime/machining-report/MachiningReportPage.tsx) | page | not DataTable |
| Onay Bekleyen Mesai Talepleri | [overtime/pending/OvertimePendingPage.tsx:108](../src/pages/general/overtime/pending/OvertimePendingPage.tsx#L108) | page | - |
| Onayladığım Mesai Talepleri | [overtime/pending/OvertimePendingPage.tsx:126](../src/pages/general/overtime/pending/OvertimePendingPage.tsx#L126) | page | - |
| Mesai Talepleri | [overtime/registry/OvertimeRegistryPage.tsx:296](../src/pages/general/overtime/registry/OvertimeRegistryPage.tsx#L296) | page | - |
| _plain Mantine table ×2_ | [overtime/shared/OvertimeDetailModal.tsx](../src/pages/general/overtime/shared/OvertimeDetailModal.tsx) | modal | not DataTable |
| Mesai Kullanıcıları | [overtime/users/OvertimeUsersPage.tsx:184](../src/pages/general/overtime/users/OvertimeUsersPage.tsx#L184) | page | - |
| _plain Mantine table ×1_ | [overtime/welding-report/FlagRowsModal.tsx](../src/pages/general/overtime/welding-report/FlagRowsModal.tsx) | modal | not DataTable |
| Dönem Özeti | [overtime/welding-report/WeldingReportPage.tsx:523](../src/pages/general/overtime/welding-report/WeldingReportPage.tsx#L523) | page | - |
| Sapma Dağılımı | [overtime/welding-report/WeldingReportPage.tsx:535](../src/pages/general/overtime/welding-report/WeldingReportPage.tsx#L535) | page | - |
| Mesai / Kaynak Zaman Karşılaştırması | [overtime/welding-report/WeldingReportPage.tsx:557](../src/pages/general/overtime/welding-report/WeldingReportPage.tsx#L557) | page | - |
| _plain Mantine table ×1_ | [overtime/welding-report/WeldingReportPage.tsx](../src/pages/general/overtime/welding-report/WeldingReportPage.tsx) | page | not DataTable |
| Onayımı Bekleyen Talepler | [vacation/pending/VacationPendingPage.tsx:233](../src/pages/general/vacation/pending/VacationPendingPage.tsx#L233) | page | - |
| Karar Verdiğim Talepler | [vacation/pending/VacationPendingPage.tsx:246](../src/pages/general/vacation/pending/VacationPendingPage.tsx#L246) | page | - |
| İzin Talepleri | [vacation/requests/VacationRequestsPage.tsx:314](../src/pages/general/vacation/requests/VacationRequestsPage.tsx#L314) | page | - |
| _plain Mantine table ×1_ | [vacation/requests/VacationRequestsPage.tsx](../src/pages/general/vacation/requests/VacationRequestsPage.tsx) | page | not DataTable |

### Human resources (`pages/human_resources`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| Bekleyen Talepler | [attendance/pending-overrides/PendingOverridesPage.tsx:223](../src/pages/human_resources/attendance/pending-overrides/PendingOverridesPage.tsx#L223) | page | - |
| PDKS Kayıtları | [attendance/records/AttendanceRecordsPage.tsx:343](../src/pages/human_resources/attendance/records/AttendanceRecordsPage.tsx#L343) | page | - |
| Vardiya Kuralları | [attendance/shift-rules/ShiftRulesPage.tsx:277](../src/pages/human_resources/attendance/shift-rules/ShiftRulesPage.tsx#L277) | page | - |
| Kullanıcı Bazlı Özet | [attendance/summary/AttendanceSummaryPage.tsx:186](../src/pages/human_resources/attendance/summary/AttendanceSummaryPage.tsx#L186) | page | - |
| Pozisyon Listesi | [org/positions/PositionsPage.tsx:215](../src/pages/human_resources/org/positions/PositionsPage.tsx#L215) | page | - |
| _plain Mantine table ×1_ | [users/tabs/AttendanceTab.tsx](../src/pages/human_resources/users/tabs/AttendanceTab.tsx) | tab | not DataTable |
| _plain Mantine table ×1_ | [users/tabs/LeaveIntervalsModal.tsx](../src/pages/human_resources/users/tabs/LeaveIntervalsModal.tsx) | modal | not DataTable |
| İzin Talepleri | [users/tabs/LeaveTab.tsx:137](../src/pages/human_resources/users/tabs/LeaveTab.tsx#L137) | tab | - |
| _plain Mantine table ×2_ | [users/tabs/PermissionsTab.tsx](../src/pages/human_resources/users/tabs/PermissionsTab.tsx) | tab | not DataTable |
| _plain Mantine table ×1_ | [users/tabs/WagesTab.tsx](../src/pages/human_resources/users/tabs/WagesTab.tsx) | tab | not DataTable |
| _(no title)_ | [users/UsersPage.tsx:286](../src/pages/human_resources/users/UsersPage.tsx#L286) | page | - |
| İzin Bakiyeleri | [vacation/HrVacationPage.tsx:454](../src/pages/human_resources/vacation/HrVacationPage.tsx#L454) | page | - |
| Onay Kutusu | [vacation/HrVacationPage.tsx:495](../src/pages/human_resources/vacation/HrVacationPage.tsx#L495) | page | - |
| Onaylanmış İzinler | [vacation/HrVacationPage.tsx:508](../src/pages/human_resources/vacation/HrVacationPage.tsx#L508) | page | - |
| _plain Mantine table ×1_ | [vacation/VacationModals.tsx](../src/pages/human_resources/vacation/VacationModals.tsx) | modal | not DataTable |

### OHS (İSG) (`pages/isg`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| İSG Bildirimleri | [issues/IsgIssuesPage.tsx:355](../src/pages/isg/issues/IsgIssuesPage.tsx#L355) | page | - |

### IT (`pages/it`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| Konu Türleri | [approvals/ApprovalsPage.tsx:119](../src/pages/it/approvals/ApprovalsPage.tsx#L119) | page | - |
| Onay Politikaları | [approvals/ApprovalsPage.tsx:209](../src/pages/it/approvals/ApprovalsPage.tsx#L209) | page | - |
| Bildirimler | [feedback/FeedbackPage.tsx:181](../src/pages/it/feedback/FeedbackPage.tsx#L181) | page | - |
| Organizasyon Grupları | [groups/GroupsPage.tsx:163](../src/pages/it/groups/GroupsPage.tsx#L163) | page | - |
| IT Cihaz Listesi | [inventory/InventoryPage.tsx:176](../src/pages/it/inventory/InventoryPage.tsx#L176) | page | - |
| Haftalık Kullanım | [neo/NeoUsagePage.tsx:370](../src/pages/it/neo/NeoUsagePage.tsx#L370) | page | - |
| Sorular Nereden Geliyor | [neo/NeoUsagePage.tsx:381](../src/pages/it/neo/NeoUsagePage.tsx#L381) | page | - |
| Olumsuz Oy Nedenleri | [neo/NeoUsagePage.tsx:397](../src/pages/it/neo/NeoUsagePage.tsx#L397) | page | - |
| Günlük Özetler | [neo/NeoUsagePage.tsx:410](../src/pages/it/neo/NeoUsagePage.tsx#L410) | page | - |
| Kullanıcı Bazında | [neo/NeoUsagePage.tsx:435](../src/pages/it/neo/NeoUsagePage.tsx#L435) | page | - |
| Konu Dağılımı | [neo/NeoUsagePage.tsx:446](../src/pages/it/neo/NeoUsagePage.tsx#L446) | page | - |
| En Çok Sorulan İşler | [neo/NeoUsagePage.tsx:457](../src/pages/it/neo/NeoUsagePage.tsx#L457) | page | - |
| Soru Kayıtları | [neo/NeoUsagePage.tsx:469](../src/pages/it/neo/NeoUsagePage.tsx#L469) | page | - |
| Bildirim Yapılandırmaları | [notifications/NotificationConfigsPage.tsx:262](../src/pages/it/notifications/NotificationConfigsPage.tsx#L262) | page | - |
| Talepler | [password-resets/PasswordResetsPage.tsx:107](../src/pages/it/password-resets/PasswordResetsPage.tsx#L107) | page | - |
| Yetkiler | [permissions/PermissionsListTab.tsx:144](../src/pages/it/permissions/PermissionsListTab.tsx#L144) | tab | - |
| Pozisyon Listesi | [permissions/PositionsTab.tsx:89](../src/pages/it/permissions/PositionsTab.tsx#L89) | tab | - |
| Kullanıcılar | [permissions/UsersTab.tsx:88](../src/pages/it/permissions/UsersTab.tsx#L88) | tab | - |

### Logistics (`pages/logistics`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| Sevkiyat Maliyeti Girilmemiş İş Emirleri | [cost-lines/ShippingCostLinesPage.tsx:212](../src/pages/logistics/cost-lines/ShippingCostLinesPage.tsx#L212) | page | - |
| Sevkiyat Maliyeti Girilmiş İş Emirleri | [cost-lines/ShippingCostLinesPage.tsx:246](../src/pages/logistics/cost-lines/ShippingCostLinesPage.tsx#L246) | page | - |
| _plain Mantine table ×1_ | [cost-lines/ShippingLinesModal.tsx](../src/pages/logistics/cost-lines/ShippingLinesModal.tsx) | modal | not DataTable |

### Management (`pages/management`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| Maliyet Tablosu | [analytics/AnalyticsPage.tsx:399](../src/pages/management/analytics/AnalyticsPage.tsx#L399) | page | - |
| Kayıtlar | [analytics/modals.tsx:383](../src/pages/management/analytics/modals.tsx#L383) | modal | - |
| _(no title)_ | [analytics/modals.tsx:529](../src/pages/management/analytics/modals.tsx#L529) | modal | - |
| Kayıtlar | [analytics/modals.tsx:542](../src/pages/management/analytics/modals.tsx#L542) | modal | - |
| İş Satırları | [analytics/modals.tsx:676](../src/pages/management/analytics/modals.tsx#L676) | modal | - |
| Düzeltmeler | [analytics/modals.tsx:725](../src/pages/management/analytics/modals.tsx#L725) | modal | - |
| _plain Mantine table ×1_ | [reports/cash-flow/CashFlowDrilldown.tsx](../src/pages/management/reports/cash-flow/CashFlowDrilldown.tsx) | page | not DataTable |
| Aylık Nakit Akış Özeti | [reports/cash-flow/CashFlowReportPage.tsx:362](../src/pages/management/reports/cash-flow/CashFlowReportPage.tsx#L362) | page | - |
| DBS Limit Kullanımı | [reports/cash-flow/CashFlowReportPage.tsx:403](../src/pages/management/reports/cash-flow/CashFlowReportPage.tsx#L403) | page | - |

### Manufacturing (`pages/manufacturing`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| _(no title)_ | [capacity-shared/MachineList.tsx:55](../src/pages/manufacturing/capacity-shared/MachineList.tsx#L55) | page | - |
| _(no title)_ | [cnc-cutting/capacity/planning/CncPlanningPage.tsx:197](../src/pages/manufacturing/cnc-cutting/capacity/planning/CncPlanningPage.tsx#L197) | page | - |
| Planlanmış Görevler | [cnc-cutting/capacity/planning/CncPlanningPage.tsx:572](../src/pages/manufacturing/cnc-cutting/capacity/planning/CncPlanningPage.tsx#L572) | page | - |
| Planlanmamış Görevler | [cnc-cutting/capacity/planning/CncPlanningPage.tsx:589](../src/pages/manufacturing/cnc-cutting/capacity/planning/CncPlanningPage.tsx#L589) | page | - |
| Kesim Listesi | [cnc-cutting/cuts/CncCutsPage.tsx:449](../src/pages/manufacturing/cnc-cutting/cuts/CncCutsPage.tsx#L449) | page | - |
| Parça Listesi | [cnc-cutting/cuts/CutDetailsModal.tsx:153](../src/pages/manufacturing/cnc-cutting/cuts/CutDetailsModal.tsx#L153) | modal | - |
| Parçalar | [cnc-cutting/cuts/FinishCutModal.tsx:461](../src/pages/manufacturing/cnc-cutting/cuts/FinishCutModal.tsx#L461) | modal | - |
| Parçalar | [cnc-cutting/cuts/PartsManager.tsx:295](../src/pages/manufacturing/cnc-cutting/cuts/PartsManager.tsx#L295) | page | - |
| _plain Mantine table ×1_ | [cnc-cutting/cuts/PartsManager.tsx](../src/pages/manufacturing/cnc-cutting/cuts/PartsManager.tsx) | page | not DataTable |
| Siparişteki ve gelen saclar | [cnc-cutting/cuts/PlateSource.tsx:636](../src/pages/manufacturing/cnc-cutting/cuts/PlateSource.tsx#L636) | page | - |
| Boş sacı olan partiler | [cnc-cutting/cuts/PlateSource.tsx:853](../src/pages/manufacturing/cnc-cutting/cuts/PlateSource.tsx#L853) | page | - |
| Plaka Kalemleri Listesi | [cnc-cutting/cuts/PlateSource.tsx:1032](../src/pages/manufacturing/cnc-cutting/cuts/PlateSource.tsx#L1032) | page | - |
| _(no title)_ | [cnc-cutting/dashboard/CncDashboardPage.tsx:116](../src/pages/manufacturing/cnc-cutting/dashboard/CncDashboardPage.tsx#L116) | page | - |
| Aktif Zamanlayıcılar | [cnc-cutting/dashboard/CncDashboardPage.tsx:271](../src/pages/manufacturing/cnc-cutting/dashboard/CncDashboardPage.tsx#L271) | page | - |
| Makine Durumları | [cnc-cutting/dashboard/CncDashboardPage.tsx:285](../src/pages/manufacturing/cnc-cutting/dashboard/CncDashboardPage.tsx#L285) | page | - |
| CNC Parça Arama Sonuçları | [cnc-cutting/reports/parts-search/PartsSearchPage.tsx:235](../src/pages/manufacturing/cnc-cutting/reports/parts-search/PartsSearchPage.tsx#L235) | page | - |
| _(no title)_ | [linear-cutting/capacity/planning/LinearPlanningPage.tsx:120](../src/pages/manufacturing/linear-cutting/capacity/planning/LinearPlanningPage.tsx#L120) | page | - |
| Planlanmış Görevler | [linear-cutting/capacity/planning/LinearPlanningPage.tsx:370](../src/pages/manufacturing/linear-cutting/capacity/planning/LinearPlanningPage.tsx#L370) | page | - |
| Planlanmamış Görevler | [linear-cutting/capacity/planning/LinearPlanningPage.tsx:384](../src/pages/manufacturing/linear-cutting/capacity/planning/LinearPlanningPage.tsx#L384) | page | - |
| _plain Mantine table ×1_ | [linear-cutting/cuts/CutsModals.tsx](../src/pages/manufacturing/linear-cutting/cuts/CutsModals.tsx) | modal | not DataTable |
| _plain Mantine table ×1_ | [linear-cutting/cuts/PartsTable.tsx](../src/pages/manufacturing/linear-cutting/cuts/PartsTable.tsx) | page | not DataTable |
| Aktif Zamanlayıcılar | [linear-cutting/dashboard/LinearCuttingDashboardPage.tsx:135](../src/pages/manufacturing/linear-cutting/dashboard/LinearCuttingDashboardPage.tsx#L135) | page | - |
| Makine Durumları | [linear-cutting/dashboard/LinearCuttingDashboardPage.tsx:149](../src/pages/manufacturing/linear-cutting/dashboard/LinearCuttingDashboardPage.tsx#L149) | page | - |
| _plain Mantine table ×1_ | [linear-cutting/shared/BarDiagram.tsx](../src/pages/manufacturing/linear-cutting/shared/BarDiagram.tsx) | page | not DataTable |
| Görev Listesi | [linear-cutting/tasks/LinearCuttingTasksPage.tsx:193](../src/pages/manufacturing/linear-cutting/tasks/LinearCuttingTasksPage.tsx#L193) | page | - |
| _(no title)_ | [linear-cutting/tasks/TaskModals.tsx:73](../src/pages/manufacturing/linear-cutting/tasks/TaskModals.tsx#L73) | modal | - |
| Planlanmış Operasyonlar | [machining/capacity/planning/MachiningPlanningPage.tsx:627](../src/pages/manufacturing/machining/capacity/planning/MachiningPlanningPage.tsx#L627) | page | - |
| _(no title)_ | [machining/create-task/CreateTaskPage.tsx:362](../src/pages/manufacturing/machining/create-task/CreateTaskPage.tsx#L362) | page | - |
| Oluşturduğum Görevler | [machining/create-task/CreateTaskPage.tsx:373](../src/pages/manufacturing/machining/create-task/CreateTaskPage.tsx#L373) | page | - |
| _plain Mantine table ×1_ | [machining/create-task/CreateTaskPage.tsx](../src/pages/manufacturing/machining/create-task/CreateTaskPage.tsx) | page | not DataTable |
| Aktif Zamanlayıcılar | [machining/dashboard/MachiningDashboardPage.tsx:377](../src/pages/manufacturing/machining/dashboard/MachiningDashboardPage.tsx#L377) | page | - |
| Makine Durumları | [machining/dashboard/MachiningDashboardPage.tsx:399](../src/pages/manufacturing/machining/dashboard/MachiningDashboardPage.tsx#L399) | page | - |
| Maliyet Analizi Raporu | [machining/reports/cost-analysis/CostAnalysisPage.tsx:220](../src/pages/manufacturing/machining/reports/cost-analysis/CostAnalysisPage.tsx#L220) | page | - |
| Kullanıcı Detayları | [machining/reports/cost-analysis/JobUsersModal.tsx:191](../src/pages/manufacturing/machining/reports/cost-analysis/JobUsersModal.tsx#L191) | modal | - |
| Günlük Verimlilik Raporu | [machining/reports/daily-efficiency/DailyEfficiencyPage.tsx:233](../src/pages/manufacturing/machining/reports/daily-efficiency/DailyEfficiencyPage.tsx#L233) | page | - |
| Kullanıcı Performans Raporu | [machining/reports/performance/PerformanceReportPage.tsx:276](../src/pages/manufacturing/machining/reports/performance/PerformanceReportPage.tsx#L276) | page | - |
| Makine Üretim Planı | [machining/reports/production-plan/ProductionPlanPage.tsx:321](../src/pages/manufacturing/machining/reports/production-plan/ProductionPlanPage.tsx#L321) | page | - |
| Toplam Raporu | [machining/reports/sum-report/SumReportPage.tsx:291](../src/pages/manufacturing/machining/reports/sum-report/SumReportPage.tsx#L291) | page | - |
| _(no title)_ | [machining/tasks/create/MachiningCreateTasksPage.tsx:775](../src/pages/manufacturing/machining/tasks/create/MachiningCreateTasksPage.tsx#L775) | page | - |
| Oluşturduğum Görevler | [machining/tasks/create/MachiningCreateTasksPage.tsx:794](../src/pages/manufacturing/machining/tasks/create/MachiningCreateTasksPage.tsx#L794) | page | - |
| _plain Mantine table ×1_ | [machining/tasks/create/MachiningCreateTasksPage.tsx](../src/pages/manufacturing/machining/tasks/create/MachiningCreateTasksPage.tsx) | page | not DataTable |
| _plain Mantine table ×1_ | [machining/tasks/list/allocations.tsx](../src/pages/manufacturing/machining/tasks/list/allocations.tsx) | page | not DataTable |
| _(no title)_ | [machining/tasks/list/CreatePartModal.tsx:422](../src/pages/manufacturing/machining/tasks/list/CreatePartModal.tsx#L422) | modal | - |
| Parça Listesi | [machining/tasks/list/MachiningPartsPage.tsx:454](../src/pages/manufacturing/machining/tasks/list/MachiningPartsPage.tsx#L454) | page | `machining-parts` |
| _(no title)_ | [machining/tasks/list/PartDetailsModal.tsx:714](../src/pages/manufacturing/machining/tasks/list/PartDetailsModal.tsx#L714) | modal | - |
| _plain Mantine table ×1_ | [machining/tasks/list/PartDetailsModal.tsx](../src/pages/manufacturing/machining/tasks/list/PartDetailsModal.tsx) | modal | not DataTable |
| _plain Mantine table ×1_ | [machining/tasks/list/PartModals.tsx](../src/pages/manufacturing/machining/tasks/list/PartModals.tsx) | modal | not DataTable |
| Aktif Arıza Zamanlayıcıları | [maintenance/dashboard/MaintenanceDashboardPage.tsx:156](../src/pages/manufacturing/maintenance/dashboard/MaintenanceDashboardPage.tsx#L156) | page | - |
| Bugün Çözülen Arızalar | [maintenance/dashboard/MaintenanceDashboardPage.tsx:169](../src/pages/manufacturing/maintenance/dashboard/MaintenanceDashboardPage.tsx#L169) | page | - |
| Arıza Talepleri | [maintenance/fault-requests/FaultRequestsPage.tsx:274](../src/pages/manufacturing/maintenance/fault-requests/FaultRequestsPage.tsx#L274) | page | - |
| Arızalar Özeti | [maintenance/reports/faults/FaultsReportPage.tsx:183](../src/pages/manufacturing/maintenance/reports/faults/FaultsReportPage.tsx#L183) | page | - |
| Aylık Arıza Detayları | [maintenance/reports/monthly-metrics/MonthlyMetricsPage.tsx:241](../src/pages/manufacturing/maintenance/reports/monthly-metrics/MonthlyMetricsPage.tsx#L241) | page | - |
| _(no title)_ | [maintenance/reports/staff-report/StaffDetailModal.tsx:197](../src/pages/manufacturing/maintenance/reports/staff-report/StaffDetailModal.tsx#L197) | modal | - |
| _(no title)_ | [maintenance/reports/staff-report/StaffDetailModal.tsx:205](../src/pages/manufacturing/maintenance/reports/staff-report/StaffDetailModal.tsx#L205) | modal | - |
| Personel Özeti | [maintenance/reports/staff-report/StaffReportPage.tsx:210](../src/pages/manufacturing/maintenance/reports/staff-report/StaffReportPage.tsx#L210) | page | - |
| Kalemler | [material-tracking/MaterialTrackingPage.tsx:357](../src/pages/manufacturing/material-tracking/MaterialTrackingPage.tsx#L357) | page | - |
| Talepler | [material-tracking/pull-requests/PullRequestsPage.tsx:253](../src/pages/manufacturing/material-tracking/pull-requests/PullRequestsPage.tsx#L253) | page | - |
| _plain Mantine table ×1_ | [material-tracking/pullRequestShared.tsx](../src/pages/manufacturing/material-tracking/pullRequestShared.tsx) | page | not DataTable |
| İş Maliyeti Raporu | [reports/combined-job-costs/CombinedJobCostsPage.tsx:120](../src/pages/manufacturing/reports/combined-job-costs/CombinedJobCostsPage.tsx#L120) | page | - |
| Kayıtlar (Tarihe Göre Sıralı) | [reports/combined-job-costs/DepartmentEntriesModal.tsx:51](../src/pages/manufacturing/reports/combined-job-costs/DepartmentEntriesModal.tsx#L51) | modal | - |
| Zamanlayıcı Listesi | [reports-shared/FinishedTimersReport.tsx:363](../src/pages/manufacturing/reports-shared/FinishedTimersReport.tsx#L363) | page | - |
| _(no title)_ | [reports-shared/UserDetailModal.tsx:71](../src/pages/manufacturing/reports-shared/UserDetailModal.tsx#L71) | modal | - |
| _(no title)_ | [reports-shared/UserReport.tsx:149](../src/pages/manufacturing/reports-shared/UserReport.tsx#L149) | page | - |
| Ek Ödemeler | [subcontracting/adjustments/AdjustmentsPage.tsx:180](../src/pages/manufacturing/subcontracting/adjustments/AdjustmentsPage.tsx#L180) | page | - |
| Kesintiler | [subcontracting/adjustments/AdjustmentsPage.tsx:193](../src/pages/manufacturing/subcontracting/adjustments/AdjustmentsPage.tsx#L193) | page | - |
| Alt Kalemler | [subcontracting/labor-pricing/LaborPricingPage.tsx:511](../src/pages/manufacturing/subcontracting/labor-pricing/LaborPricingPage.tsx#L511) | page | - |
| _(no title)_ | [subcontracting/overview/OverviewPage.tsx:446](../src/pages/manufacturing/subcontracting/overview/OverviewPage.tsx#L446) | page | - |
| _plain Mantine table ×3_ | [subcontracting/statements/StatementDetailModal.tsx](../src/pages/manufacturing/subcontracting/statements/StatementDetailModal.tsx) | modal | not DataTable |
| Hakediş Listesi | [subcontracting/statements/StatementsPage.tsx:290](../src/pages/manufacturing/subcontracting/statements/StatementsPage.tsx#L290) | page | - |
| Taşeron Listesi | [subcontracting/subcontractors/SubcontractorsPage.tsx:187](../src/pages/manufacturing/subcontracting/subcontractors/SubcontractorsPage.tsx#L187) | page | - |
| Maliyet Analizi Raporu | [welding/reports/cost-analysis/CostAnalysisPage.tsx:168](../src/pages/manufacturing/welding/reports/cost-analysis/CostAnalysisPage.tsx#L168) | page | - |
| Kullanıcı Detayları | [welding/reports/cost-analysis/UserDetailsModal.tsx:61](../src/pages/manufacturing/welding/reports/cost-analysis/UserDetailsModal.tsx#L61) | modal | - |
| Çalışan Çalışma Saatleri | [welding/reports/user-work-hours/UserWorkHoursPage.tsx:119](../src/pages/manufacturing/welding/reports/user-work-hours/UserWorkHoursPage.tsx#L119) | page | - |
| Ekip Listesi | [welding/teams/WeldingTeamsPage.tsx:226](../src/pages/manufacturing/welding/teams/WeldingTeamsPage.tsx#L226) | page | - |
| _(no title)_ | [welding/time-entries/BulkCreateModal.tsx:409](../src/pages/manufacturing/welding/time-entries/BulkCreateModal.tsx#L409) | modal | - |
| _plain Mantine table ×2_ | [welding/time-entries/BulkCreateModal.tsx](../src/pages/manufacturing/welding/time-entries/BulkCreateModal.tsx) | modal | not DataTable |
| Zaman Kayıtları | [welding/time-entries/TimeEntriesPage.tsx:309](../src/pages/manufacturing/welding/time-entries/TimeEntriesPage.tsx#L309) | page | - |
| _(no title)_ | [welding/timesheets/TimesheetsPage.tsx:386](../src/pages/manufacturing/welding/timesheets/TimesheetsPage.tsx#L386) | page | - |

### Planning (`pages/planning`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| _plain Mantine table ×1_ | [department-requests/DepartmentRequestDetailModal.tsx](../src/pages/planning/department-requests/DepartmentRequestDetailModal.tsx) | modal | not DataTable |
| Aktarılacak Departman Talepleri | [department-requests/DepartmentRequestsPage.tsx:534](../src/pages/planning/department-requests/DepartmentRequestsPage.tsx#L534) | page | - |
| ERP Girişi Bekleyen Planlama Talepleri | [department-requests/DepartmentRequestsPage.tsx:574](../src/pages/planning/department-requests/DepartmentRequestsPage.tsx#L574) | page | - |
| Planlama Talepleri | [department-requests/DepartmentRequestsPage.tsx:616](../src/pages/planning/department-requests/DepartmentRequestsPage.tsx#L616) | page | - |
| _plain Mantine table ×1_ | [department-requests/ExcelImportModal.tsx](../src/pages/planning/department-requests/ExcelImportModal.tsx) | modal | not DataTable |
| _plain Mantine table ×1_ | [department-requests/PlanningRequestDetailModal.tsx](../src/pages/planning/department-requests/PlanningRequestDetailModal.tsx) | modal | not DataTable |
| Stok Kartları | [inventory/cards/InventoryCardsPage.tsx:329](../src/pages/planning/inventory/cards/InventoryCardsPage.tsx#L329) | page | - |
| _(no title)_ | [inventory/cards/ItemRequestsModal.tsx:71](../src/pages/planning/inventory/cards/ItemRequestsModal.tsx#L71) | modal | - |
| _(no title)_ | [inventory/cards/ItemStockModal.tsx:110](../src/pages/planning/inventory/cards/ItemStockModal.tsx#L110) | modal | - |
| _(no title)_ | [inventory/cards/ItemStockModal.tsx:125](../src/pages/planning/inventory/cards/ItemStockModal.tsx#L125) | modal | - |
| Ekipman Listesi | [inventory/equipment/EquipmentPage.tsx:224](../src/pages/planning/inventory/equipment/EquipmentPage.tsx#L224) | page | - |
| Kalemler | [items/PlanningItemsPage.tsx:330](../src/pages/planning/items/PlanningItemsPage.tsx#L330) | page | `planning-items` |
| _(no title)_ | [procurement-lines/CutBreakdownModal.tsx:104](../src/pages/planning/procurement-lines/CutBreakdownModal.tsx#L104) | modal | - |
| _(no title)_ | [procurement-lines/ProcurementLinesModal.tsx:368](../src/pages/planning/procurement-lines/ProcurementLinesModal.tsx#L368) | modal | - |
| Satın Alma Bekleyen İş Emirleri | [procurement-lines/ProcurementLinesPage.tsx:301](../src/pages/planning/procurement-lines/ProcurementLinesPage.tsx#L301) | page | - |
| Malzeme Maliyeti Girilmiş İş Emirleri | [procurement-lines/ProcurementLinesPage.tsx:335](../src/pages/planning/procurement-lines/ProcurementLinesPage.tsx#L335) | page | - |
| Şablon Görevleri | [task-templates/ManageItemsModal.tsx:347](../src/pages/planning/task-templates/ManageItemsModal.tsx#L347) | modal | - |
| _plain Mantine table ×1_ | [task-templates/ManageItemsModal.tsx](../src/pages/planning/task-templates/ManageItemsModal.tsx) | modal | not DataTable |
| Görev Şablonları | [task-templates/TaskTemplatesPage.tsx:194](../src/pages/planning/task-templates/TaskTemplatesPage.tsx#L194) | page | - |

### Procurement (`pages/procurement`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| _(no title)_ | [critical-items/CriticalItemsPage.tsx:234](../src/pages/procurement/critical-items/CriticalItemsPage.tsx#L234) | page | - |
| _(no title)_ | [payment-lists/DetailView.tsx:574](../src/pages/procurement/payment-lists/DetailView.tsx#L574) | page | - |
| Ödeme Listeleri | [payment-lists/ListsView.tsx:227](../src/pages/procurement/payment-lists/ListsView.tsx#L227) | page | - |
| _(no title)_ | [payment-lists/PoolPicker.tsx:68](../src/pages/procurement/payment-lists/PoolPicker.tsx#L68) | page | - |
| Ödeme Havuzu | [payment-lists/PoolView.tsx:108](../src/pages/procurement/payment-lists/PoolView.tsx#L108) | page | - |
| Kalemler | [planning-items/ProcurementPlanningItemsPage.tsx:149](../src/pages/procurement/planning-items/ProcurementPlanningItemsPage.tsx#L149) | page | `procurement-planning-items` |
| Malzeme Listesi | [purchase-requests/create/CreatePurchaseRequestPage.tsx:454](../src/pages/procurement/purchase-requests/create/CreatePurchaseRequestPage.tsx#L454) | page | - |
| _plain Mantine table ×1_ | [purchase-requests/create/dialogs/DraftDialogs.tsx](../src/pages/procurement/purchase-requests/create/dialogs/DraftDialogs.tsx) | modal | not DataTable |
| _plain Mantine table ×1_ | [purchase-requests/create/dialogs/MergeModal.tsx](../src/pages/procurement/purchase-requests/create/dialogs/MergeModal.tsx) | modal | not DataTable |
| _plain Mantine table ×1_ | [purchase-requests/create/dialogs/OfferModal.tsx](../src/pages/procurement/purchase-requests/create/dialogs/OfferModal.tsx) | modal | not DataTable |
| Planlama Talebi Malzemeleri | [purchase-requests/create/dialogs/PlanningItemsModal.tsx:567](../src/pages/procurement/purchase-requests/create/dialogs/PlanningItemsModal.tsx#L567) | modal | - |
| _plain Mantine table ×1_ | [purchase-requests/create/dialogs/PlanningItemsModal.tsx](../src/pages/procurement/purchase-requests/create/dialogs/PlanningItemsModal.tsx) | modal | not DataTable |
| _(no title)_ | [purchase-requests/pending/PendingRequestsPage.tsx:317](../src/pages/procurement/purchase-requests/pending/PendingRequestsPage.tsx#L317) | page | - |
| Tüm Satın Alma Talepleri | [purchase-requests/registry/RegistryPage.tsx:308](../src/pages/procurement/purchase-requests/registry/RegistryPage.tsx#L308) | page | - |
| Ürün Raporu | [reports/items/ItemsReportPage.tsx:127](../src/pages/procurement/reports/items/ItemsReportPage.tsx#L127) | page | - |
| Personel Raporu | [reports/staff/StaffReportPage.tsx:155](../src/pages/procurement/reports/staff/StaffReportPage.tsx#L155) | page | - |
| Tedarikçi Raporu | [reports/suppliers/SuppliersReportPage.tsx:248](../src/pages/procurement/reports/suppliers/SuppliersReportPage.tsx#L248) | page | - |
| _plain Mantine table ×1_ | [suppliers/list/SupplierPurchaseHistoryModal.tsx](../src/pages/procurement/suppliers/list/SupplierPurchaseHistoryModal.tsx) | modal | not DataTable |
| _plain Mantine table ×2_ | [suppliers/list/SupplierRatingsModal.tsx](../src/pages/procurement/suppliers/list/SupplierRatingsModal.tsx) | modal | not DataTable |
| Tüm Tedarikçiler | [suppliers/list/SuppliersPage.tsx:306](../src/pages/procurement/suppliers/list/SuppliersPage.tsx#L306) | page | `suppliers` |
| Tüm Ödeme Koşulları | [suppliers/payment-terms/PaymentTermsPage.tsx:202](../src/pages/procurement/suppliers/payment-terms/PaymentTermsPage.tsx#L202) | page | - |

### Projects (`pages/projects`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| _(no title)_ | [estimate-report/WeldTable.tsx:61](../src/pages/projects/estimate-report/WeldTable.tsx#L61) | page | - |
| _(no title)_ | [estimates/EstimatesPage.tsx:232](../src/pages/projects/estimates/EstimatesPage.tsx#L232) | page | - |
| _plain Mantine table ×1_ | [project-tracking/detail/CreatePhasesForm.tsx](../src/pages/projects/project-tracking/detail/CreatePhasesForm.tsx) | tab | not DataTable |
| _(no title)_ | [project-tracking/detail/DesignTab.tsx:215](../src/pages/projects/project-tracking/detail/DesignTab.tsx#L215) | tab | - |
| _(no title)_ | [project-tracking/detail/GenelTab.tsx:230](../src/pages/projects/project-tracking/detail/GenelTab.tsx#L230) | tab | - |
| _(no title)_ | [project-tracking/detail/GenelTab.tsx:344](../src/pages/projects/project-tracking/detail/GenelTab.tsx#L344) | tab | - |
| _plain Mantine table ×1_ | [project-tracking/detail/GenelTab.tsx](../src/pages/projects/project-tracking/detail/GenelTab.tsx) | tab | not DataTable |
| _plain Mantine table ×1_ | [project-tracking/detail/PriceTiersTab.tsx](../src/pages/projects/project-tracking/detail/PriceTiersTab.tsx) | tab | not DataTable |
| Uygunsuzluk Raporları | [project-tracking/detail/QualityTab.tsx:86](../src/pages/projects/project-tracking/detail/QualityTab.tsx#L86) | tab | - |
| Departman Görevleri | [project-tracking/detail/TasksTab.tsx:223](../src/pages/projects/project-tracking/detail/TasksTab.tsx#L223) | tab | - |
| İş Emri Listesi | [project-tracking/ProjectTrackingPage.tsx:781](../src/pages/projects/project-tracking/ProjectTrackingPage.tsx#L781) | page | - |
| _plain Mantine table ×1_ | [project-tracking/task-planner/TaskPlannerModal.tsx](../src/pages/projects/project-tracking/task-planner/TaskPlannerModal.tsx) | modal | not DataTable |
| _(no title)_ | [references/CalibrationTab.tsx:443](../src/pages/projects/references/CalibrationTab.tsx#L443) | tab | - |
| _(no title)_ | [references/CostHistoryTab.tsx:348](../src/pages/projects/references/CostHistoryTab.tsx#L348) | tab | - |
| _(no title)_ | [references/WeldListModal.tsx:412](../src/pages/projects/references/WeldListModal.tsx#L412) | modal | - |

### Quality control (`pages/quality-control`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| KK Maliyeti Girilmemiş İş Emirleri | [cost-lines/CostLinesPage.tsx:173](../src/pages/quality-control/cost-lines/CostLinesPage.tsx#L173) | page | - |
| KK Maliyeti Girilmiş İş Emirleri | [cost-lines/CostLinesPage.tsx:206](../src/pages/quality-control/cost-lines/CostLinesPage.tsx#L206) | page | - |
| Kalite Evrakları | [documents/DocumentsPage.tsx:227](../src/pages/quality-control/documents/DocumentsPage.tsx#L227) | page | - |
| Uygunsuzluk Raporları | [ncrs/NcrsPage.tsx:410](../src/pages/quality-control/ncrs/NcrsPage.tsx#L410) | page | `ncrs` |
| KK İncelemeleri | [qc-reviews/QcReviewsPage.tsx:232](../src/pages/quality-control/qc-reviews/QcReviewsPage.tsx#L232) | page | `qc-reviews` |
| _plain Mantine table ×1_ | [qc-reviews/ReviewDetailModal.tsx](../src/pages/quality-control/qc-reviews/ReviewDetailModal.tsx) | modal | not DataTable |

### Sales (`pages/sales`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| Maliyet Tablosu | [cost-table/CostTablePage.tsx:274](../src/pages/sales/cost-table/CostTablePage.tsx#L274) | page | - |
| _(no title)_ | [cost-table/FasonDetailsModal.tsx:193](../src/pages/sales/cost-table/FasonDetailsModal.tsx#L193) | modal | - |
| Kayıtlar (Tarihe Göre Sıralı) | [cost-table/modals.tsx:273](../src/pages/sales/cost-table/modals.tsx#L273) | modal | - |
| Kayıtlar (Tarihe Göre Sıralı) | [cost-table/modals.tsx:376](../src/pages/sales/cost-table/modals.tsx#L376) | modal | - |
| Malzeme Satırları | [cost-table/modals.tsx:475](../src/pages/sales/cost-table/modals.tsx#L475) | modal | - |
| Taşeron Atamaları | [cost-table/modals.tsx:607](../src/pages/sales/cost-table/modals.tsx#L607) | modal | - |
| Müşteri Listesi | [customers/CustomersPage.tsx:240](../src/pages/sales/customers/CustomersPage.tsx#L240) | page | - |
| _plain Mantine table ×1_ | [offers/dialogs/DecisionModals.tsx](../src/pages/sales/offers/dialogs/DecisionModals.tsx) | modal | not DataTable |
| _plain Mantine table ×1_ | [offers/dialogs/NodeHistoryModal.tsx](../src/pages/sales/offers/dialogs/NodeHistoryModal.tsx) | modal | not DataTable |
| _plain Mantine table ×2_ | [offers/dialogs/PasteModals.tsx](../src/pages/sales/offers/dialogs/PasteModals.tsx) | modal | not DataTable |
| Teklifler | [offers/OffersPage.tsx:415](../src/pages/sales/offers/OffersPage.tsx#L415) | page | `sales-offers` |
| Onay Geçmişi | [offers/tabs/ApprovalTab.tsx:304](../src/pages/sales/offers/tabs/ApprovalTab.tsx#L304) | tab | - |
| _plain Mantine table ×1_ | [offers/tabs/ApprovalTab.tsx](../src/pages/sales/offers/tabs/ApprovalTab.tsx) | tab | not DataTable |
| Departman Görüşleri | [offers/tabs/ConsultationsTab.tsx:170](../src/pages/sales/offers/tabs/ConsultationsTab.tsx#L170) | tab | - |
| _plain Mantine table ×2_ | [offers/tabs/PricingTab.tsx](../src/pages/sales/offers/tabs/PricingTab.tsx) | tab | not DataTable |

### Shared (`pages/shared`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| Görev Listesi | [department-tasks/DepartmentTasksPage.tsx:625](../src/pages/shared/department-tasks/DepartmentTasksPage.tsx#L625) | page | `department-tasks` |
| _plain Mantine table ×1_ | [department-tasks/dialogs/OtherDialogs.tsx](../src/pages/shared/department-tasks/dialogs/OtherDialogs.tsx) | modal | not DataTable |
| _plain Mantine table ×2_ | [department-tasks/tabs/AssignmentTabs.tsx](../src/pages/shared/department-tasks/tabs/AssignmentTabs.tsx) | tab | not DataTable |
| _plain Mantine table ×3_ | [department-tasks/tabs/QualityTabs.tsx](../src/pages/shared/department-tasks/tabs/QualityTabs.tsx) | tab | not DataTable |

### Warehouse (`pages/warehouse`)

| Table | File | Kind | columnsKey |
|---|---|---|---|
| Sayım Satırları | [counts/StockCountDetail.tsx:456](../src/pages/warehouse/counts/StockCountDetail.tsx#L456) | page | - |
| Sayımlar | [counts/StockCountsPage.tsx:198](../src/pages/warehouse/counts/StockCountsPage.tsx#L198) | page | - |
| Stok Kartları | [inventories/InventoryPages.tsx:567](../src/pages/warehouse/inventories/InventoryPages.tsx#L567) | page | - |
| Sac ve Boy Lotları | [inventories/InventoryPages.tsx:589](../src/pages/warehouse/inventories/InventoryPages.tsx#L589) | page | - |
| İşler | [inventories/InventoryPages.tsx:794](../src/pages/warehouse/inventories/InventoryPages.tsx#L794) | page | - |
| _plain Mantine table ×1_ | [inventories/InventoryPages.tsx](../src/pages/warehouse/inventories/InventoryPages.tsx) | page | not DataTable |
| Mikro ile karşılaştırma | [mikro-comparison/MikroComparisonPage.tsx:137](../src/pages/warehouse/mikro-comparison/MikroComparisonPage.tsx#L137) | page | - |
| Sayım Satırları | [piece-counts/PieceCountDetail.tsx:577](../src/pages/warehouse/piece-counts/PieceCountDetail.tsx#L577) | page | - |
| Sayımlar | [piece-counts/PieceCountsPage.tsx:199](../src/pages/warehouse/piece-counts/PieceCountsPage.tsx#L199) | page | - |
| _(no title)_ | [pieces/PiecesPage.tsx:1332](../src/pages/warehouse/pieces/PiecesPage.tsx#L1332) | page | - |
| Kartlar | [pieces/PiecesPage.tsx:1360](../src/pages/warehouse/pieces/PiecesPage.tsx#L1360) | page | - |
| _plain Mantine table ×1_ | [pieces/PiecesPage.tsx](../src/pages/warehouse/pieces/PiecesPage.tsx) | page | not DataTable |
| Fişler | [production/ProductionSlipsPage.tsx:608](../src/pages/warehouse/production/ProductionSlipsPage.tsx#L608) | page | - |
| _plain Mantine table ×2_ | [production/ProductionSlipsPage.tsx](../src/pages/warehouse/production/ProductionSlipsPage.tsx) | page | not DataTable |
| Bekleyen Siparişler | [receipts/GoodsReceiptsPage.tsx:712](../src/pages/warehouse/receipts/GoodsReceiptsPage.tsx#L712) | page | - |
| Mal Kabuller | [receipts/GoodsReceiptsPage.tsx:831](../src/pages/warehouse/receipts/GoodsReceiptsPage.tsx#L831) | page | - |
| _plain Mantine table ×2_ | [receipts/GoodsReceiptsPage.tsx](../src/pages/warehouse/receipts/GoodsReceiptsPage.tsx) | page | not DataTable |
| Transferler | [transfers/TransfersPage.tsx:551](../src/pages/warehouse/transfers/TransfersPage.tsx#L551) | page | - |
| _plain Mantine table ×2_ | [transfers/TransfersPage.tsx](../src/pages/warehouse/transfers/TransfersPage.tsx) | page | not DataTable |
| Parçalar ve Düşülecek Ağırlık | [weight-reduction/WeightReductionPage.tsx:211](../src/pages/warehouse/weight-reduction/WeightReductionPage.tsx#L211) | page | - |
| _(no title)_ | [weight-reduction/WeightReductionPage.tsx:303](../src/pages/warehouse/weight-reduction/WeightReductionPage.tsx#L303) | page | - |
