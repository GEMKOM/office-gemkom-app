import { forwardRef, type HTMLAttributes } from 'react';

export interface EstimateHtmlProps extends Omit<HTMLAttributes<HTMLDivElement>, 'dangerouslySetInnerHTML' | 'children'> {
  /** Markup from the legacy report-view.js builders or loadMethodHtml() (markdownLite), and nothing else. */
  html: string;
}

/**
 * The one place the estimate report puts HTML into the page.
 *
 * Why innerHTML is allowed here (the porting guide's second exception, next to
 * RichText): the Tahmin report body is built by
 * components/estimate-report/report-view.js, which the legacy project
 * tracking modal still mounts. Keeping that file the single source
 * means a change to the report shows on both sides at once. Its builders
 * escape every payload value (utils/text.js escapeHtml) and pass markdown
 * through utils/markdownLite.js, which escapes first and only adds its own
 * tags, the same contract as renderRichText. The estimator's method text
 * (loadMethodHtml, markdownLite) is the one other allowed input. Never pass
 * anything else here.
 * When project tracking moves to React, port the builders to JSX and delete
 * this component.
 */
export const EstimateHtml = forwardRef<HTMLDivElement, EstimateHtmlProps>(function EstimateHtml(
  { html, ...rest },
  ref,
) {
  return <div ref={ref} {...rest} dangerouslySetInnerHTML={{ __html: html }} />;
});
