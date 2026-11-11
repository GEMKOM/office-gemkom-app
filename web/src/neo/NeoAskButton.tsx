import { Menu, UnstyledButton } from '@mantine/core';
import type { NeoPageContext, NeoPageType } from '@/api/assistant';
import { FaIcon } from '@/ui/FaIcon';
import classes from './neo.module.css';
import { askNeo, openNeo, setNeoPage, useNeoPage } from './neoStore';
import { useNeoAccess } from './queries';

// Ready questions per record type. They carry the record's number, so they
// read well in the chat history and work even where the page context is lost.
export const ASK_QUESTIONS: Record<NeoPageType, ((id: string) => string)[]> = {
  job_order: [
    (id) => `${id} işinin genel durumu ne?`,
    (id) => `${id} işinde maliyet ve saatler ne durumda?`,
    (id) => `${id} işinde eksik malzeme var mı?`,
    (id) => `${id} işinin tartışmalarında son neler konuşuldu?`,
  ],
  purchase_request: [
    (id) => `${id} talebi ne durumda, kimde bekliyor?`,
    (id) => `${id} talebindeki kalemlerin fiyat geçmişi nasıl?`,
    (id) => `${id} talebine kimler teklif verdi?`,
  ],
  purchase_order: [
    (id) => `${id} numaralı sipariş ne durumda?`,
    (id) => `${id} numaralı siparişin tedarikçisiyle geçmiş siparişler nasıl gitti?`,
  ],
  ncr: [
    (id) => `${id} ne durumda, kimde bekliyor?`,
    (id) => `${id} ile aynı işte başka NCR var mı?`,
    (id) => `${id} gibi uygunsuzluklar daha önce yaşandı mı?`,
  ],
  planning_request: [
    (id) => `${id} planlama talebi ne durumda?`,
    (id) => `${id} talebindeki malzemeler için satın alma talebi açıldı mı?`,
  ],
  daily_summary: [
    (date) => `${trDate(date)} özetinde beni ilgilendiren ne var?`,
    (date) => `${trDate(date)} özetindeki geciken veya riskli işler hangileri?`,
    (date) => `${trDate(date)} özetinde geçen iş emirleri şu an ne durumda?`,
  ],
};

/** "2026-11-10" → "10.11.2026"; anything else as it is. */
function trDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
}

/**
 * "Neo'ya sor" for a record's header: a short menu of questions about the
 * record, each asked at once, plus "Kendi sorunuzu yazın". Also tells Neo
 * which record is on screen while it is mounted (useNeoPage). Hidden for
 * users whose Neo access is known to be closed.
 */
export function NeoAskButton({
  page,
  tone = 'brand',
  beforeAsk,
}: {
  /** null while the record loads: nothing is shown. */
  page: NeoPageContext | null;
  /** 'brand' on the red modal strip, 'plain' on white. */
  tone?: 'brand' | 'plain';
  /**
   * Runs before Neo opens, for a modal that cannot stay open beside the chat
   * (the daily summary lives inside Neo's own summaries view). The question
   * still carries the record: it is read before the modal goes.
   */
  beforeAsk?: () => void;
}) {
  useNeoPage(page);
  // Only reads what the panel already learned; no request of its own.
  const { locked } = useNeoAccess(false);
  if (!page || locked) return null;

  const questions = ASK_QUESTIONS[page.type].map((q) => q(page.id));

  return (
    <Menu position="bottom-end" width={300} withinPortal shadow="md">
      <Menu.Target>
        <UnstyledButton className={classes.askBtn} data-tone={tone} aria-label="Neo'ya sor">
          <FaIcon icon="fas fa-robot" size={12} />
          <span className={classes.askBtnText}>Neo&apos;ya sor</span>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Bu kayıt hakkında</Menu.Label>
        {questions.map((question) => (
          <Menu.Item
            key={question}
            leftSection={
              <FaIcon icon="fas fa-arrow-turn-down" size={10} className={classes.askItemIcon} />
            }
            onClick={() => {
              beforeAsk?.();
              setNeoPage(page);
              void askNeo(question, 'page_button');
            }}
          >
            {question}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item
          leftSection={<FaIcon icon="fas fa-pen" size={11} />}
          onClick={() => {
            beforeAsk?.();
            setNeoPage(page);
            openNeo({ view: 'chat' });
          }}
        >
          Kendi sorunuzu yazın…
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
