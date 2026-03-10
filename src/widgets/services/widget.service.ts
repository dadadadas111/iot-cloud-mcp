/**
 * Widget Service
 * Compiles and renders Handlebars templates for ChatGPT widget resources
 * Templates live at project root: views/widgets/*.hbs
 */

import { Injectable, Logger } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { readFile } from 'fs/promises';
import { join } from 'path';

/** Data passed to widget templates */
export interface WidgetData {
  [key: string]: unknown;
}

/**
 * Service responsible for rendering widget HTML from Handlebars templates
 * Templates are read from disk at runtime (not bundled by webpack)
 */
@Injectable()
export class WidgetService {
  private readonly logger = new Logger(WidgetService.name);
  private readonly viewsPath: string;

  constructor() {
    // Views live at project root /views/widgets/, read at runtime via process.cwd()
    // Same pattern as docs/ai-resources/ used by existing resources
    this.viewsPath = join(process.cwd(), 'views', 'widgets');

    // Register custom Handlebars helpers
    this.registerHelpers();
  }

  /** Register custom Handlebars helpers for widget templates */
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
   * Render a widget template with data
   * @param templateName - Name of the template file (without .hbs extension)
   * @param data - Data to pass to the Handlebars template
   * @returns Rendered HTML string
   */
  async render(templateName: string, data: WidgetData): Promise<string> {
    const templatePath = join(this.viewsPath, `${templateName}.hbs`);

    try {
      const templateSource = await readFile(templatePath, 'utf-8');
      const template = Handlebars.compile(templateSource);
      return template(data);
    } catch (error) {
      this.logger.error(`Failed to render widget template: ${templateName}`, error);
      throw new Error(`Failed to render widget template: ${templateName}`);
    }
  }
}
