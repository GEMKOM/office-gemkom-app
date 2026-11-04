import {
  ANGLE_TOL_DEG,
  formatAngleTr,
  MAX_ANGLE_DEG,
  setbackFromAngle,
} from '@/pages/manufacturing/linear-cutting/shared/lcGeometry';
import {
  ActionIcon,
  Checkbox,
  Group,
  NativeSelect,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { Fragment, useState, type ReactNode } from 'react';
import { searchOpenJobOrders, searchStockItems } from '@/api/manufacturing/linearCuttingSessions';
import { FaIcon, SelectRemote } from '@/ui';
import classes from './cuts.module.css';
import {
  applySetback,
  castNumber,
  effectiveHeight,
  ownHeight,
  pickItem,
  reapplySetbacks,
  round2,
  shapeSpec,
  SIDES,
  typeAngle,
  type PartRow,
  type SideConfig,
} from './partRows';
import { PiecePictogram } from './PiecePictogram';

export interface PartsTableProps {
  rows: PartRow[];
  /** The saved row in inline edit, if any. */
  editingId: string | null;
  savingId: string | null;
  /** The plan's stock length, the placeholder of the Stok (mm) inputs. */
  sessionStockMm?: number | null;
  onChange: (row: PartRow) => void;
  onEdit: (row: PartRow) => void;
  onSave: (row: PartRow) => void;
  onCancel: (row: PartRow) => void;
  onCopy: (row: PartRow) => void;
  onRemoveNew: (row: PartRow) => void;
  onDelete: (row: PartRow) => void;
}

type TextField =
  | 'order'
  | 'profile_height_mm'
  | 'label'
  | 'image_no'
  | 'stock_length_mm'
  | 'nominal_length_mm'
  | 'quantity';

// Whole-millimetre fields carry step="1" so the browser flags a decimal
// before the request goes out (see INTEGER_MM_FIELDS).
const STEP: Partial<Record<TextField, string>> = {
  profile_height_mm: '1',
  stock_length_mm: '1',
  quantity: '1',
  nominal_length_mm: '0.01',
};

function Dash({ center = false }: { center?: boolean }) {
  return (
    <Text span c="dimmed" size="sm" ta={center ? 'center' : undefined} display="block">
      —
    </Text>
  );
}

function Truncated({ value, width }: { value: string; width: number }) {
  return value ? (
    <div className={classes.truncate} style={{ maxWidth: width }} title={value}>
      {value}
    </div>
  ) : (
    <Dash />
  );
}

function BoolMark({ value }: { value: boolean }) {
  return value ? (
    <Text ta="center" c="green" fw={700}>
      ✓
    </Text>
  ) : (
    <Dash center />
  );
}

function HeadTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip label={label} multiline w={300} withArrow>
      <span style={{ cursor: 'help' }}>{children}</span>
    </Tooltip>
  );
}

/** "Sol uç → 12° (alt uzun)": what the end works out to now. */
function GeomReadout({ row, rows, cfg }: { row: PartRow; rows: PartRow[]; cfg: SideConfig }) {
  const h = effectiveHeight(row, rows);
  const angle = castNumber(row[cfg.angleField], 0);
  if (h <= 0) {
    return (
      <Text span c="orange.8" size="sm">
        <FaIcon icon="fas fa-triangle-exclamation" style={{ marginRight: 4 }} />
        Kesit girin
      </Text>
    );
  }
  if (Math.abs(angle) > MAX_ANGLE_DEG) {
    return (
      <Text span c="red" fw={600} size="sm">
        {round2(angle)}° — en fazla ±{MAX_ANGLE_DEG}°
      </Text>
    );
  }
  return (
    <Text span fw={600} size="sm">
      {formatAngleTr(angle)}
    </Text>
  );
}

function GeomSide({
  row,
  rows,
  cfg,
  editable,
  onChange,
}: {
  row: PartRow;
  rows: PartRow[];
  cfg: SideConfig;
  editable: boolean;
  onChange: (row: PartRow) => void;
}) {
  const stored = row[cfg.setbackField];
  const angle = castNumber(row[cfg.angleField], 0);
  const [magnitude, setMagnitude] = useState(
    stored != null ? String(round2(Math.abs(stored))) : '',
  );
  const [sign, setSign] = useState<'near' | 'far'>(
    stored != null ? (stored >= 0 ? 'near' : 'far') : angle >= 0 ? 'near' : 'far',
  );
  // A hand-typed angle clears the measurement; clear the box with it.
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    if (stored == null && magnitude !== '') setMagnitude('');
  }

  const h = effectiveHeight(row, rows);
  // With no stored measurement, show what the current angle works out to — as
  // a placeholder, so nothing is persisted unless it is actually typed.
  const equivalent =
    stored == null && h > 0 && Math.abs(angle) >= ANGLE_TOL_DEG
      ? `≈ ${round2(Math.abs(setbackFromAngle(angle, h)))}`
      : '—';

  if (!editable) {
    return (
      <div className={classes.geomSide}>
        <span className={classes.geomSideLabel}>{cfg.label} uç</span>
        <span className={classes.geomStatic}>
          {stored != null ? (
            `${round2(Math.abs(stored))} mm · ${stored >= 0 ? 'alt uzun' : 'üst uzun'}`
          ) : (
            <Text span c="dimmed" size="sm">
              açı doğrudan girilmiş
            </Text>
          )}
        </span>
        <span className={classes.geomArrow}>→</span>
        <GeomReadout row={row} rows={rows} cfg={cfg} />
      </div>
    );
  }

  return (
    <div className={classes.geomSide}>
      <span className={classes.geomSideLabel}>{cfg.label} uç</span>
      <TextInput
        size="xs"
        w={104}
        type="number"
        min={0}
        step="0.01"
        aria-label={`${cfg.label} uç köşe farkı (mm)`}
        title="Uçtaki iki köşe arasındaki boy farkı (mm) — açı = atan(fark ÷ kesit)"
        placeholder={equivalent}
        value={magnitude}
        onChange={(e) => {
          const value = e.currentTarget.value;
          setMagnitude(value);
          const next = applySetback(row, rows, cfg.side, value, sign);
          setSeen(next[cfg.setbackField]);
          onChange(next);
        }}
      />
      <NativeSelect
        size="xs"
        w={106}
        aria-label={`${cfg.label} uç uzun kenar`}
        title="Hangi kenar daha uzun kalıyor?"
        value={sign}
        data={[
          { value: 'near', label: 'alt uzun' },
          { value: 'far', label: 'üst uzun' },
        ]}
        onChange={(e) => {
          const value = e.currentTarget.value === 'far' ? 'far' : 'near';
          setSign(value);
          const next = applySetback(row, rows, cfg.side, magnitude, value);
          setSeen(next[cfg.setbackField]);
          onChange(next);
        }}
      />
      <span className={classes.geomArrow}>→</span>
      <GeomReadout row={row} rows={rows} cfg={cfg} />
    </div>
  );
}

/** The "Kenar ölçüsünden açı" panel under a row. */
function GeomPanel({
  row,
  rows,
  editable,
  onChange,
}: {
  row: PartRow;
  rows: PartRow[];
  editable: boolean;
  onChange: (row: PartRow) => void;
}) {
  const h = effectiveHeight(row, rows);
  const inherited = h > 0 && ownHeight(row) <= 0;
  return (
    <div className={classes.geomPanel}>
      <div className={classes.geomDrawing}>
        <PiecePictogram spec={shapeSpec(row, rows)} width={392} height={136} dimensions />
      </div>
      <div className={classes.geomForm}>
        <div className={classes.geomHead}>
          <span>
            <FaIcon icon="fas fa-ruler-combined" style={{ marginRight: 4 }} />
            Kenar ölçüsünden açı
          </span>
          <span className={classes.geomKesit}>
            {h > 0 ? (
              <>
                Kesit: <strong>{round2(h)} mm</strong>
                {inherited ? (
                  <Text span c="dimmed" size="sm">
                    {' '}
                    (malzemeden)
                  </Text>
                ) : null}
              </>
            ) : (
              <Text span c="orange.8" size="sm">
                Kesit (mm) girilmedi
              </Text>
            )}
          </span>
        </div>
        {SIDES.map((cfg) => (
          <GeomSide
            key={cfg.side}
            row={row}
            rows={rows}
            cfg={cfg}
            editable={editable}
            onChange={onChange}
          />
        ))}
        <div className={classes.geomHint}>
          Resimde açı yoksa, o uçtaki <strong>iki köşe arasındaki boy farkını</strong> girin — açı
          kesitten hesaplanır ve şekil anında güncellenir. Açıyı doğrudan yazarsanız buradaki ölçü
          temizlenir.
        </div>
      </div>
    </div>
  );
}

/** Port of the legacy parts table: rows edit in place, new rows save in bulk. */
export function PartsTable({
  rows,
  editingId,
  savingId,
  sessionStockMm,
  onChange,
  onEdit,
  onSave,
  onCancel,
  onCopy,
  onRemoveNew,
  onDelete,
}: PartsTableProps) {
  // Stok (mm) override column — rarely used, collapsed by default.
  const [stockOpen, setStockOpen] = useState(false);
  const [openGeom, setOpenGeom] = useState<ReadonlySet<string>>(() => new Set());

  const isEditable = (row: PartRow) => !row.id || row.rowId === editingId;

  const input = (
    row: PartRow,
    field: TextField,
    opts: { placeholder?: string; min?: number } = {},
  ) => {
    const numeric = field !== 'label' && field !== 'image_no';
    return (
      <TextInput
        size="xs"
        miw={60}
        type={numeric ? 'number' : 'text'}
        min={opts.min}
        step={STEP[field]}
        placeholder={opts.placeholder}
        aria-label={FIELD_LABEL[field]}
        value={row[field]}
        onChange={(e) => {
          const value = e.currentTarget.value;
          let next: PartRow = { ...row, [field]: value };
          if (field === 'profile_height_mm') {
            next = reapplySetbacks(
              next,
              rows.map((r) => (r.rowId === row.rowId ? next : r)),
            );
          }
          onChange(next);
        }}
      />
    );
  };

  const angleInput = (row: PartRow, cfg: SideConfig) => (
    <TextInput
      size="xs"
      miw={60}
      type="number"
      aria-label={`${cfg.label} Açı`}
      value={row[cfg.angleField]}
      onChange={(e) => onChange(typeAngle(row, cfg.side, e.currentTarget.value))}
    />
  );

  const toggleGeom = (rowId: string) =>
    setOpenGeom((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });

  const center = (node: ReactNode) => <div style={{ textAlign: 'center' }}>{node}</div>;

  const columnCount = 15;

  return (
    <div className={classes.tableWrap}>
      <Table className={classes.table} highlightOnHover verticalSpacing={4} fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={52} ta="center">
              #
            </Table.Th>
            <Table.Th w={120}>İş No</Table.Th>
            <Table.Th w={170}>Malzeme</Table.Th>
            <Table.Th w={90} ta="center">
              <HeadTip label="Malzemenin açı düzlemindeki kesit ölçüsü: boru için dış çap, kutu profil için açı yönündeki kenar. Malzeme başına BİR satırda girilmesi yeterli — aynı malzemenin diğer satırlarına otomatik uygulanır. Düz kesimlerde gerekmez.">
                Kesit (mm)
              </HeadTip>
            </Table.Th>
            <Table.Th w={150}>Parça Adı</Table.Th>
            <Table.Th w={120}>Resim No</Table.Th>
            <Table.Th w={stockOpen ? 110 : 40} ta="center">
              {stockOpen ? (
                <Group gap={4} justify="center" wrap="nowrap">
                  Stok (mm)
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    aria-label="Sütunu daralt"
                    title="Sütunu daralt"
                    onClick={() => setStockOpen(false)}
                  >
                    <FaIcon icon="fas fa-compress" />
                  </ActionIcon>
                </Group>
              ) : (
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  aria-label="Stok boyu (mm) sütununu genişlet"
                  title="Stok boyu (mm) sütununu genişlet — özel durumlarda bar boyu satır bazında değiştirilebilir"
                  onClick={() => setStockOpen(true)}
                >
                  <FaIcon icon="fas fa-ruler-horizontal" />
                </ActionIcon>
              )}
            </Table.Th>
            <Table.Th w={120} ta="center">
              Uzunluk (mm)
            </Table.Th>
            <Table.Th w={80} ta="center">
              Adet
            </Table.Th>
            <Table.Th w={90} ta="center">
              Sol Açı
            </Table.Th>
            <Table.Th w={90} ta="center">
              Sağ Açı
            </Table.Th>
            <Table.Th w={132} ta="center">
              <HeadTip label="Parçanın ölçekli görünümü — açılar birebir, boy kesite göre ölçekli. Tıklayınca kenar ölçüsü paneli açılır.">
                Şekil
              </HeadTip>
            </Table.Th>
            <Table.Th w={44} ta="center">
              <HeadTip label="Döndür — optimizasyon parçayı 180° döndürerek ortak kesim oluşturabilir. Simetrik profillerde açık bırakın.">
                <FaIcon icon="fas fa-arrows-rotate" />
              </HeadTip>
            </Table.Th>
            <Table.Th w={44} ta="center">
              <HeadTip label="Büküm — parça kesimden sonra bükülür; boy olarak açınım (düz) boyu girilmelidir.">
                <FaIcon icon="fas fa-wave-square" />
              </HeadTip>
            </Table.Th>
            <Table.Th w={100} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={columnCount}>
                <div className={classes.empty}>
                  <FaIcon icon="fas fa-puzzle-piece" />
                  <p>Henüz parça yok — &quot;Parça Ekle&quot; ile başlayın</p>
                </div>
              </Table.Td>
            </Table.Tr>
          ) : null}
          {rows.map((row) => {
            const editable = isEditable(row);
            const geomOpen = openGeom.has(row.rowId);
            const derived = row.setback_left_mm != null || row.setback_right_mm != null;
            const saving = savingId === row.rowId;
            const stockPh = sessionStockMm ? `Varsayılan: ${sessionStockMm}` : '';
            return (
              <Fragment key={row.rowId}>
                <Table.Tr data-row-id={row.rowId}>
                  <Table.Td>
                    {editable ? (
                      input(row, 'order', { min: 0 })
                    ) : (
                      <Text ta="center" c="dimmed" fw={700} size="sm">
                        {row.order || '—'}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {editable ? (
                      <div style={{ minWidth: 120 }}>
                        <SelectRemote
                          size="xs"
                          placeholder="İş no seçin…"
                          minSearchLength={2}
                          queryKey={['lc-job-orders']}
                          search={(q, signal) => searchOpenJobOrders(q, signal)}
                          initialOptions={
                            row.jobNo
                              ? [{ value: row.jobNo, label: row.jobLabel || row.jobNo }]
                              : []
                          }
                          comboboxProps={{ width: 280, position: 'bottom-start' }}
                          value={row.jobNo || null}
                          onChange={(value, option) =>
                            onChange({ ...row, jobNo: value ?? '', jobLabel: option?.label ?? '' })
                          }
                        />
                      </div>
                    ) : row.jobNo ? (
                      <div className={classes.truncate} style={{ maxWidth: 120 }} title={row.jobNo}>
                        <Text span fw={600} size="sm">
                          {row.jobNo}
                        </Text>
                      </div>
                    ) : (
                      <Dash />
                    )}
                  </Table.Td>
                  <Table.Td>
                    {editable ? (
                      <div style={{ minWidth: 160 }}>
                        <SelectRemote
                          size="xs"
                          placeholder="Malzeme seçin…"
                          minSearchLength={2}
                          queryKey={['lc-stock-items']}
                          search={(q, signal) => searchStockItems(q, signal)}
                          initialOptions={
                            row.item ? [{ value: row.item, label: row.itemLabel || row.item }] : []
                          }
                          comboboxProps={{ width: 560, position: 'bottom-start' }}
                          value={row.item || null}
                          onChange={(value, option) =>
                            onChange(pickItem(row, rows, value ?? '', option?.label ?? ''))
                          }
                        />
                      </div>
                    ) : (
                      <Truncated value={row.itemLabel.trim()} width={170} />
                    )}
                  </Table.Td>
                  <Table.Td>
                    {editable ? (
                      input(row, 'profile_height_mm', { min: 0 })
                    ) : Number(row.profile_height_mm) ? (
                      center(row.profile_height_mm)
                    ) : (
                      <Dash center />
                    )}
                  </Table.Td>
                  <Table.Td>
                    {editable ? (
                      input(row, 'label', { placeholder: 'Parça adı' })
                    ) : (
                      <Truncated value={row.label} width={150} />
                    )}
                  </Table.Td>
                  <Table.Td>
                    {editable ? (
                      input(row, 'image_no', { placeholder: 'Resim no' })
                    ) : (
                      <Truncated value={row.image_no} width={120} />
                    )}
                  </Table.Td>
                  <Table.Td>
                    {!stockOpen ? (
                      row.stock_length_mm !== '' ? (
                        <Text ta="center" size="xs" title={`Stok boyu: ${row.stock_length_mm} mm`}>
                          {row.stock_length_mm}
                        </Text>
                      ) : (
                        <Text ta="center" c="dimmed">
                          ·
                        </Text>
                      )
                    ) : editable ? (
                      input(row, 'stock_length_mm', { placeholder: stockPh, min: 0 })
                    ) : row.stock_length_mm !== '' ? (
                      center(row.stock_length_mm)
                    ) : (
                      <Dash center />
                    )}
                  </Table.Td>
                  <Table.Td>
                    {editable ? (
                      input(row, 'nominal_length_mm', { min: 0 })
                    ) : row.nominal_length_mm !== '' ? (
                      <Text ta="center" fw={700} size="sm">
                        {row.nominal_length_mm}
                      </Text>
                    ) : (
                      <Dash center />
                    )}
                  </Table.Td>
                  <Table.Td>
                    {editable ? (
                      input(row, 'quantity', { min: 1 })
                    ) : row.quantity !== '' ? (
                      center(row.quantity)
                    ) : (
                      <Dash center />
                    )}
                  </Table.Td>
                  {SIDES.map((cfg) => (
                    <Table.Td key={cfg.side}>
                      {editable ? angleInput(row, cfg) : center(formatAngleTr(row[cfg.angleField]))}
                    </Table.Td>
                  ))}
                  <Table.Td ta="center">
                    <button
                      type="button"
                      className={classes.geomToggle}
                      data-open={geomOpen || undefined}
                      aria-expanded={geomOpen}
                      aria-label="Ölçü paneli"
                      title="Ölçü panelini aç/kapat — resimde açı yerine köşe farkı verilmişse buradan girin"
                      onClick={() => toggleGeom(row.rowId)}
                    >
                      <PiecePictogram spec={shapeSpec(row, rows)} width={116} height={42} />
                      <FaIcon icon="fas fa-chevron-down" className={classes.geomCaret} />
                      {derived ? (
                        <span title="Açılar kenar ölçüsünden hesaplandı">
                          <FaIcon icon="fas fa-ruler-combined" className={classes.geomFlag} />
                        </span>
                      ) : null}
                    </button>
                  </Table.Td>
                  <Table.Td>
                    {editable ? (
                      center(
                        <Checkbox
                          size="xs"
                          display="inline-block"
                          aria-label="Döndür"
                          title="Döndür — optimizasyon parçayı 180° döndürerek ortak kesim oluşturabilir"
                          checked={row.allow_rotation}
                          onChange={(e) =>
                            onChange({ ...row, allow_rotation: e.currentTarget.checked })
                          }
                        />,
                      )
                    ) : (
                      <BoolMark value={row.allow_rotation} />
                    )}
                  </Table.Td>
                  <Table.Td>
                    {editable ? (
                      center(
                        <Checkbox
                          size="xs"
                          display="inline-block"
                          aria-label="Büküm"
                          title="Büküm — parça kesimden sonra bükülür; boy olarak açınım (düz) boyu girilmelidir"
                          checked={row.requires_bending}
                          onChange={(e) =>
                            onChange({ ...row, requires_bending: e.currentTarget.checked })
                          }
                        />,
                      )
                    ) : (
                      <BoolMark value={row.requires_bending} />
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      {!row.id ? (
                        <>
                          <RowButton
                            icon="fas fa-clone"
                            label="Kopyala"
                            onClick={() => onCopy(row)}
                          />
                          <RowButton
                            icon="fas fa-trash"
                            label="Satırı Kaldır"
                            color="red"
                            onClick={() => onRemoveNew(row)}
                          />
                        </>
                      ) : row.rowId === editingId ? (
                        <>
                          <RowButton
                            icon="fas fa-check"
                            label="Kaydet"
                            color="green"
                            variant="filled"
                            loading={saving}
                            onClick={() => onSave(row)}
                          />
                          <RowButton
                            icon="fas fa-times"
                            label="İptal"
                            onClick={() => onCancel(row)}
                          />
                        </>
                      ) : (
                        <>
                          <RowButton
                            icon="fas fa-clone"
                            label="Kopyala"
                            onClick={() => onCopy(row)}
                          />
                          <RowButton
                            icon="fas fa-edit"
                            label="Düzenle"
                            color="blue"
                            onClick={() => onEdit(row)}
                          />
                          <RowButton
                            icon="fas fa-trash"
                            label="Sil"
                            color="red"
                            onClick={() => onDelete(row)}
                          />
                        </>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
                {geomOpen ? (
                  <Table.Tr data-geom-row={row.rowId}>
                    <Table.Td colSpan={columnCount} className={classes.geomCell}>
                      <GeomPanel row={row} rows={rows} editable={editable} onChange={onChange} />
                    </Table.Td>
                  </Table.Tr>
                ) : null}
              </Fragment>
            );
          })}
        </Table.Tbody>
      </Table>
    </div>
  );
}

const FIELD_LABEL: Record<TextField, string> = {
  order: 'Sıra',
  profile_height_mm: 'Kesit (mm)',
  label: 'Parça Adı',
  image_no: 'Resim No',
  stock_length_mm: 'Stok (mm)',
  nominal_length_mm: 'Uzunluk (mm)',
  quantity: 'Adet',
};

function RowButton({
  icon,
  label,
  color = 'gray',
  variant = 'outline',
  loading,
  onClick,
}: {
  icon: string;
  label: string;
  color?: string;
  variant?: 'outline' | 'filled';
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <ActionIcon
      size="md"
      variant={variant}
      color={color}
      aria-label={label}
      title={label}
      loading={loading}
      onClick={onClick}
    >
      <FaIcon icon={icon} />
    </ActionIcon>
  );
}
