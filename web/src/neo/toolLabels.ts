// What the chip under a Neo answer says while a tool runs. One entry per tool
// in gemkom-backend assistant/tools (registry order); a tool missing here
// shows the generic label instead of its code name.

export const TOOL_LABELS: Record<string, string> = {
  // İş emirleri
  search_job_orders: 'İş emirleri aranıyor',
  find_job_number: 'İş emri numarası bulunuyor',
  get_job_order_brief: 'İş emri özeti alınıyor',
  get_job_timeline: 'İş emri geçmişi alınıyor',
  get_job_costs: 'Maliyetler alınıyor',
  get_drawing_release_status: 'Çizim yayınları alınıyor',
  get_job_order_hours: 'Çalışma saatleri alınıyor',
  // Malzeme ve planlama
  get_material_status: 'Malzeme durumu alınıyor',
  get_planning_requests: 'Planlama talepleri alınıyor',
  // Tartışmalar
  get_my_mentions: 'Etiketlenmeler alınıyor',
  get_discussions: 'Tartışmalar okunuyor',
  // Üretim
  get_qc_status: 'Kalite kontrol durumu alınıyor',
  get_cutting_status: 'Kesim durumu alınıyor',
  get_machine_faults: 'Makine arızaları alınıyor',
  // Satın alma
  get_purchase_requests: 'Satın alma talepleri alınıyor',
  get_purchase_order_status: 'Siparişler alınıyor',
  get_item_price_history: 'Fiyat geçmişi alınıyor',
  get_supplier_brief: 'Tedarikçi bilgisi alınıyor',
  // Ticari
  get_cost_benchmark: 'Maliyet karşılaştırması yapılıyor',
  get_sales_offers: 'Satış teklifleri alınıyor',
  get_overtime_report: 'Mesai raporu alınıyor',
  get_subcontractor_status: 'Taşeron durumu alınıyor',
  // Kişiler ve kişisel
  who_does_what: 'Kim ne yapıyor bakılıyor',
  get_my_summary: 'Kişisel özet alınıyor',
  get_my_work: 'İşleriniz alınıyor',
  get_my_attendance: 'Devam kaydınız alınıyor',
  get_my_approvals: 'Onay bekleyenler alınıyor',
  get_my_notifications: 'Bildirimleriniz alınıyor',
  // Rehber ve veri
  search_docs: 'Rehberler aranıyor',
  read_doc: 'Rehber okunuyor',
  describe_data: 'Veri yapısı inceleniyor',
  query_data: 'Veri sorgulanıyor',
  get_daily_summary: 'Günlük özet okunuyor',
  // Toplamlar (aggregates.py)
  get_portfolio_financials: 'Kâr ve marj toplamları hesaplanıyor',
  get_workload_overview: 'İş yükü toplanıyor',
  get_procurement_spend: 'Satın alma harcaması hesaplanıyor',
};

export const GENERIC_TOOL_LABEL = 'Veri alınıyor';

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? GENERIC_TOOL_LABEL;
}
