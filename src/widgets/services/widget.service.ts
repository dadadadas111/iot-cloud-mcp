/**
 * Widget Service
 * Reads static HTML widget files for MCP resource responses,
 * injects i18n locale data from views/widgets/locales/*.json,
 * and renders Handlebars templates for dev-time preview.
 * Widget files live at project root: views/widgets/
 */

import { Injectable, Logger } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';

/** Data passed to widget preview templates */
export interface WidgetData {
  [key: string]: unknown;
}

/**
 * Service responsible for widget HTML management:
 * - readStaticHtml(): returns raw HTML for MCP resource responses (ChatGPT widgets)
 * - renderPreview(): compiles Handlebars template with sample data (dev preview)
 *
 * Files are read from disk at runtime (not bundled by webpack).
 */
@Injectable()
export class WidgetService {
  private readonly logger = new Logger(WidgetService.name);
  private readonly viewsPath: string;
  private readonly localesPath: string;
  private localeCache: Record<string, Record<string, string>> | null = null;

  constructor() {
    // Views live at project root /views/widgets/, read at runtime via process.cwd()
    // Same pattern as docs/ai-resources/ used by existing resources
    this.viewsPath = join(process.cwd(), 'views', 'widgets');
    this.localesPath = join(this.viewsPath, 'locales');

    // Register custom Handlebars helpers for preview templates
    this.registerHelpers();
  }

  /**
   * Read a static HTML widget file and inject i18n locale data.
   * Locale JSON files from views/widgets/locales/ are auto-discovered,
   * bundled, and injected as window.__I18N__ before the widget script.
   * The widget's t() helper reads document.documentElement.lang at runtime.
   *
   * @param widgetName - Name of the widget file (without .html extension)
   * @returns HTML string with locale data injected
   */
  async readStaticHtml(widgetName: string): Promise<string> {
    const filePath = join(this.viewsPath, `${widgetName}.html`);

    try {
      let html = await readFile(filePath, 'utf-8');

      // Inject i18n locale data before the first <script> tag
      const locales = await this.loadLocales();
      if (Object.keys(locales).length > 0) {
        const localeScript = `<script>window.__I18N__=${JSON.stringify(locales)}</script>\n`;
        html = html.replace('<script>', localeScript + '<script>');
      }

      return html;
    } catch (error) {
      this.logger.error(`Failed to read widget HTML: ${widgetName}`, error);
      throw new Error(`Failed to read widget HTML: ${widgetName}`);
    }
  }

  /**
   * Render a Handlebars preview template with sample data (dev-time only).
   * Used by the preview controller for browser testing.
   *
   * @param templateName - Name of the template file (without .hbs extension)
   * @param data - Data to pass to the Handlebars template
   * @returns Rendered HTML string
   */
  async renderPreview(templateName: string, data: WidgetData): Promise<string> {
    const templatePath = join(this.viewsPath, `${templateName}.hbs`);

    try {
      const templateSource = await readFile(templatePath, 'utf-8');
      const template = Handlebars.compile(templateSource);
      return template(data);
    } catch (error) {
      this.logger.error(`Failed to render widget preview template: ${templateName}`, error);
      throw new Error(`Failed to render widget preview template: ${templateName}`);
    }
  }

  /** Register custom Handlebars helpers for preview templates */
  private registerHelpers(): void {
    // ifEquals: conditional block when two values are strictly equal
    // Usage: {{#ifEquals deviceType "LED Light"}}...{{/ifEquals}}
    Handlebars.registerHelper(
      'ifEquals',
      function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
        return a === b ? options.fn(this) : options.inverse(this);
      },
    );
  }

  /**
   * Load all locale JSON files from views/widgets/locales/.
   * Each file (e.g. en.json, vi.json) becomes a key in the returned object.
   * Results are cached in memory after first load.
   */
  private async loadLocales(): Promise<Record<string, Record<string, string>>> {
    if (this.localeCache) return this.localeCache;

    try {
      const files = await readdir(this.localesPath);
      const locales: Record<string, Record<string, string>> = {};

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const lang = file.replace('.json', '');
        const content = await readFile(join(this.localesPath, file), 'utf-8');
        locales[lang] = JSON.parse(content);
      }

      this.localeCache = locales;
      return locales;
    } catch {
      // No locales directory or read error — widget works without i18n
      return {};
    }
  }
}
