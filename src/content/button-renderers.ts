/**
 * Button State Renderers
 * Strategy pattern for button rendering across different button types
 * Eliminates code duplication and makes it easy to add new button types
 */

/**
 * Button state configuration
 * Defines what content, CSS class, title, and disabled state a button should have
 */
export interface ButtonStateConfig {
  content: string; // HTML content or text content
  cssClass: string; // CSS class to apply (e.g., 'reported', 'removed')
  title: string; // Tooltip text
  disabled: boolean; // Whether button should be disabled
}

/**
 * Button state enum
 * Represents the three possible states of a report button
 */
export enum ButtonState {
  NOT_REPORTED = 'NOT_REPORTED',
  REPORTED = 'REPORTED',
  REMOVED = 'REMOVED',
}

/**
 * Abstract base class for button renderers
 * Each button type (player, shorts, etc.) extends this class
 */
export abstract class ButtonRenderer {
  /**
   * Get configuration for a specific button state
   */
  abstract getConfig(state: ButtonState): ButtonStateConfig;

  /**
   * Apply configuration to a button element
   */
  applyConfig(button: HTMLButtonElement, config: ButtonStateConfig): void {
    // Set content
    button.innerHTML = config.content;

    // Update CSS classes (remove old state classes, add new one)
    button.classList.remove('reported', 'removed');
    if (config.cssClass) {
      button.classList.add(config.cssClass);
    }

    // Set title and disabled state
    button.title = config.title;
    button.disabled = config.disabled;
  }

  /**
   * Render button to a specific state
   */
  render(button: HTMLButtonElement, state: ButtonState): void {
    const config = this.getConfig(state);
    this.applyConfig(button, config);
  }
}

/**
 * Player Button Renderer
 * Renders SVG icons for the video player controls
 */
export class PlayerButtonRenderer extends ButtonRenderer {
  getConfig(state: ButtonState): ButtonStateConfig {
    switch (state) {
      case ButtonState.NOT_REPORTED:
        return {
          content: this.generateWarningTriangleSVG(),
          cssClass: '',
          title: 'Report as AI Slop',
          disabled: false,
        };

      case ButtonState.REPORTED:
        return {
          content: this.generateCheckmarkSVG(),
          cssClass: 'reported',
          title: 'Reported as AI Slop - Click to undo',
          disabled: false,
        };

      case ButtonState.REMOVED:
        return {
          content: this.generateSlashCircleSVG(),
          cssClass: 'removed',
          title: 'You have removed your report for this video',
          disabled: true,
        };
    }
  }

  /**
   * Generate glossy warning triangle SVG (unreported state)
   */
  private generateWarningTriangleSVG(): string {
    return `
      <svg width="100%" height="100%" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="glossGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#ff5252;stop-opacity:0.95" />
            <stop offset="40%" style="stop-color:#d32f2f;stop-opacity:0.75" />
            <stop offset="100%" style="stop-color:#8b1a1a;stop-opacity:0.7" />
          </linearGradient>
        </defs>
        <path d="M18 3L3 30h30L18 3z" fill="url(#glossGradient)"/>
        <path d="M18 3L10 18L26 18Z" fill="white" opacity="0.3"/>
        <path d="M18 6L13 16L23 16Z" fill="white" opacity="0.2"/>
        <text x="18" y="25.5" fill="#000" font-size="12" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif" opacity="0.6">AI</text>
        <text x="17.5" y="25" fill="white" font-size="12" font-weight="bold" text-anchor="middle" font-family="Arial, sans-serif" letter-spacing="0.5">AI</text>
      </svg>
    `;
  }

  /**
   * Generate checkmark SVG (reported state)
   */
  private generateCheckmarkSVG(): string {
    return `
      <svg width="100%" height="100%" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M30 9L13.5 25.5l-7.5-7.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  /**
   * Generate slash circle SVG (removed state)
   */
  private generateSlashCircleSVG(): string {
    return `
      <svg width="100%" height="100%" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="18" cy="18" r="15" stroke="currentColor" stroke-width="3"/>
        <line x1="10.5" y1="10.5" x2="25.5" y2="25.5" stroke="currentColor" stroke-width="3"/>
      </svg>
    `;
  }
}

/**
 * Shorts Button Renderer
 * Renders compact text for Shorts action buttons
 */
export class ShortsButtonRenderer extends ButtonRenderer {
  getConfig(state: ButtonState): ButtonStateConfig {
    switch (state) {
      case ButtonState.NOT_REPORTED:
        return {
          content: '<div style="font-size: 10px; line-height: 1.2;">AI<br>Slop?</div>',
          cssClass: '',
          title: 'Mark this video as AI-generated content',
          disabled: false,
        };

      case ButtonState.REPORTED:
        return {
          content: '<div style="font-size: 10px; line-height: 1.2;">✓<br>Reported</div>',
          cssClass: 'reported',
          title: 'Click to undo report',
          disabled: false,
        };

      case ButtonState.REMOVED:
        return {
          content: '<div style="font-size: 10px; line-height: 1.2;">✓<br>Removed</div>',
          cssClass: 'removed',
          title: 'You have removed your report for this video',
          disabled: true,
        };
    }
  }
}

/**
 * Generic Button Renderer
 * Fallback renderer for any other button types
 */
export class GenericButtonRenderer extends ButtonRenderer {
  getConfig(state: ButtonState): ButtonStateConfig {
    switch (state) {
      case ButtonState.NOT_REPORTED:
        return {
          content: '⚠ Report as AI Slop',
          cssClass: '',
          title: 'Mark this video as AI-generated content',
          disabled: false,
        };

      case ButtonState.REPORTED:
        return {
          content: '✓ Slop Reported',
          cssClass: 'reported',
          title: 'Click to undo report',
          disabled: false,
        };

      case ButtonState.REMOVED:
        return {
          content: 'Report Removed',
          cssClass: 'removed',
          title: 'You have removed your report for this video',
          disabled: true,
        };
    }
  }
}

/**
 * Button Renderer Factory
 * Creates the appropriate renderer based on button type
 */
export class ButtonRendererFactory {
  /**
   * Create renderer based on button element
   */
  static create(button: HTMLButtonElement): ButtonRenderer {
    if (button.classList.contains('slopblock-player-button')) {
      return new PlayerButtonRenderer();
    }

    if (button.classList.contains('slopblock-shorts-button')) {
      return new ShortsButtonRenderer();
    }

    return new GenericButtonRenderer();
  }
}
