/**
 * Widget Service
 * Reads static HTML widget files for MCP resource responses,
 * and renders Handlebars templates for dev-time preview.
 * Widget files live at project root: views/widgets/
 */

import { Injectable, Logger } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { readFile } from 'fs/promises';
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

  constructor() {
    // Views live at project root /views/widgets/, read at runtime via process.cwd()
    // Same pattern as docs/ai-resources/ used by existing resources
    this.viewsPath = join(process.cwd(), 'views', 'widgets');

    // Register custom Handlebars helpers for preview templates
    this.registerHelpers();
  }

  /**
   * Read a static HTML widget file for MCP resource responses.
   * The HTML contains embedded JS that reads data from window.openai.toolOutput
   * at runtime in the ChatGPT iframe — no server-side data injection needed.
   *
   * @param widgetName - Name of the widget file (without .html extension)
   * @returns Raw HTML string
   */
  async readStaticHtml(widgetName: string): Promise<string> {
    const filePath = join(this.viewsPath, `${widgetName}.html`);

    try {
      const html = await readFile(filePath, 'utf-8');
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
}
