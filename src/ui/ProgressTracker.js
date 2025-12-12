/**
 * ProgressTracker.js - Enhanced progress tracking for model loading and analysis
 *
 * Features:
 * - Page load progress indication
 * - Per-model download progress with cache status
 * - Analysis progress tracking
 * - Concurrent model loading progress visualization
 * - Persistent progress state across user interactions
 */

export class ProgressTracker {
  constructor(containerId = 'progress-tracker') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.warn(`[ProgressTracker] Container #${containerId} not found, creating one`);
      this.createContainer(containerId);
    }
    this.modelProgresses = new Map();
    this.isVisible = false;
  }

  /**
   * Create progress container if it doesn't exist
   */
  createContainer(containerId) {
    const div = document.createElement('div');
    div.id = containerId;
    div.className = 'progress-tracker-container';
    document.body.insertBefore(div, document.body.firstChild);
    this.container = div;
  }

  /**
   * Show initial page load progress
   * @param {string} message - Initial message
   */
  showPageLoadProgress(message = 'Loading application...') {
    this.container.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.className = 'progress-overlay';

    const box = document.createElement('div');
    box.className = 'progress-box';

    const header = document.createElement('div');
    header.className = 'progress-header';

    const title = document.createElement('h2');
    title.className = 'progress-title';
    title.textContent = message;

    const main = document.createElement('div');
    main.className = 'progress-main';

    const barWrapper = document.createElement('div');
    barWrapper.className = 'progress-bar-wrapper';

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.id = 'page-load-bar';
    bar.style.width = '0%';

    const details = document.createElement('div');
    details.className = 'progress-details';
    details.id = 'page-load-details';
    details.textContent = 'Initializing...';

    barWrapper.appendChild(bar);
    header.appendChild(title);
    main.appendChild(barWrapper);
    main.appendChild(details);
    box.appendChild(header);
    box.appendChild(main);
    overlay.appendChild(box);
    this.container.appendChild(overlay);

    this.container.style.display = 'block';
    this.isVisible = true;
  }

  /**
   * Update page load progress
   * @param {number} percent - Progress percentage (0-100)
   * @param {string} details - Detailed message
   */
  updatePageLoadProgress(percent, details) {
    const bar = this.container.querySelector('#page-load-bar');
    const detailsEl = this.container.querySelector('#page-load-details');

    if (bar) {
      bar.style.width = `${Math.min(percent, 100)}%`;
    }

    if (detailsEl && details) {
      detailsEl.textContent = details;
    }
  }

  /**
   * Show model loading progress for multiple models
   * @param {Object} progress - Progress information
   * @param {string} progress.modelId - Model identifier
   * @param {string} progress.displayName - Display name
   * @param {number} progress.percent - Progress percentage (0-100)
   * @param {number} progress.completed - Number of models completed
   * @param {number} progress.total - Total models to load
   * @param {boolean} progress.cached - Whether model was served from cache
   */
  showModelLoadingProgress(progress) {
    const {
      modelId,
      displayName,
      percent = 0,
      completed = 0,
      total = 0,
      cached = false
    } = progress;

    // Create initial container if needed
    if (!this.modelProgresses.has(modelId)) {
      this.ensureModelProgressContainer();

      const modelProgresssContainer = this.container.querySelector('.model-progressses-container');
      if (modelProgresssContainer) {
        const progressItem = document.createElement('div');
        progressItem.className = 'model-progress-item';
        progressItem.id = `progress-model-${modelId}`;

        const header = document.createElement('div');
        header.className = 'model-progress-header';

        const name = document.createElement('span');
        name.className = 'model-progress-name';
        name.textContent = displayName;

        const status = document.createElement('span');
        status.className = `model-progress-status ${cached ? 'cached' : 'downloading'}`;
        status.textContent = cached ? 'Cached' : 'Downloading...';

        const barWrapper = document.createElement('div');
        barWrapper.className = 'model-progress-bar-wrapper';

        const bar = document.createElement('div');
        bar.className = 'model-progress-bar';
        bar.style.width = `${percent}%`;

        const meta = document.createElement('div');
        meta.className = 'model-progress-meta';

        const percentSpan = document.createElement('span');
        percentSpan.className = 'model-progress-percent';
        percentSpan.textContent = `${percent}%`;

        const countSpan = document.createElement('span');
        countSpan.className = 'model-progress-count';
        countSpan.textContent = `${completed}/${total}`;

        header.appendChild(name);
        header.appendChild(status);
        barWrapper.appendChild(bar);
        meta.appendChild(percentSpan);
        meta.appendChild(countSpan);
        progressItem.appendChild(header);
        progressItem.appendChild(barWrapper);
        progressItem.appendChild(meta);
        modelProgresssContainer.appendChild(progressItem);
      }

      this.modelProgresses.set(modelId, { percent, cached });
    } else {
      // Update existing progress
      const progressItem = this.container.querySelector(`#progress-model-${modelId}`);
      if (progressItem) {
        const bar = progressItem.querySelector('.model-progress-bar');
        const percentEl = progressItem.querySelector('.model-progress-percent');
        const countEl = progressItem.querySelector('.model-progress-count');
        const statusEl = progressItem.querySelector('.model-progress-status');

        if (bar) bar.style.width = `${percent}%`;
        if (percentEl) percentEl.textContent = `${percent}%`;
        if (countEl) countEl.textContent = `${completed}/${total}`;
        if (statusEl && percent === 100) {
          statusEl.className = 'model-progress-status ready';
          statusEl.textContent = cached ? 'Cached' : 'Ready';
        }
      }

      this.modelProgresses.set(modelId, { percent, cached });
    }
  }

  /**
   * Ensure model progress container exists
   */
  ensureModelProgressContainer() {
    let container = this.container.querySelector('.model-progressses-container');
    if (!container) {
      const mainDiv = this.container.querySelector('.progress-main');
      if (mainDiv) {
        const section = document.createElement('div');
        section.className = 'progress-section';

        const title = document.createElement('div');
        title.className = 'progress-section-title';
        title.textContent = 'Loading Models';

        const modelContainer = document.createElement('div');
        modelContainer.className = 'model-progressses-container';

        section.appendChild(title);
        section.appendChild(modelContainer);
        mainDiv.appendChild(section);
      }
    }
  }

  /**
   * Show analysis progress
   * @param {number} currentModel - Current model index
   * @param {number} totalModels - Total models
   * @param {string} modelName - Current model name
   */
  showAnalysisProgress(currentModel, totalModels, modelName = 'Model') {
    const percent = (currentModel / totalModels) * 100;

    this.container.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.className = 'progress-overlay';

    const box = document.createElement('div');
    box.className = 'progress-box';

    const header = document.createElement('div');
    header.className = 'progress-header';

    const title = document.createElement('h2');
    title.className = 'progress-title';
    title.textContent = 'Analyzing Image';

    const main = document.createElement('div');
    main.className = 'progress-main';

    const detailText = document.createElement('div');
    detailText.className = 'progress-detail-text';
    detailText.textContent = `Processing with ${modelName}`;

    const barWrapper = document.createElement('div');
    barWrapper.className = 'progress-bar-wrapper';

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.style.width = `${percent}%`;

    const details = document.createElement('div');
    details.className = 'progress-details';
    details.textContent = `Model ${currentModel} of ${totalModels}`;

    barWrapper.appendChild(bar);
    header.appendChild(title);
    main.appendChild(detailText);
    main.appendChild(barWrapper);
    main.appendChild(details);
    box.appendChild(header);
    box.appendChild(main);
    overlay.appendChild(box);
    this.container.appendChild(overlay);

    this.container.style.display = 'block';
    this.isVisible = true;
  }

  /**
   * Update analysis progress
   * @param {number} currentModel - Current model index
   * @param {number} totalModels - Total models
   * @param {string} modelName - Current model name
   */
  updateAnalysisProgress(currentModel, totalModels, modelName = 'Model') {
    const percent = (currentModel / totalModels) * 100;
    const detailText = this.container.querySelector('.progress-detail-text');
    const bar = this.container.querySelector('.progress-bar');
    const details = this.container.querySelector('.progress-details');

    if (detailText) detailText.textContent = `Processing with ${modelName}`;
    if (bar) bar.style.width = `${percent}%`;
    if (details) details.textContent = `Model ${currentModel} of ${totalModels}`;
  }

  /**
   * Show completion state
   * @param {string} message - Completion message
   * @param {string} type - Type: 'success', 'info', 'warning', 'error'
   */
  showCompletion(message = 'Complete!', type = 'success') {
    this.container.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.className = 'progress-overlay';

    const box = document.createElement('div');
    box.className = `progress-box completion-${type}`;

    const header = document.createElement('div');
    header.className = 'progress-header';

    const title = document.createElement('h2');
    title.className = 'progress-title';
    title.textContent = message;

    const icon = document.createElement('div');
    icon.className = `progress-icon-${type}`;
    icon.textContent = type === 'success' ? '[OK]' : '!';

    header.appendChild(title);
    box.appendChild(header);
    box.appendChild(icon);
    overlay.appendChild(box);
    this.container.appendChild(overlay);

    this.container.style.display = 'block';
    this.isVisible = true;
  }

  /**
   * Clear all progress indicators
   */
  clear() {
    this.container.innerHTML = '';
    this.container.style.display = 'none';
    this.modelProgresses.clear();
    this.isVisible = false;
  }

  /**
   * Hide progress tracker (but keep state)
   */
  hide() {
    this.container.style.display = 'none';
    this.isVisible = false;
  }

  /**
   * Show progress tracker
   */
  show() {
    if (this.container.innerHTML.trim()) {
      this.container.style.display = 'block';
      this.isVisible = true;
    }
  }

  /**
   * Get visibility state
   */
  getVisibility() {
    return this.isVisible;
  }
}

/**
 * Global progress tracker instance for convenience
 * Usage: window.progressTracker.showPageLoadProgress('Loading...')
 */
if (typeof window !== 'undefined') {
  if (!window.progressTracker) {
    window.progressTracker = new ProgressTracker('progress-tracker');
  }
}

export default ProgressTracker;
