/**
 * ResultsPanel.js - Detection Results Display Component
 *
 * Manages the display of AI/Real detection results from multiple models.
 * Features scanning state, individual model results, and ensemble verdict.
 *
 * API:
 *  - create(containerId): Initialize panel in container
 *  - showScanning(modelName): Show analyzing state
 *  - addModelResult(result): Add single model result
 *  - showFinalResult(aggregatedResult): Display ensemble verdict
 *  - reset(): Clear all results
 *  - destroy(): Remove from DOM
 */

let panelContainer = null;
let panelElement = null;
let scanningElement = null;
let resultsGridElement = null;
let verdictBannerElement = null;
let statsFooterElement = null;
let modelResultCards = new Map();

// CSS color scheme for verdicts
const VERDICT_COLORS = {
  'AI_GENERATED': { bg: '#ef4444', dim: 'rgba(239, 68, 68, 0.15)', text: '#fca5a5' },
  'LIKELY_AI': { bg: '#f59e0b', dim: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24' },
  'INCONCLUSIVE': { bg: '#22d3ee', dim: 'rgba(34, 211, 238, 0.15)', text: '#67e8f9' },
  'LIKELY_REAL': { bg: '#10b981', dim: 'rgba(16, 185, 129, 0.15)', text: '#6ee7b7' },
  'HUMAN_CREATED': { bg: '#22c55e', dim: 'rgba(34, 197, 94, 0.15)', text: '#86efac' }
};

const VERDICT_LABELS = {
  'AI_GENERATED': 'AI Generated',
  'LIKELY_AI': 'Likely AI',
  'INCONCLUSIVE': 'Inconclusive',
  'LIKELY_REAL': 'Likely Real',
  'HUMAN_CREATED': 'Human Created'
};

/**
 * Embed CSS styles into the document
 * @private
 */
function injectStyles() {
  if (document.getElementById('results-panel-styles')) return;

  const style = document.createElement('style');
  style.id = 'results-panel-styles';
  style.textContent = `
    /* Results Panel Root */
    .results-panel {
      --bg-secondary: #151025;
      --bg-elevated: #1e1735;
      --border: #2a2245;
      --text-primary: #f0eeff;
      --text-secondary: #a099c0;
      --text-muted: #5c5480;
      --success: #22c55e;
      --success-dim: rgba(34, 197, 94, 0.15);
      --warning: #f59e0b;
      --warning-dim: rgba(245, 158, 11, 0.15);
      --danger: #ef4444;
      --danger-dim: rgba(239, 68, 68, 0.15);
      --cyan: #22d3ee;
      --cyan-dim: rgba(34, 211, 238, 0.15);

      font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
      color: var(--text-primary);
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin: 16px 0;
      overflow: hidden;
    }

    /* Scanning State */
    .scanning-state {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 32px 24px;
      background: var(--bg-elevated);
      border-radius: 8px;
      border: 1px solid var(--border);
    }

    .scanning-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid var(--border);
      border-top-color: var(--cyan);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .scanning-text {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .scanning-text .label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      font-weight: 600;
    }

    .scanning-text .model-name {
      font-size: 18px;
      font-weight: 600;
      color: var(--cyan);
    }

    /* Results Grid */
    .results-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin: 24px 0;
      padding: 0;
    }

    .model-result-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      transition: all 0.2s ease;
      cursor: default;
      position: relative;
      overflow: hidden;
    }

    .model-result-card:hover {
      border-color: var(--cyan);
      box-shadow: 0 0 12px rgba(34, 211, 238, 0.1);
    }

    .model-result-card.loading {
      opacity: 0.6;
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 12px;
    }

    .card-model-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      flex: 1;
      word-break: break-word;
    }

    .card-verdict {
      font-size: 11px;
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 4px;
      white-space: nowrap;
      text-transform: uppercase;
    }

    .card-verdict.ai {
      background: rgba(239, 68, 68, 0.2);
      color: #fca5a5;
    }

    .card-verdict.real {
      background: rgba(34, 197, 94, 0.2);
      color: #86efac;
    }

    .card-verdict.unsure {
      background: rgba(34, 211, 238, 0.2);
      color: #67e8f9;
    }

    .card-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .probability-bar {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .probability-label {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .probability-track {
      height: 6px;
      background: var(--bg-secondary);
      border-radius: 3px;
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .probability-fill {
      height: 100%;
      background: linear-gradient(90deg, #ef4444, #f59e0b, #22c55e);
      width: 0%;
      transition: width 0.3s ease;
      border-radius: 3px;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      padding: 6px 0;
      border-top: 1px solid var(--border);
    }

    .stat-label {
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stat-value {
      color: var(--text-primary);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .stat-value.time {
      color: var(--cyan);
    }

    /* Verdict Banner */
    .verdict-banner {
      border-radius: 8px;
      padding: 24px;
      margin: 24px 0;
      border: 2px solid;
      background-size: 200% 200%;
      animation: bannerSlide 0.6s ease-out;
      text-align: center;
    }

    @keyframes bannerSlide {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .verdict-icon {
      font-size: 32px;
      margin-bottom: 8px;
    }

    .verdict-title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .verdict-subtitle {
      font-size: 13px;
      opacity: 0.8;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .verdict-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 16px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid currentColor;
      opacity: 0.9;
    }

    .verdict-stat {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .verdict-stat-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.8;
    }

    .verdict-stat-value {
      font-size: 16px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    /* Stats Footer */
    .stats-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 12px 0;
      border-top: 1px solid var(--border);
      margin-top: 16px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .stats-left {
      display: flex;
      gap: 16px;
    }

    .stat-item {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .stat-item-label {
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stat-item-value {
      font-weight: 600;
      color: var(--text-primary);
    }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 40px 24px;
      color: var(--text-muted);
      text-align: center;
    }

    .empty-state-icon {
      font-size: 40px;
      opacity: 0.5;
    }

    .empty-state-text {
      font-size: 13px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .results-panel {
        padding: 16px;
      }

      .results-grid {
        grid-template-columns: 1fr;
      }

      .verdict-banner {
        padding: 16px;
      }

      .verdict-title {
        font-size: 20px;
      }

      .stats-footer {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `;

  document.head.appendChild(style);
}

/**
 * Create the panel in a container
 * @param {string} containerId - ID of container element
 * @throws {Error} If container not found
 */
export function create(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Container with ID "${containerId}" not found`);
  }

  injectStyles();

  panelContainer = container;
  panelElement = document.createElement('div');
  panelElement.className = 'results-panel';

  // Create scanning state (initially hidden)
  scanningElement = document.createElement('div');
  scanningElement.className = 'scanning-state';
  scanningElement.style.display = 'none';

  const scannerSpinner = document.createElement('div');
  scannerSpinner.className = 'scanning-spinner';

  const scanningText = document.createElement('div');
  scanningText.className = 'scanning-text';

  const scanLabel = document.createElement('div');
  scanLabel.className = 'label';
  scanLabel.textContent = 'Analyzing with';

  const modelNameEl = document.createElement('div');
  modelNameEl.className = 'model-name';
  modelNameEl.textContent = '';

  scanningText.appendChild(scanLabel);
  scanningText.appendChild(modelNameEl);

  scanningElement.appendChild(scannerSpinner);
  scanningElement.appendChild(scanningText);
  panelElement.appendChild(scanningElement);

  // Create results grid
  resultsGridElement = document.createElement('div');
  resultsGridElement.className = 'results-grid';
  resultsGridElement.style.display = 'none';
  panelElement.appendChild(resultsGridElement);

  // Create verdict banner (initially hidden)
  verdictBannerElement = document.createElement('div');
  verdictBannerElement.className = 'verdict-banner';
  verdictBannerElement.style.display = 'none';
  panelElement.appendChild(verdictBannerElement);

  // Create stats footer (initially hidden)
  statsFooterElement = document.createElement('div');
  statsFooterElement.className = 'stats-footer';
  statsFooterElement.style.display = 'none';
  panelElement.appendChild(statsFooterElement);

  // Show empty state initially
  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state';
  emptyState.id = 'empty-state';

  const emptyIcon = document.createElement('div');
  emptyIcon.className = 'empty-state-icon';
  emptyIcon.textContent = '📊';

  const emptyText = document.createElement('div');
  emptyText.className = 'empty-state-text';
  emptyText.textContent = 'Waiting for analysis...';

  emptyState.appendChild(emptyIcon);
  emptyState.appendChild(emptyText);
  panelElement.appendChild(emptyState);

  container.appendChild(panelElement);
}

/**
 * Show scanning state for a model
 * @param {string} modelName - Display name of model being analyzed
 */
export function showScanning(modelName) {
  if (!panelElement) {
    console.warn('ResultsPanel not initialized. Call create() first.');
    return;
  }

  // Hide empty state
  const emptyState = panelElement.querySelector('#empty-state');
  if (emptyState) emptyState.style.display = 'none';

  // Update and show scanning state
  const modelNameElement = scanningElement.querySelector('.model-name');
  modelNameElement.textContent = modelName;
  scanningElement.style.display = 'flex';

  // Show grid
  resultsGridElement.style.display = 'grid';

  // Hide verdict and stats initially
  verdictBannerElement.style.display = 'none';
  statsFooterElement.style.display = 'none';
}

/**
 * Add a single model result
 * @param {Object} result - Model result object
 * @param {string} result.modelId - Unique model identifier
 * @param {string} result.displayName - Display name for UI
 * @param {number} result.aiProbability - AI probability 0-100
 * @param {string} result.verdict - 'AI', 'REAL', or 'UNSURE'
 * @param {number} result.confidence - Confidence 0-100
 * @param {number} result.inferenceTime - Time in ms
 */
export function addModelResult(result) {
  if (!panelElement) {
    console.warn('ResultsPanel not initialized. Call create() first.');
    return;
  }

  // Ensure scanning state is visible
  scanningElement.style.display = 'flex';
  resultsGridElement.style.display = 'grid';

  // Create or update card
  let card = modelResultCards.get(result.modelId);
  if (!card) {
    card = document.createElement('div');
    card.className = 'model-result-card loading';
    card.dataset.modelId = result.modelId;
    resultsGridElement.appendChild(card);
    modelResultCards.set(result.modelId, card);
  }

  // Remove loading animation
  card.classList.remove('loading');

  // Build card content using safe DOM methods
  const verdictClass = result.verdict.toLowerCase();
  const probPercent = Math.round(result.aiProbability);

  // Header
  const header = document.createElement('div');
  header.className = 'card-header';

  const modelName = document.createElement('div');
  modelName.className = 'card-model-name';
  modelName.textContent = result.displayName;

  const verdict = document.createElement('div');
  verdict.className = `card-verdict ${verdictClass}`;
  verdict.textContent = result.verdict;

  header.appendChild(modelName);
  header.appendChild(verdict);

  // Body
  const body = document.createElement('div');
  body.className = 'card-body';

  // Probability bar
  const probBar = document.createElement('div');
  probBar.className = 'probability-bar';

  const probLabel = document.createElement('div');
  probLabel.className = 'probability-label';

  const probLabelText = document.createElement('span');
  probLabelText.textContent = 'AI Probability';

  const probValue = document.createElement('span');
  probValue.textContent = `${probPercent}%`;

  probLabel.appendChild(probLabelText);
  probLabel.appendChild(probValue);

  const probTrack = document.createElement('div');
  probTrack.className = 'probability-track';

  const probFill = document.createElement('div');
  probFill.className = 'probability-fill';
  probFill.style.width = `${probPercent}%`;

  probTrack.appendChild(probFill);

  probBar.appendChild(probLabel);
  probBar.appendChild(probTrack);

  // Confidence stat
  const confStat = document.createElement('div');
  confStat.className = 'stat-row';

  const confLabel = document.createElement('span');
  confLabel.className = 'stat-label';
  confLabel.textContent = 'Confidence';

  const confValue = document.createElement('span');
  confValue.className = 'stat-value';
  confValue.textContent = `${result.confidence.toFixed(1)}%`;

  confStat.appendChild(confLabel);
  confStat.appendChild(confValue);

  // Inference time stat
  const timeStat = document.createElement('div');
  timeStat.className = 'stat-row';

  const timeLabel = document.createElement('span');
  timeLabel.className = 'stat-label';
  timeLabel.textContent = 'Inference';

  const timeValue = document.createElement('span');
  timeValue.className = 'stat-value time';
  timeValue.textContent = `${result.inferenceTime}ms`;

  timeStat.appendChild(timeLabel);
  timeStat.appendChild(timeValue);

  body.appendChild(probBar);
  body.appendChild(confStat);
  body.appendChild(timeStat);

  // Clear existing content and rebuild
  card.innerHTML = '';
  card.appendChild(header);
  card.appendChild(body);
}

/**
 * Show final aggregated result
 * @param {Object} aggregatedResult - Ensemble result
 * @param {string} aggregatedResult.verdict - 'AI_GENERATED', 'LIKELY_AI', 'INCONCLUSIVE', 'LIKELY_REAL', 'HUMAN_CREATED'
 * @param {number} aggregatedResult.confidence - Confidence 0-100
 * @param {number} aggregatedResult.aiProbability - Average AI probability 0-100
 * @param {Array} aggregatedResult.modelResults - Array of model results
 * @param {number} aggregatedResult.totalTime - Total time in ms
 */
export function showFinalResult(aggregatedResult) {
  if (!panelElement) {
    console.warn('ResultsPanel not initialized. Call create() first.');
    return;
  }

  // Hide scanning state
  scanningElement.style.display = 'none';

  // Show grid and footer
  resultsGridElement.style.display = 'grid';
  statsFooterElement.style.display = 'flex';

  // Get colors for verdict
  const colors = VERDICT_COLORS[aggregatedResult.verdict];
  if (!colors) {
    console.warn(`Unknown verdict: ${aggregatedResult.verdict}`);
    return;
  }

  const label = VERDICT_LABELS[aggregatedResult.verdict];
  const icon = getVerdictIcon(aggregatedResult.verdict);

  // Update verdict banner styling
  verdictBannerElement.style.display = 'block';
  verdictBannerElement.style.backgroundColor = colors.dim;
  verdictBannerElement.style.borderColor = colors.bg;
  verdictBannerElement.style.color = colors.text;

  const confPercent = Math.round(aggregatedResult.confidence);
  const aiProb = Math.round(aggregatedResult.aiProbability);
  const modelCount = aggregatedResult.modelResults?.length || 0;

  // Build banner content using safe DOM methods
  verdictBannerElement.innerHTML = '';

  const iconEl = document.createElement('div');
  iconEl.className = 'verdict-icon';
  iconEl.textContent = icon;

  const titleEl = document.createElement('div');
  titleEl.className = 'verdict-title';
  titleEl.textContent = label;

  const subtitleEl = document.createElement('div');
  subtitleEl.className = 'verdict-subtitle';
  subtitleEl.textContent = `${confPercent}% Confidence • ${modelCount} Models Analyzed`;

  const statsEl = document.createElement('div');
  statsEl.className = 'verdict-stats';

  // AI Probability stat
  const aiStat = document.createElement('div');
  aiStat.className = 'verdict-stat';

  const aiStatLabel = document.createElement('div');
  aiStatLabel.className = 'verdict-stat-label';
  aiStatLabel.textContent = 'AI Probability';

  const aiStatValue = document.createElement('div');
  aiStatValue.className = 'verdict-stat-value';
  aiStatValue.textContent = `${aiProb}%`;

  aiStat.appendChild(aiStatLabel);
  aiStat.appendChild(aiStatValue);

  // Confidence stat
  const confStat = document.createElement('div');
  confStat.className = 'verdict-stat';

  const confStatLabel = document.createElement('div');
  confStatLabel.className = 'verdict-stat-label';
  confStatLabel.textContent = 'Confidence';

  const confStatValue = document.createElement('div');
  confStatValue.className = 'verdict-stat-value';
  confStatValue.textContent = `${confPercent}%`;

  confStat.appendChild(confStatLabel);
  confStat.appendChild(confStatValue);

  // Time stat
  const timeStat = document.createElement('div');
  timeStat.className = 'verdict-stat';

  const timeStatLabel = document.createElement('div');
  timeStatLabel.className = 'verdict-stat-label';
  timeStatLabel.textContent = 'Analysis Time';

  const timeStatValue = document.createElement('div');
  timeStatValue.className = 'verdict-stat-value';
  timeStatValue.textContent = `${aggregatedResult.totalTime}ms`;

  timeStat.appendChild(timeStatLabel);
  timeStat.appendChild(timeStatValue);

  statsEl.appendChild(aiStat);
  statsEl.appendChild(confStat);
  statsEl.appendChild(timeStat);

  verdictBannerElement.appendChild(iconEl);
  verdictBannerElement.appendChild(titleEl);
  verdictBannerElement.appendChild(subtitleEl);
  verdictBannerElement.appendChild(statsEl);

  // Update stats footer
  updateStatsFooter(aggregatedResult);
}

/**
 * Update stats footer with result information
 * @private
 */
function updateStatsFooter(aggregatedResult) {
  const modelCount = aggregatedResult.modelResults?.length || 0;
  const avgInferenceTime =
    modelCount > 0
      ? Math.round(
          aggregatedResult.modelResults.reduce((sum, r) => sum + (r.inferenceTime || 0), 0) / modelCount
        )
      : 0;

  statsFooterElement.innerHTML = '';

  const statsLeft = document.createElement('div');
  statsLeft.className = 'stats-left';

  // Models stat
  const modelsStat = document.createElement('div');
  modelsStat.className = 'stat-item';

  const modelsLabel = document.createElement('span');
  modelsLabel.className = 'stat-item-label';
  modelsLabel.textContent = 'Models:';

  const modelsValue = document.createElement('span');
  modelsValue.className = 'stat-item-value';
  modelsValue.textContent = String(modelCount);

  modelsStat.appendChild(modelsLabel);
  modelsStat.appendChild(modelsValue);

  // Total time stat
  const totalStat = document.createElement('div');
  totalStat.className = 'stat-item';

  const totalLabel = document.createElement('span');
  totalLabel.className = 'stat-item-label';
  totalLabel.textContent = 'Total Time:';

  const totalValue = document.createElement('span');
  totalValue.className = 'stat-item-value';
  totalValue.textContent = `${aggregatedResult.totalTime}ms`;

  totalStat.appendChild(totalLabel);
  totalStat.appendChild(totalValue);

  // Avg inference stat
  const avgStat = document.createElement('div');
  avgStat.className = 'stat-item';

  const avgLabel = document.createElement('span');
  avgLabel.className = 'stat-item-label';
  avgLabel.textContent = 'Avg Inference:';

  const avgValue = document.createElement('span');
  avgValue.className = 'stat-item-value';
  avgValue.textContent = `${avgInferenceTime}ms`;

  avgStat.appendChild(avgLabel);
  avgStat.appendChild(avgValue);

  statsLeft.appendChild(modelsStat);
  statsLeft.appendChild(totalStat);
  statsLeft.appendChild(avgStat);

  statsFooterElement.appendChild(statsLeft);
}

/**
 * Get icon for verdict type
 * @private
 */
function getVerdictIcon(verdict) {
  const icons = {
    'AI_GENERATED': '🤖',
    'LIKELY_AI': '[WARN]',
    'INCONCLUSIVE': '❓',
    'LIKELY_REAL': '[OK]',
    'HUMAN_CREATED': '👤'
  };
  return icons[verdict] || '📊';
}

/**
 * Reset panel to initial state
 */
export function reset() {
  if (!panelElement) return;

  // Clear all data
  modelResultCards.clear();
  resultsGridElement.innerHTML = '';

  // Hide all sections
  scanningElement.style.display = 'none';
  resultsGridElement.style.display = 'none';
  verdictBannerElement.style.display = 'none';
  statsFooterElement.style.display = 'none';

  // Show empty state
  let emptyState = panelElement.querySelector('#empty-state');
  if (!emptyState) {
    emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.id = 'empty-state';

    const emptyIcon = document.createElement('div');
    emptyIcon.className = 'empty-state-icon';
    emptyIcon.textContent = '📊';

    const emptyText = document.createElement('div');
    emptyText.className = 'empty-state-text';
    emptyText.textContent = 'Waiting for analysis...';

    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(emptyText);
    panelElement.appendChild(emptyState);
  }
  emptyState.style.display = 'flex';
}

/**
 * Remove panel from DOM
 */
export function destroy() {
  if (panelElement && panelContainer) {
    panelContainer.removeChild(panelElement);
  }

  panelElement = null;
  panelContainer = null;
  scanningElement = null;
  resultsGridElement = null;
  verdictBannerElement = null;
  statsFooterElement = null;
  modelResultCards.clear();
}
