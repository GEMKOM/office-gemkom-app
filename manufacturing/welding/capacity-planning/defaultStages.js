// Default welding stages (Montaj, Kaynak ve Taşlama) shared by "İş Ekle"
// and "Varsayılan aşamaları oluştur". The bulk-save payload already carries
// these objects; the server must not also be asked to create_default_stages.

export const DEFAULT_STAGE_TITLES = ['Montaj', 'Kaynak ve Taşlama'];

/**
 * Build the two default stages.
 *
 * Dates/duration copy the assignment subtask when it has a schedule, so
 * creating stages after planning the block row cannot drop that window on
 * save (buildPayload sends stages and omits subtask_schedule once any stage
 * exists).
 */
export function defaultStagesFrom(subtask, nextCid) {
    const seed = Number(subtask?.progress || 0);
    return DEFAULT_STAGE_TITLES.map(title => ({
        cid: nextCid(),
        id: null,
        title,
        is_default: true,
        weight: 10,
        status: seed > 0 ? 'in_progress' : 'pending',
        progress: seed,
        duration_wd: subtask?.duration_wd ?? null,
        start_date: subtask?.start_date || null,
        end_date: subtask?.end_date || null,
        note: '',
        deleted: false,
    }));
}
