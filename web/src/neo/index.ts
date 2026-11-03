// Neo, the in-app assistant. Anything can open it:
//
//   openNeo();                                   // just open
//   openNeo({ prompt: 'Dün neler oldu?' });      // prefill the question box
//   openNeo({ reportId: 42 });                   // a report's follow-up questions
//   openNeo({ summaryId: 7, openSummary: true }); // a daily summary
//
// The React daily summary, once it is migrated, calls openNeo({ prompt }) for
// its "Neo'ya Sor" button (the legacy modal sends `assistant:open`, which the
// panel also understands).

export { DailySummaryPrompt } from './DailySummaryPrompt';
export { NeoEntry, NeoRule } from './NeoEntry';
export { NeoAside, NEO_PANEL_ID } from './NeoPanel';
export { neoLinkTarget } from './neoLinks';
export {
  bindNeoUser,
  closeNeo,
  getNeoState,
  openNeo,
  toggleNeo,
  useNeo,
  type OpenNeoOptions,
} from './neoStore';
