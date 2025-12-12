/**
 * ProgressBar - Progress tracking component for model loading and inference
 * Manages progress state and provides DOM rendering with multiple visual states
 *
 * @module ui/ProgressBar
 * @requires DOM API (ES6+ module)
 */

/**
 * @typedef {Object} ProgressBarState
 * @property {number} percent - Current progress percentage (0-100)
 * @property {string} label - Display label text
 * @property {string} state - Current state: 'default', 'indeterminate', 'complete', 'error'
 * @property {HTMLElement} container - DOM container element
 * @property {boolean} initialized - Whether component is initialized
 */

/** @type {ProgressBarState} */
let state = {
  percent: 0,
  label: '',
  state: 'default',
  container: null,
  initialized: false
};

/**
 * Injects CSS styles for the progress bar component
 * Uses CSS variables from design system for consistency
 * @private
 */
function injectStyles() {
  // Check if styles already injected
  if (document.getElementById('progress-bar-styles')) {
    return;
  }

  const styleSheet = document.createElement('style');
  styleSheet.id = 'progress-bar-styles';
  styleSheet.textContent = `
    :root {
      --bg-elevated: #1e1735;
      --border: #2a2245;
      --text-muted: #5c5480;
      --accent: #7c5cff;
      --success: #22c55e;
      --danger: #ef4444;
      --cyan: #22d3ee;
    }

    .progress-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      padding: 12px;
      background-color: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-family: 'JetBrains Mono', monospace;
      user-select: none;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .progress-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-muted);
      letter-spacing: 0.3px;
    }

    .progress-percent {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      min-width: 35px;
      text-align: right;
    }

    .progress-track {
      position: relative;
      width: 100%;
      height: 6px;
      background-color: var(--border);
      border-radius: 4px;
      overflow: hidden;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), var(--cyan));
      border-radius: 4px;
      transition: width 0.3s ease;
      width: 0%;
      position: relative;
      box-shadow: 0 0 10px rgba(124, 92, 255, 0.5);
    }

    /* Indeterminate state - animated stripes */
    .progress-container.indeterminate .progress-fill {
      width: 100% !important;
      background: repeating-linear-gradient(
        45deg,
        var(--accent),
        var(--accent) 10px,
        var(--cyan) 10px,
        var(--cyan) 20px
      );
      background-size: 28px 28px;
      animation: progress-pulse 1.5s ease-in-out infinite;
    }

    @keyframes progress-pulse {
      0% {
        background-position: 0 0;
      }
      100% {
        background-position: 28px 28px;
      }
    }

    /* Complete state - green */
    .progress-container.complete .progress-fill {
      width: 100% !important;
      background: linear-gradient(90deg, var(--success), rgba(34, 197, 94, 0.7));
      box-shadow: 0 0 15px rgba(34, 197, 94, 0.6);
    }

    .progress-container.complete .progress-label {
      color: var(--success);
    }

    .progress-container.complete .progress-percent {
      color: var(--success);
    }

    /* Error state - red */
    .progress-container.error .progress-fill {
      width: 100% !important;
      background: linear-gradient(90deg, var(--danger), rgba(239, 68, 68, 0.7));
      box-shadow: 0 0 15px rgba(239, 68, 68, 0.6);
      animation: progress-error-pulse 0.6s ease-in-out infinite;
    }

    @keyframes progress-error-pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.7;
      }
    }

    .progress-container.error .progress-label {
      color: var(--danger);
    }

    .progress-container.error .progress-percent {
      color: var(--danger);
    }

    /* Status icon */
    .progress-status-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      margin-left: 6px;
      font-size: 12px;
      font-weight: bold;
    }

    .progress-container.complete .progress-status-icon::before {
      content: '[OK]';
      color: var(--success);
    }

    .progress-container.error .progress-status-icon::before {
      content: '✕';
      color: var(--danger);
    }

    /* Dark mode and accessibility */
    @media (prefers-reduced-motion: reduce) {
      .progress-fill {
        transition: none;
      }

      .progress-container.indeterminate .progress-fill {
        animation: none;
        background: var(--accent);
      }

      .progress-container.error .progress-fill {
        animation: none;
      }
    }

    @media (prefers-color-scheme: dark) {
      .progress-container {
        background-color: var(--bg-elevated);
        border-color: var(--border);
      }
    }
  `;

  document.head.appendChild(styleSheet);
}

/**
 * Creates the HTML structure for the progress bar using safe DOM methods
 * @private
 * @returns {HTMLElement} The progress bar container element
 */
function createProgressBarHTML() {
  const container = document.createElement('div');
  container.className = 'progress-container';

  // Create header (label and percent)
  const header = document.createElement('div');
  header.className = 'progress-header';

  const label = document.createElement('div');
  label.className = 'progress-label';
  label.textContent = '';

  const percent = document.createElement('div');
  percent.className = 'progress-percent';
  percent.textContent = '0%';

  header.appendChild(label);
  header.appendChild(percent);

  // Create track and fill
  const track = document.createElement('div');
  track.className = 'progress-track';

  const fill = document.createElement('div');
  fill.className = 'progress-fill';

  track.appendChild(fill);

  // Assemble container
  container.appendChild(header);
  container.appendChild(track);

  return container;
}

/**
 * Initializes the progress bar component in a container
 * Creates HTML structure, injects styles, and sets up initial state
 *
 * @param {string} containerId - The ID of the DOM element to render into
 * @throws {Error} If container with given ID is not found
 * @returns {boolean} True if initialization was successful
 */
export function create(containerId) {
  // Inject styles once
  injectStyles();

  // Get container element
  const containerElement = document.getElementById(containerId);
  if (!containerElement) {
    console.error(`ProgressBar: Container with ID "${containerId}" not found`);
    return false;
  }

  // Create and insert progress bar HTML
  const progressBar = createProgressBarHTML();
  containerElement.appendChild(progressBar);

  // Update state
  state.container = progressBar;
  state.initialized = true;
  state.percent = 0;
  state.label = '';
  state.state = 'default';

  return true;
}

/**
 * Updates progress to a specific percentage with optional label
 * Updates the visual fill width and percentage display
 *
 * @param {number} percent - Progress percentage (0-100)
 * @param {string} [label] - Optional label text to display
 * @returns {boolean} True if update was successful
 */
export function setProgress(percent, label) {
  if (!state.initialized || !state.container) {
    console.warn('ProgressBar: Component not initialized. Call create() first.');
    return false;
  }

  // Validate and clamp percentage
  const clampedPercent = Math.max(0, Math.min(100, parseInt(percent, 10)));

  // Update state
  state.percent = clampedPercent;
  if (label !== undefined) {
    state.label = label;
  }
  state.state = 'default';

  // Remove animation classes
  state.container.classList.remove('indeterminate', 'complete', 'error');

  // Update DOM
  const label_elem = state.container.querySelector('.progress-label');
  const percent_elem = state.container.querySelector('.progress-percent');
  const fill_elem = state.container.querySelector('.progress-fill');

  if (label_elem) label_elem.textContent = state.label;
  if (percent_elem) percent_elem.textContent = `${clampedPercent}%`;
  if (fill_elem) fill_elem.style.width = `${clampedPercent}%`;

  return true;
}

/**
 * Sets progress bar to indeterminate (pulsing loading) state
 * Shows animated stripes to indicate activity without a specific percentage
 *
 * @param {string} [label] - Optional label text to display
 * @returns {boolean} True if update was successful
 */
export function setIndeterminate(label) {
  if (!state.initialized || !state.container) {
    console.warn('ProgressBar: Component not initialized. Call create() first.');
    return false;
  }

  // Update state
  state.state = 'indeterminate';
  if (label !== undefined) {
    state.label = label;
  }

  // Add indeterminate class
  state.container.classList.remove('complete', 'error');
  state.container.classList.add('indeterminate');

  // Update DOM
  const label_elem = state.container.querySelector('.progress-label');
  const percent_elem = state.container.querySelector('.progress-percent');

  if (label_elem) label_elem.textContent = state.label;
  if (percent_elem) percent_elem.textContent = '∞';

  return true;
}

/**
 * Sets progress bar to complete state with green styling
 * Displays success indicator and stops animations
 *
 * @param {string} [label] - Optional label text to display
 * @returns {boolean} True if update was successful
 */
export function setComplete(label) {
  if (!state.initialized || !state.container) {
    console.warn('ProgressBar: Component not initialized. Call create() first.');
    return false;
  }

  // Update state
  state.state = 'complete';
  state.percent = 100;
  if (label !== undefined) {
    state.label = label;
  }

  // Add complete class
  state.container.classList.remove('indeterminate', 'error');
  state.container.classList.add('complete');

  // Update DOM
  const label_elem = state.container.querySelector('.progress-label');
  const percent_elem = state.container.querySelector('.progress-percent');
  const fill_elem = state.container.querySelector('.progress-fill');

  if (label_elem) {
    label_elem.textContent = state.label;
  }
  if (percent_elem) percent_elem.textContent = '100%';
  if (fill_elem) fill_elem.style.width = '100%';

  return true;
}

/**
 * Sets progress bar to error state with red styling
 * Displays error indicator with pulsing animation
 *
 * @param {string} [label] - Optional error message text to display
 * @returns {boolean} True if update was successful
 */
export function setError(label) {
  if (!state.initialized || !state.container) {
    console.warn('ProgressBar: Component not initialized. Call create() first.');
    return false;
  }

  // Update state
  state.state = 'error';
  if (label !== undefined) {
    state.label = label;
  }

  // Add error class
  state.container.classList.remove('indeterminate', 'complete');
  state.container.classList.add('error');

  // Update DOM
  const label_elem = state.container.querySelector('.progress-label');
  const percent_elem = state.container.querySelector('.progress-percent');
  const fill_elem = state.container.querySelector('.progress-fill');

  if (label_elem) label_elem.textContent = state.label;
  if (percent_elem) percent_elem.textContent = '0%';
  if (fill_elem) fill_elem.style.width = '0%';

  return true;
}

/**
 * Resets the progress bar to initial state
 * Clears label, percentage, and removes all state classes
 *
 * @returns {boolean} True if reset was successful
 */
export function reset() {
  if (!state.initialized || !state.container) {
    console.warn('ProgressBar: Component not initialized. Call create() first.');
    return false;
  }

  // Reset state
  state.percent = 0;
  state.label = '';
  state.state = 'default';

  // Remove all state classes
  state.container.classList.remove('indeterminate', 'complete', 'error');

  // Update DOM
  const label_elem = state.container.querySelector('.progress-label');
  const percent_elem = state.container.querySelector('.progress-percent');
  const fill_elem = state.container.querySelector('.progress-fill');

  if (label_elem) label_elem.textContent = '';
  if (percent_elem) percent_elem.textContent = '0%';
  if (fill_elem) fill_elem.style.width = '0%';

  return true;
}

/**
 * Removes the progress bar from the DOM and cleans up state
 * Resets internal state but leaves CSS styles in document
 *
 * @returns {boolean} True if destruction was successful
 */
export function destroy() {
  if (!state.initialized || !state.container) {
    console.warn('ProgressBar: Component not initialized or already destroyed.');
    return false;
  }

  // Remove from DOM
  if (state.container.parentElement) {
    state.container.parentElement.removeChild(state.container);
  }

  // Reset state
  state = {
    percent: 0,
    label: '',
    state: 'default',
    container: null,
    initialized: false
  };

  return true;
}

/**
 * Returns the current state of the progress bar
 * Useful for debugging and monitoring
 *
 * @private
 * @returns {ProgressBarState} Current component state
 */
export function getState() {
  return { ...state };
}

/**
 * Export default object with all public methods for alternative import style
 * @type {Object}
 */
export default {
  create,
  setProgress,
  setIndeterminate,
  setComplete,
  setError,
  reset,
  destroy,
  getState
};
